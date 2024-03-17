import { RateLimiter, RetryAfterRateLimiter } from '$lib/server';
import type { RequestEvent } from '@sveltejs/kit';
import { describe, it, expect, beforeEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { Rate, RateLimiterPlugin } from '$lib/server';

const hashFunction = (input: string) => {
  const msgUint8 = new TextEncoder().encode(input);
  return crypto.subtle
    .digest('SHA-256', msgUint8)
    .then((buffer) => Array.from(new Uint8Array(buffer)))
    .then((hashArray) => {
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    });
};

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class ShortCircuitPlugin implements RateLimiterPlugin {
  readonly rate: Rate;
  readonly value: boolean | null;

  constructor(value: boolean | null, rate: Rate) {
    this.rate = rate;
    this.value = value;
  }

  async hash() {
    return this.value;
  }
}

function mockEvent(): Partial<RequestEvent> {
  const cookieStore = new Map<string, string>();
  return {
    request: new Request('https://test.com', {
      headers: {
        'User-Agent': 'Chrome'
      }
    }),
    getClientAddress: () => '345.456.789.0',
    cookies: {
      get(name) {
        return cookieStore.get(name);
      },
      getAll() {
        return Array.from(cookieStore.keys()).map((name) => ({
          name,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          value: cookieStore.get(name)!
        }));
      },
      set(name, value) {
        cookieStore.set(name, value);
      },
      delete(name) {
        cookieStore.delete(name);
      },
      serialize() {
        throw new Error('Not implemented.');
      }
    }
  };
}

describe('Basic rate limiter', async () => {
  it('should limit IP requests', async () => {
    const limiter = new RateLimiter({
      hashFunction,
      rates: {
        IP: [2, 's']
      }
    });

    const event = mock<RequestEvent>();
    event.getClientAddress.mockReturnValue('123.456.789.0');

    expect(await limiter.isLimited(event)).toEqual(false);
    await delay(200);

    expect(await limiter.isLimited(event)).toEqual(false);
    await delay(300);

    expect(await limiter.isLimited(event)).toEqual(true);
    await delay(10);

    expect(await limiter.isLimited(event)).toEqual(true);
    await delay(600);

    expect(await limiter.isLimited(event)).toEqual(false);
    expect(await limiter.isLimited(event)).toEqual(false);
    expect(await limiter.isLimited(event)).toEqual(true);
  });

  it('should limit IP + User Agent requests', async () => {
    const limiter = new RateLimiter({
      hashFunction,
      rates: {
        IPUA: [2, '100ms']
      }
    });

    const event = mockEvent() as RequestEvent;

    expect(await limiter.isLimited(event)).toEqual(false);
    expect(await limiter.isLimited(event)).toEqual(false);
    expect(await limiter.isLimited(event)).toEqual(true);

    await delay(100);

    expect(await limiter.isLimited(event)).toEqual(false);
    expect(await limiter.isLimited(event)).toEqual(false);
    expect(await limiter.isLimited(event)).toEqual(true);
  });

  it('should limit cookie requests', async () => {
    const limiter = new RateLimiter({
      hashFunction,
      rates: {
        cookie: {
          name: 'testcookie',
          secret: 'SECRET',
          rate: [2, '250ms'],
          preflight: true
        }
      }
    });

    const event = mockEvent() as RequestEvent;

    expect(await limiter.isLimited(event)).toEqual(true);

    await limiter.cookieLimiter?.preflight(event);

    expect(await limiter.isLimited(event)).toEqual(false);
    expect(await limiter.isLimited(event)).toEqual(false);
    expect(await limiter.isLimited(event)).toEqual(true);

    await delay(250);

    expect(await limiter.isLimited(event)).toEqual(false);
    expect(await limiter.isLimited(event)).toEqual(false);
    expect(await limiter.isLimited(event)).toEqual(true);
  });

  it('should limit multiple plugins', async () => {
    const limits: string[] = [];

    const limiter = new RateLimiter({
      hashFunction,
      IP: [10, '500ms'],
      IPUA: [5, '500ms'],
      cookie: {
        name: 'testcookie',
        secret: 'SECRET',
        rate: [2, '500ms'],
        preflight: false
      },
      onLimited(_, reason) {
        limits.push(reason);
      }
    });

    const event = mockEvent() as RequestEvent;

    await limiter.cookieLimiter?.preflight(event);

    expect(await limiter.isLimited(event)).toEqual(false); //  1 1 1
    expect(await limiter.isLimited(event)).toEqual(false); //  2 2 2
    expect(await limiter.isLimited(event)).toEqual(true); // 3 2 2 (Cookie fails)

    event.cookies.delete('testcookie', { path: '/' });

    expect(await limiter.isLimited(event)).toEqual(false); //  1 3 3
    expect(await limiter.isLimited(event)).toEqual(false); //  2 4 4
    expect(await limiter.isLimited(event)).toEqual(true); // 3 4 4 (Cookie fails)

    event.cookies.delete('testcookie', { path: '/' });

    expect(await limiter.isLimited(event)).toEqual(false); //  1 5 5
    expect(await limiter.isLimited(event)).toEqual(true); // 2 6 5 (UA fails)

    event.request.headers.set('User-Agent', 'Edge');

    expect(await limiter.isLimited(event)).toEqual(true); // 3 1 6 (Cookie fails)
    expect(await limiter.isLimited(event)).toEqual(true); // 3 1 6 (Cookie fails)

    event.cookies.delete('testcookie', { path: '/' });

    expect(await limiter.isLimited(event)).toEqual(false); //   1 2 7
    expect(await limiter.isLimited(event)).toEqual(false); //   2 3 8
    expect(await limiter.isLimited(event)).toEqual(true); //  3 3 8 (Cookie fails)

    event.cookies.delete('testcookie', { path: '/' });

    expect(await limiter.isLimited(event)).toEqual(false); //   1 4 9
    expect(await limiter.isLimited(event)).toEqual(false); //   2 5 10
    expect(await limiter.isLimited(event)).toEqual(true); //  3 5 10 (Cookie fails)

    event.cookies.delete('testcookie', { path: '/' });

    expect(await limiter.isLimited(event)).toEqual(false); //  1 6 10 (UA fails)

    event.request.headers.set('User-Agent', 'Safari');

    expect(await limiter.isLimited(event)).toEqual(true); //  2 1 11 (IP fails)
    expect(await limiter.isLimited(event)).toEqual(true); //  3 1 11 (UA fails)

    await delay(500);

    expect(await limiter.isLimited(event)).toEqual(false); //  1 1 1
    expect(await limiter.isLimited(event)).toEqual(false); //  2 2 2
    expect(await limiter.isLimited(event)).toEqual(true); // 3 3 3 (Cookie fails)

    expect(limits).toEqual(new Array(10).fill('rate'));
  });

  describe('Short-circuiting the plugin chain when a boolean is returned', () => {
    let event: RequestEvent;
    const limits: string[] = [];

    beforeEach(() => {
      limits.length = 0;
      event = mockEvent() as RequestEvent;
    });

    it('should always allow the request when true is returned and the plugin is first in the chain', async () => {
      const limiter = new RateLimiter({
        hashFunction,
        plugins: [new ShortCircuitPlugin(true, [1, 'm'])],
        rates: {
          IP: [2, 'm']
        }
      });

      expect(await limiter.isLimited(event)).toEqual(false);
      expect(await limiter.isLimited(event)).toEqual(false);
      expect(await limiter.isLimited(event)).toEqual(false);
    });

    it('should always deny the request when false is returned and the plugin is first in the chain', async () => {
      const limiter = new RateLimiter({
        hashFunction,
        plugins: [new ShortCircuitPlugin(false, [1, 'm'])],
        rates: {
          IP: [2, 'm']
        }
      });

      expect(await limiter.isLimited(event)).toEqual(true);
      expect(await limiter.isLimited(event)).toEqual(true);
      expect(await limiter.isLimited(event)).toEqual(true);
    });

    it('should deny the request when it is returning false further down the chain, and the first plugin is ok', async () => {
      const limiter = new RateLimiter({
        hashFunction,
        plugins: [new ShortCircuitPlugin(false, [5, 'm'])],
        rates: {
          IP: [2, 'm']
        }
      });

      expect(await limiter.isLimited(event)).toEqual(true);
      expect(await limiter.isLimited(event)).toEqual(true);
      expect(await limiter.isLimited(event)).toEqual(true);
    });

    it('should allow the request when it is returning true further down the chain, until the first plugin is limiting', async () => {
      const limiter = new RateLimiter({
        hashFunction,
        plugins: [new ShortCircuitPlugin(true, [5, 'm'])],
        rates: {
          IP: [2, 'm']
        }
      });

      expect(await limiter.isLimited(event)).toEqual(false);
      expect(await limiter.isLimited(event)).toEqual(false);
      expect(await limiter.isLimited(event)).toEqual(true);
    });

    it('should allow the request when a plugin returns null early in the chain, until any other plugin is limiting', async () => {
      const limiter = new RateLimiter({
        hashFunction,
        plugins: [new ShortCircuitPlugin(null, [3, 'm'])],
        rates: {
          IP: [5, 'm']
        }
      });

      expect(await limiter.isLimited(event)).toEqual(false);
      expect(await limiter.isLimited(event)).toEqual(false);
      expect(await limiter.isLimited(event)).toEqual(false);
      expect(await limiter.isLimited(event)).toEqual(false);
      expect(await limiter.isLimited(event)).toEqual(false);
      expect(await limiter.isLimited(event)).toEqual(true);
    });

    it('should deny the request when a plugin returns null last in chain.', async () => {
      const limiter = new RateLimiter({
        hashFunction,
        plugins: [new ShortCircuitPlugin(null, [5, 'm'])],
        rates: {
          IP: [3, 'm']
        }
      });

      expect(await limiter.isLimited(event)).toEqual(false);
      expect(await limiter.isLimited(event)).toEqual(false);
      expect(await limiter.isLimited(event)).toEqual(false);
      expect(await limiter.isLimited(event)).toEqual(true);
      expect(await limiter.isLimited(event)).toEqual(true);
      expect(await limiter.isLimited(event)).toEqual(true);
    });

    it('should deny the request when null is returned from all plugins', async () => {
      const limiter = new RateLimiter({
        hashFunction,
        plugins: [
          new ShortCircuitPlugin(null, [3, 'm']),
          new ShortCircuitPlugin(null, [5, 'm'])
        ]
      });

      expect(await limiter.isLimited(event)).toEqual(true);
      expect(await limiter.isLimited(event)).toEqual(true);
      expect(await limiter.isLimited(event)).toEqual(true);
      expect(await limiter.isLimited(event)).toEqual(true);
      expect(await limiter.isLimited(event)).toEqual(true);
      expect(await limiter.isLimited(event)).toEqual(true);
      expect(await limiter.isLimited(event)).toEqual(true);
    });
  });
});

class ExtraDataPlugin implements RateLimiterPlugin {
  readonly rate: Rate = [75, 'm'];
  readonly log: string[] = [];

  async hash(event: RequestEvent, extra: { email: string }) {
    const hash = event.getClientAddress() + extra.email;
    this.log.push(hash);
    return hash;
  }
}

class AllowDomain implements RateLimiterPlugin {
  readonly rate: Rate = [0, 's'];
  readonly allowedDomain: string;

  constructor(allowedDomain: string) {
    this.allowedDomain = allowedDomain;
  }

  async hash(_: RequestEvent, extraData: { email: string }) {
    return extraData.email.endsWith(this.allowedDomain) ? true : null;
  }
}

describe('Plugins with extra data', () => {
  it('should take it into consideration', async () => {
    const event = mockEvent() as RequestEvent;
    const extra = new ExtraDataPlugin();
    const limiter = new RateLimiter<{ email: string }>({
      hashFunction,
      plugins: [extra],
      IP: [3, 's']
    });

    expect(await limiter.isLimited(event, { email: 'abc@test.com' })).toBe(
      false
    );
    expect(extra.log[0]).toEqual('345.456.789.0abc@test.com');

    // @ts-expect-error No extra data specified
    expect(limiter.isLimited(event)).rejects.toThrow();

    const limiter2 = new RateLimiter({
      hashFunction,
      IPUA: [3, 's']
    });

    // @ts-expect-error Extra data specified when not supposed to
    await limiter2.isLimited(event, { extraData: 123 });
  });

  it('should work with boolean and null result', async () => {
    const event = mockEvent() as RequestEvent;
    const limiter = new RateLimiter<{ email: string }>({
      hashFunction,
      plugins: [new AllowDomain('test.com')],
      IP: [3, 's']
    });

    expect(await limiter.isLimited(event, { email: 'hello@test.com' })).toEqual(
      false
    );
    expect(
      await limiter.isLimited(event, { email: 'hello@example.com' })
    ).toEqual(false);
    expect(
      await limiter.isLimited(event, { email: 'hello@example.com' })
    ).toEqual(false);
    expect(
      await limiter.isLimited(event, { email: 'hello@example.com' })
    ).toEqual(false);
    expect(
      await limiter.isLimited(event, { email: 'hello@example.com' })
    ).toEqual(true);

    expect(await limiter.isLimited(event, { email: 'hello@test.com' })).toEqual(
      false
    );
  });
});

describe('Retry-After rate limiter', () => {
  it('should return retry-after information together with the limited status', async () => {
    const event = mockEvent() as RequestEvent;
    const limiter = new RetryAfterRateLimiter({
      hashFunction,
      rates: {
        IPUA: [3, '5s']
      }
    });

    let status = await limiter.check(event);
    expect(status).toEqual({ limited: false, retryAfter: 0 });

    status = await limiter.check(event);
    expect(status).toEqual({ limited: false, retryAfter: 0 });

    status = await limiter.check(event);
    expect(status).toEqual({ limited: false, retryAfter: 0 });

    status = await limiter.check(event);
    expect(status.limited).toBe(true);
    expect(status.retryAfter.toString()).toMatch(/^[345]$/);

    await delay(5100);

    status = await limiter.check(event);
    expect(status).toEqual({ limited: false, retryAfter: 0 });
  }, 6000);

  it('should work for multiple rate limiters', async () => {
    const event = mockEvent() as RequestEvent;
    const limiter = new RetryAfterRateLimiter({
      hashFunction,
      rates: {
        IP: [5, 'm'],
        IPUA: [3, 's']
      }
    });

    event.request.headers.set('User-Agent', 'Safari 1');

    let status = await limiter.check(event);
    expect(status).toEqual({ limited: false, retryAfter: 0 });

    status = await limiter.check(event);
    expect(status).toEqual({ limited: false, retryAfter: 0 });

    status = await limiter.check(event);
    expect(status).toEqual({ limited: false, retryAfter: 0 });

    status = await limiter.check(event);
    expect(status).toEqual({ limited: true, retryAfter: 1 });

    event.request.headers.set('User-Agent', 'Safari 2');

    status = await limiter.check(event);
    expect(status).toEqual({ limited: false, retryAfter: 0 });

    status = await limiter.check(event);
    expect(status).toEqual({ limited: false, retryAfter: 0 });

    status = await limiter.check(event);
    expect(status.limited).toEqual(true);
    expect(status.retryAfter).toBeGreaterThanOrEqual(59);
    expect(status.retryAfter).toBeLessThanOrEqual(60);

    event.request.headers.set('User-Agent', 'Safari 3');

    status = await limiter.check(event);
    expect(status.limited).toEqual(true);
    expect(status.retryAfter).toBeGreaterThanOrEqual(59);
    expect(status.retryAfter).toBeLessThanOrEqual(60);

    await delay(1100);

    status = await limiter.check(event);
    expect(status.limited).toEqual(true);
    expect(status.retryAfter).toBeGreaterThanOrEqual(58);
    expect(status.retryAfter).toBeLessThanOrEqual(59);

    await limiter.clear();

    status = await limiter.check(event);
    expect(status).toEqual({ limited: false, retryAfter: 0 });
  });
});
