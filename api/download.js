import { createClient } from '@supabase/supabase-js';
import { publicCorsMiddleware } from './_middleware/cors.js';
import { rateLimiterMiddleware } from './_middleware/rateLimiter.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ymgyekgmonqhehmnskcw.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const DEFAULT_BUCKET = process.env.DOWNLOAD_BUCKET || 'secure_assets';

const MIME_BY_EXTENSION = {
  pdf: 'application/pdf',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mp3: 'audio/mpeg',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

const MIME_TO_EXTENSION = {
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/vnd.rar': 'rar',
  'application/x-7z-compressed': '7z',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
};

const INVALID_EXTENSIONS = new Set([
  'bin',
  'image',
  'images',
  'download',
  'file',
  'open',
  'view',
  'uc',
]);

const GENERIC_BASE_NAMES = new Set([
  'bin',
  'image',
  'images',
  'download',
  'file',
  'open',
  'view',
  'uc',
]);

const isValidExtension = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return /^[a-z0-9]{2,6}$/.test(normalized) && !INVALID_EXTENSIONS.has(normalized);
};

const safeName = (value) => String(value || '')
  .replace(/[\\/]+/g, '_')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 180);

const safeDecode = (value) => {
  let output = String(value || '');
  for (let i = 0; i < 2; i += 1) {
    try {
      const decoded = decodeURIComponent(output);
      if (decoded === output) break;
      output = decoded;
    } catch {
      break;
    }
  }
  return output;
};

const extensionFromName = (value) => {
  const cleaned = String(value || '').split('?')[0].split('#')[0].trim();
  const candidate = cleaned.split('.').pop()?.toLowerCase() || '';
  return isValidExtension(candidate) ? candidate : '';
};

const fileNameFromPath = (value) => {
  const cleaned = String(value || '').split('?')[0].split('#')[0].trim();
  const parts = cleaned.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : '';
};

const detectMimeType = (contentType, filename) => {
  const normalized = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (normalized && normalized !== 'application/octet-stream') return normalized;

  const ext = extensionFromName(filename);
  if (ext && MIME_BY_EXTENSION[ext]) return MIME_BY_EXTENSION[ext];
  return 'application/octet-stream';
};

const extensionFromMime = (mimeType) => {
  const normalized = String(mimeType || '').split(';')[0].trim().toLowerCase();
  if (!normalized) return '';
  return MIME_TO_EXTENSION[normalized] || '';
};

const fileNameFromContentDisposition = (disposition) => {
  const raw = String(disposition || '').trim();
  if (!raw) return '';

  const utf8Match = raw.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return safeName(safeDecode(utf8Match[1].replace(/"/g, '')));
  }

  const plainMatch = raw.match(/filename=([^;]+)/i);
  if (plainMatch?.[1]) {
    const cleaned = plainMatch[1].trim().replace(/^"|"$/g, '');
    return safeName(cleaned);
  }

  return '';
};

const stripExtension = (value) => {
  const name = safeName(value);
  return name.replace(/\.[a-z0-9]{2,6}$/i, '');
};

const isGenericBaseName = (value) => {
  const normalized = stripExtension(value).toLowerCase();
  return GENERIC_BASE_NAMES.has(normalized);
};

const normalizeGoogleDriveUrl = (rawUrl) => {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    const host = parsed.hostname.toLowerCase();
    if (!host.includes('drive.google.com')) return rawUrl;

    const idFromQuery = parsed.searchParams.get('id') || parsed.searchParams.get('file_id');
    if (idFromQuery) {
      return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(idFromQuery)}`;
    }

    const match = parsed.pathname.match(/\/file\/d\/([^/]+)/i);
    if (match?.[1]) {
      return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(match[1])}`;
    }
  } catch {
    // ignore parse failures and keep URL as-is
  }

  return rawUrl;
};

const isGoogleDriveUrl = (rawUrl) => {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    return parsed.hostname.toLowerCase().includes('drive.google.com');
  } catch {
    return false;
  }
};

const isHtmlLikeResponse = (response) => {
  const contentType = String(response?.headers?.get('content-type') || '').toLowerCase();
  return contentType.includes('text/html');
};

