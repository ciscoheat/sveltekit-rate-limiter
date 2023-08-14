import { type Rate, RetryAfterRateLimiter } from '$lib/server';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const rates = {
  IP: [3, 'm'] satisfies Rate,
  IPUA: [1, '15s'] satisfies Rate
};

const limiter = new RetryAfterRateLimiter({ rates });

export const load = (async () => {
  return { rates };
}) satisfies PageServerLoad;

export const actions = {
  default: async (event) => {
    const status = await limiter.check(event);
    if (status.limited) {
      event.setHeaders({
        'Retry-After': status.retryAfter.toString()
      });
      return fail(429, { retryAfter: status.retryAfter });
    }
    return { retryAfter: 0 };
  }
};
