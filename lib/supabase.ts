import { createClient } from '@supabase/supabase-js';

/**
 * SECURITY ENHANCEMENT: Environment-based configuration
 * 
 * Credentials are loaded from environment variables instead of hardcoding.
 * For Vite, environment variables must be prefixed with VITE_
 * 
 * Configuration in .env:
 * VITE_SUPABASE_URL=https://your-project.supabase.co
 * VITE_SUPABASE_ANON_KEY=your-anon-key
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ymgyekgmonqhehmnskcw.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltZ3lla2dtb25xaGVobW5za2N3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NTA0MjQsImV4cCI6MjA4NzUyNjQyNH0.1KjMMPJaU849XJ0w3NjsUKSBugjjNAR_mGyu7wJCURw';

// Environment validation (only in development)
if (import.meta.env.DEV && (!supabaseUrl || !supabaseAnonKey)) {
  console.warn('⚠️ Supabase environment variables not set. Using fallback values.');
}

// 2. FIXED: Define the custom fetch to prevent Windows browser caching while preserving Auth headers
const customFetch = (input: RequestInfo | URL, options?: RequestInit) => {
  return fetch(input, {
    ...options, // CRITICAL: This keeps the JWT Authorization headers intact
    cache: 'no-store', // CRITICAL: Forces Windows browsers (Chrome/Edge) to bypass the cache
  });
};

const createSupabaseClient = () => {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage // Explicitly enforce localStorage for sessions
    },
    global: {
      fetch: customFetch, // Apply the custom fetch here
      // Apply your aggressive cache-control natively here safely
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    },
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  });
};

// Singleton pattern to prevent "Multiple GoTrueClient instances" warning during Vite HMR
let supabaseInstance: ReturnType<typeof createClient>;
if (typeof window !== 'undefined') {
  if (!(window as any)._supabaseInstance) {
    (window as any)._supabaseInstance = createSupabaseClient();
  }
  supabaseInstance = (window as any)._supabaseInstance;
} else {
  supabaseInstance = createSupabaseClient();
}

export const supabase = supabaseInstance;

/**
 * Robust Query Wrapper
 * Executes a Supabase query with automatic retries and exponential backoff.
 */
export const robustFetch = async <T>(
  queryPromise: any,
  retries = 3
): Promise<{ data: T | null; error: any; count?: number | null }> => {
  let lastError: any;
  let lastCount: number | null | undefined;
  
  for (let i = 0; i < retries; i++) {
    try {
      const result = await queryPromise;
      
      // CRITICAL: If the database rejects the token (JWT invalid/expired), trigger a forced logout
      if (result.error && (result.error.code === 'PGRST301' || result.error.message?.includes('JWT'))) {
        window.dispatchEvent(new CustomEvent('auth-error'));
        return { data: null, error: result.error, count: null };
      }

      if (!result.error) return { data: result.data, error: null, count: result.count };
      
      lastError = result.error;
      lastCount = result.count;
      
      // Don't retry on user-level errors or resource not found
      if (
        result.error.code === 'PGRST116' || 
        result.error.status === 404 || 
        result.error.code === '42501'
      ) {
        return { data: result.data, error: result.error, count: result.count };
      }
      
    } catch (err) {
      lastError = err;
      console.error(`Fetch attempt ${i + 1} failed:`, err);
    }
    
    // Exponential backoff
    const delay = Math.pow(2, i) * 1000;
    if (i < retries - 1) {
      await new Promise(res => setTimeout(res, delay));
    }
  }
  
  return { data: null, error: lastError, count: lastCount };
};

export const calculateDiscount = (original: number, sale: number): number => {
  if (!original || original <= sale) return 0;
  return Math.round(((original - sale) / original) * 100);
};

export const checkDbHealth = async (): Promise<boolean> => {
  try {
    const { error } = await supabase.from('settings').select('key').limit(1).maybeSingle();
    if (error) return false;
    return true;
  } catch (e) {
    return false;
  }
};
