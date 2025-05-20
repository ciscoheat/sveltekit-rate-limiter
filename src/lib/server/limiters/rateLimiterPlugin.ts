import type { RequestEvent } from '@sveltejs/kit';
import type { Rate } from '../rate';

export interface RateLimiterPlugin<Extra = never> {
  hash: (
    event: RequestEvent,
    extraData: Extra
  ) => string | boolean | null | Promise<string | boolean | null>;
  get rate(): Rate | Rate[];
}
