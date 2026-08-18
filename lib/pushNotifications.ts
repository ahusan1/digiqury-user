import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { PushNotifications, type Token } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { supabase } from './supabase.ts';

type UserRole = 'admin' | 'seller' | 'user' | 'guest';

type PushDebugSnapshot = {
  timestamp: number;
  source: 'push_tap' | 'local_tap' | 'foreground';
  route: string | null;
  payload: Record<string, string>;
};

let listenersBound = false;
let notificationRouteListeners = new Set<(route: string) => void>();
let lastNotificationRoute = '';
let lastNotificationAt = 0;
let pendingNotificationRoute: string | null = null;

const navigateToRoute = (route: string) => {
  try {
    const parsed = new URL(route, window.location.origin);
    const next = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (current === next) return;
    
    const now = Date.now();
    if (next === lastNotificationRoute && now - lastNotificationAt < 1500) {
      return;
    }
    lastNotificationRoute = next;
    lastNotificationAt = now;
    pendingNotificationRoute = next;
    
    notificationRouteListeners.forEach((listener) => {
      try {
        listener(next);
      } catch (err) {
        void err;
      }
    });
  } catch {
    // Fallback for invalid URLs
  }
};

export const subscribeNotificationRoutes = (listener: (route: string) => void): (() => void) => {
  notificationRouteListeners.add(listener);
  if (pendingNotificationRoute) {
    listener(pendingNotificationRoute);
  }
  return () => {
    notificationRouteListeners.delete(listener);
  };
}
let activeIdentity: { userId?: string; role: UserRole } | null = null;
let retryTimer: number | null = null;
let localPermissionChecked = false;
const PUSH_DEBUG_STORAGE_KEY = 'vexora_push_debug_user';
const PUSH_DEBUG_EVENT = 'vexora:push-debug-updated';
const resolveApiUrl = (path: string) => {
  if (!Capacitor.isNativePlatform()) return path;
  const base = String(import.meta.env.VITE_API_BASE_URL || 'https://user-mu-two.vercel.app').replace(/\/+$/, '');
  return `${base}${path}`;
};

const registerTokenOnServer = async (token: string, userId: string | undefined, role: UserRole) => {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(resolveApiUrl('/api/notifications/register-token'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      token,
      role,
      userId,
      platform: Capacitor.getPlatform(),
      appScope: 'user',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    const brief = body ? body.slice(0, 180) : '';
    throw new Error(brief || `Token registration failed with status ${response.status}`);
  }
};

const scheduleRetry = (delayMs = 7000) => {
  if (retryTimer !== null) {
    window.clearTimeout(retryTimer);
  }

  retryTimer = window.setTimeout(() => {
    if (!activeIdentity) return;
    void triggerRegistration();
  }, delayMs);
};

const toStringRecord = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, v == null ? '' : String(v)])
  );
};

const mergePayload = (target: Record<string, string>, source: unknown): Record<string, string> => {
  if (!source || typeof source !== 'object') return target;
  return { ...target, ...toStringRecord(source) };
};

const normalizeNotificationPayload = (raw: unknown): Record<string, string> => {
  const rawObject = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : null;
  let payload = mergePayload({}, rawObject);

  const nestedCandidates: unknown[] = [
    rawObject?.data,
    rawObject?.extra,
    rawObject?.payload,
    payload.data,
    payload.extra,
    payload.payload,
  ];

  for (const candidate of nestedCandidates) {
    if (!candidate) continue;
    if (typeof candidate === 'object') {
      payload = mergePayload(payload, candidate);
      continue;
    }
    if (typeof candidate === 'string') {
      try {
        payload = mergePayload(payload, JSON.parse(candidate));
      } catch {
        // Ignore non-JSON nested values.
      }
    }
  }

  return payload;
};

