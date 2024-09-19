# sveltekit-rate-limiter

A modular rate limiter for password resets, account registration, API call limiting, etc. Use in your `+page.server.ts`, `+server.ts` or `src/hooks.server.ts`.

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
  IP: [10, 'h'], // IP address limiter
  IPUA: [5, 'm'], // IP + User Agent limiter
  cookie: {
    // Cookie limiter
    name: 'limiterid', // Unique cookie name for this limiter
    secret: 'SECRETKEY-SERVER-ONLY', // Use $env/static/private
    rate: [2, 'm'],
    preflight: true // Require preflight call (see load function)
  }
});

export const load = async (event) => {
  /**
   * Preflight prevents direct posting. If preflight option for the
   * cookie limiter is true and this function isn't called before posting,
   * request will be limited.
   *
   * Remember to await, so the cookie will be set before returning!
   */
  await limiter.cookieLimiter?.preflight(event);
};

export const actions = {
  default: async (event) => {
    // Every call to isLimited counts as a hit towards the rate limit for the event.
    if (await limiter.isLimited(event)) throw error(429);
  }
};
```

## Call order for limiters

The limiters will be called in smallest unit and rate order, so in the example above:

```
cookie(2/min) → IPUA(5/min) → IP(10/hour)
```

For four consecutive requests from the same source within one minute, the following will happen:

| Request | Cookie    | IPUA  | IP    |
| ------- | --------- | ----- | ----- |
| 1       | Hit 1     | Hit 1 | Hit 1 |
| 2       | Hit 2     | Hit 2 | Hit 2 |
| 3       | **Limit** | -     | -     |
| 4       | **Limit** | -     | -     |

If the cookie is deleted but the User-Agent stays the same, the counter keeps going for the other limiters:

| Request | Cookie    | IPUA  | IP    |
| ------- | --------- | ----- | ----- |
| 5       | Hit 1     | Hit 3 | Hit 3 |
| 6       | Hit 2     | Hit 4 | Hit 4 |
| 7       | **Limit** | -     | -     |

If deleted one more time, the User-Agent limiter will reach its limit:

| Request | Cookie    | IPUA      | IP    |
| ------- | --------- | --------- | ----- |
| 8       | Hit 1     | Hit 5     | Hit 5 |
| 9       | Hit 2     | **Limit** | -     |
| 10      | **Limit** | -         | -     |

## Valid units

Valid units are, from smallest to largest:

```
'100ms' | '250ms' | '500ms'
's' | '2s' | '5s' | '10s' | '15s' | '30s' | '45s'
'm' | '2m' | '5m  | '10m' | '15m' | '30m' | '45m'
'h' | '2h' | '6h' | '12h'
'd'
```

## Multiple limits

You can specify the rates as an array, to handle multiple rates per limiter, like "Max 1 per second and 100 per hour": `[[1, 's'], [100, 'h']]`.

## Retry-After limiter

There is a version of the rate limiter that will return [Retry-After](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Retry-After) information, the number of seconds before the request should be attempted again. This has been implemented in the `src/hooks.server.ts` file and instead of throwing an error code like other pages, we have to create a new response so that we can add the header.

```ts
import type { Handle } from '@sveltejs/kit';
import { RetryAfterRateLimiter } from 'sveltekit-rate-limiter/server';

const limiter = new RetryAfterRateLimiter({
  IP: [10, 'h'],
  IPUA: [5, 'm']
});

export const handle: Handle = async ({ event, resolve }) => {
  const status = await limiter.check(event);
  if (status.limited) {
    let response = new Response(
      `You are being rate limited. Please try after ${status.retryAfter} seconds.`,
      {
        status: 429,
        headers: { 'Retry-After': status.retryAfter.toString() }
      }
    );
    return response;
  }
  const response = await resolve(event);
  return response;
};
```

A custom store for the `RetryAfterRateLimiter` can also be used, in which the second argument to the constructor should be a [RateLimiterStore](https://github.com/ciscoheat/sveltekit-rate-limiter/blob/main/src/lib/server/index.ts#L24) that returns a unix timestamp describing when the request should be reattempted, based on the unit sent to it.

## Clearing the limits

Clearing all rate limits can be done by calling the `clear` method of the rate limiter object.

## Custom hash function

The default hash function is using `crypto.subtle` to generate a SHA-256 digest, but if isn't available in your environment, you can supply your own with the `hashFunction` option. Here's an example with the NodeJS `crypto` package:

```ts
import crypto from 'crypto';

// (input: string) => MaybePromise<string>
const hashFunction = (input: string) =>
  crypto.createHash('sha256').update(input).digest('hex');
```

## Creating a custom limiter

Implement the `RateLimiterPlugin` interface:

```ts
interface RateLimiterPlugin {
  hash: (event: RequestEvent) => MaybePromise<string | boolean | null>;
  get rate(): Rate | Rate[];
}
```

In `hash`, return one of the following:

- A `string` based on a [RequestEvent](https://kit.svelte.dev/docs/types#public-types-requestevent), which will be counted and checked against the rate.
- A `boolean`, to short-circuit the plugin chain and make the request fail (`false`) or succeed (`true`) no matter the current rate.
- Or `null`, to signify an indeterminate result and move to the next plugin in the chain, or fail the request if it's the last and no previous limiter have passed.

### String hash rules

- **The string will be hashed later**, so you don't need to use a hash function.
- **The string cannot be empty**, in which case an exception will be thrown.

### Example

Here's the source for the IP + User Agent limiter:

```ts
import type { RequestEvent } from '@sveltejs/kit';
import type { Rate, RateLimiterPlugin } from 'sveltekit-rate-limiter/server';

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
```

Add your limiter to the `plugins` option to use it.

```ts
import { RateLimiter } from 'sveltekit-rate-limiter/server';

const limiter = new RateLimiter({
  plugins: [new CustomLimiter([5, 'm'])]
  // The built-in limiters can be added as well.
});
```

## Custom data for the limiter

You can specify a type parameter to `RateLimiter` that expands the `isLimited` method with an extra parameter. There you can add extra data that will be supplied to the custom limiters:

```ts
class AllowDomain implements RateLimiterPlugin {
  // Shortest rate, so it will be executed first
  readonly rate: Rate = [0, '100ms'];
  readonly allowedDomain: string;

  constructor(allowedDomain: string) {
    this.allowedDomain = allowedDomain;
  }

  async hash(_: RequestEvent, extraData: { email: string }) {
    // Return true to bypass the rest of the plugin chain
    return extraData.email.endsWith(this.allowedDomain) ? true : null;
  }
}
```

```ts
const limiter = new RateLimiter<{ email: string }>({
  plugins: [new AllowDomain('company-domain.com')],
  IP: [10, 'm']
});

export const actions = {
  default: async (event) => {
    if (await limiter.isLimited(event, { email: event.locals.user.email })) {
      throw error(429);
    }
  }
};
```
