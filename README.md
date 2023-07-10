# sveltekit-rate-limiter

A modular rate limiter for password resets, account registration, etc. Use in your `page.server.ts` files, or `hooks.server.ts`.

Uses an in-memory cache, but can be swapped for something else. Same for limiters, which are plugins. See the [source file](https://github.com/ciscoheat/sveltekit-rate-limiter/blob/main/src/lib/server/index.ts#L24-L33) for interfaces.

```ts
import { error } from '@sveltejs/kit';
import { RateLimiter } from 'sveltekit-rate-limiter/server';

const limiter = new RateLimiter({
  rates: {
    IP: [10, 'h'], // IP address limiter
    IPUA: [5, 'm'], // IP + User Agent limiter
    cookie: {
      // Cookie limiter
      name: 'limiterid',
      secret: 'SECRETKEY-SERVER-ONLY',
      rate: [2, 'm'],
      preflight: true // Require preflight call (see load)
    }
  }
});

export const load = async (event) => {
  limiter.cookieLimiter?.preflight(event);
};

export const actions = {
  default: async (event) => {
    if (await limiter.isLimited(event)) throw error(429);
  }
};
```

## Creating a custom limiter

Implement the `RateLimiterPlugin` interface:

```ts
interface RateLimiterPlugin {
  hash: (event: RequestEvent) => Promise<string | boolean>;
  get rate(): Rate;
}
```

In `hash`, return a string based on a `RequestEvent`, which will be counted and checked against the rate, or a boolean to make the request fail (`false`) or succeed (`true`) no matter the current rate.

- The string will be hashed later, so you don't need to use any hash function.
- The string cannot be empty, in that case an exception will be thrown.

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

Add your limiter to `options.plugins` to use it.

```ts
import { RateLimiter } from 'sveltekit-rate-limiter/server';

const limiter = new RateLimiter({
  plugins: [new CustomLimiter([5, 'm'])]
  // The built-in limiters can be added as well.
});
```