const resolveProductRouteFromUrl = (rawUrl: string): string | null => {
  try {
    const parsed = new URL(rawUrl);
    const protocol = parsed.protocol.replace(':', '').toLowerCase();

    if (protocol === 'vexora' && parsed.hostname.toLowerCase() === 'product') {
      const productId = parsed.pathname.replace(/^\/+/, '').split('/')[0];
      return productId ? `/product/${encodeURIComponent(productId)}` : null;
    }

    if (protocol === 'http' || protocol === 'https') {
      const host = parsed.host.toLowerCase();
      const allowedHosts = new Set([
        'plusvexora.vercel.app',
        'www.plusvexora.vercel.app',
        'user-mu-two.vercel.app',
        'seller-ochre.vercel.app',
        'adminvexora.vercel.app',
        'vexoraplus.vercel.app',
        window.location.host.toLowerCase(),
      ]);

      if (!allowedHosts.has(host)) return null;

      if (parsed.pathname.startsWith('/api/share/product/')) {
        const productId = parsed.pathname.replace('/api/share/product/', '').split('/')[0];
        if (productId) {
          return `/product/${encodeURIComponent(productId)}`;
        }
      }

      if (parsed.pathname.startsWith('/product/')) {
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
      }

      const queryProductId = parsed.searchParams.get('productId') || parsed.searchParams.get('id');
      if (queryProductId) {
        return `/product/${encodeURIComponent(queryProductId)}`;
      }

      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    return null;
  }

  return null;
};

const remapRouteForUserApp = (route: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(route, window.location.origin);
  } catch {
    return route;
  }

  const suffix = `${parsed.search}${parsed.hash}`;
  const pathname = parsed.pathname;

  if (pathname.startsWith('/product/')) return `${pathname}${suffix}`;
  if (pathname === '/support' || pathname.startsWith('/support/')) return `/support${suffix}`;
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/downloads') || pathname.startsWith('/profile')) return `${pathname}${suffix}`;

  if (pathname.startsWith('/seller/')) {
    if (pathname.includes('/sales') || pathname.includes('/wallet')) return `/dashboard${suffix}`;
    return '/';
  }

  if (pathname.startsWith('/admin/orders')) return `/dashboard${suffix}`;
  if (pathname.startsWith('/admin/support')) return `/support${suffix}`;
  if (pathname.startsWith('/admin/')) return `/dashboard${suffix}`;

  return `${pathname}${suffix}`;
};

const normalizeInAppPath = (rawPath: string): string | null => {
  const trimmed = rawPath.trim();
  if (!trimmed) return null;

  const resolvedByUrl = resolveProductRouteFromUrl(trimmed);
  if (resolvedByUrl) return resolvedByUrl;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed, window.location.origin);
      if (parsed.origin !== window.location.origin) return null;
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return null;
    }
  }

  if (trimmed.startsWith('/')) return remapRouteForUserApp(trimmed);
  return remapRouteForUserApp(`/${trimmed}`);
};

const isSystemClickAction = (value: string): boolean => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return true;
  return normalized === 'FCM_PLUGIN_ACTIVITY' || normalized === 'FLUTTER_NOTIFICATION_CLICK';
};

const resolveRouteFromPayload = (data: Record<string, string>): string | null => {
  const direct = data.deepLink || data.deeplink || data.route || data.path || data.url || data.link || data.click_action;
  if (direct && isSystemClickAction(direct)) {
    // Android push click action marker, not a navigable route.
  } else if (direct) {
    const directRoute = normalizeInAppPath(direct);
    if (directRoute) return directRoute;
  }

  const payloadProductId = String(data.productId || data.product_id || '').trim();
  if (payloadProductId) {
    return `/product/${encodeURIComponent(payloadProductId)}`;
  }

  switch (data.type) {
    case 'purchase_event':
      return '/dashboard';
    case 'new_product_uploaded':
    case 'product_published':
      return payloadProductId ? `/product/${encodeURIComponent(payloadProductId)}` : '/';
    case 'product_price_drop':
      return payloadProductId ? `/product/${encodeURIComponent(payloadProductId)}` : '/';
    case 'promotional':
      return '/';
    case 'admin_activity':
      return '/support';
    case 'support_reply':
      return (data.threadId || data.thread_id)
        ? `/support?threadId=${encodeURIComponent(String(data.threadId || data.thread_id))}`
        : '/support';
    case 'withdrawal_approved':
    case 'withdrawal_rejected':
    case 'withdrawal_completed':
    case 'order_payment_released':
      return '/dashboard';
    case 'seller_product_approved':
    case 'seller_product_enabled':
    case 'seller_product_disabled':
    case 'seller_product_deleted':
    case 'seller_product_rejected':
    case 'seller_product_updated':
      return payloadProductId ? `/product/${encodeURIComponent(payloadProductId)}` : '/dashboard';
    default:
      return '/';
  }
};

const savePushDebugSnapshot = (
  source: PushDebugSnapshot['source'],
  payload: Record<string, string>,
  route: string | null
) => {
  const snapshot: PushDebugSnapshot = {
    timestamp: Date.now(),
    source,
    route,
    payload,
  };

  try {
    localStorage.setItem(PUSH_DEBUG_STORAGE_KEY, JSON.stringify(snapshot));
    window.dispatchEvent(new CustomEvent(PUSH_DEBUG_EVENT, { detail: snapshot }));
  } catch {
    // Ignore storage/event failures in low-permission contexts.
  }
};

const navigateFromNotification = (data: Record<string, string>) => {
  const route = resolveRouteFromPayload(data) || '/dashboard';
  console.log('[NAVIGATE] Attempting to navigate to:', route);
  console.log('[NAVIGATE] Current location:', window.location.href);
  try {
    window.location.assign(route);
    console.log('[NAVIGATE] Navigation initiated');
  } catch (err) {
    console.error('[NAVIGATE] Navigation failed:', err);
  }
};

