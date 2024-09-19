import type { MaybePromise, RequestEvent } from '@sveltejs/kit';
import type { RateLimiterStore } from '../stores/index.js';
import type { CookieRateLimiterOptions } from './cookieRateLimiter.js';
import type { HashFunction } from '../hashFunction.js';

export type Rate = [number, RateUnit];

/**
 * Like Rate, but with TTL as a number instead of a string unit
 */
export type TTLRate = [number, number];

export type RateLimiterOptions = Partial<{
  plugins: RateLimiterPlugin[];
  store: RateLimiterStore;
  maxItems: number;
  onLimited: (
    event: RequestEvent,
    reason: 'rate' | 'rejected'
  ) => MaybePromise<void | boolean>;
  /**
   * @deprecated Add the IP/IPUA/cookie rates to the main object, no need for "rates".
   */
  rates: {
    /**
     * @deprecated Add the IP option to the main object, no need for "rates".
     */
    IP?: Rate;
    /**
     * @deprecated Add the IPUA option to the main object, no need for "rates".
     */
    IPUA?: Rate;
    /**
     * @deprecated Add cookie option to the main object, no need for "rates".
     */
    cookie?: CookieRateLimiterOptions;
  };
  IP: Rate | Rate[];
  IPUA: Rate | Rate[];
  cookie: CookieRateLimiterOptions;
  hashFunction: HashFunction;
}>;

export type RateUnit =
  | 'ms'
  | '100ms'
  | '250ms'
  | '500ms'
  | 's'
  | '2s'
  | '5s'
  | '10s'
  | '15s'
  | '30s'
  | '45s'
  | 'm'
  | '2m'
  | '5m'
  | '10m'
  | '15m'
  | '30m'
  | '45m'
  | 'h'
  | '2h'
  | '6h'
  | '12h'
  | 'd';

export function TTLTime(unit: RateUnit) {
  switch (unit) {
    case 's':
      return 1000;
    case 'm':
      return 60000;
    case 'h':
      return 60 * 60000;
    case '2s':
      return 2000;
    case '5s':
      return 5000;
    case '10s':
      return 10000;
    case '15s':
      return 15000;
    case '30s':
      return 30000;
    case '45s':
      return 45000;
    case '2m':
      return 2 * 60000;
    case '5m':
      return 5 * 60000;
    case '10m':
      return 10 * 60000;
    case '15m':
      return 15 * 60000;
    case '30m':
      return 30 * 60000;
    case '45m':
      return 45 * 60000;
    case '100ms':
      return 100;
    case '250ms':
      return 250;
    case '500ms':
      return 500;
    case '2h':
      return 2 * 60 * 60000;
    case '6h':
      return 6 * 60 * 60000;
    case '12h':
      return 12 * 60 * 60000;
    case 'd':
      return 24 * 60 * 60000;
    case 'ms':
      return 1;
  }
  throw new Error('Invalid unit for TTLTime: ' + unit);
}

export interface RateLimiterPlugin<Extra = never> {
  hash: (
    event: RequestEvent,
    extraData: Extra
  ) => MaybePromise<string | boolean | null>;
  get rate(): Rate | Rate[];
}