const extractDriveConfirmToken = (html) => {
  const raw = String(html || '');
  const tokenFromQuery = raw.match(/[?&]confirm=([0-9A-Za-z_\-]+)/i)?.[1];
  if (tokenFromQuery) return tokenFromQuery;

  const tokenFromForm = raw.match(/name="confirm"\s+value="([^"]+)"/i)?.[1];
  if (tokenFromForm) return tokenFromForm;

  // Fallback to 't' which often bypasses the Google Drive large file warning
  return 't';
};

const extractDriveWarningCookie = (setCookieHeader) => {
  const raw = String(setCookieHeader || '');
  const match = raw.match(/(download_warning[^=]*=[^;]+)/i);
  return match?.[1] || '';
};

const resolveDriveDirectUrl = async (targetUrl) => {
  try {
    let res = await fetch(targetUrl, { redirect: 'manual' });
    
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const loc = res.headers.get('location');
      if (loc.includes('googleusercontent.com')) return loc;
    }

    if (res.status === 200 && isHtmlLikeResponse(res)) {
      const html = await res.text();
      const token = extractDriveConfirmToken(html);
      
      const parsed = new URL(targetUrl);
      parsed.searchParams.set('confirm', token);
      
      const warningCookie = extractDriveWarningCookie(res.headers.get('set-cookie'));
      const headers = warningCookie ? { Cookie: warningCookie } : undefined;
      
      res = await fetch(parsed.toString(), { redirect: 'manual', headers });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        const loc = res.headers.get('location');
        return loc.startsWith('/') ? `https://drive.google.com${loc}` : loc;
      }
    }
  } catch (e) {
    console.warn('resolveDriveDirectUrl error:', e);
  }
  return null;
};

const fetchUpstreamWithDriveFallback = async (targetUrl, method) => {
  let upstream = await fetch(targetUrl, { method, redirect: 'follow' });

  // Google Drive can return an HTML warning page for large files. Resolve confirm token and retry.
  if (
    method === 'GET' &&
    isGoogleDriveUrl(targetUrl) &&
    upstream.ok &&
    isHtmlLikeResponse(upstream)
  ) {
    const html = await upstream.text();
    const confirmToken = extractDriveConfirmToken(html);

    if (confirmToken) {
      const parsed = new URL(targetUrl);
      parsed.searchParams.set('confirm', confirmToken);

      const warningCookie = extractDriveWarningCookie(upstream.headers.get('set-cookie'));
      const headers = warningCookie ? { Cookie: warningCookie } : undefined;
      upstream = await fetch(parsed.toString(), {
        method: 'GET',
        headers,
        redirect: 'follow',
      });
    }
  }

  return upstream;
};

const resolveDownloadFileName = ({ providedName, providedExt, upstreamName, fallbackName, mimeType }) => {
  const preferredBaseSource = !providedName || isGenericBaseName(providedName)
    ? (upstreamName || fallbackName || 'download')
    : providedName;

  const candidateBase = stripExtension(preferredBaseSource) || 'download';

  const resolvedExt = [
    String(providedExt || '').toLowerCase(),
    extensionFromName(providedName),
    extensionFromName(upstreamName),
    extensionFromName(fallbackName),
    extensionFromMime(mimeType),
  ].find((value) => isValidExtension(value)) || '';

  if (!resolvedExt) {
    const safeFallback = safeName(providedName || upstreamName || fallbackName) || 'download.bin';
    return safeFallback;
  }

  return `${candidateBase}.${resolvedExt}`;
};

const buildDisposition = (filename) => {
  const fallback = safeName(filename) || 'download.bin';
  const encoded = encodeURIComponent(fallback);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
};

const parseQuery = (req) => {
  const path = String(req.query?.path || '').trim().replace(/^\/+/, '');
  const directUrl = String(req.query?.url || '').trim();
  const bucket = String(req.query?.bucket || DEFAULT_BUCKET).trim() || DEFAULT_BUCKET;
  const name = safeName(safeDecode(String(req.query?.name || '').trim()));
  const ext = String(req.query?.ext || '').trim().toLowerCase();

  return { path, directUrl, bucket, name, ext };
};

