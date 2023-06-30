# sveltekit-rate-limiter

A modular rate limiter for password resets, account registration, etc. Use in your `page.server.ts` files, or `hooks.server.ts`.

Uses an in-memory cache, but can be swapped for something else. Same for limiters, which are plugins. See the [source file](https://github.com/ciscoheat/sveltekit-rate-limiter/blob/main/src/lib/rateLimiter.ts) for interfaces.

```ts
import { RateLimiter } from 'sveltekit-rate-limiter';

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
    if (!(await limiter.check(event))) return fail(429);
  }
};
```

## Creating a custom limiter

Implement the `RateLimiterPlugin` interface:

```ts
interface RateLimiterPlugin {
  hash: (event: RequestEvent) => Promise<string | boolean>;
  readonly rate: Rate;
}
```

In `hash`, return a unique string for a `RequestEvent`, or a boolean to make the request fail or succeed no matter the current rate. The string will be hashed later.

Here's the source for the IP + User Agent limiter, as an example:

```ts
import type { RequestEvent } from '@sveltejs/kit';
import type { Rate, RateLimiterPlugin } from 'sveltekit-rate-limiter';

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

Add the limiter to `options.plugins` to use it.

```ts
import { RateLimiter } from 'sveltekit-rate-limiter';

const limiter = new RateLimiter({
  plugins: [new CustomLimiter([5, 'm'])]
});
```
