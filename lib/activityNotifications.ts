import { supabase } from './supabase.ts';
import { Capacitor } from '@capacitor/core';

type ActivityPayload = {
  title: string;
  message: string;
};

type PurchasePayload = {
  productIds: string[];
  itemCount: number;
  totalAmount: number;
  paymentId?: string;
  buyerName?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const buildAuthHeaders = async () => {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
};

const resolveApiUrl = (path: string) => {
  if (!Capacitor.isNativePlatform()) return path;
  const base = String(import.meta.env.VITE_API_BASE_URL || 'https://user-mu-two.vercel.app').replace(/\/+$/, '');
  return `${base}${path}`;
};

const postWithRetry = async (path: string, payload: unknown) => {
  const url = resolveApiUrl(path);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const headers = await buildAuthHeaders();
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (response.ok) return true;

      if (response.status < 500) {
        const body = await response.text();
        console.warn(`Notification API rejected (${response.status}):`, body.slice(0, 180));
        return false;
      }
    } catch (err) {
      if (attempt === 2) {
        console.warn('Notification request failed after retries:', err);
        return false;
      }
    }

    await sleep(250 * (attempt + 1));
  }

  return false;
};

export async function notifyAdminActivity(payload: ActivityPayload): Promise<void> {
  await postWithRetry('/api/notifications/activity', payload);
}

export async function notifyPurchaseActivity(payload: PurchasePayload): Promise<void> {
  await postWithRetry('/api/notifications/purchase', payload);
}
