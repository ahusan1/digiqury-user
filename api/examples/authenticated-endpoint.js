import { strictCorsMiddleware } from '../_middleware/cors.js';
import { rateLimiterMiddleware } from '../_middleware/rateLimiter.js';
import { requireAuth } from '../_middleware/auth.js';

export default async function handler(req, res) {
  try {
    const corsAllowed = strictCorsMiddleware(req, res);
    if (!corsAllowed) {
      return;
    }

    const profile = await requireAuth(req, res, {
      roles: ['admin', 'seller'],
      optional: false,
    });

    if (!profile) {
      return;
    }

    const rateLimitPassed = await rateLimiterMiddleware(req, res, null, req.user.id);
    if (!rateLimitPassed) {
      return;
    }

    return res.status(200).json({
      success: true,
      data: {
        message: 'Authenticated endpoint accessed successfully.',
        user: {
          id: req.user.id,
          email: req.user.email || null,
          role: profile.role,
        },
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('Authenticated endpoint error:', err);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An error occurred while processing your request.',
      },
    });
  }
}
