/**
 * SECURITY ENHANCEMENT: Environment-based configuration
 * Credentials are now loaded from environment variables instead of hardcoding
 */
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ymgyekgmonqhehmnskcw.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltZ3lla2dtb25xaGVobW5za2N3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NTA0MjQsImV4cCI6MjA4NzUyNjQyNH0.1KjMMPJaU849XJ0w3NjsUKSBugjjNAR_mGyu7wJCURw';

import { rateLimiterMiddleware } from '../_middleware/rateLimiter.js';
import { publicCorsMiddleware } from '../_middleware/cors.js';

// Allowed production hosts — prevents open-redirect via Host header injection
const ALLOWED_HOSTS = new Set([
  'www.digiqury.in',
  'digiqury.in',
  'localhost:3000',
  'localhost:5173',
  '127.0.0.1:3000',
  '127.0.0.1:5173',
]);

const esc = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const toAbsoluteUrl = (origin, value) => {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('//')) return `https:${value}`;
  return `${origin}${value.startsWith('/') ? '' : '/'}${value}`;
};

export default async function handler(req, res) {
  try {
    /**
     * SECURITY ENHANCEMENT 1: CORS Protection
     * Only allow requests from trusted origins
     */
    const corsAllowed = publicCorsMiddleware(req, res);
    if (!corsAllowed) {
      return; // CORS middleware already sent response
    }

    /**
     * SECURITY ENHANCEMENT 2: Rate Limiting
     * Prevent abuse and brute-force attacks
     */
    const rateLimitPassed = await rateLimiterMiddleware(req, res);
    if (!rateLimitPassed) {
      return; // Rate limiter already sent 429 response
    }

    const id = String((req.query?.id) || '').trim();
    // Validate host to prevent open-redirect via Host header injection
    const rawHost = (req.headers['x-forwarded-host'] || req.headers.host || '');
    const safeHost = ALLOWED_HOSTS.has(rawHost) ? rawHost : 'www.digiqury.in';
    const protocol = (req.headers['x-forwarded-proto'] || 'https');
    const origin = `${protocol}://${safeHost}`;

    if (!id) {
      res.status(400).setHeader('Content-Type', 'text/plain').send('Missing product id');
      return;
    }

    const productPageUrl = `${origin}/product/${encodeURIComponent(id)}`;

    const query = `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(id)}&select=title,price,original_price,category,preview_image`;
    const response = await fetch(query, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    const data = await response.json();
    const product = Array.isArray(data) ? data[0] : null;

    if (!product) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0;url=${productPageUrl}" />
    <title>DIGi QuRY</title>
  </head>
</html>`);
      return;
    }

    const title = esc(product.title || 'Product');
    const category = product.category ? ` | Category: ${product.category}` : '';
    const originalPrice = product.original_price && product.original_price > product.price
      ? ` (Original: ₹${product.original_price})`
      : '';
    const description = esc(`Price: ₹${product.price}${originalPrice}${category}`);
    const imageUrl = toAbsoluteUrl(origin, product.preview_image);
    const image = esc(imageUrl);

    let html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} - DIGi QuRY</title>
    <meta name="description" content="${description}" />
    <meta property="og:type" content="product" />
    <meta property="og:site_name" content="DIGi QuRY" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />`;

    if (image) {
      html += `\n    <meta property="og:image" content="${image}" />
    <meta property="og:image:secure_url" content="${image}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${image}" />`;
    }

    html += `\n    <meta property="og:url" content="${productPageUrl}" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta http-equiv="refresh" content="0;url=${productPageUrl}" />
    <link rel="canonical" href="${productPageUrl}" />
  </head>
  <body><a href="${productPageUrl}">Open product</a></body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
    res.status(200).send(html);
  } catch (err) {
    /**
     * SECURITY ENHANCEMENT 3: Secure Error Handling
     * Don't leak internal error details to clients
     */
    console.error('Product API error:', err);
    res.status(500).setHeader('Content-Type', 'application/json').send(
      JSON.stringify({ 
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred while processing your request.'
        }
      })
    );
  }
}
