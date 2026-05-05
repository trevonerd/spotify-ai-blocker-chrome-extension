# Release v0.4.2 — Prepared Commits

This document contains the prepared commit messages for v0.4.2 release.

---

## Commit 1: fix(background): add retry logic with fallback selectors for now-playing detection

**Files**: `src/background.ts`

**Changes**:
- Converted `readNowPlayingFromDOM()` from synchronous single-shot query to Promise-based retry polling
- Added fallback selector arrays for artist (3 selectors), track (2 selectors), and cover (3 selectors)
- Retry configuration: 200ms interval × 25 attempts = 5 second maximum timeout
- Uses `.map().find()` pattern to select first matching element from fallback chain
- Preserves existing `NowPlayingInfo` return structure for backward compatibility

**Rationale**:
Fixes race condition where popup opened immediately after clicking play would show "Nothing playing right now" even though music was playing. Spotify updates the now-playing bar asynchronously, creating a timing window where DOM elements aren't ready yet.

---

## Commit 2: fix(page-script): add retry logic with fallback selectors for now-playing detection

**Files**: `src/page-script.ts`

**Changes**:
- Converted `getNowPlaying()` from synchronous to async Promise-based retry polling
- Applied same fallback selector arrays as background.ts: artist (3 selectors), track (2 selectors)
- Same retry configuration: 200ms × 25 attempts = 5s timeout
- **Critical fix**: Replaced busy-wait loop with non-blocking `setTimeout` retry
- Updated `CMD_REPORT_ARTIST` handler (line 444) to use `await getNowPlaying()`

**Rationale**:
Fixes the same race condition for context menu "Report AI Artist" feature. The critical busy-wait bug (blocking main thread for 5s) was discovered during testing and fixed by converting to async Promise pattern.

---

## Commit 3: feat(page-script): add "Report AI Artist" button on artist pages

**Files**: `src/page-script.ts`

**Changes**:
- Added `injectArtistPageButton()` function that creates a floating green pill button
- Button appears on all `/artist/` pages with fixed position (bottom-right: 100px/24px)
- Styled with Spotify green (#1ed760), hover scale effect, and robot icon
- On click: extracts artist ID from URL, finds artist name using fallback selectors, blocks artist if not already blocked, opens pre-filled GitHub issue
- Added `setupArtistPageObserver()` to handle SPA navigation — button appears/disappears as user navigates to/from artist pages

**Rationale**:
Provides convenient one-click reporting when users discover suspicious artists while browsing. Complements the popup and context menu reporting options.

---

## Commit 4: fix(page-script): fix artist name selector specificity

**Files**: `src/page-script.ts`

**Changes**:
- Reordered artist name selectors in `injectArtistPageButton()` from most-specific to most-general
- Previous order had `[data-testid="entityTitle"]` too early, causing it to match sidebar elements ("Your Library") instead of artist names
- New order: `artist-page-hero-title` → `artist-page-hero entityTitle` → `top-result-card entityTitle` → `h1` → `.artist-names`

**Rationale**:
Fixes incorrect artist name detection on artist pages. The unqualified `entityTitle` selector was matching the wrong element, causing the report button to capture incorrect artist names.

---

## Version Bump

**File**: `manifest.json`

```diff
-  "version": "0.4.1",
+  "version": "0.4.2",
```

---

*Prepared for release on 2026-05-05*
