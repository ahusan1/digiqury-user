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

    return res.status(200).json({
      success: true,
      data: {
        message: 'Public endpoint accessed successfully.',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('Public endpoint error:', err);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An error occurred while processing your request.',
      },
    });
  }
}
