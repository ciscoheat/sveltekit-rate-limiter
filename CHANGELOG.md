# Changelog

Headlines: Added, Changed, Deprecated, Removed, Fixed, Security

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2023-07-02

### Security

- Moved exports to `sveltekit-rate-limiter/server`.

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