import type { Cookies, RequestEvent } from '@sveltejs/kit';
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

type CookieSerializeOptions = NonNullable<Parameters<Cookies['set']>[2]>;

type CookieRateLimiterOptions = {
  name: string;
  secret: string;
  rate: Rate;
  preflight: boolean;
  serializeOptions?: CookieSerializeOptions;
  hashFunction?: HashFunction;
};

class CookieRateLimiter implements RateLimiterPlugin {
  readonly rate: Rate;
  private readonly cookieOptions: CookieSerializeOptions;
  private readonly secret: string;
  private readonly requirePreflight: boolean;
  private readonly cookieId: string;
  private readonly hashFunction: HashFunction;

  constructor(options: CookieRateLimiterOptions) {
    this.cookieId = options.name;
    this.secret = options.secret;
    this.rate = options.rate;
    this.requirePreflight = options.preflight;
    this.hashFunction = options.hashFunction ?? defaultHashFunction;

    this.cookieOptions = {
      path: '/',
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7,
      sameSite: 'strict',
      ...options.serializeOptions
    };
  }

  async hash(event: RequestEvent) {
    const currentId = await this.userIdFromCookie(
      event.cookies.get(this.cookieId),
      event
    );
    return currentId ? currentId : false;
  }

  async preflight(event: RequestEvent): Promise<string> {
    const data = event.cookies.get(this.cookieId);
    if (data) {
      const userId = await this.userIdFromCookie(data, event);
      if (userId) return userId;
    }

    const userId = nanoid();

    event.cookies.set(
      this.cookieId,
      userId + ';' + (await this.hashFunction(this.secret + userId)),
      this.cookieOptions
    );
    return userId;
  }

  private async userIdFromCookie(
    cookie: string | undefined,
    event: RequestEvent
  ): Promise<string | null> {
    const empty = () => {
      return this.requirePreflight ? null : this.preflight(event);
    };

    if (!cookie) return empty();
    const [userId, secretHash] = cookie.split(';');
    if (!userId || !secretHash) return empty();
    if ((await this.hashFunction(this.secret + userId)) != secretHash) {
      return empty();
    }
    return userId;
  }
}

///// Hashing ///////////////////////////////////////////////////////

type HashFunction = (input: string) => Promise<string>;

let defaultHashFunction: HashFunction;

if (globalThis?.crypto?.subtle) {
  defaultHashFunction = _subtleSha256;
} else {
  import('crypto').then((crypto) => {
    defaultHashFunction = (input: string) => {
      return Promise.resolve(
        crypto.createHash('sha256').update(input).digest('hex')
      );
    };
  });
}

async function _subtleSha256(str: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(str)
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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
  hashFunction: HashFunction;
}>;

export class RateLimiter {
  private readonly store: RateLimiterStore;
  private readonly plugins: RateLimiterPlugin[];
  private readonly onLimited: RateLimiterOptions['onLimited'] | undefined;
  private readonly hashFunction: HashFunction;

  readonly cookieLimiter: CookieRateLimiter | undefined;

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
    return (await this._isLimited(event)).limited;
  }

  /**
   * Clear all rate limits.
   */
  async clear(): Promise<void> {
    return await this.store.clear();
  }

  /**
   * Check if a request event is rate limited.
   * @param {RequestEvent} event
   * @returns {Promise<boolean>} true if request is limited, false otherwise
   */
  protected async _isLimited(
    event: RequestEvent
  ): Promise<{ limited: boolean; hash: string | null; unit: RateUnit }> {
    let indeterminate = false;

    for (const plugin of this.plugins) {
      const id = await plugin.hash(event);
      if (id === false) {
        if (this.onLimited) {
          const status = await this.onLimited(event, 'rejected');
          if (status === true)
            return { limited: false, hash: null, unit: plugin.rate[1] };
        }
        return { limited: true, hash: null, unit: plugin.rate[1] };
      } else if (id === true) {
        return { limited: false, hash: null, unit: plugin.rate[1] };
      } else if (id === null) {
        indeterminate = true;
        continue;
      } else {
        indeterminate = false;
      }

      if (!id) {
        throw new Error(
          'Empty hash returned from rate limiter ' + plugin.constructor.name
        );
      }

      const hash = await this.hashFunction(id);
      const rate = await this.store.add(hash, plugin.rate[1]);

      if (rate > plugin.rate[0]) {
        if (this.onLimited) {
          const status = await this.onLimited(event, 'rate');
          if (status === true)
            return { limited: false, hash, unit: plugin.rate[1] };
        }
        return { limited: true, hash, unit: plugin.rate[1] };
      }
    }

    return {
      limited: indeterminate,
      hash: null,
      unit: this.plugins[this.plugins.length - 1].rate[1]
    };
  }

  constructor(options: RateLimiterOptions = {}) {
    this.plugins = [...(options.plugins ?? [])];
    this.onLimited = options.onLimited;
    this.hashFunction = options.hashFunction ?? defaultHashFunction;

    if (!this.hashFunction)
      throw new Error(
        'No RateLimiter hash function found. Please set one with the hashFunction option.'
      );

    if (options.rates?.IP)
      this.plugins.push(new IPRateLimiter(options.rates.IP));

    if (options.rates?.IPUA)
      this.plugins.push(new IPUserAgentRateLimiter(options.rates.IPUA));

    if (options.rates?.cookie) {
      this.plugins.push(
        (this.cookieLimiter = new CookieRateLimiter({
          hashFunction: this.hashFunction,
          ...options.rates.cookie
        }))
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

export class RetryAfterRateLimiter extends RateLimiter {
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

  private static unitToSeconds(unit: RateUnit) {
    return RetryAfterRateLimiter.toSeconds(RateLimiter.TTLTime(unit));
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
    event: RequestEvent
  ): Promise<{ limited: boolean; retryAfter: number }> {
    const result = await this._isLimited(event);

    if (!result.limited) return { limited: false, retryAfter: 0 };

    if (result.hash === null) {
      return {
        limited: true,
        retryAfter: RetryAfterRateLimiter.unitToSeconds(result.unit)
      };
    }

    const retryAfter = RetryAfterRateLimiter.toSeconds(
      (await this.retryAfter.add(result.hash, result.unit)) - Date.now()
    );

    return { limited: true, retryAfter };
  }
}

///// Stores ///////////////////////////////////////////////////////////////////

class TTLStore implements RateLimiterStore {
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

  async add(hash: string, unit: RateUnit) {
    const currentRate = this.cache.get(hash) ?? 0;
    return this.set(hash, currentRate + 1, unit);
  }

  private set(hash: string, rate: number, unit: RateUnit): number {
    this.cache.set(hash, rate, { ttl: RateLimiter.TTLTime(unit) });
    return rate;
  }
}

class RetryAfterStore implements RateLimiterStore {
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

  async add(hash: string, unit: RateUnit) {
    const currentRate = this.cache.get(hash);
    if (currentRate) return this.cache.get(hash) ?? 0;

    const ttl = RateLimiter.TTLTime(unit);
    const retryAfter = Date.now() + ttl;
    this.cache.set(hash, retryAfter, { ttl });

    return retryAfter;
  }
}
