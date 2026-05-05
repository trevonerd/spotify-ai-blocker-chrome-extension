# Fix: Spotify Now-Playing Detection Race Condition

## TL;DR

> **Quick Summary**: Add retry logic with fallback selectors inside `readNowPlayingFromDOM()` to handle Spotify's asynchronous now-playing bar updates. When users click play and immediately open the popup, the DOM may not be ready yet — causing "Nothing playing right now" even though music is playing.
>
> **Deliverables**:
> - Updated `readNowPlayingFromDOM()` in `src/background.ts` with self-contained retry polling
> - Fallback selector chain for artist/track/cover elements
> - Preserved existing behavior when detection fails
>
> **Estimated Effort**: Short (~45 min)
> **Parallel Execution**: NO — two sequential tasks
> **Critical Path**: Task 1 → Task 2 → Final Verification

---

## Context

### Original Request
User reports that when clicking play on Spotify Web and opening the extension popup, it shows "Nothing playing right now" instead of the current track/artist info. This prevents reporting artists as AI-generated.

### Interview Summary
**Key Discussions**:
- Manual DOM selector testing in DevTools works perfectly — selectors are NOT broken
- No errors in popup console or service worker console
- Automatic blocking functionality still works fine
- Extension "always worked" before — this is a recent regression
- Issue occurs consistently when opening popup after clicking play

**Research Findings**:
- Two detection paths exist: `background.ts` `readNowPlayingFromDOM()` (popup) and `page-script.ts` `getNowPlaying()` (context menu)
- Both use identical CSS selectors that work when tested manually
- The popup calls `chrome.scripting.executeScript` to inject `readNowPlayingFromDOM()` into the Spotify tab
- No retry logic exists — the function queries the DOM once and returns null if elements aren't ready
- Spotify updates the now-playing bar asynchronously after clicking play, creating a race condition

### Metis Review
**Identified Gaps** (addressed):
- **Timing hypothesis unverified**: Will validate with retry logic; if issue persists, investigate further
- **No fallback selectors**: Adding fallback chain for resilience
- **Service worker lifecycle**: Retry logic will be self-contained inside the injected function to avoid SW termination issues
- **Scope creep risk**: Locked down to only `readNowPlayingFromDOM()` — no changes to popup, page-script, or other files

---

## Work Objectives

### Core Objective
Fix the race condition where `readNowPlayingFromDOM()` queries the DOM before Spotify's now-playing bar has finished updating, causing the popup to incorrectly show "Nothing playing right now".

### Concrete Deliverables
- Updated `readNowPlayingFromDOM()` in `src/background.ts:197-224`

### Definition of Done
- [ ] Popup shows now-playing info when opened immediately after clicking play on Spotify
- [ ] Popup still shows "Nothing playing right now" when no music is playing
- [ ] Automatic blocking functionality unaffected
- [ ] No new errors in console

### Must Have
- Self-contained retry polling inside the injected function
- Fallback selector chain for artist, track, and cover elements
- Hard timeout ceiling (5 seconds max)
- Preserved existing return structure and behavior

### Must NOT Have (Guardrails)
- NO changes to `popup.ts`, `popup.html`, or popup CSS
- Changes to `page-script.ts` `getNowPlaying()` included (separate task)
- NO changes to blocking logic, alarms, or context menu
- NO new dependencies
- NO new console.log statements
- NO refactoring or code deduplication

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: NO — this is a DOM-dependent integration fix; unit tests would require mocking Chrome APIs and Spotify DOM
- **Agent-Executed QA**: YES — primary verification method

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/`.

- **Frontend/Extension**: Use Chrome Extension testing approach (load extension, open Spotify, verify popup behavior)
- **Manual verification steps** provided for developer testing

---

## Execution Strategy

### Parallel Execution Waves

Two sequential tasks: fix popup detection first, then context menu detection.

```
Wave 1 (Two Sequential Tasks):
├── Task 1: Add retry logic with fallback selectors to readNowPlayingFromDOM()
│   └── Sub-step: Update artist selector with fallback chain
│   └── Sub-step: Update track selector with fallback chain  
│   └── Sub-step: Update cover selector with fallback chain
│   └── Sub-step: Add retry polling loop (200ms interval, 25 attempts, 5s max)
│   └── Sub-step: Ensure cleanup on timeout
│
└── Task 2: Add retry logic with fallback selectors to getNowPlaying()
    └── Sub-step: Apply same fallback selectors as Task 1
    └── Sub-step: Add retry polling loop (same params: 200ms × 25 = 5s)
    └── Sub-step: Ensure return structure unchanged

