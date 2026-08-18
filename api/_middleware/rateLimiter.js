/**
 * Production-Grade Rate Limiter Middleware
 * 
 * Implements sliding window rate limiting with:
 * - IP-based limiting for anonymous requests
 * - User-based limiting for authenticated requests
 * - Configurable limits via environment variables
 * - Proper HTTP 429 responses with retry headers
 * 
 * Security Benefits:
 * - Prevents brute-force attacks
 * - Mitigates DoS/DDoS attempts
 * - Protects against credential stuffing
 * - Reduces infrastructure costs from abuse
 */

// In-memory store (use Redis/Vercel KV in production for distributed systems)
const rateLimitStore = new Map();

// Configuration from environment
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'); // 1 minute
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100');
const RATE_LIMIT_MAX_REQUESTS_AUTH = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS_AUTH || '300');

// Cleanup old entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now - data.resetTime > RATE_LIMIT_WINDOW_MS) {
      rateLimitStore.delete(key);
    }
  }
}, 300000);

/**
 * Get client identifier (IP or user ID)
 */
function getClientId(req, userId = null) {
  if (userId) return `user:${userId}`;
  
  // Try multiple IP headers for production environments
  const forwarded = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  const cfConnectingIp = req.headers['cf-connecting-ip']; // Cloudflare
  
  const ip = forwarded ? forwarded.split(',')[0].trim() : 
             realIp || 
             cfConnectingIp || 
             req.socket?.remoteAddress || 
             'unknown';
  
  return `ip:${ip}`;
}

/**
 * Rate Limiter Middleware
 * 
 * @param {Object} req - Request object
 * @param {string|null} userId - Authenticated user ID (if available)
 * @returns {Object} { allowed: boolean, remaining: number, resetTime: number }
 */
export function checkRateLimit(req, userId = null) {
  const clientId = getClientId(req, userId);
  const now = Date.now();
  const maxRequests = userId ? RATE_LIMIT_MAX_REQUESTS_AUTH : RATE_LIMIT_MAX_REQUESTS;
  
  let record = rateLimitStore.get(clientId);
  
  // Initialize or reset if window expired
  if (!record || now - record.resetTime >= RATE_LIMIT_WINDOW_MS) {
    record = {
      count: 0,
      resetTime: now + RATE_LIMIT_WINDOW_MS,
    };
  }
  
  record.count++;
  rateLimitStore.set(clientId, record);
  
  const allowed = record.count <= maxRequests;
  const remaining = Math.max(0, maxRequests - record.count);
  
  return {
    allowed,
    remaining,
    resetTime: record.resetTime,
    limit: maxRequests,
  };
}

/**
 * Apply rate limit headers to response
 */
export function applyRateLimitHeaders(res, rateLimitInfo) {
  const resetInSeconds = Math.ceil((rateLimitInfo.resetTime - Date.now()) / 1000);
  
  res.setHeader('X-RateLimit-Limit', rateLimitInfo.limit.toString());
  res.setHeader('X-RateLimit-Remaining', rateLimitInfo.remaining.toString());
  res.setHeader('X-RateLimit-Reset', rateLimitInfo.resetTime.toString());
  res.setHeader('Retry-After', resetInSeconds.toString());
  
  return res;
}

/**
 * Send rate limit exceeded response
 */
export function sendRateLimitError(res, rateLimitInfo) {
  const resetInSeconds = Math.ceil((rateLimitInfo.resetTime - Date.now()) / 1000);
  
  applyRateLimitHeaders(res, rateLimitInfo);
  
  res.status(429).json({
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
      retryAfter: resetInSeconds,
      limit: rateLimitInfo.limit,
      resetAt: new Date(rateLimitInfo.resetTime).toISOString(),
    }
  });
}

/**
 * Express/Vercel-style middleware wrapper
 */
export async function rateLimiterMiddleware(req, res, next, userId = null) {
  const rateLimitInfo = checkRateLimit(req, userId);
  
  if (!rateLimitInfo.allowed) {
    sendRateLimitError(res, rateLimitInfo);
    return false;
  }
  
  applyRateLimitHeaders(res, rateLimitInfo);
  
  if (next) await next();
  return true;
}
