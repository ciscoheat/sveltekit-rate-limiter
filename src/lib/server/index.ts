import type { RequestEvent } from '@sveltejs/kit';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import TTLCache from '@isaacs/ttlcache';

export type RateUnit =
  | 'ms'
  | 's'
  | '15s'
  | '30s'
  | 'm'
  | '15m'
  | '30m'
  | 'h'
  | '2h'
  | '6h'
  | '12h'
  | 'd';

export type Rate = [number, RateUnit];

///// Interfaces /////////////////////////////////////////////////////////////

export interface RateLimiterStore {
  add: (hash: string, unit: RateUnit) => Promise<number>;
  clear: () => Promise<void>;
}

export interface RateLimiterPlugin {
  hash: (event: RequestEvent) => Promise<string | boolean | null>;
  get rate(): Rate;
}

///// Store ///////////////////////////////////////////////////////////////////

class TTLStore implements RateLimiterStore {
  private cache: TTLCache<string, number>;

  constructor(maxTTL: number, maxItems = Infinity) {
    this.cache = new TTLCache({
      ttl: maxTTL,
      max: maxItems,
      noUpdateTTL: true
      /*
			dispose(value, key, reason) {
				console.log('TTLStore ~ dispose', value, key, reason);
			}
      */
    });
  }

  async clear() {
    return this.cache.clear();
  }

  async add(hash: string, unit: RateUnit) {
    const currentRate = this.cache.get(hash) ?? 0;
    return this.set(hash, currentRate + 1, unit);
  }

  private set(hash: string, rate: number, unit: RateUnit): number {
    this.cache.set(hash, rate, { ttl: RateLimiter.TTLTime(unit) });
    return rate;
  }
}

///// Plugins /////////////////////////////////////////////////////////////////

class IPRateLimiter implements RateLimiterPlugin {
  readonly rate: Rate;

  constructor(rate: Rate) {
    this.rate = rate;
  }

  async hash(event: RequestEvent) {
    return event.getClientAddress();
  }
}

class IPUserAgentRateLimiter implements RateLimiterPlugin {
  readonly rate: Rate;

  constructor(rate: Rate) {
    this.rate = rate;
  }

  async hash(event: RequestEvent) {
    const ua = event.request.headers.get('user-agent');
    if (!ua) return false;
    return event.getClientAddress() + ua;
  }
}

type CookieRateLimiterOptions = {
  name: string;
  secret: string;
  rate: Rate;
  preflight: boolean;
  maxAge?: number;
};

class CookieRateLimiter implements RateLimiterPlugin {
  readonly rate: Rate;
  private readonly secret: string;
  private readonly requirePreflight: boolean;
  private readonly cookieId: string;
  private readonly maxAge: number;

  constructor(options: CookieRateLimiterOptions) {
    this.cookieId = options.name;
    this.secret = options.secret;
    this.rate = options.rate;
    this.requirePreflight = options.preflight;
    this.maxAge = options.maxAge ?? 60 * 60 * 24 * 7;
  }

  async hash(event: RequestEvent) {
    const currentId = this.userIdFromCookie(
      event.cookies.get(this.cookieId),
      event
    );
    return currentId ? currentId : false;
  }

  preflight(event: RequestEvent): string {
    const data = event.cookies.get(this.cookieId);
    if (data) {
      const userId = this.userIdFromCookie(data, event);
      if (userId) return userId;
    }
    const userId = nanoid();
    event.cookies.set(
      this.cookieId,
      userId + ';' + RateLimiter.hash(this.secret + userId),
      {
        path: '/',
        httpOnly: true,
        maxAge: this.maxAge
      }
    );
    return userId;
  }

  private userIdFromCookie(
    cookie: string | undefined,
    event: RequestEvent
  ): string | null {
    const empty = () => {
      return this.requirePreflight ? null : this.preflight(event);
    };

    if (!cookie) return empty();
    const [userId, secretHash] = cookie.split(';');
    if (!userId || !secretHash) return empty();
    if (RateLimiter.hash(this.secret + userId) != secretHash) {
      return empty();
    }
    return userId;
  }
}