const ensureLocalNotificationPermission = async () => {
  if (localPermissionChecked) return;
  const status = await LocalNotifications.checkPermissions();
  if (status.display === 'granted') {
    localPermissionChecked = true;
    return;
  }

  const requested = await LocalNotifications.requestPermissions();
  if (requested.display === 'granted') {
    localPermissionChecked = true;
  }
};

const showForegroundLocalNotification = async (notification: { title?: string; body?: string; data?: unknown }) => {
  await ensureLocalNotificationPermission();
  if (!localPermissionChecked) return;

  const data = toStringRecord(notification.data);
  const route = resolveRouteFromPayload(data);
  savePushDebugSnapshot('foreground', data, route);
  const id = Math.floor(Date.now() % 2147483000);
  
  // Extract image URL if available
  const imageUrl = data.image || data.imageUrl || '';

  await LocalNotifications.schedule({
    notifications: [
      {
        id,
        title: notification.title || 'DIGi QuRY Update',
        body: notification.body || 'You have a new update.',
        smallIcon: 'ic_stat_notify',
        sound: 'default',
        extra: {
          ...data,
          deepLink: route || data.deepLink || '',
          image: imageUrl, // Keep image in extras too
        },
      },
    ],
  });
};

const triggerRegistration = async () => {
  const permissionStatus = await PushNotifications.checkPermissions();
  let receive = permissionStatus.receive;

  if (receive === 'prompt') {
    const requested = await PushNotifications.requestPermissions();
    receive = requested.receive;
  }

  if (receive !== 'granted') {
    return;
  }

  await PushNotifications.register();
};

const bindListenersOnce = () => {
  if (listenersBound) {
    console.log('[BIND] Listeners already bound');
    return;
  }
  
  console.log('[BIND] Binding listeners for first time');

  PushNotifications.addListener('registration', async (token: Token) => {
    console.log('[REGISTRATION] Token received:', token.value);
    if (!activeIdentity) {
      console.warn('[REGISTRATION] No active identity, skipping server sync');
      return;
    }
    try {
      await registerTokenOnServer(token.value, activeIdentity.userId, activeIdentity.role);
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
      console.info('Push token synced to server for role:', activeIdentity.role);
    } catch (err) {
      console.error('Push token sync failed:', err);
      scheduleRetry();
    }
  });

  PushNotifications.addListener('registrationError', (error) => {
    console.error('Push registration error:', error);
    scheduleRetry();
  });

  App.addListener('appStateChange', ({ isActive }) => {
    console.log('[APP_STATE] App state changed, active:', isActive);
    if (!isActive || !activeIdentity) return;
    void triggerRegistration();
  });

  PushNotifications.addListener('pushNotificationReceived', async (notification) => {
    console.log('[PUSH_RECEIVED] Foreground notification:', JSON.stringify(notification, null, 2));
    try {
      await showForegroundLocalNotification(notification);
    } catch (error) {
      console.error('Failed to show foreground local notification:', error);
    }
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
    console.log('[PUSH_TAP] Event received:', JSON.stringify(event, null, 2));
    const payload = normalizeNotificationPayload(event.notification?.data || event.notification || event);
    console.log('[PUSH_TAP] Normalized payload:', payload);
    const route = resolveRouteFromPayload(payload);
    console.log('[PUSH_TAP] Resolved route:', route);
    savePushDebugSnapshot('push_tap', payload, route);
    navigateFromNotification(payload);
  });

  LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    console.log('[LOCAL_TAP] Event received:', JSON.stringify(event, null, 2));
    const payload = normalizeNotificationPayload(event.notification?.extra || event.notification || event);
    console.log('[LOCAL_TAP] Normalized payload:', payload);
    const route = resolveRouteFromPayload(payload);
    console.log('[LOCAL_TAP] Resolved route:', route);
    savePushDebugSnapshot('local_tap', payload, route);
    navigateFromNotification(payload);
  });

  listenersBound = true;
  console.log('[BIND] Listeners bound successfully');
};

if (Capacitor.isNativePlatform()) {
  console.log('[INIT] Native platform detected, binding listeners at module load');
  bindListenersOnce();
} else {
  console.log('[INIT] Web platform detected, listeners will bind on auth');
}

export const syncPushTokenForCurrentUser = async (userId: string, role: UserRole) => {
  if (!Capacitor.isNativePlatform()) return;

  activeIdentity = { userId, role };
  bindListenersOnce();

  await triggerRegistration();
  scheduleRetry();
};

export const syncPushTokenForGuest = async () => {
  await syncPushTokenForCurrentUser('', 'guest');
};

export const getLastPushDebugSnapshot = (): PushDebugSnapshot | null => {
  try {
    const raw = localStorage.getItem(PUSH_DEBUG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PushDebugSnapshot;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
};
