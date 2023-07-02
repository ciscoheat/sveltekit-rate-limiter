import { RateLimiter, type Rate } from '$lib/server';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const rates = {
  IP: [3, 'm'] satisfies Rate,
  IPUA: [1, '15s'] satisfies Rate
};

const limiter = new RateLimiter({ rates });

export const load = (async () => {
  return { rates };
}) satisfies PageServerLoad;

export const actions = {
  default: async (event) => {
    if (!(await limiter.check(event))) {
      return fail(429, { status: false });
    }
    return { status: true };
  }
};
