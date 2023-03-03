import { RateLimiter } from '$lib/rateLimiter';
import type { RequestEvent } from '@sveltejs/kit';
import { describe, it, expect } from 'vitest';
import { mock } from 'vitest-mock-extended';

describe('Basic rate limiter', () => {
	it('should limit requests', () => {
		const limiter = new RateLimiter({
			defaultRates: {
				ip: [2, 's']
			}
		});

		const event = mock<RequestEvent>();
		event.getClientAddress.mockReturnValue('123.456.789.0');

		expect(limiter.add(event)).toEqual(true);
		expect(limiter.add(event)).toEqual(true);
		expect(limiter.add(event)).toEqual(false);
	});
});
