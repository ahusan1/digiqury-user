import { strictCorsMiddleware } from '../_middleware/cors.js';
import { rateLimiterMiddleware } from '../_middleware/rateLimiter.js';
import { requireAuth, getAdminClient } from '../_middleware/auth.js';
import { sendPushToTokens } from './_sendCore.js';

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
    const title = String(body.title || '').trim() || 'User Activity';
    const message = String(body.message || '').trim();
    const imageUrl = String(body.imageUrl || body.image || '').trim();

    if (!message) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PAYLOAD',
          message: 'message is required.',
        },
      });
    }

    const supabaseAdmin = getAdminClient();
    const { data: rows, error: tokenError } = await supabaseAdmin
      .from('fcm_device_tokens')
      .select('device_token')
      .or('role.eq.admin,app_scope.eq.admin')
      .limit(5000);

    if (tokenError) {
      return res.status(500).json({
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to load admin tokens.',
        },
      });
    }

    const tokens = [...new Set((rows || []).map((row) => row.device_token).filter(Boolean))];

    if (tokens.length === 0) {
      return res.status(200).json({ success: true, sent: 0, failed: 0, note: 'No admin recipients.' });
    }

    const result = await sendPushToTokens(supabaseAdmin, {
      tokens,
      title,
      message,
      imageUrl,
      data: {
        type: 'admin_activity',
        sourceApp: 'user',
        actorRole: String(req.userProfile?.role || 'guest'),
        actorId: String(user?.id || ''),
        image: imageUrl,
      },
    });

    return res.status(200).json({
      success: true,
      sent: result.sent,
      failed: result.failed,
      invalidTokensRemoved: result.invalidTokensRemoved,
    });
  } catch (err) {
    console.error('activity notification error:', err);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to send activity notification.',
      },
    });
  }
}
