import { defaultHashFunction, type HashFunction } from '../hashFunction.js';
import type { Cookies, RequestEvent } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import type { RateLimiterPlugin } from './rateLimiterPlugin.js';
import type { Rate } from '../rate.js';

export type CookieSerializeOptions = NonNullable<Parameters<Cookies['set']>[2]>;

export type CookieRateLimiterOptions = {
  name: string;
  secret: string;
  rate: Rate | Rate[];
  preflight: boolean;
  serializeOptions?: CookieSerializeOptions;
  hashFunction?: HashFunction;
};

export class CookieRateLimiter implements RateLimiterPlugin {
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
