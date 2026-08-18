import { publicCorsMiddleware } from '../_middleware/cors.js';
import { rateLimiterMiddleware } from '../_middleware/rateLimiter.js';

export default async function handler(req, res) {
  try {
    const corsAllowed = publicCorsMiddleware(req, res);
    if (!corsAllowed) {
      return;
    }

    const rateLimitPassed = await rateLimiterMiddleware(req, res);
    if (!rateLimitPassed) {
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(405).json({
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: 'Only GET and HEAD are allowed.',
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: 'User product test endpoint is healthy.',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('User product test endpoint error:', err);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An error occurred while processing your request.',
      },
    });
  }
}
