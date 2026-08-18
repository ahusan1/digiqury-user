import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { publicCorsMiddleware } from '../_middleware/cors.js';

const sanitizeObjectKey = (rawValue) => {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';

  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }

  const clean = decoded
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');

  if (!clean) return '';
  if (clean.includes('..')) return '';
  if (!/^[a-zA-Z0-9/_\-.]+$/.test(clean)) return '';
  return clean;
};

const streamToBuffer = async (body) => {
  if (!body) return Buffer.alloc(0);

  if (typeof body.transformToByteArray === 'function') {
    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes);
  }

  const chunks = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
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

  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket: configuredBucket || bucketFromEndpoint,
  };
};

const setObjectHeaders = (res, objectResponse) => {
  const contentType = String(objectResponse?.ContentType || 'application/octet-stream');
  const cacheControl = String(objectResponse?.CacheControl || 'public, max-age=31536000, immutable');
  const eTag = String(objectResponse?.ETag || '').trim();
  const contentLength = Number(objectResponse?.ContentLength || 0);

  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', cacheControl);
  if (eTag) res.setHeader('ETag', eTag);
  if (Number.isFinite(contentLength) && contentLength > 0) {
    res.setHeader('Content-Length', contentLength.toString());
  }
};

export default async function handler(req, res) {
  try {
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

    const keyQuery = Array.isArray(req.query?.key) ? req.query.key[0] : req.query?.key;
    const objectKey = sanitizeObjectKey(keyQuery);

    if (!objectKey) {
      return res.status(400).json({
        error: {
          code: 'INVALID_OBJECT_KEY',
          message: 'Object key is missing or invalid.',
        },
      });
    }

    const r2 = getR2Config();
    if (!r2.endpoint || !r2.accessKeyId || !r2.secretAccessKey || !r2.bucket) {
      return res.status(500).json({
        error: {
          code: 'R2_NOT_CONFIGURED',
          message: 'R2 configuration is missing. Set account, endpoint, bucket, and key credentials.',
        },
      });
    }

    const client = new S3Client({
      region: 'auto',
      endpoint: r2.endpoint,
      credentials: {
        accessKeyId: r2.accessKeyId,
        secretAccessKey: r2.secretAccessKey,
      },
    });

    let objectResponse;
    try {
      objectResponse = await client.send(
        new GetObjectCommand({
          Bucket: r2.bucket,
          Key: objectKey,
        }),
      );
    } catch (err) {
      const statusCode = Number(err?.$metadata?.httpStatusCode || 0);
      if (err?.name === 'NoSuchKey' || statusCode === 404) {
        return res.status(404).json({
          error: {
            code: 'OBJECT_NOT_FOUND',
            message: 'Requested object was not found.',
          },
        });
      }

      console.error('r2 public object read error:', err);
      return res.status(502).json({
        error: {
          code: 'OBJECT_FETCH_FAILED',
          message: 'Failed to fetch object from storage.',
        },
      });
    }

    setObjectHeaders(res, objectResponse);

    if (req.method === 'HEAD') {
      return res.status(200).end();
    }

    const payload = await streamToBuffer(objectResponse?.Body);
    return res.status(200).send(payload);
  } catch (err) {
    console.error('r2 public object handler error:', err);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to read object.',
      },
    });
  }
}
