import type { MaybePromise, RequestEvent } from '@sveltejs/kit';
import type { Rate } from '../rate';

export interface RateLimiterPlugin<Extra = never> {
  hash: (
    event: RequestEvent,
    extraData: Extra
  ) => MaybePromise<string | boolean | null>;
  get rate(): Rate | Rate[];
}
