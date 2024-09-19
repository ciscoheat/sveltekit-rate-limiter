import type { RequestEvent } from '@sveltejs/kit';
import type { Rate } from '../rate.js';
import type { RateLimiterPlugin } from './rateLimiterPlugin.js';

export class CloudflareIPRateLimiter implements RateLimiterPlugin {
  readonly rate: Rate | Rate[];

  constructor(rate: Rate | Rate[]) {
    this.rate = rate;
  }

  async hash(event: RequestEvent): Promise<string | boolean | null> {
    return (
      event.request.headers.get('cf-connecting-ip') || event.getClientAddress()
    );
  }
}

export class CloudflareIPUARateLimiter extends CloudflareIPRateLimiter {
  constructor(rate: Rate | Rate[]) {
    super(rate);
  }

  async hash(event: RequestEvent) {
    const ua = event.request.headers.get('user-agent');
    if (!ua) return false;
    return super.hash(event) + ua;
  }
}
