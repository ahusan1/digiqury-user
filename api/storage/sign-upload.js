import crypto from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { strictCorsMiddleware } from '../_middleware/cors.js';
import { rateLimiterMiddleware } from '../_middleware/rateLimiter.js';
import { requireAuth } from '../_middleware/auth.js';

const DEFAULT_TTL_SECONDS = 120;
const MIN_TTL_SECONDS = 30;
const MAX_TTL_SECONDS = 300;

const MIME_TO_EXTENSION = {
  'image/avif': 'avif',
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/x-rar-compressed': 'rar',
  'application/vnd.rar': 'rar',
  'application/x-7z-compressed': '7z',
};

const ALLOWED_FOLDERS = new Set(['product-preview']);

const parseBody = (req) => {
  if (typeof req.body === 'string') {
    return JSON.parse(req.body || '{}');
  }
  return req.body || {};
};

const sanitizeFolder = (value) => {
  const clean = String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');

  if (!clean) return '';
  if (clean.includes('..')) return '';
  if (!/^[a-zA-Z0-9/_-]+$/.test(clean)) return '';
  return clean;
};

const sanitizeContentType = (value) => {
  const clean = String(value || '').trim().toLowerCase().split(';')[0];
  if (!clean) return '';
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(clean)) return '';
  return clean;
};

const sanitizeExtension = (value) => {
  const clean = String(value || '').trim().toLowerCase().replace(/^\./, '');
  return /^[a-z0-9]{2,8}$/.test(clean) ? clean : '';
};

const encodeObjectKey = (key) => {
  return String(key || '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
};

const toPublicUrl = (base, key) => {
  const cleanBase = String(base || '').trim().replace(/\/+$/, '');
  if (!cleanBase) return '';
  return `${cleanBase}/${encodeObjectKey(key)}`;
};

const sanitizeHost = (value) => {
  const clean = String(value || '').trim().split(',')[0].trim();
  return /^[a-zA-Z0-9.-]+(?::\d{2,5})?$/.test(clean) ? clean : '';
};

const toProxyUrl = (req, key) => {
  const hostHeader = req.headers['x-forwarded-host'] || req.headers.host || '';
  const safeHost = sanitizeHost(Array.isArray(hostHeader) ? hostHeader[0] : hostHeader);
  if (!safeHost) return '';

  const protoHeader = req.headers['x-forwarded-proto'] || '';
  const protoRaw = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader;
  const proto = String(protoRaw || '').trim().toLowerCase() === 'http' ? 'http' : 'https';

  const encodedKey = encodeURIComponent(String(key || '').replace(/^\/+/, ''));
  return `${proto}://${safeHost}/api/storage/public?key=${encodedKey}`;
};

const getR2Config = () => {
  const accountId = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_R2_ACCOUNT_ID || '';
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '';
  const configuredBucket = process.env.R2_BUCKET || process.env.CLOUDFLARE_R2_BUCKET || '';

  const rawEndpoint =
    process.env.R2_ENDPOINT ||
    process.env.CLOUDFLARE_R2_ENDPOINT ||
    process.env.R2_S3_API_URL ||
    process.env.CLOUDFLARE_R2_S3_API_URL ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');

  let endpoint = String(rawEndpoint || '').trim();
  let bucketFromEndpoint = '';

  try {
    if (endpoint) {
      const parsed = new URL(endpoint);
      const pathBucket = parsed.pathname.replace(/^\/+|\/+$/g, '');
      if (pathBucket) {
        bucketFromEndpoint = pathBucket.split('/')[0] || '';
        parsed.pathname = '';
        endpoint = parsed.toString().replace(/\/+$/, '');
      }
    }
  } catch {
    // Keep raw endpoint if parsing fails; validation below will report misconfiguration.
  }

  const bucket = configuredBucket || bucketFromEndpoint;

  const publicBaseUrl =
    process.env.R2_PUBLIC_BASE_URL ||
    process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL ||
    '';

  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl,
  };
};

export default async function handler(req, res) {
  try {
    const corsAllowed = strictCorsMiddleware(req, res);
    if (!corsAllowed) return;

    if (req.method !== 'POST') {
      return res.status(405).json({
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: 'Only POST is supported.',
        },
      });
    }

    const user = await requireAuth(req, res, { optional: false });
    if (!user) return;

    const rateLimitPassed = await rateLimiterMiddleware(req, res, null, user?.id || null);
    if (!rateLimitPassed) return;

    const body = parseBody(req);
    const folder = sanitizeFolder(body.folder);
    const contentType = sanitizeContentType(body.contentType);
    const requestedExtension = sanitizeExtension(body.extension);

    if (!folder || !ALLOWED_FOLDERS.has(folder)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_FOLDER',
          message: 'Upload folder is invalid or not allowed.',
        },
      });
    }

    if (!contentType) {
      return res.status(400).json({
        error: {
          code: 'INVALID_CONTENT_TYPE',
          message: 'contentType is required and must be valid.',
        },
      });
    }

    const extension = requestedExtension || sanitizeExtension(MIME_TO_EXTENSION[contentType] || '') || 'bin';

    const ttlCandidate = Number(body.expiresIn || process.env.R2_SIGN_TTL_SECONDS || DEFAULT_TTL_SECONDS);
    const expiresIn = Number.isFinite(ttlCandidate)
      ? Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, Math.floor(ttlCandidate)))
      : DEFAULT_TTL_SECONDS;

    const r2 = getR2Config();
    if (!r2.endpoint || !r2.accessKeyId || !r2.secretAccessKey || !r2.bucket) {
      return res.status(500).json({
        error: {
          code: 'R2_NOT_CONFIGURED',
          message: 'R2 configuration is missing. Set account, endpoint, bucket, and key credentials.',
        },
      });
    }

    const objectKey = `${folder}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${extension}`;
    const publicUrlBase = String(r2.publicBaseUrl || '').trim();

    const client = new S3Client({
      region: 'auto',
      endpoint: r2.endpoint,
      credentials: {
        accessKeyId: r2.accessKeyId,
        secretAccessKey: r2.secretAccessKey,
      },
    });

    const putCommand = new PutObjectCommand({
      Bucket: r2.bucket,
      Key: objectKey,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    });

    const uploadUrl = await getSignedUrl(client, putCommand, { expiresIn });
    const publicUrl = publicUrlBase ? toPublicUrl(publicUrlBase, objectKey) : toProxyUrl(req, objectKey);

    if (!publicUrl) {
      return res.status(500).json({
        error: {
          code: 'R2_PUBLIC_URL_INVALID',
          message: 'Failed to compose public URL for uploaded asset. Set R2_PUBLIC_BASE_URL or ensure request host is valid.',
        },
      });
    }

    return res.status(200).json({
      uploadUrl,
      publicUrl,
      objectKey,
      expiresIn,
    });
  } catch (err) {
    console.error('r2 sign-upload error:', err);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create upload URL.',
      },
    });
  }
}
