const ALLOWED_HOSTS = new Set([
  'images.unsplash.com',
  'encrypted-tbn0.gstatic.com',
  'ymgyekgmonqhehmnskcw.supabase.co',
]);

const MAX_BYTES = 8 * 1024 * 1024;

function isAllowedHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  if (ALLOWED_HOSTS.has(host)) return true;
  for (const allowed of ALLOWED_HOSTS) {
    if (host.endsWith(`.${allowed}`)) return true;
  }
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawUrl = String(req.query.url || '').trim();
  if (!rawUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  if (!/^https?:$/.test(parsed.protocol)) {
    return res.status(400).json({ error: 'Only http/https URLs are supported' });
  }

  if (!isAllowedHost(parsed.hostname)) {
    return res.status(403).json({ error: 'Host not allowed' });
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream returned ${upstream.status}` });
    }

    const contentType = upstream.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return res.status(415).json({ error: 'Upstream response is not an image' });
    }

    const contentLength = Number(upstream.headers.get('content-length') || '0');
    if (contentLength > MAX_BYTES) {
      return res.status(413).json({ error: 'Image is too large' });
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    if (body.byteLength > MAX_BYTES) {
      return res.status(413).json({ error: 'Image is too large' });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(body);
  } catch (error) {
    console.error('image-proxy error:', error);
    return res.status(502).json({ error: 'Failed to fetch upstream image' });
  }
}
