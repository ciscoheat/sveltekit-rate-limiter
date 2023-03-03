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

		expect(limiter.add(event)).toEqual(true);
		await delay(200);

		expect(limiter.add(event)).toEqual(true);
		await delay(300);

		expect(limiter.add(event)).toEqual(false);
		await delay(600);

		expect(limiter.add(event)).toEqual(true);
		expect(limiter.add(event)).toEqual(true);
		expect(limiter.add(event)).toEqual(false);
	}, 60000);

	it('should limit IP + User Agent requests', async () => {
		const limiter = new RateLimiter({
			rates: {
				ipAndUserAgent: [2, 'ms']
			}
		});

		const event = mockEvent() as RequestEvent;

		expect(limiter.add(event)).toEqual(true);
		expect(limiter.add(event)).toEqual(true);
		expect(limiter.add(event)).toEqual(false);

		await delay(1);

		expect(limiter.add(event)).toEqual(true);
		expect(limiter.add(event)).toEqual(true);
		expect(limiter.add(event)).toEqual(false);
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

		expect(limiter.add(event)).toEqual(true);
		expect(limiter.add(event)).toEqual(true);
		expect(limiter.add(event)).toEqual(false);

		await delay(1);

		expect(limiter.add(event)).toEqual(true);
		expect(limiter.add(event)).toEqual(true);
		expect(limiter.add(event)).toEqual(false);
	});

	it('should limit multiple plugins', async () => {
		const limiter = new RateLimiter({
			rates: {
				ip: [10, 'ms'],
				ipAndUserAgent: [6, 'ms'],
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

		expect(limiter.add(event)).toEqual(true); // 1
		expect(limiter.add(event)).toEqual(true); // 2
		expect(limiter.add(event)).toEqual(false); // 3 (Cookie fails)

		event.cookies.delete('testcookie');

		expect(limiter.add(event)).toEqual(true); // 4
		expect(limiter.add(event)).toEqual(true); // 5
		expect(limiter.add(event)).toEqual(false); // 6 (Cookie fails)

		event.cookies.delete('testcookie');

		expect(limiter.add(event)).toEqual(false); // 7 (UA fails)

		event.request.headers.set('User-Agent', 'Edge');

		expect(limiter.add(event)).toEqual(true); // 8
		expect(limiter.add(event)).toEqual(false); // 9 (Cookie fails)

		event.cookies.delete('testcookie');

		expect(limiter.add(event)).toEqual(true); // 10
		expect(limiter.add(event)).toEqual(false); // 11 (IP fails)
	});
});
