import { type RateLimiterStore } from './stores/index.js';
import type { RequestEvent } from '@sveltejs/kit';
import { RetryAfterStore } from './stores/retryAfterStore.js';
import { RateLimiter } from './rateLimiter.js';
import type { RateLimiterOptions } from './limiters/index.js';

export class RetryAfterRateLimiter<Extra = never> extends RateLimiter<Extra> {
  private readonly retryAfter: RateLimiterStore;

  constructor(
    options: RateLimiterOptions = {},
    retryAfterStore?: RateLimiterStore
  ) {
    super(options);
    this.retryAfter = retryAfterStore ?? new RetryAfterStore();
  }

  private static toSeconds(rateMs: number) {
    return Math.max(0, Math.floor(rateMs / 1000));
  }

  /**
   * Clear all rate limits.
   */
  async clear(): Promise<void> {
    await this.retryAfter.clear();
    return await super.clear();
  }

  /**
   * Check if a request event is rate limited.
   * @param {RequestEvent} event
   * @returns {Promise<limited: boolean, retryAfter: number>} Rate limit status for the event.
   */
  async check(
    event: RequestEvent,
    extraData?: Extra
  ): Promise<{ limited: boolean; retryAfter: number }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this._isLimited(event, extraData as any);

    if (!result.limited) return { limited: false, retryAfter: 0 };

    if (result.hash === null) {
      return {
        limited: true,
        retryAfter: RetryAfterRateLimiter.toSeconds(result.ttl)
      };
    }

    const retryAfter = RetryAfterRateLimiter.toSeconds(
      (await this.retryAfter.add(result.hash, result.ttl)) - Date.now()
    );

    return { limited: true, retryAfter };
  }
}
