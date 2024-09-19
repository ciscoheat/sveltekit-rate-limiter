import {
  CookieRateLimiter,
  type CookieRateLimiterOptions
} from './limiters/cookieRateLimiter.js';
import { IPRateLimiter } from './limiters/ipRateLimiter.js';
import { IPUserAgentRateLimiter } from './limiters/ipUaRateLimiter.js';
import type { MaybePromise, RequestEvent } from '@sveltejs/kit';
import { defaultHashFunction, type HashFunction } from './hashFunction.js';
import { TTLStore } from './stores/ttlStore.js';
import { type RateLimiterPlugin } from './limiters/rateLimiterPlugin.js';
import { TTLTime, type Rate } from './rate.js';
import type { RateLimiterStore } from './stores/rateLimiterStore.js';

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

/**
 * Like Rate, but with TTL as a number instead of a string unit
 */
type TTLRate = [number, number];

export class RateLimiter<Extra = never> {
  private readonly store: RateLimiterStore;
  private readonly plugins: {
    rate: TTLRate;
    limiter: RateLimiterPlugin;
  }[];
  private readonly onLimited: RateLimiterOptions['onLimited'] | undefined;
  private readonly hashFunction: HashFunction;

  readonly cookieLimiter: CookieRateLimiter | undefined;

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
        rate: [rate[0], TTLTime(rate[1])] as const satisfies TTLRate,
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
