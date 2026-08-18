import { appCache } from './cache.ts';
import { supabase, robustFetch } from './supabase.ts';

const SETTINGS_CACHE_PREFIX = 'settings:';

export const getCachedSetting = async (key: string, ttlSeconds = 300): Promise<string | null> => {
  const cacheKey = `${SETTINGS_CACHE_PREFIX}${key}`;

  return appCache.getOrSet<string | null>(
    cacheKey,
    async () => {
      const { data, error } = await robustFetch<any>(
        supabase.from('settings').select('value').eq('key', key).maybeSingle()
      );

      if (error) return null;
      return data?.value ?? null;
    },
    ttlSeconds
  );
};

const truthySettingValues = new Set(['true', '1', 'yes', 'on']);

export const getCachedSettingBoolean = async (
  key: string,
  defaultValue = false,
  ttlSeconds = 300
): Promise<boolean> => {
  const value = await getCachedSetting(key, ttlSeconds);
  if (value === null) return defaultValue;
  return truthySettingValues.has(String(value).trim().toLowerCase());
};

export const invalidateCachedSetting = (key: string): void => {
  appCache.invalidate(`${SETTINGS_CACHE_PREFIX}${key}`);
};
