import type { RateLimiterStore } from './rateLimiterStore.js';
import TTLCache from '@isaacs/ttlcache';

export class TTLStore implements RateLimiterStore {
  private cache: TTLCache<string, number>;

  constructor(maxTTL: number, maxItems = Infinity) {
    this.cache = new TTLCache({
      ttl: maxTTL,
      max: maxItems,
      noUpdateTTL: true
    });
  }

  async clear() {
    return this.cache.clear();
  }

  async add(hash: string, ttl: number) {
    const currentRate = this.cache.get(hash) ?? 0;
    return this.set(hash, currentRate + 1, ttl);
  }

  private set(hash: string, rate: number, ttl: number): number {
    this.cache.set(hash, rate, { ttl });
    return rate;
  }
}
