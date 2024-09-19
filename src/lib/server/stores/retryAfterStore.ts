import type { RateLimiterStore } from './rateLimiterStore.js';
import TTLCache from '@isaacs/ttlcache';

export class RetryAfterStore implements RateLimiterStore {
  private cache: TTLCache<string, number>;

  constructor(maxItems = Infinity) {
    this.cache = new TTLCache({
      max: maxItems,
      noUpdateTTL: true
    });
  }

  async clear() {
    return this.cache.clear();
  }

  async add(hash: string, ttl: number) {
    const currentRate = this.cache.get(hash);
    if (currentRate) return this.cache.get(hash) ?? 0;

    const retryAfter = Date.now() + ttl;
    this.cache.set(hash, retryAfter, { ttl });

    return retryAfter;
  }
}
