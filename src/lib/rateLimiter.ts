import type { RequestEvent } from '@sveltejs/kit';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import TTLCache from '@isaacs/ttlcache';

type RateHash = string;
type RateUnit = 's' | 'm' | 'h' | 'd';
type Rate = [number, RateUnit];

interface RateLimiterReadable {
	check: (hash: RateHash, unit: RateUnit) => number;
}

interface RateLimiterWritable extends RateLimiterReadable {
	add: (hash: RateHash, unit: RateUnit) => number;
}

interface RateLimiterPlugin {
	hash: (event: RequestEvent) => string | false;
	readonly rate: Rate;
}

///// Store ///////////////////////////////////////////////////////////////////

class TTLStore implements RateLimiterWritable {
	private cache: TTLCache<RateHash, number>;

	constructor(maxTTL: number, maxItems = Infinity) {
		this.cache = new TTLCache({
			ttl: maxTTL,
			max: maxItems
		});
	}

	set(hash: RateHash, rate: number, unit: RateUnit) {
		this.cache.set(hash, rate, { ttl: RateLimiter.TTLTime(unit) });
		return rate;
	}

	check(hash: RateHash, unit: RateUnit) {
		const currentRate = this.cache.get(hash);
		return currentRate === undefined ? this.set(hash, 1, unit) : currentRate;
	}

	add(hash: RateHash, unit: RateUnit) {
		const currentRate = this.cache.get(hash);
		return currentRate === undefined
			? this.set(hash, 1, unit)
			: this.set(hash, currentRate + 1, unit);
	}
}

///// Plugins /////////////////////////////////////////////////////////////////

class IPRateLimiter implements RateLimiterPlugin {
	readonly rate: Rate;

	constructor(rate: Rate) {
		this.rate = rate;
	}

	hash(event: RequestEvent) {
		return event.getClientAddress();
	}
}

class IPUserAgentRateLimiter implements RateLimiterPlugin {
	readonly rate: Rate;

	constructor(rate: Rate) {
		this.rate = rate;
	}

	hash(event: RequestEvent) {
		const ua = event.request.headers.get('user-agent');
		if (!ua) return false;
		return event.getClientAddress() + ua;
	}
}

class CookieRateLimiter implements RateLimiterPlugin {
	readonly rate: Rate;
	private readonly cookieId: string;

	constructor(cookieId: string, rate: Rate) {
		this.cookieId = cookieId;
		this.rate = rate;
	}

	hash(event: RequestEvent) {
		const currentId = this.userIdFromCookie(event.cookies.get(this.cookieId));
		return currentId ? currentId : false;
	}

	preflight(request: RequestEvent) {
		const data = request.cookies.get(this.cookieId);
		if (data) {
			const userId = this.userIdFromCookie(data);
			if (userId) return userId;
		}
		const userId = nanoid();
		request.cookies.set(
			this.cookieId,
			userId + ';' + RateLimiter.hash(this.cookieId + userId)
		);
		return userId;
	}

	private userIdFromCookie(cookie: string | undefined) {
		if (!cookie) return null;
		const cookieData = cookie.split(';');
		if (cookieData.length != 2) return null;
		if (RateLimiter.hash(this.cookieId + cookieData[0]) != cookieData[1])
			return null;
		return cookieData[0];
	}
}

///// Main class //////////////////////////////////////////////////////////////

export class RateLimiter {
	private store: RateLimiterWritable;
	private plugins: RateLimiterPlugin[];

	static hash(data: string): RateHash {
		return crypto.createHash('sha256').update(data).digest('hex');
	}

	static TTLTime(unit: RateUnit) {
		let ttl = 1000;
		if (unit == 'm') ttl = ttl * 60;
		else if (unit == 'h') ttl = ttl * 60 * 60;
		else if (unit == 'd') ttl = ttl * 60 * 60 * 24;
		return ttl;
	}

	add(event: RequestEvent) {
		return this.plugins.reduce((status, plugin) => {
			const hash = plugin.hash(event);
			if (hash === false) return false;
			if (!hash)
				throw new Error(
					'Empty hash returned from rate limiter ' + plugin.constructor.name
				);

			const rate = this.store.add(RateLimiter.hash(hash), plugin.rate[1]);
			return rate > plugin.rate[0] ? false : status;
		}, true);
	}

	constructor(
		options: {
			plugins?: RateLimiterPlugin[];
			store?: RateLimiterWritable;
			defaultRates?: {
				ip?: Rate;
				ipAndUserAgent?: Rate;
				cookie?: { name: string; rate: Rate };
			};
		} = {}
	) {
		this.plugins = options.plugins ?? [];

		if (options.defaultRates?.ip)
			this.plugins.push(new IPRateLimiter(options.defaultRates.ip));

		if (options.defaultRates?.ipAndUserAgent)
			this.plugins.push(
				new IPUserAgentRateLimiter(options.defaultRates.ipAndUserAgent)
			);

		if (options.defaultRates?.cookie) {
			const { name, rate } = options.defaultRates.cookie;
			this.plugins.push(new CookieRateLimiter(name, rate));
		}

		const maxTTL = this.plugins.reduce((acc, plugin) => {
			const time = RateLimiter.TTLTime(plugin.rate[1]);
			return Math.max(time, acc);
		}, 0);

		this.store = options.store ?? new TTLStore(maxTTL);
	}
}
