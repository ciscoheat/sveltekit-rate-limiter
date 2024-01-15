import type { RequestHandler } from './$types';
import { RateLimiter } from '$lib/server';
import { error, json } from '@sveltejs/kit';

const limiter = new RateLimiter({
  cookie: {
    name: 'preflight-required',
    rate: [2, '15s'],
    secret: 'VERY_SECRET',
    preflight: true
  }
});

export const GET: RequestHandler = async (event) => {
  await limiter.cookieLimiter?.preflight(event);
  return json({ message: 'Preflight' });
};

export const POST: RequestHandler = async (event) => {
  if (await limiter.isLimited(event)) {
    error(429);
  }
  return json({ message: 'Not limited' });
};
