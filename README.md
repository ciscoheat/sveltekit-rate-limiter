# sveltekit-rate-limiter

A modular rate limiter for password resets, account registration, etc. Use in your `page.server.ts` files, or `hooks.server.ts`.

```ts
import { RateLimiter } from 'sveltekit-rate-limiter';

const limiter = new RateLimiter({
	rates: {
		IP: [10, 'h'],
		IPUA: [5, 'm'],
		cookie: {
			name: 'testcookie',
			secret: 'SECRETKEY',
			rate: [2, 'm'],
			preflight: true
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
