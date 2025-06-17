# Changelog

Headlines: Added, Changed, Deprecated, Removed, Fixed, Security

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] - 2025-06-17

### Added

- The `check` method now exists on both limiters, and will return a `reason` property.
- `RateLimiterOptions` is now exported.
- Package updates for Svelte 5 and general QOL improvements [#18](https://github.com/ciscoheat/sveltekit-rate-limiter/pull/18), thanks to [screenfluent](https://github.com/screenfluent)!

### Fixed

- Fixed so invalid cookie data does not cause an infinite loop when `preflight` is `false`.

## [0.6.1] - 2024-09-19

### Added

- Plugins can now use an array of rates for the `rate` property, so limits like "1 per secord, 100 per hour" can be set.
- New limiters: `CloudflareIPRateLimiter` and `CloudflareIPUARateLimiter` that can be imported from `sveltekit-rate-limiter/limiters`.

### Changed

- The `RateLimiterStore` interface now uses `number` as second parameter to the `add` method.

## [0.5.2] - 2024-07-15

### Added

- Some additional rate units: `2m | 5m | 10m | 45m`

## [0.5.1] - 2024-03-18

### Fixed

- Interfaces now uses `MaybePromise` instead of `Promise`.

## [0.5.0] - 2024-03-17

### Changed

- Plugins returning `null` weren't fully indeterminate: They will now limit the request only if no other limited have passed. As soon as another plugin passes, any subsequent `null` result will pass (for the current request).

### Added

- Added "extra data" type parameter for the rate limiter, so plugins can be provided information outside the request event. See README for an example.

## [0.4.3] - 2024-01-16

### Changed

- The "rates" object options (`IP`, `IPUA`, `cookie`) should now be set in the top of the configuration for `RateLimiter`, no need for a nested object.
- Deprecated the `ms` rate unit, it's not reliable due to OS timing issues.

### Added

- Added more units for milliseconds and seconds.

## [0.4.2] - 2023-12-18

### Fixed

- Compatibility with SvelteKit 2.

## [0.4.1] - 2023-08-21

### Fixed

- Hash function is now compatible with any environment that supports Web Crypto API, including Cloudflare workers. (Wasn't working properly in 0.4.0)

## [0.4.0] - 2023-08-19

### Changed

- `limiter.preflight` is now async and must be awaited!
- Cookie limiter options now takes a `serializeOptions`, that can be used for customizing the cookie.

### Added

- `hashFunction` option, for custom hashing. Defaults to Web Crypto API SHA-256, will fallback to NodeJS crypto if not available.

### Fixed

- Hash function is now compatible with any environment that supports Web Crypto API, including Cloudflare workers.

## [0.3.5] - 2023-08-14

### Added

- Added a `RetryAfterRateLimiter`, that provides information for setting a [Retry-After](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Retry-After) header.
- Added `clear` method to the rate limiters.

## [0.3.4] - 2023-08-11

### Security

- Rate wasn't limited when `null` was returned last in chain.

### Fixed

- Added top-level export, to make vite/vitest satisfied.

## [0.3.2] - 2023-07-11

### Changed

- Removed `check` method from `RateLimiterStore` interface.

### Added

- `RateLimiterPlugin` can now return `null`, as an indeterminate result.

### Fixed

- `RateLimiter` plugin chain wasn't immutable.

## [0.3.1] - 2023-07-02

### Security

- Moved exports to `sveltekit-rate-limiter/server`.

### Added

- Added `isLimited` method.

### Removed

- Removed `check` method, replaced by `isLimited` **which has the condition inverted!**

### Changed

- `RateLimiterPlugin` interface is now using a getter instead of readonly for `rate`.

## [0.2.1] - 2023-06-30

### Added

- `RateLimiterPlugin` can now return `boolean`, not just `false`.

## [0.2.0] - 2023-06-30

### Fixed

- Corrected exports
- Package updated

### Changed

- Hash type is now `string` instead of an alias.
