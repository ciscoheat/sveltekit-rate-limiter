import { RateLimiter } from '$lib/rateLimiter';
import type { RequestEvent } from '@sveltejs/kit';
import { describe, it, expect } from 'vitest';
import { mock } from 'vitest-mock-extended';

async function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function mockEvent(): Partial<RequestEvent> {
	const cookieStore = new Map<string, string>();
	return {
		request: new Request('https://test.com', {
			headers: {
				'User-Agent': 'Chrome'
			}
		}),
		getClientAddress: () => '345.456.789.0',
		cookies: {
			get(name) {
				return cookieStore.get(name);
			},
			set(name, value) {
				cookieStore.set(name, value);
			},
			delete(name) {
				cookieStore.delete(name);
			},
			serialize() {
				throw new Error('Not implemented.');
			}
		}
	};
}

describe('Basic rate limiter', async () => {
	it('should limit IP requests', async () => {
		const limiter = new RateLimiter({
			rates: {
				ip: [2, 's']
			}
		});

		const event = mock<RequestEvent>();
		event.getClientAddress.mockReturnValue('123.456.789.0');

		expect(limiter.check(event)).toEqual(true);
		await delay(200);

		expect(limiter.check(event)).toEqual(true);
		await delay(300);

		expect(limiter.check(event)).toEqual(false);
		await delay(10);
		expect(limiter.check(event)).toEqual(false);
		await delay(600);

		expect(limiter.check(event)).toEqual(true);
		expect(limiter.check(event)).toEqual(true);
		expect(limiter.check(event)).toEqual(false);
	}, 60000);

	it('should limit IP + User Agent requests', async () => {
		const limiter = new RateLimiter({
			rates: {
				ipAndUserAgent: [2, 'ms']
			}
		});

		const event = mockEvent() as RequestEvent;

		expect(limiter.check(event)).toEqual(true);
		expect(limiter.check(event)).toEqual(true);
		expect(limiter.check(event)).toEqual(false);

		await delay(1);

		expect(limiter.check(event)).toEqual(true);
		expect(limiter.check(event)).toEqual(true);
		expect(limiter.check(event)).toEqual(false);
	});

	it('should limit cookie requests', async () => {
		const limiter = new RateLimiter({
			rates: {
				cookie: {
					name: 'testcookie',
					secret: 'SECRET',
					rate: [2, 'ms'],
					preflight: true
				}
			}
		});

		const event = mockEvent() as RequestEvent;

		limiter.cookieLimiter?.preflight(event);

		expect(limiter.check(event)).toEqual(true);
		expect(limiter.check(event)).toEqual(true);
		expect(limiter.check(event)).toEqual(false);

		await delay(1);

		expect(limiter.check(event)).toEqual(true);
		expect(limiter.check(event)).toEqual(true);
		expect(limiter.check(event)).toEqual(false);
	});

	it.only('should limit multiple plugins', async () => {
		const limiter = new RateLimiter({
			rates: {
				ip: [10, 'ms'],
				ipAndUserAgent: [5, 'ms'],
				cookie: {
					name: 'testcookie',
					secret: 'SECRET',
					rate: [2, 'ms'],
					preflight: false
				}
			}
		});

		const event = mockEvent() as RequestEvent;

		limiter.cookieLimiter?.preflight(event);

		expect(limiter.check(event)).toEqual(true); //  1 1 1
		expect(limiter.check(event)).toEqual(true); //  2 2 2
		expect(limiter.check(event)).toEqual(false); // 3 3 3 (Cookie fails)

		event.cookies.delete('testcookie');

		expect(limiter.check(event)).toEqual(true); //  1 4 4
		expect(limiter.check(event)).toEqual(true); //  2 5 5
		expect(limiter.check(event)).toEqual(false); // 3 6 6 (Cookie fails)

		event.cookies.delete('testcookie');

		expect(limiter.check(event)).toEqual(false); // 1 7 7 (UA fails)

		event.request.headers.set('User-Agent', 'Edge');

		expect(limiter.check(event)).toEqual(true); //  2 1 8
		expect(limiter.check(event)).toEqual(false); // 3 2 9 (Cookie fails)

		event.cookies.delete('testcookie');

		expect(limiter.check(event)).toEqual(true); //  1 3 10
		expect(limiter.check(event)).toEqual(false); // 2 4 11 (IP fails)

		await delay(1);

		expect(limiter.check(event)).toEqual(true); //  1 1 1
		expect(limiter.check(event)).toEqual(true); //  2 2 2
		expect(limiter.check(event)).toEqual(false); // 3 3 3 (Cookie fails)
	});
});