const getSignedStorageUrl = async ({ bucket, path }) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase credentials missing for download proxy.');
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, 120);

  if (error || !data?.signedUrl) {
    throw new Error('Unable to create signed file URL.');
  }

  return data.signedUrl;
};

export default async function handler(req, res) {
  const corsAllowed = publicCorsMiddleware(req, res);
  if (!corsAllowed) return;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Only GET and HEAD are supported.',
      },
    });
  }

  const rateLimitPassed = await rateLimiterMiddleware(req, res);
  if (!rateLimitPassed) return;

  try {
    const { path, directUrl, bucket, name, ext } = parseQuery(req);

    if (!path && !directUrl) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'path or url query parameter is required.',
        },
      });
    }

    const sourceUrl = path ? await getSignedStorageUrl({ bucket, path }) : directUrl;
    const targetUrl = normalizeGoogleDriveUrl(sourceUrl);
    
    if (isGoogleDriveUrl(targetUrl)) {
      const directGoogleUrl = await resolveDriveDirectUrl(targetUrl);
      const finalUrl = directGoogleUrl || targetUrl;
      
      if (req.method === 'HEAD') {
        try {
          const headRes = await fetch(finalUrl, { method: 'HEAD' });
          if (headRes.ok) {
            const cd = headRes.headers.get('content-disposition');
            const ct = headRes.headers.get('content-type');
            if (cd) res.setHeader('Content-Disposition', cd);
            if (ct) res.setHeader('Content-Type', ct);
            const cl = headRes.headers.get('content-length');
            if (cl) res.setHeader('Content-Length', cl);
          } else {
            res.setHeader('Content-Disposition', 'attachment; filename="download.zip"');
          }
        } catch (e) {
          res.setHeader('Content-Disposition', 'attachment; filename="download.zip"');
        }
        return res.status(200).end();
      }

      res.setHeader('Location', finalUrl);
      return res.status(302).end();
    }

    let upstream = await fetchUpstreamWithDriveFallback(targetUrl, req.method);
    if (req.method === 'HEAD' && upstream.status === 405) {
      upstream = await fetchUpstreamWithDriveFallback(targetUrl, 'GET');
    }

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: {
          code: 'UPSTREAM_ERROR',
          message: 'Failed to fetch file from storage.',
        },
      });
    }

    if (req.method === 'GET' && isHtmlLikeResponse(upstream)) {
      return res.status(502).json({
        error: {
          code: 'UPSTREAM_NOT_DOWNLOADABLE',
          message: 'Upstream URL returned HTML page instead of a downloadable file.',
        },
      });
    }

    const upstreamName = fileNameFromContentDisposition(upstream.headers.get('content-disposition'));
    const fallbackName = fileNameFromPath(path || targetUrl) || 'download';
    const mimeType = detectMimeType(upstream.headers.get('content-type'), name || upstreamName || fallbackName);
    const sourceName = resolveDownloadFileName({
      providedName: name,
      providedExt: ext,
      upstreamName,
      fallbackName,
      mimeType,
    });

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', buildDisposition(sourceName));
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');

    if (req.method === 'HEAD') {
      const upstreamLength = upstream.headers.get('content-length');
      if (upstreamLength && /^\d+$/.test(upstreamLength)) {
        res.setHeader('Content-Length', upstreamLength);
      }
      try {
        upstream.body?.cancel();
      } catch {
        // ignore stream cancel failure
      }
      return res.status(200).end();
    }

    const upstreamLength = upstream.headers.get('content-length');
    if (upstreamLength && /^\d+$/.test(upstreamLength)) {
      res.setHeader('Content-Length', upstreamLength);
    }

    if (upstream.body) {
      const { Readable } = await import('stream');
      const nodeStream = Readable.fromWeb(upstream.body);
      return nodeStream.pipe(res);
    } else {
      const arrayBuffer = await upstream.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuffer);
      res.setHeader('Content-Length', String(fileBuffer.byteLength));
      return res.status(200).send(fileBuffer);
    }
  } catch (err) {
    console.error('download proxy error:', err);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to prepare download file.',
      },
    });
  }
}
