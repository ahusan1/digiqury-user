import { strictCorsMiddleware } from '../_middleware/cors.js';
import { rateLimiterMiddleware } from '../_middleware/rateLimiter.js';
import { requireAuth, getAdminClient } from '../_middleware/auth.js';
import { sendPushToTokens } from './_sendCore.js';

const normalizeIds = (value) => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
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

    const user = await requireAuth(req, res, { roles: ['user'], optional: true });
    const rateLimitPassed = await rateLimiterMiddleware(req, res, null, user?.id || null);
    if (!rateLimitPassed) return;

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const productIds = normalizeIds(body.productIds);
    const itemCount = Number(body.itemCount || productIds.length || 0);
    const totalAmount = Number(body.totalAmount || 0);
    const buyerName = String(body.buyerName || 'User').trim();
    const paymentId = String(body.paymentId || '').trim();

    if (productIds.length === 0 || itemCount <= 0 || totalAmount <= 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PAYLOAD',
          message: 'productIds, itemCount and totalAmount are required.',
        },
      });
    }

    const supabaseAdmin = getAdminClient();

    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('id,seller_id,title,preview_image')
      .in('id', productIds)
      .limit(200);

    if (productsError) {
      return res.status(500).json({
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to load product ownership.',
        },
      });
    }

    const sellerIds = [...new Set((products || []).map((row) => String(row.seller_id || '').trim()).filter(Boolean))];

    const { data: adminRows, error: adminTokenError } = await supabaseAdmin
      .from('fcm_device_tokens')
      .select('device_token')
      .or('role.eq.admin,app_scope.eq.admin')
      .limit(5000);

    if (adminTokenError) {
      return res.status(500).json({
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to load admin tokens.',
        },
      });
    }

    let sellerRows = [];
    if (sellerIds.length > 0) {
      const { data, error: sellerTokenError } = await supabaseAdmin
        .from('fcm_device_tokens')
        .select('device_token')
        .in('user_id', sellerIds)
        .or('role.eq.seller,app_scope.eq.seller')
        .limit(5000);

      if (sellerTokenError) {
        return res.status(500).json({
          error: {
            code: 'DATABASE_ERROR',
            message: 'Failed to load seller tokens.',
          },
        });
      }

      sellerRows = data || [];
    }

    const tokens = [
      ...new Set([
        ...(adminRows || []).map((row) => row.device_token),
        ...sellerRows.map((row) => row.device_token),
      ].filter(Boolean)),
    ];

    if (tokens.length === 0) {
      return res.status(200).json({ success: true, sent: 0, failed: 0, note: 'No recipients.' });
    }

    const sellerScoped = sellerIds.length > 0;
    const title = sellerScoped ? 'New Seller Order' : 'New Order';
    const message = sellerScoped
      ? `${buyerName} purchased ${itemCount} item(s), total Rs ${totalAmount.toFixed(2)}.`
      : `${buyerName} completed purchase of ${itemCount} item(s), total Rs ${totalAmount.toFixed(2)}.`;

    const result = await sendPushToTokens(supabaseAdmin, {
      tokens,
      title,
      message,
      imageUrl: String((products || [])[0]?.preview_image || '').trim(),
      data: {
        type: 'purchase_event',
        sourceApp: 'user',
        actorRole: String(req.userProfile?.role || 'guest'),
        actorId: String(user?.id || ''),
        paymentId,
        itemCount: String(itemCount),
        totalAmount: String(totalAmount),
        hasSellerRecipient: sellerScoped ? '1' : '0',
        image: String((products || [])[0]?.preview_image || '').trim(),
      },
    });

    return res.status(200).json({
      success: true,
      sent: result.sent,
      failed: result.failed,
      invalidTokensRemoved: result.invalidTokensRemoved,
      sellerRecipients: sellerIds.length,
    });
  } catch (err) {
    console.error('purchase notification error:', err);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to send purchase notification.',
      },
    });
  }
}
