import admin from 'firebase-admin';

let initialized = false;
const MAX_TOKENS_PER_BATCH = 500;
const MAX_RETRIES = 2;
const RETRYABLE_ERROR_CODES = [
  'messaging/internal-error',
  'messaging/server-unavailable',
  'messaging/unknown-error',
];

function initFirebaseAdmin() {
  if (initialized) return;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is missing');
  }

  const serviceAccount = JSON.parse(raw);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  initialized = true;
}

function chunkTokens(tokens) {
  const batches = [];
  for (let i = 0; i < tokens.length; i += MAX_TOKENS_PER_BATCH) {
    batches.push(tokens.slice(i, i + MAX_TOKENS_PER_BATCH));
  }
  return batches;
}

function isInvalidTokenError(code) {
  return (
    code.includes('registration-token-not-registered') ||
    code.includes('invalid-registration-token')
  );
}

function isRetryableError(code) {
  return RETRYABLE_ERROR_CODES.some((retryCode) => code.includes(retryCode));
}

async function sendWithRetry(tokens, title, message, data, imageUrl) {
  let pendingTokens = [...tokens];
  let sent = 0;
  let failed = 0;
  let retried = 0;
  const invalidTokens = [];

  for (let attempt = 0; attempt <= MAX_RETRIES && pendingTokens.length > 0; attempt++) {
    const tokensForAttempt = [...pendingTokens];
    pendingTokens = [];

    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }

    for (const batch of chunkTokens(tokensForAttempt)) {
      const response = await admin.messaging().sendEachForMulticast({
        tokens: batch,
        notification: {
          title,
          body: message,
          ...(imageUrl ? { imageUrl } : {}),
        },
        data: Object.fromEntries(
          Object.entries(data || {}).map(([key, value]) => [String(key), String(value)])
        ),
        android: {
          priority: 'high',
          ttl: 7 * 24 * 60 * 60 * 1000,
          notification: {
            ...(imageUrl ? { imageUrl } : {}),
            sound: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              'mutable-content': 1,
            },
          },
          fcmOptions: {
            ...(imageUrl ? { imageUrl } : {}),
          },
        },
        webpush: {
          notification: {
            title,
            body: message,
            ...(imageUrl ? { image: imageUrl, icon: imageUrl } : {}),
          },
        },
      });

      response.responses.forEach((item, idx) => {
        const token = batch[idx];
        if (item.success) {
          sent += 1;
          return;
        }

        const code = item.error?.code || '';
        if (isInvalidTokenError(code)) {
          invalidTokens.push(token);
          failed += 1;
          return;
        }

        if (attempt < MAX_RETRIES && isRetryableError(code)) {
          pendingTokens.push(token);
          retried += 1;
          return;
        }

        failed += 1;
      });
    }
  }

  return {
    sent,
    failed,
    retried,
    invalidTokens,
  };
}

export async function sendPushToTokens(supabaseAdmin, { tokens, title, message, data, imageUrl }) {
  initFirebaseAdmin();

  const result = await sendWithRetry(tokens, title, message, data, String(imageUrl || '').trim());

  if (result.invalidTokens.length > 0) {
    await supabaseAdmin.from('fcm_device_tokens').delete().in('device_token', result.invalidTokens);
  }

  return {
    sent: result.sent,
    failed: result.failed,
    retried: result.retried,
    invalidTokensRemoved: result.invalidTokens.length,
  };
}