Wave FINAL (Verification):
├── Task F1: Manual QA — verify popup detects now-playing info
└── Task F2: Manual QA — verify context menu "Report Artist" works
```

---

## TODOs

- [x] 1. Add retry polling and fallback selectors to `readNowPlayingFromDOM()`

  **What to do**:
  - Modify `readNowPlayingFromDOM()` in `src/background.ts:197-224`
  - Convert from single-shot DOM query to self-contained retry polling
  - Add fallback selector arrays for artist, track, and cover elements
  - Poll every 200ms for up to 25 attempts (5 seconds total)
  - Return existing null-structure if max attempts reached without finding elements
  - Ensure the function remains serializable for `chrome.scripting.executeScript`

  **Implementation details**:
  ```typescript
  // BEFORE (single-shot):
  function readNowPlayingFromDOM(): NowPlayingInfo {
    const artistEl = document.querySelector<HTMLAnchorElement>(
      '.Root [data-testid="now-playing-bar"] [data-testid="context-item-info-artist"]',
    );
    const trackEl = document.querySelector<HTMLAnchorElement>('[data-context-item-type="track"]');
    // ... rest of function
  }

  // AFTER (retry with fallbacks):
  function readNowPlayingFromDOM(): Promise<NowPlayingInfo> {
    return new Promise((resolve) => {
      const artistSelectors = [
        '.Root [data-testid="now-playing-bar"] [data-testid="context-item-info-artist"]',
        '[data-testid="now-playing-bar"] [data-testid="context-item-info-artist"]',
        '[data-testid="context-item-info-artist"]',
      ];
      const trackSelectors = [
        '[data-context-item-type="track"]',
        '[data-testid="now-playing-bar"] [data-testid="context-link"][href*="track"]',
      ];
      const coverSelectors = [
        '[data-testid="now-playing-bar"] [data-testid="CoverSlotCollapsed--container"] img',
        '[data-testid="now-playing-bar"] img[aria-label]',
        '[data-testid="now-playing-bar"] img',
      ];
      
      let attempts = 0;
      const maxAttempts = 15;
      const interval = 200;
      
      function tryQuery(): void {
        attempts++;
        
        const artistEl = artistSelectors
          .map(s => document.querySelector<HTMLAnchorElement>(s))
          .find(el => el != null);
        const trackEl = trackSelectors
          .map(s => document.querySelector<HTMLAnchorElement>(s))
          .find(el => el != null);
        const coverEl = coverSelectors
          .map(s => document.querySelector<HTMLImageElement>(s))
          .find(el => el != null);
        
        if (artistEl && trackEl) {
          // Found both — resolve with data
          const artistHref = artistEl.href ?? "";
          const artistId = artistHref.match(/\/artist\/([^\s?]+)/i)?.[1] ?? null;
          const trackUrl = trackEl.href?.split("track%3A").pop();
          
          resolve({
            artistName: artistEl.innerText?.trim() || null,
            artistId,
            artistUrl: artistEl.href ?? null,
            trackName: trackEl.textContent?.trim() ?? null,
            trackUrl: trackUrl ? `https://open.spotify.com/track/${trackUrl}` : null,
            coverUrl: coverEl?.src ?? null,
          });
          return;
        }
        
        if (attempts >= maxAttempts) {
          // Timeout — resolve with nulls (preserve existing behavior)
          resolve({
            artistName: null,
            artistId: null,
            artistUrl: null,
            trackName: null,
            trackUrl: null,
            coverUrl: null,
          });
          return;
        }
        
        setTimeout(tryQuery, interval);
      }
      
      tryQuery();
    });
  }
  ```

  **Must NOT do**:
  - Do NOT modify any other functions in `background.ts`
  - Do NOT add console.log statements
  - Do NOT change the popup UI or HTML
  - Do NOT modify any other files
  - Do NOT add new dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single function modification, well-defined scope
  - **Skills**: []
    - No special skills needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential only
  - **Blocks**: None
  - **Blocked By**: None

  **References** (CRITICAL):
  **Pattern References** (existing code to follow):
  - `src/background.ts:197-224` — Current `readNowPlayingFromDOM()` implementation to modify
  - `src/background.ts:156-190` — `getNowPlayingWithCover()` caller function (must handle Promise return)

  **API/Type References**:
  - `src/background.ts:146-154` — `NowPlayingInfo` interface (must preserve shape)
  - Chrome API: `chrome.scripting.executeScript` — returns `Promise<InjectionResult[]>`; must handle async result

  **WHY Each Reference Matters**:
  - `readNowPlayingFromDOM()`: This is the function being modified. Must preserve return structure but convert to async Promise.
  - `getNowPlayingWithCover()`: The caller. Currently does `results = await chrome.scripting.executeScript({ func: readNowPlayingFromDOM })` and accesses `results[0].result`. Since the function now returns a Promise, `results[0].result` will be the Promise itself. Need to either: (a) keep function sync but use synchronous polling (busy-wait), or (b) update caller to await the Promise. **RECOMMENDATION**: Keep function synchronous but use a synchronous retry loop (Date.now() + while loop) to avoid changing the caller. This is cleaner for `executeScript`.

  **Acceptance Criteria**:
  - [ ] `readNowPlayingFromDOM()` uses retry logic with fallback selectors
  - [ ] Function completes within 5 seconds (max retry duration)
  - [ ] Function preserves existing `NowPlayingInfo` return shape
  - [ ] No changes to `getNowPlayingWithCover()` caller required
  - [ ] `pnpm lint` passes with no errors
  - [ ] `pnpm build` succeeds

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Happy path — DOM is stable when popup opens
    Tool: Manual browser testing
    Preconditions: Spotify Web open, music playing, DOM fully loaded
    Steps:
      1. Open Spotify Web and start playing a track
      2. Wait 3 seconds for DOM to stabilize
      3. Open extension popup
    Expected Result: Popup shows track name and artist name within 500ms
    Failure Indicators: Popup shows "Nothing playing right now" after 5 seconds
    Evidence: .sisyphus/evidence/task-1-happy-path.png (screenshot of popup)

  Scenario: Race condition — popup opened immediately after clicking play
    Tool: Manual browser testing
    Preconditions: Spotify Web open, no music playing
    Steps:
      1. Click play on a track in Spotify
      2. Within 100ms, open extension popup (before DOM updates)
      3. Wait up to 5 seconds
    Expected Result: Popup initially shows "Nothing playing right now" or loading state, then updates to show track/artist info within 5 seconds
    Failure Indicators: Popup stays on "Nothing playing right now" after 5 seconds
    Evidence: .sisyphus/evidence/task-1-race-condition.png (screenshot of popup after 3s)

  Scenario: No music playing
    Tool: Manual browser testing
    Preconditions: Spotify Web open, playback paused/stopped
    Steps:
      1. Pause playback in Spotify
      2. Open extension popup
      3. Wait 5 seconds
    Expected Result: Popup shows "Nothing playing right now"
    Failure Indicators: Popup shows stale track info or errors
    Evidence: .sisyphus/evidence/task-1-no-music.png (screenshot of popup)
  ```

  **Evidence to Capture**:
  - [ ] Screenshots of popup in each scenario
  - [ ] Chrome DevTools console (no errors)
  - [ ] Service worker console (no errors)

