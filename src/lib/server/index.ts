import type { Cookies, RequestEvent, MaybePromise } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import TTLCache from '@isaacs/ttlcache';

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

export type Rate = [number, RateUnit];

type CalculatedRate = [number, number];

///// Interfaces /////////////////////////////////////////////////////////////

export interface RateLimiterStore {
  add: (hash: string, ttl: number) => MaybePromise<number>;
  clear: () => MaybePromise<void>;
}

export interface RateLimiterPlugin<Extra = never> {
  hash: (
    event: RequestEvent,
    extraData: Extra
  ) => MaybePromise<string | boolean | null>;
  get rate(): Rate | Rate[];
}

///// Plugins /////////////////////////////////////////////////////////////////

class IPRateLimiter implements RateLimiterPlugin {
  readonly rate: Rate | Rate[];

  constructor(rate: Rate | Rate[]) {
    this.rate = rate;
  }

  async hash(event: RequestEvent) {
    return event.getClientAddress();
  }
}

class IPUserAgentRateLimiter implements RateLimiterPlugin {
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

type CookieSerializeOptions = NonNullable<Parameters<Cookies['set']>[2]>;

type CookieRateLimiterOptions = {
  name: string;
  secret: string;
  rate: Rate | Rate[];
  preflight: boolean;
  serializeOptions?: CookieSerializeOptions;
  hashFunction?: HashFunction;
};

class CookieRateLimiter implements RateLimiterPlugin {
  readonly rate: Rate | Rate[];
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

type HashFunction = (input: string) => MaybePromise<string>;

let defaultHashFunction: HashFunction;

if (globalThis?.crypto?.subtle) {
  defaultHashFunction = _subtleSha256;
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

export class RateLimiter<Extra = never> {
  private readonly store: RateLimiterStore;
  private readonly plugins: {
    rate: CalculatedRate;
    limiter: RateLimiterPlugin;
  }[];
  private readonly onLimited: RateLimiterOptions['onLimited'] | undefined;
  private readonly hashFunction: HashFunction;

  readonly cookieLimiter: CookieRateLimiter | undefined;

  static TTLTime(unit: RateUnit) {
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

  /**
   * Check if a request event is rate limited.
   * @param {RequestEvent} event
   * @returns {Promise<boolean>} true if request is limited, false otherwise
   */
  async isLimited(
    event: [Extra] extends [never] ? RequestEvent : { missing_extraData: Extra }
  ): Promise<boolean>;

  /**
   * Check if a request event is rate limited, supplying extra data that will be available for plugins.
   * @param {RequestEvent} event
   * @returns {Promise<boolean>} true if request is limited, false otherwise
   */
  async isLimited(event: RequestEvent, extraData: Extra): Promise<boolean>;

  async isLimited(event: unknown, extraData?: unknown): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await this._isLimited(event as RequestEvent, extraData as any))
      .limited;
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
    event: RequestEvent,
    extraData: Extra
  ): Promise<{ limited: boolean; hash: string | null; ttl: number }> {
    let limited: boolean | undefined = undefined;

    for (let i = 0; i < this.plugins.length; i++) {
      const plugin = this.plugins[i];
      const rate = plugin.rate;
      const id = await plugin.limiter.hash(event, extraData as never);

      if (id === false) {
        if (this.onLimited) {
          const status = await this.onLimited(event, 'rejected');
          if (status === true)
            return { limited: false, hash: null, ttl: rate[1] };
        }
        return { limited: true, hash: null, ttl: rate[1] };
      } else if (id === null) {
        if (limited === undefined) limited = true;
        continue;
      } else {
        limited = false;
      }

      if (!id) {
        throw new Error(
          'Empty hash returned from rate limiter ' + plugin.constructor.name
        );
      }

      if (id === true) {
        return { limited: false, hash: null, ttl: rate[1] };
      }

      // Add the plugin index to the hash, so it differs between limiters with multiple rates
      const hash = i.toString() + (await this.hashFunction(id));
      const currentRate = await this.store.add(hash, rate[1]);

      if (currentRate > rate[0]) {
        if (this.onLimited) {
          const status = await this.onLimited(event, 'rate');
          if (status === true) return { limited: false, hash, ttl: rate[1] };
        }
        return { limited: true, hash, ttl: rate[1] };
      }
    }

    return {
      limited: limited ?? false,
      hash: null,
      ttl: this.plugins[this.plugins.length - 1].rate[1]
    };
  }

  constructor(options: RateLimiterOptions = {}) {
    this.onLimited = options.onLimited;
    this.hashFunction = options.hashFunction ?? defaultHashFunction;

    if (!this.hashFunction) {
      throw new Error(
        'No RateLimiter hash function found. Please set one with the hashFunction option.'
      );
    }

    //#region Plugin setup

    function mapPluginRates(limiter: RateLimiterPlugin) {
      if (!limiter.rate.length)
        throw new Error(`Empty rate for limiter ${limiter.constructor.name}`);
      const pluginRates = (
        Array.isArray(limiter.rate[0]) ? limiter.rate : [limiter.rate]
      ) as Rate[];
      return pluginRates.map((rate) => ({
        rate: [
          rate[0],
          RateLimiter.TTLTime(rate[1])
        ] as const satisfies CalculatedRate,
        limiter
      }));
    }

    this.plugins = (options.plugins ?? []).flatMap(mapPluginRates);

    const IPRates = options.IP ?? options.rates?.IP;
    if (IPRates) {
      this.plugins = this.plugins.concat(
        mapPluginRates(new IPRateLimiter(IPRates))
      );
    }

    const IPUARates = options.IPUA ?? options.rates?.IPUA;
    if (IPUARates) {
      this.plugins = this.plugins.concat(
        mapPluginRates(new IPUserAgentRateLimiter(IPUARates))
      );
    }

    const cookieRates = options.cookie ?? options.rates?.cookie;
    if (cookieRates) {
      this.plugins = this.plugins.concat(
        mapPluginRates(
          (this.cookieLimiter = new CookieRateLimiter({
            hashFunction: this.hashFunction,
            ...cookieRates
          }))
        )
      );
    }

    if (!this.plugins.length) {
      throw new Error('No plugins set for RateLimiter!');
    }

    // Sort plugins by rate, if early cancelling
    this.plugins.sort((a, b) => {
      const diff = a.rate[1] - b.rate[1];
      return diff == 0 ? a.rate[0] - b.rate[0] : diff;
    });

    //#endregion

    const maxTTL = this.plugins.reduce((acc, plugin) => {
      const rate = plugin.rate[1];
      if (rate == 1) {
        console.warn(
          'RateLimiter: The "ms" unit is not reliable due to OS timing issues.'
        );
      }
      return Math.max(rate, acc);
    }, 0);

    this.store = options.store ?? new TTLStore(maxTTL, options.maxItems);
  }
}

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

  async add(hash: string, ttl: number) {
    const currentRate = this.cache.get(hash) ?? 0;
    return this.set(hash, currentRate + 1, ttl);
  }

  private set(hash: string, rate: number, ttl: number): number {
    this.cache.set(hash, rate, { ttl });
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

  async add(hash: string, ttl: number) {
    const currentRate = this.cache.get(hash);
    if (currentRate) return this.cache.get(hash) ?? 0;

    const retryAfter = Date.now() + ttl;
    this.cache.set(hash, retryAfter, { ttl });

    return retryAfter;
  }
}