///// Main class //////////////////////////////////////////////////////////////

export type RateLimiterOptions = Partial<{
  plugins: RateLimiterPlugin[];
  store: RateLimiterStore;
  maxItems: number;
  onLimited: (
    event: RequestEvent,
    reason: 'rate' | 'rejected'
  ) => Promise<void | boolean> | void | boolean;
  rates: {
    IP?: Rate;
    IPUA?: Rate;
    cookie?: CookieRateLimiterOptions;
  };
}>;

export class RateLimiter {
  private readonly store: RateLimiterStore;
  private readonly plugins: RateLimiterPlugin[];
  private readonly onLimited: RateLimiterOptions['onLimited'] | undefined;

  readonly cookieLimiter: CookieRateLimiter | undefined;

  static hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  static TTLTime(unit: RateUnit) {
    if (unit == 'ms') return 1;
    if (unit == 's') return 1000;
    if (unit == 'm') return 60 * 1000;
    if (unit == 'h') return 60 * 60 * 1000;
    if (unit == '15s') return 15 * 1000;
    if (unit == '30s') return 30 * 1000;
    if (unit == '15m') return 15 * 60 * 1000;
    if (unit == '30m') return 30 * 60 * 1000;
    if (unit == '2h') return 2 * 60 * 60 * 1000;
    if (unit == '6h') return 6 * 60 * 60 * 1000;
    if (unit == '12h') return 12 * 60 * 60 * 1000;
    if (unit == 'd') return 24 * 60 * 60 * 1000;
    throw new Error('Invalid unit for TTLTime: ' + unit);
  }

  /**
   * Check if a request event is rate limited.
   * @param {RequestEvent} event
   * @returns {Promise<boolean>} true if request is limited, false otherwise
   */
  async isLimited(event: RequestEvent): Promise<boolean> {
    for (const plugin of this.plugins) {
      const id = await plugin.hash(event);
      if (id === false) {
        if (this.onLimited) {
          const status = await this.onLimited(event, 'rejected');
          if (status === true) return false;
        }
        return true;
      } else if (id === true) {
        return false;
      } else if (id === null) {
        continue;
      }

      if (!id) {
        throw new Error(
          'Empty hash returned from rate limiter ' + plugin.constructor.name
        );
      }

      const hash = RateLimiter.hash(id);

      const rate = await this.store.add(hash, plugin.rate[1]);
      if (rate > plugin.rate[0]) {
        if (this.onLimited) {
          const status = await this.onLimited(event, 'rate');
          if (status === true) return false;
        }
        return true;
      }
    }

    return false;
  }

  constructor(options: RateLimiterOptions = {}) {
    this.plugins = [...(options.plugins ?? [])];
    this.onLimited = options.onLimited;

    if (options.rates?.IP)
      this.plugins.push(new IPRateLimiter(options.rates.IP));

    if (options.rates?.IPUA)
      this.plugins.push(new IPUserAgentRateLimiter(options.rates.IPUA));

    if (options.rates?.cookie) {
      this.plugins.push(
        (this.cookieLimiter = new CookieRateLimiter(options.rates.cookie))
      );
    }

    if (!this.plugins.length) {
      throw new Error('No plugins set for RateLimiter!');
    }

    // Sort plugins by rate, if early cancelling
    this.plugins.sort((a, b) => {
      const diff =
        RateLimiter.TTLTime(a.rate[1]) - RateLimiter.TTLTime(b.rate[1]);
      return diff == 0 ? a.rate[0] - b.rate[0] : diff;
    });

    const maxTTL = this.plugins.reduce((acc, plugin) => {
      const time = RateLimiter.TTLTime(plugin.rate[1]);
      return Math.max(time, acc);
    }, 0);

    this.store = options.store ?? new TTLStore(maxTTL, options.maxItems);
  }
}