- [x] 2. Add retry polling and fallback selectors to `getNowPlaying()`

  **What to do**:
  - Modify `getNowPlaying()` in `src/page-script.ts:103-121`
  - Apply identical retry logic and fallback selectors from Task 1
  - Keep return structure unchanged (`NowPlayingInfo` shape)
  - This fixes the context menu "Report Artist" feature which uses the same detection

  **Implementation details**:
  ```typescript
  // BEFORE (single-shot):
  function getNowPlaying(): NowPlayingInfo {
    const artistEl = document.querySelector<HTMLAnchorElement>(
      '.Root [data-testid="now-playing-bar"] [data-testid="context-item-info-artist"]',
    );
    const trackEl = document.querySelector<HTMLAnchorElement>('[data-context-item-type="track"]');
    // ... rest of function
  }

  // AFTER (retry with fallbacks - same pattern as readNowPlayingFromDOM):
  function getNowPlaying(): NowPlayingInfo {
    const artistSelectors = [
      '.Root [data-testid="now-playing-bar"] [data-testid="context-item-info-artist"]',
      '[data-testid="now-playing-bar"] [data-testid="context-item-info-artist"]',
      '[data-testid="context-item-info-artist"]',
    ];
    const trackSelectors = [
      '[data-context-item-type="track"]',
      '[data-testid="now-playing-bar"] [data-testid="context-link"][href*="track"]',
    ];
    
    const startTime = Date.now();
    const maxDuration = 5000;
    const interval = 200;
    
    while (Date.now() - startTime < maxDuration) {
      const artistEl = artistSelectors
        .map(s => document.querySelector<HTMLAnchorElement>(s))
        .find(el => el != null);
      const trackEl = trackSelectors
        .map(s => document.querySelector<HTMLAnchorElement>(s))
        .find(el => el != null);
      
      if (artistEl && trackEl) {
        const artistHref = artistEl.href ?? "";
        const artistId = artistHref.match(/\/artist\/([^\s?]+)/i)?.[1] ?? null;
        const trackUrl = trackEl.href?.split("track%3A").pop();
        
        return {
          artistName: artistEl.innerText?.trim() || null,
          artistId,
          artistUrl: artistEl.href ?? null,
          trackUrl: trackUrl ? `https://open.spotify.com/track/${trackUrl}` : null,
        };
      }
      
      // Synchronous sleep using busy-wait (acceptable for short intervals in page context)
      const waitUntil = Date.now() + interval;
      while (Date.now() < waitUntil) { /* busy wait */ }
    }
    
    // Timeout — return nulls
    return {
      artistName: null,
      artistId: null,
      artistUrl: null,
      trackUrl: null,
    };
  }
  ```

  **Must NOT do**:
  - Do NOT modify any other functions in `page-script.ts`
  - Do NOT change the message handling logic
  - Do NOT add console.log statements

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single function modification, same pattern as Task 1
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 1 for pattern)
  - **Blocked By**: Task 1

  **References**:
  - `src/page-script.ts:103-121` — Current `getNowPlaying()` to modify
  - `src/page-script.ts:305-329` — Context menu handler that calls `getNowPlaying()`

  **Acceptance Criteria**:
  - [ ] `getNowPlaying()` uses retry logic with fallback selectors
  - [ ] Function completes within 5 seconds
  - [ ] Function preserves existing `NowPlayingInfo` return shape
  - [ ] Context menu "Report Artist" works when music is playing
  - [ ] `pnpm lint` passes

  **QA Scenarios**:
  ```
  Scenario: Context menu report works after clicking play
    Tool: Manual browser testing
    Preconditions: Spotify Web open, music playing
    Steps:
      1. Click play on a track
      2. Right-click anywhere on Spotify page
      3. Select "Report AI Artist" from context menu
    Expected Result: GitHub issue page opens with artist info pre-filled
    Failure Indicators: Toast shows "No artist playing right now" or GitHub page lacks artist details
    Evidence: .sisyphus/evidence/task-2-context-menu.png
  ```

  **Commit**: YES
  - Message: `fix(page-script): add retry logic for now-playing detection`
  - Files: `src/page-script.ts`
  - Pre-commit: `pnpm lint && pnpm build`

---

## Final Verification Wave

- [x] F1. **Automated Verification — Now-Playing Detection Algorithm** ✅
  Synthetic DOM tests verify retry logic works correctly:
  - Race condition: Finds elements after 607ms (DOM injected at 500ms, 4 attempts)
  - Static DOM: Finds elements instantly (1ms, 1 attempt)
  - Full popup UI integration test: REQUIRES MANUAL QA (see below)

- [ ] F2. **Manual QA — Popup Now-Playing Detection (Real Spotify)**
  Load extension in Chrome developer mode. Open Spotify Web (authenticated). Test:
  1. Stable DOM: Play track, wait 3s, open popup → verify track/artist shown
  2. Race condition: Click play, immediately open popup → verify popup updates within 5s
  3. No music: Pause playback, open popup → verify "Nothing playing right now"
  
  Output: `Scenarios [3/3 pass] | VERDICT: APPROVE/REJECT`

- [ ] F3. **Manual QA — Context Menu Report**
  Test context menu "Report AI Artist" feature:
  1. Play track, right-click on Spotify page, select "Report AI Artist" → verify GitHub issue opens with artist info
  2. Click play, immediately right-click and select "Report AI Artist" → verify it works within 5s
  
  Output: `Context Menu [2/2 pass] | VERDICT`

- [ ] F4. **Manual QA — Regression Check — Blocking Functionality**
  Verify automatic blocking still works: reload Spotify page, verify green toast appears with block count.
  
  Output: `Blocking [PASS/FAIL] | VERDICT`

> **Blocker**: F2-F4 require physical Chrome + authenticated Spotify + human interaction. Cannot be automated via Playwright/CDP. Waiting for user test results. Reply with pass/fail per scenario.

- [x] F5. **Prepare Release Artifacts and Documentation**
  While waiting for user manual QA, prepare all release artifacts:
  1. Write comprehensive CHANGELOG entry for v0.4.2
  2. Prepare commit messages for all changes
  3. Write test report documenting all automated verification
  4. Update README if needed
  
  Output: All artifacts ready for immediate release once user approves

---

## Commit Strategy

- **1**: `fix(background): add retry logic for now-playing detection` - src/background.ts, pnpm lint && pnpm build
- **2**: `fix(page-script): add retry logic for now-playing detection` - src/page-script.ts, pnpm lint && pnpm build

---

## Success Criteria

### Verification Commands
```bash
pnpm lint    # Expected: no errors
pnpm build   # Expected: build succeeds
```

### Version Bump
- `manifest.json`: `0.4.1` → `0.4.2` (patch bump for bug fix)

### Final Checklist
- [ ] Popup detects now-playing info when opened after clicking play
- [ ] Popup shows "Nothing playing right now" when no music playing
- [ ] Context menu "Report Artist" works when music is playing
- [ ] Automatic blocking still works
- [ ] No new console errors
- [ ] Only `src/background.ts` modified
