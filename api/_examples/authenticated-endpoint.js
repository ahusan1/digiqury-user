/**
 * EXAMPLE: Authenticated API Endpoint with Full Security
 * 
 * This demonstrates how to create a protected API endpoint that:
 * - Validates CORS from trusted origins only
 * - Enforces rate limiting per user
 * - Requires authentication with JWT
 * - Implements role-based access control
 * 
 * Use this as a template for new secure API endpoints.
 */

const { strictCorsMiddleware } = require('../_middleware/cors.js');
const { rateLimiterMiddleware } = require('../_middleware/rateLimiter.js');
const { requireAuth } = require('../_middleware/auth.js');

module.exports = async function handler(req, res) {
  try {
    /**
     * STEP 1: CORS Protection
     * Block requests from untrusted origins
     */
    const corsAllowed = strictCorsMiddleware(req, res);
    if (!corsAllowed) {
      return;
    }

    /**
     * STEP 2: Authentication
     * Verify JWT token and extract user info
     */
    const user = await requireAuth(req, res, { 
      optional: false // Set to true if authentication is optional
    });
    
    if (!user) {
      return; // Auth middleware already sent 401 response
    }

    /**
     * STEP 3: Rate Limiting (User-based)
     * Apply higher limits for authenticated users
     */
    const rateLimitPassed = await rateLimiterMiddleware(req, res, null, user.id);
    if (!rateLimitPassed) {
      return;
    }

    /**
     * STEP 4: Authorization (RBAC)
     * Check if user has required role
     */
    const allowedRoles = ['user']; // User-only mode
    
    if (!allowedRoles.includes(req.userProfile.role)) {
      return res.status(403).json({
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'You do not have permission to access this resource.',
        }
      });
    }

    /**
     * STEP 5: Business Logic
     * Your actual API logic goes here
     */
    const result = {
      message: 'Secure endpoint accessed successfully',
      user: {
        id: user.id,
        email: user.email,
        role: req.userProfile.role,
      },
      timestamp: new Date().toISOString(),
    };

    res.status(200).json({
      success: true,
      data: result,
    });

  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An error occurred while processing your request.',
      }
    });
  }
};
