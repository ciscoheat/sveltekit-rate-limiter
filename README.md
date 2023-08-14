# sveltekit-rate-limiter

A modular rate limiter for password resets, account registration, etc. Use in your `page.server.ts` files, or `hooks.server.ts`.

Uses an in-memory cache ([@isaacs/ttlcache](https://www.npmjs.com/package/@isaacs/ttlcache)), but can be swapped for something else. Same for limiters, which are plugins. The [source file](https://github.com/ciscoheat/sveltekit-rate-limiter/blob/main/src/lib/server/index.ts#L24-L32) lists both interfaces.

## Installation

```
npm i -D sveltekit-rate-limiter
```

```
pnpm i -D sveltekit-rate-limiter
```

## How to use

```ts
import { error } from '@sveltejs/kit';
import { RateLimiter } from 'sveltekit-rate-limiter/server';

const limiter = new RateLimiter({
  // A rate is defined as [number, unit]
  rates: {
    IP: [10, 'h'], // IP address limiter
    IPUA: [5, 'm'], // IP + User Agent limiter
    cookie: {
      // Cookie limiter
      name: 'limiterid', // Unique cookie name for this limiter
      secret: 'SECRETKEY-SERVER-ONLY', // Use $env/static/private
      rate: [2, 'm'],
      preflight: true // Require preflight call (see load function)
    }
  }
});

export const load = async (event) => {
  // Preflight prevents direct posting.
  // If preflight option is true and this function isn't called
  // before posting, request will be limited:
  limiter.cookieLimiter?.preflight(event);
};

export const actions = {
  default: async (event) => {
    // Every call to isLimited counts as a hit towards the rate limit for the event.
    if (await limiter.isLimited(event)) throw error(429);
  }
};
```

The limiters will be called in smallest unit and rate order, so in the example above:

```
cookie(2/min) → IPUA(5/min) → IP(10/hour)
```

Valid units are, from smallest to largest:

```
'ms' | 's' | '15s' | '30s' | 'm' | '15m' | '30m' | 'h' | '2h' | '6h' | '12h' | 'd'
```

## Retry-After limiter

There is a version of the rate limiter that will return [Retry-After](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Retry-After) information, the number of seconds before the request should be attempted again. It's used in a similar way:

```ts
import { error } from '@sveltejs/kit';
import { RetryAfterRateLimiter } from 'sveltekit-rate-limiter/server';

const limiter = new RetryAfterRateLimiter({
  rates: {
    IP: [10, 'h']
    IPUA: [5, 'm']
  }
});

export const actions = {
  default: async (event) => {
    const status = await limiter.check(event);

    if(status.limited) {
      event.setHeaders({
        'Retry-After': status.retryAfter.toString()
      });
      return fail(429);
    }
  }
};
```

A custom store for the `RetryAfterRateLimiter` can also be used, in which the second argument to the constructor should be a [RateLimiterStore](https://github.com/ciscoheat/sveltekit-rate-limiter/blob/main/src/lib/server/index.ts#L24) that returns a unix timestamp describing when the request should be reattempted, based on the unit sent to it.

## Clearing the limits

Clearing all rate limits can be done by calling the `clear` method of the rate limiter object.

## Creating a custom limiter

Implement the `RateLimiterPlugin` interface:

```ts
interface RateLimiterPlugin {
  hash: (event: RequestEvent) => Promise<string | boolean | null>;
  get rate(): Rate;
}
```

In `hash`, return one of the following:

- A `string` based on a [RequestEvent](https://kit.svelte.dev/docs/types#public-types-requestevent), which will be counted and checked against the rate.
- A `boolean`, to short-circuit the plugin chain and make the request fail (`false`) or succeed (`true`) no matter the current rate.
- Or `null`, to signify an indeterminate result and move to the next plugin in the chain, or fail the request if it's the last one.

### String hash rules

- The string will be hashed later, so you don't need to use a hash function.
- The string cannot be empty, in which case an exception will be thrown.

### Example

Here's the source for the IP + User Agent limiter:

```ts
import type { RequestEvent } from '@sveltejs/kit';
import type { Rate, RateLimiterPlugin } from 'sveltekit-rate-limiter/server';

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
```

Add your limiter to the `plugins` option to use it.

```ts
import { RateLimiter } from 'sveltekit-rate-limiter/server';

const limiter = new RateLimiter({
  plugins: [new CustomLimiter([5, 'm'])]
  // The built-in limiters can be added as well.
});
```
