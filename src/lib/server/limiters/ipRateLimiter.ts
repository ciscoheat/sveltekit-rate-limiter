import type { Rate, RateLimiterPlugin } from '../index.js';
import type { RequestEvent } from '@sveltejs/kit';

export class IPRateLimiter implements RateLimiterPlugin {
  readonly rate: Rate | Rate[];

  constructor(rate: Rate | Rate[]) {
    this.rate = rate;
  }

  async hash(event: RequestEvent) {
    return event.getClientAddress();
  }
}
