import { strictCorsMiddleware } from '../_middleware/cors.js';
import { rateLimiterMiddleware } from '../_middleware/rateLimiter.js';
import { requireAuth, getAdminClient } from '../_middleware/auth.js';

const ALLOWED_ROLES = new Set(['admin', 'seller', 'user', 'guest']);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

    const user = await requireAuth(req, res, { roles: ['user'], optional: true });
    const rateLimitPassed = await rateLimiterMiddleware(req, res, null, user?.id || null);
    if (!rateLimitPassed) return;

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const token = String(body.token || '').trim();
    const platform = String(body.platform || 'android').slice(0, 32);
    const appScope = String(body.appScope || 'user').slice(0, 32);
    const requestedRole = String(body.role || '').trim().toLowerCase();
    const profileRole = String(req.userProfile?.role || '').trim().toLowerCase();
    const role = ALLOWED_ROLES.has(profileRole)
      ? profileRole
      : (ALLOWED_ROLES.has(requestedRole) ? requestedRole : 'guest');
    const requestedUserId = String(body.userId || '').trim();
    const resolvedUserId = user?.id || (UUID_REGEX.test(requestedUserId) ? requestedUserId : null);

    if (token.length < 20) {
      return res.status(400).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Device token is missing or invalid.',
        },
      });
    }

    const supabaseAdmin = getAdminClient();
    const payload = {
      user_id: resolvedUserId,
      role,
      device_token: token,
      platform,
      app_scope: appScope,
      last_seen_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from('fcm_device_tokens')
      .upsert(payload, { onConflict: 'device_token' });

    if (error) {
      const message = String(error.message || '');
      if (message.includes('relation') && message.includes('fcm_device_tokens')) {
        return res.status(500).json({
          error: {
            code: 'SETUP_REQUIRED',
            message: 'FCM table is missing. Run fcm_setup.sql first.',
          },
        });
      }

      return res.status(500).json({
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to save push token.',
        },
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('register-token error:', err);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to register token.',
      },
    });
  }
}
