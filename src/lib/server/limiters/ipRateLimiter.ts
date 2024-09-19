import type { RequestEvent } from '@sveltejs/kit';
import type { RateLimiterPlugin } from './rateLimiterPlugin';
import type { Rate } from '../rate';

export class IPRateLimiter implements RateLimiterPlugin {
  readonly rate: Rate | Rate[];

  constructor(rate: Rate | Rate[]) {
    this.rate = rate;
  }

  async hash(event: RequestEvent) {
    return event.getClientAddress();
  }
}
