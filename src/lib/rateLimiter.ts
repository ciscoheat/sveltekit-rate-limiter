import type { RequestEvent } from '@sveltejs/kit';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import TTLCache from '@isaacs/ttlcache';

type RateHash = string;
type RateUnit = 'ms' | 's' | 'm' | 'h' | 'd';
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
			max: maxItems,
			noUpdateTTL: true
			/*
			dispose(value, key, reason) {
				console.log('TTLStore ~ dispose', value, key, reason);
			}
      */
		});
	}

	set(hash: RateHash, rate: number, unit: RateUnit): number {
		this.cache.set(hash, rate, { ttl: RateLimiter.TTLTime(unit) });
		return rate;
	}

	check(hash: RateHash): number {
		return this.cache.get(hash) ?? 0;
	}

	add(hash: RateHash, unit: RateUnit): number {
		const currentRate = this.check(hash);
		return this.set(hash, currentRate + 1, unit);
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

type CookieRateLimiterOptions = {
	name: string;
	secret?: string;
	rate: Rate;
	preflight: boolean;
};

class CookieRateLimiter implements RateLimiterPlugin {
	readonly rate: Rate;
	private readonly secret: string;
	private readonly requirePreflight: boolean;
	private readonly cookieId: string;

	constructor(options: CookieRateLimiterOptions) {
		this.cookieId = options.name;
		this.secret = options.secret ?? nanoid();
		this.rate = options.rate;
		this.requirePreflight = options.preflight;
	}

	hash(event: RequestEvent) {
		const currentId = this.userIdFromCookie(
			event.cookies.get(this.cookieId),
			event
		);
		return currentId ? currentId : false;
	}

	preflight(event: RequestEvent): string {
		const data = event.cookies.get(this.cookieId);
		if (data) {
			const userId = this.userIdFromCookie(data, event);
			if (userId) return userId;
		}
		const userId = nanoid();
		event.cookies.set(
			this.cookieId,
			userId + ';' + RateLimiter.hash(this.secret + userId),
			{
				path: '/',
				httpOnly: true,
				maxAge: RateLimiter.TTLTime(this.rate[1]) / 1000
			}
		);
		return userId;
	}

	private userIdFromCookie(
		cookie: string | undefined,
		event: RequestEvent
	): string | null {
		const empty = () => {
			return this.requirePreflight ? null : this.preflight(event);
		};

		if (!cookie) return empty();
		const [userId, secretHash] = cookie.split(';');
		if (!userId || !secretHash) return empty();
		if (RateLimiter.hash(this.secret + userId) != secretHash) {
			return empty();
		}
		return userId;
	}
}

///// Main class //////////////////////////////////////////////////////////////

export class RateLimiter {
	private store: RateLimiterWritable;
	private plugins: RateLimiterPlugin[];

	readonly cookieLimiter: CookieRateLimiter | undefined;

	static hash(data: string): RateHash {
		return crypto.createHash('sha256').update(data).digest('hex');
	}

	static TTLTime(unit: RateUnit) {
		if (unit == 'ms') return 1;
		if (unit == 's') return 1000;
		if (unit == 'm') return 60 * 1000;
		if (unit == 'h') return 60 * 60 * 1000;
		if (unit == 'd') return 24 * 60 * 60 * 1000;
		throw new Error('Invalid unit for TTLTime: ' + unit);
	}

	check(event: RequestEvent) {
		let status = true;
		for (const plugin of this.plugins) {
			const id = plugin.hash(event);
			if (id === false) status = false;
			if (!id)
				throw new Error(
					'Empty hash returned from rate limiter ' + plugin.constructor.name
				);

			const hash = RateLimiter.hash(id);

			const rate = this.store.add(hash, plugin.rate[1]);
			if (rate > plugin.rate[0]) status = false;
		}
		return status;
	}

	constructor(
		options: {
			plugins?: RateLimiterPlugin[];
			store?: RateLimiterWritable;
			maxItems?: number;
			rates?: {
				IP?: Rate;
				IPUA?: Rate;
				cookie?: CookieRateLimiterOptions;
			};
		} = {}
	) {
		this.plugins = options.plugins ?? [];

		if (options.rates?.IP)
			this.plugins.push(new IPRateLimiter(options.rates.IP));

		if (options.rates?.IPUA)
			this.plugins.push(new IPUserAgentRateLimiter(options.rates.IPUA));

		if (options.rates?.cookie) {
			this.plugins.push(
				(this.cookieLimiter = new CookieRateLimiter(options.rates.cookie))
			);
		}

		if (!this.plugins.length) {
			throw new Error('No plugins set for RateLimiter!');
		}

		/*
		// Sort plugins by rate, if early cancelling
		this.plugins.sort((a, b) => {
			const diff =
				RateLimiter.TTLTime(a.rate[1]) - RateLimiter.TTLTime(b.rate[1]);
			return diff == 0 ? a.rate[0] - b.rate[0] : diff;
		});
    */

		const maxTTL = this.plugins.reduce((acc, plugin) => {
			const time = RateLimiter.TTLTime(plugin.rate[1]);
			return Math.max(time, acc);
		}, 0);

		this.store = options.store ?? new TTLStore(maxTTL, options.maxItems);
	}
}
