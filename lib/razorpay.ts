import { Capacitor } from '@capacitor/core';
import { Checkout } from 'capacitor-razorpay';

type RazorpayHandler = (response: Record<string, any>) => void | Promise<void>;

interface RazorpayModalOptions {
  ondismiss?: () => void;
  [key: string]: any;
}

export interface RazorpayCheckoutOptions {
  key: string;
  amount: number | string;
  currency: string;
  name?: string;
  description?: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, any>;
  theme?: Record<string, any>;
  modal?: RazorpayModalOptions;
  handler?: RazorpayHandler;
  method?: Record<string, boolean>;
  upi?: Record<string, any>;
  config?: Record<string, any>;
  [key: string]: any;
}

let razorpayLoaderPromise: Promise<boolean> | null = null;

const normalizeIndianContact = (value: string): string => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 10) return '';
  return digits.slice(-10);
};

const normalizePluginResponse = (response: unknown): Record<string, any> => {
  if (!response) return {};
  if (typeof response === 'string') {
    try {
      return JSON.parse(response);
    } catch {
      return { razorpay_payment_id: response };
    }
  }
  if (typeof response === 'object') {
    return response as Record<string, any>;
  }
  return { razorpay_payment_id: String(response) };
};

const normalizePluginError = (error: unknown): { message: string; cancelled: boolean } => {
  if (error instanceof Error) {
    const message = error.message || 'Payment failed';
    const cancelled = /cancel/i.test(message);
    return { message, cancelled };
  }

  if (typeof error === 'string') {
    try {
      const parsed = JSON.parse(error);
      const code = Number(parsed?.code);
      const message = String(parsed?.description || parsed?.message || error);
      const cancelled = code === 2 || /cancel/i.test(message);
      return { message, cancelled };
    } catch {
      const message = error;
      return { message, cancelled: /cancel/i.test(message) };
    }
  }

  const message = 'Payment failed';
  return { message, cancelled: false };
};

const applyCheckoutEnhancements = (options: RazorpayCheckoutOptions): RazorpayCheckoutOptions => {
  const normalizedContact = normalizeIndianContact(options.prefill?.contact || '');
  const isNativeRuntime = Capacitor.isNativePlatform();
  const resolvedUpiFlow = (options.upi?.flow as string | undefined) || (isNativeRuntime ? 'intent' : 'collect');

  const baseOptions: RazorpayCheckoutOptions = {
    ...options,
    method: {
      card: true,
      netbanking: true,
      wallet: true,
      paylater: true,
      emi: true,
      ...(options.method || {}),
      upi: true,
    },
    upi: {
      ...(options.upi || {}),
      flow: resolvedUpiFlow,
    },
    prefill: {
      ...(options.prefill || {}),
      contact: normalizedContact || options.prefill?.contact || '',
    },
  };

  if (!isNativeRuntime && !options.config) {
    baseOptions.config = {
      display: {
        blocks: {
          upi: {
            name: 'Pay using UPI',
            instruments: [{ method: 'upi' }],
          },
        },
        sequence: ['block.upi'],
        preferences: {
          show_default_blocks: true,
        },
      },
    };
  }

  return baseOptions;
};

export const ensureRazorpayLoaded = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false;

  if ((window as any).Razorpay) {
    return true;
  }

  if (razorpayLoaderPromise) {
    return razorpayLoaderPromise;
  }

  razorpayLoaderPromise = new Promise<boolean>((resolve) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-razorpay-sdk="true"]');

    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(Boolean((window as any).Razorpay)), { once: true });
      existingScript.addEventListener('error', () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.dataset.razorpaySdk = 'true';

    script.onload = () => resolve(Boolean((window as any).Razorpay));
    script.onerror = () => resolve(false);

    document.head.appendChild(script);
  });

  const loaded = await razorpayLoaderPromise;

  if (!loaded) {
    razorpayLoaderPromise = null;
  }

  return loaded;
};

const openWebRazorpayCheckout = async (options: RazorpayCheckoutOptions): Promise<void> => {
  const sdkLoaded = await ensureRazorpayLoaded();
  if (!sdkLoaded || typeof window === 'undefined') {
    throw new Error('Payment gateway failed to load. Please try again.');
  }

  await new Promise<void>((resolve, reject) => {
    const Razorpay = (window as any).Razorpay;
    if (!Razorpay) {
      reject(new Error('Payment gateway failed to load. Please try again.'));
      return;
    }

    const modal = options.modal || {};
    let settled = false;
    const settleResolve = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const settleReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const webOptions: RazorpayCheckoutOptions = {
      ...options,
      handler: async (response: Record<string, any>) => {
        try {
          if (options.handler) {
            await options.handler(response);
          }
          settleResolve();
        } catch (handlerError) {
          settleReject(handlerError);
        }
      },
      modal: {
        ...modal,
        ondismiss: () => {
          if (typeof modal.ondismiss === 'function') {
            modal.ondismiss();
          }
          settleResolve();
        },
      },
    };

    try {
      const rzp = new Razorpay(webOptions);
      if (typeof rzp.on === 'function') {
        rzp.on('payment.failed', (payload: any) => {
          const message = payload?.error?.description || payload?.error?.reason || 'Payment failed';
          settleReject(new Error(message));
        });
      }
      rzp.open();
    } catch (error) {
      settleReject(error);
    }
  });
};

const openNativeRazorpayCheckout = async (options: RazorpayCheckoutOptions): Promise<void> => {
  const modal = options.modal || {};
  const nativeOptions = {
    ...options,
    amount: String(options.amount),
  };
  delete (nativeOptions as any).handler;

  console.log('Razorpay native checkout, platform:', Capacitor.getPlatform(), 'options:', {
    ...nativeOptions,
    amount: nativeOptions.amount,
    upi: nativeOptions.upi,
  });

  try {
    const result = await Checkout.open(nativeOptions as any);
    const response = normalizePluginResponse((result as any)?.response ?? result);
    if (options.handler) {
      await options.handler(response);
    }
  } catch (error) {
    console.error('Razorpay native checkout failed:', error);
    const normalizedError = normalizePluginError(error);
    if (normalizedError.cancelled) {
      if (typeof modal.ondismiss === 'function') {
        modal.ondismiss();
      }
      return;
    }

    const lower = normalizedError.message.toLowerCase();
    const unimplemented = lower.includes('not implemented') || lower.includes('unimplemented');
    if (unimplemented) {
      await openWebRazorpayCheckout(options);
      return;
    }

    throw new Error(normalizedError.message || 'Payment failed');
  }
};

export const openRazorpayCheckout = async (options: RazorpayCheckoutOptions): Promise<void> => {
  const enhancedOptions = applyCheckoutEnhancements(options);
  if (Capacitor.isNativePlatform()) {
    // Prefer native SDK on Android for best UPI app visibility; fallback to web checkout if native fails.
    try {
      await openNativeRazorpayCheckout(enhancedOptions);
      return;
    } catch {
      await openWebRazorpayCheckout(enhancedOptions);
      return;
    }
  }

  await openWebRazorpayCheckout(enhancedOptions);
};
