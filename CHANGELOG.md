# Changelog

Headlines: Added, Changed, Deprecated, Removed, Fixed, Security

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
