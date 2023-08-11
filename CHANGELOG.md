# Changelog

Headlines: Added, Changed, Deprecated, Removed, Fixed, Security

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.3] - 2023-08-11

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
