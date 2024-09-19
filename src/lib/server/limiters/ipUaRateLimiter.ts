import type { Rate } from '../rate.js';
import type { RateLimiterPlugin } from './rateLimiterPlugin.js';
import type { RequestEvent } from '@sveltejs/kit';

export class IPUserAgentRateLimiter implements RateLimiterPlugin {
  readonly rate: Rate | Rate[];

  constructor(rate: Rate | Rate[]) {
    this.rate = rate;
  }

  async hash(event: RequestEvent) {
    const ua = event.request.headers.get('user-agent');
    if (!ua) return false;
    return event.getClientAddress() + ua;
  }
}
