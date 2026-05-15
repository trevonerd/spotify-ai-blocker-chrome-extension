# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Migrated the extension build fully to WXT with file-based entrypoints, generated MV3 manifest, WXT zip output, and Chrome/Edge scripts.
- Refactored runtime messaging and storage access around shared TypeScript types and WXT storage while preserving existing extension local storage keys.
- Split and polished the popup UI with separate CSS, testable view helpers, better empty/error states, and inline manual-run confirmation.
- Replaced custom release shell scripting with WXT build, zip, submit, manifest, and purity-check package scripts.

### Fixed

- Registered the Spotify right-click report context menu from the background service worker.

## [0.4.2] - 2026-05-05

### Added

- Added "Report AI Artist" floating button on artist pages - appears as a green pill with robot icon in the bottom-right corner when viewing any artist profile

### Fixed

- **Critical**: Fixed race condition in now-playing detection that caused popup to incorrectly show "Nothing playing right now" when opened immediately after clicking play. Both `readNowPlayingFromDOM()` (background) and `getNowPlaying()` (page-script) now use retry polling with fallback selectors:
  - Polls every 200ms for up to 25 attempts (5 second max timeout)
  - Falls back through multiple selector arrays for artist (3), track (2), and cover (3) elements
  - Uses `.map().find()` pattern to select first matching element from fallback chain
- **Critical**: Fixed UI freeze bug in `getNowPlaying()` - the busy-wait loop blocked the main thread for up to 5 seconds, freezing Spotify's UI during context menu usage. Converted to async Promise-based retry with `setTimeout` polling (same pattern as background.ts)
- Fixed artist name selector on artist pages - `[data-testid="entityTitle"]` alone was matching sidebar elements instead of artist names. Reordered selectors from most-specific to most-general: `artist-page-hero-title` → `artist-page-hero entityTitle` → `top-result-card entityTitle` → `h1` → `.artist-names`

## [0.4.1] - Previous

### Added

- Progress bar in popup showing real-time blocking progress during runs
- Hourglass badge (⏳) on extension icon during active blocking runs with orange background
- Last-run timestamp display in popup

### Changed

- Improved error handling for CSV fetch failures
- Enhanced popup UI layout and responsiveness

## [0.4.0] - Previous

### Added

- Automatic blocking of AI artists from community-maintained list
- Context menu "Report AI Artist" for quick reporting
- Popup with current track info and GitHub issue creation
- Daily alarm for automatic blocking runs
- Toast notifications for blocking completion

[Unreleased]: https://github.com/trevonerd/spotify-ai-blocker-chrome-extension/compare/v0.4.2...HEAD
[0.4.2]: https://github.com/trevonerd/spotify-ai-blocker-chrome-extension/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/trevonerd/spotify-ai-blocker-chrome-extension/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/trevonerd/spotify-ai-blocker-chrome-extension/releases/tag/v0.4.0
