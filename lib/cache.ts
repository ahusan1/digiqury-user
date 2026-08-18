
interface CacheItem<T> {
  data: T;
  expiry: number;
}

class MemoryCache {
  private cache: Map<string, CacheItem<any>> = new Map();
  private inFlight: Map<string, Promise<any>> = new Map();
  private defaultTTL: number = 300; // 5 minutes in seconds

  /**
   * Get data from cache if it exists and is not expired
   */
  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }

    return item.data as T;
  }

  /**
   * Set data into cache with a specific TTL
   */
  set<T>(key: string, data: T, ttlInSeconds: number = this.defaultTTL): void {
    const expiry = Date.now() + ttlInSeconds * 1000;
    this.cache.set(key, { data, expiry });
  }

  /**
   * Get cached value or resolve it once for all concurrent callers
   */
  async getOrSet<T>(key: string, loader: () => Promise<T>, ttlInSeconds: number = this.defaultTTL): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const pending = this.inFlight.get(key);
    if (pending) {
      return pending as Promise<T>;
    }

    const loadPromise = loader()
      .then((data) => {
        this.set(key, data, ttlInSeconds);
        return data;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, loadPromise);
    return loadPromise;
  }

  /**
   * Remove a specific key
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Remove all keys starting with a specific prefix
   */
  invalidatePrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    this.inFlight.clear();
  }
}

export const appCache = new MemoryCache();
