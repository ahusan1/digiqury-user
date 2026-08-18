import { Capacitor } from '@capacitor/core';

const FALLBACK_PUBLIC_ORIGIN = 'https://www.digiqury.in';

const sanitizeOrigin = (value: string): string => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return FALLBACK_PUBLIC_ORIGIN;

  try {
    const parsed = new URL(trimmed);
    return parsed.origin;
  } catch {
    return FALLBACK_PUBLIC_ORIGIN;
  }
};

export const getPublicAppOrigin = (): string => {
  const envOrigin = sanitizeOrigin(String(import.meta.env.VITE_PUBLIC_APP_URL || FALLBACK_PUBLIC_ORIGIN));
  const runtimeOrigin = window.location.origin;

  if (Capacitor.isNativePlatform()) {
    return envOrigin;
  }

  if (/localhost|127\.0\.0\.1/i.test(runtimeOrigin)) {
    return envOrigin;
  }

  return runtimeOrigin;
};

export const buildProductShareUrl = (productId: string): string => {
  return `${getPublicAppOrigin()}/product/${encodeURIComponent(String(productId || '').trim())}`;
};
