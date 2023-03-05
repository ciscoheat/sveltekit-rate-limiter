# sveltekit-rate-limiter

A modular rate limiter for password resets, account registration, etc. Use in your `page.server.ts` files, or `hooks.server.ts`.

Uses an in-memory cache, but can be swapped for something else. Same for limiters, which are plugins. See the [source file](https://github.com/ciscoheat/sveltekit-rate-limiter/blob/main/src/lib/rateLimiter.ts) for interfaces.

```ts
import { RateLimiter } from 'sveltekit-rate-limiter';

const limiter = new RateLimiter({
  rates: {
    IP: [10, 'h'],  // IP address limiter
    IPUA: [5, 'm'], // IP + User Agent limiter
    cookie: {       // Cookie limiter
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
    if (!limiter.check(event)) return fail(429);
  }
};
```
