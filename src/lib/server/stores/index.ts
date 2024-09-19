import type { MaybePromise } from '@sveltejs/kit';

export interface RateLimiterStore {
  add: (hash: string, ttl: number) => MaybePromise<number>;
  clear: () => MaybePromise<void>;
}
