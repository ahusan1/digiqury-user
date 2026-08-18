import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

let initialized = false;
let pendingRoute: string | null = null;
const listeners = new Set<(route: string) => void>();
let lastEmittedRoute = '';
let lastEmittedAt = 0;

const normalizeRoute = (route: string): string | null => {
  const trimmed = String(route || '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/')) return trimmed;
  return `/${trimmed}`;
};

const resolveRouteFromUrl = (rawUrl: string): string | null => {
  if (!rawUrl) return null;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  const protocol = parsed.protocol.replace(':', '').toLowerCase();
  const host = parsed.host.toLowerCase();

  if (protocol === 'vexora') {
    if (parsed.hostname.toLowerCase() === 'product') {
      const productId = parsed.pathname.replace(/^\/+/, '').split('/')[0];
      if (!productId) return null;
      return `/product/${encodeURIComponent(productId)}`;
    }

    if (parsed.hostname.toLowerCase() === 'open') {
      const segments = parsed.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
      if (segments[0] === 'product' && segments[1]) {
        return `/product/${encodeURIComponent(segments[1])}`;
      }
    }

    const queryProductId = parsed.searchParams.get('productId') || parsed.searchParams.get('id');
    if (queryProductId) {
      return `/product/${encodeURIComponent(queryProductId)}`;
    }
  }

  const allowedHosts = new Set([
    'plusvexora.vercel.app',
    'user-mu-two.vercel.app',
    'vexoraplus.vercel.app',
    'www.plusvexora.vercel.app',
    'user-hasans-projects-33486bf1.vercel.app',
    'user-ahusan1-hasans-projects-33486bf1.vercel.app',
    window.location.host.toLowerCase(),
  ]);

  if ((protocol === 'https' || protocol === 'http') && allowedHosts.has(host)) {
    if (parsed.pathname.startsWith('/api/share/product/')) {
      const productId = parsed.pathname.replace('/api/share/product/', '').split('/')[0];
      if (productId) {
        return `/product/${encodeURIComponent(productId)}`;
      }
    }

    if (parsed.pathname.startsWith('/share/product/')) {
      const productId = parsed.pathname.replace('/share/product/', '').split('/')[0];
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
  }

  return null;
};

const navigateIfNeeded = (route: string | null) => {
  const safeRoute = route ? normalizeRoute(route) : null;
  if (!safeRoute) return;

  const now = Date.now();
  if (safeRoute === lastEmittedRoute && now - lastEmittedAt < 1500) {
    return;
  }

  lastEmittedRoute = safeRoute;
  lastEmittedAt = now;

  pendingRoute = safeRoute;
  listeners.forEach((listener) => {
    try {
      listener(safeRoute);
    } catch {
      // Ignore listener errors.
    }
  });
};

export const subscribeDeepLinkRoutes = (listener: (route: string) => void): (() => void) => {
  listeners.add(listener);

  if (pendingRoute) {
    listener(pendingRoute);
  }

  return () => {
    listeners.delete(listener);
  };
};

const handleIncomingUrl = (rawUrl: string) => {
  const route = resolveRouteFromUrl(rawUrl);
  navigateIfNeeded(route);
};

export const initDeepLinkHandling = async () => {
  if (!Capacitor.isNativePlatform() || initialized) return;
  initialized = true;

  App.addListener('appUrlOpen', ({ url }) => {
    handleIncomingUrl(String(url || ''));
  });

  try {
    const launch = await App.getLaunchUrl();
    if (launch?.url) {
      handleIncomingUrl(launch.url);
    }
  } catch {
    // Ignore launch URL read failures.
  }
};

export const clearPendingDeepLinkRoute = () => {
  pendingRoute = null;
};
