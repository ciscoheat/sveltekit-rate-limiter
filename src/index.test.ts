import { RateLimiter } from '$lib/rateLimiter';
import type { RequestEvent } from '@sveltejs/kit';
import { describe, it, expect } from 'vitest';
import { mock } from 'vitest-mock-extended';

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      rates: {
        IP: [2, 's']
      }
    });

    const event = mock<RequestEvent>();
    event.getClientAddress.mockReturnValue('123.456.789.0');

    expect(await limiter.check(event)).toEqual(true);
    await delay(200);

    expect(await limiter.check(event)).toEqual(true);
    await delay(300);

    expect(await limiter.check(event)).toEqual(false);
    await delay(10);
    expect(await limiter.check(event)).toEqual(false);
    await delay(600);

    expect(await limiter.check(event)).toEqual(true);
    expect(await limiter.check(event)).toEqual(true);
    expect(await limiter.check(event)).toEqual(false);
  }, 60000);

  it('should limit IP + User Agent requests', async () => {
    const limiter = new RateLimiter({
      rates: {
        IPUA: [2, 'ms']
      }
    });

    const event = mockEvent() as RequestEvent;

    expect(await limiter.check(event)).toEqual(true);
    expect(await limiter.check(event)).toEqual(true);
    expect(await limiter.check(event)).toEqual(false);

    await delay(1);

    expect(await limiter.check(event)).toEqual(true);
    expect(await limiter.check(event)).toEqual(true);
    expect(await limiter.check(event)).toEqual(false);
  });

  it('should limit cookie requests', async () => {
    const limiter = new RateLimiter({
      rates: {
        cookie: {
          name: 'testcookie',
          secret: 'SECRET',
          rate: [2, 'ms'],
          preflight: true
        }
      }
    });

    const event = mockEvent() as RequestEvent;

    expect(await limiter.check(event)).toEqual(false);

    limiter.cookieLimiter?.preflight(event);

    expect(await limiter.check(event)).toEqual(true);
    expect(await limiter.check(event)).toEqual(true);
    expect(await limiter.check(event)).toEqual(false);

    await delay(1);

    expect(await limiter.check(event)).toEqual(true);
    expect(await limiter.check(event)).toEqual(true);
    expect(await limiter.check(event)).toEqual(false);
  });

  it('should limit multiple plugins', async () => {
    const limits: string[] = [];

    const limiter = new RateLimiter({
      rates: {
        IP: [10, 'ms'],
        IPUA: [5, 'ms'],
        cookie: {
          name: 'testcookie',
          secret: 'SECRET',
          rate: [2, 'ms'],
          preflight: false
        }
      },
      onLimited(_, reason) {
        limits.push(reason);
      }
    });

    const event = mockEvent() as RequestEvent;

    limiter.cookieLimiter?.preflight(event);

    expect(await limiter.check(event)).toEqual(true); //  1 1 1
    expect(await limiter.check(event)).toEqual(true); //  2 2 2
    expect(await limiter.check(event)).toEqual(false); // 3 2 2 (Cookie fails)

    event.cookies.delete('testcookie');

    expect(await limiter.check(event)).toEqual(true); //  1 3 3
    expect(await limiter.check(event)).toEqual(true); //  2 4 4
    expect(await limiter.check(event)).toEqual(false); // 3 4 4 (Cookie fails)

    event.cookies.delete('testcookie');

    expect(await limiter.check(event)).toEqual(true); //  1 5 5
    expect(await limiter.check(event)).toEqual(false); // 2 6 5 (UA fails)

    event.request.headers.set('User-Agent', 'Edge');

    expect(await limiter.check(event)).toEqual(false); // 3 1 6 (Cookie fails)
    expect(await limiter.check(event)).toEqual(false); // 3 1 6 (Cookie fails)

    event.cookies.delete('testcookie');

    expect(await limiter.check(event)).toEqual(true); //   1 2 7
    expect(await limiter.check(event)).toEqual(true); //   2 3 8
    expect(await limiter.check(event)).toEqual(false); //  3 3 8 (Cookie fails)

    event.cookies.delete('testcookie');

    expect(await limiter.check(event)).toEqual(true); //   1 4 9
    expect(await limiter.check(event)).toEqual(true); //   2 5 10
    expect(await limiter.check(event)).toEqual(false); //  3 5 10 (Cookie fails)

    event.cookies.delete('testcookie');

    expect(await limiter.check(event)).toEqual(true); //  1 6 10 (UA fails)

    event.request.headers.set('User-Agent', 'Safari');

    expect(await limiter.check(event)).toEqual(false); //  2 1 11 (IP fails)
    expect(await limiter.check(event)).toEqual(false); //  3 1 11 (UA fails)

    await delay(1);

    expect(await limiter.check(event)).toEqual(true); //  1 1 1
    expect(await limiter.check(event)).toEqual(true); //  2 2 2
    expect(await limiter.check(event)).toEqual(false); // 3 3 3 (Cookie fails)

    expect(limits).toEqual(new Array(10).fill('rate'));
  });
});
