# Spotify AI Blocker — Chrome Extension

If you've been using Spotify for a while you've probably noticed something annoying: playlists and radio stations full of artists with names like "Relaxing Piano Mood Vol. 3" or "Deep Focus Study Beats" that don't really exist. They're AI-generated, uploaded in bulk, and Spotify keeps pushing them because they cost zero in royalties. The result is that you end up listening to fake music without even knowing it.

There's already a great Tampermonkey script by [CennoxX](https://github.com/CennoxX/spotify-ai-blocker) that solves this using a crowdsourced list of AI artists. The problem is that Tampermonkey is a power-user thing — you need to install an extension, paste a script, figure out how it works... most people give up before finishing.

This project brings the exact same functionality as a **native Chrome extension**: install it, open Spotify, done. Nothing else.

> ⚠️ **Work in progress** — Working towards a stable release to publish on the Chrome Web Store. For now it installs in developer mode (instructions below, it's not complicated).

> ⚠️ **Disclaimer** — Spotify does not provide an official API for blocking artists. This userscript mimics requests made by Spotify's web player and may violate Spotify's Terms of Service. Use at your own risk.

---

## How it works in 30 seconds

- Automatically blocks all AI artists from the [official crowdsourced list](https://github.com/CennoxX/spotify-ai-blocker) every 24 hours
- Blocks happen on your Spotify account — so they sync across **all your devices** (mobile app, desktop, smart TV, everything)
- If you find an AI artist that's not on the list yet, you can report them directly from the extension popup
- Only works on the **Spotify Web Player** (`open.spotify.com`) — but the blocks apply everywhere

---

## Installation

### Step 1 — Download the extension

Click the green **Code** button at the top right of this page, then **Download ZIP**. Extract the folder wherever you want (e.g. your Desktop).

Or if you use git:
```bash
git clone https://github.com/trevonerd/spotify-ai-blocker-chrome-extension.git
```

### Step 2 — Open Chrome's extensions page

In Chrome's address bar type:
```
chrome://extensions
```
and press Enter.

### Step 3 — Enable Developer Mode

In the top right corner you'll see a toggle called **"Developer mode"**. Turn it on. Three new buttons will appear.

### Step 4 — Load the extension

Click **"Load unpacked"**. A file picker opens: navigate to the `spotify-ai-blocker-chrome-extension` folder you extracted and select it (the folder itself, not the files inside).

The extension icon will appear in Chrome's toolbar. If you don't see it, click the puzzle icon 🧩 and pin it.

### Step 5 — Open Spotify

Go to [open.spotify.com](https://open.spotify.com) and log in. The extension starts automatically. After a few seconds you'll see a green toast notification showing how many artists were blocked.

**That's it.** From now on it runs automatically every 24 hours and every time you reload Spotify.

---

## How to use it

**The popup** (click the extension icon in Chrome):
- See how many artists you've blocked and how many are in the total list
- See when the last automatic block run happened
- When a blocking run is active, a Spotify-green progress bar shows real-time progress (e.g. "Blocking 142/850...")
- Force a manual run with **"Run now"** — clicking it shows a confirmation prompt to prevent accidental API spam
- If a song is playing, you can see the current track and report the artist as AI with one click
- While a blocking run is active, the extension icon displays a hourglass badge (⏳) with an orange background, which clears automatically when the run completes

**Reporting an AI artist:**
1. Play a song by the suspicious artist
2. Open the extension popup
3. Click **"Report as AI Artist on GitHub"**
4. A pre-filled GitHub issue opens — add any extra details and submit
5. The artist gets blocked on your account immediately, even before the report gets accepted into the list

**Right-click menu:**
You can also right-click anywhere on the Spotify page and find the report option in the context menu.

---

## FAQ

**Do blocks work on mobile too?**
Yes. Blocking an artist is an account-level feature, not device-specific. Whatever you block on the web player applies everywhere.

**How often does the list update?**
The list is downloaded from GitHub once a day and cached locally. New artists get blocked automatically every 24 hours, every time you reload Spotify, or manually via the popup.

**Can I unblock an artist?**
Yes, directly from Spotify: go to the artist's profile, click the three dots and choose "Unblock". The extension won't re-block them (it keeps a local cache of what it has already blocked).

**Can Spotify ban me for this?**
It uses the same internal endpoint Spotify uses when you manually block an artist. The risk is extremely low. That said, no guarantees. See the disclaimer at the top of this README for more details.

---

## For developers

### Project structure

```
spotify-ai-blocker-chrome-extension/
├── manifest.json              # MV3 manifest
├── src/
│   ├── background.ts          # Service worker: alarms, CSV cache, context menu, cover art
│   ├── injector.ts            # Content script: bridge between page context ↔ extension runtime
│   ├── page-script.ts         # Page context: fetch interceptor, block API, toast notifications
│   └── utils/
│       └── csv.ts             # CSV parsing utilities (unit-tested)
├── popup/
│   ├── popup.html
│   ├── popup.ts               # Popup UI logic (TypeScript + TSDoc)
│   └── utils/
│       └── html.ts            # HTML escaping helper (unit-tested)
├── dist/                      # Built Chrome extension (output of `pnpm build`)
├── vite.config.ts             # Vite + @crxjs/vite-plugin manifest-driven build
├── tsconfig.json              # TypeScript compiler options
├── biome.json                 # Biome (lint + format) configuration
├── .husky/                    # Husky Git hooks (pre-commit, commit-msg)
├── .commitlintrc.cjs          # Conventional commit rules
└── package.json               # Scripts and dev tooling configuration
```

### Runtime architecture (content script vs page script)

MV3 content scripts run in an isolated JS world — they can't access `window.fetch` or any of the page's variables. To capture Spotify's Bearer token (which travels in the headers of its fetch calls) we need to execute code in the real page context.

Solution: `injector.ts` (content script) injects `page-script.ts` as a `<script src>` tag, which runs in the actual page context. The two communicate via `window.postMessage` with a namespaced protocol (`SAB_PAGE` / `SAB_BG`) and unique request IDs to avoid race conditions.

### Message flow

```
popup.ts
  └─ chrome.tabs.sendMessage(FORCE_BLOCK_RUN)
       └─ injector.ts (chrome.runtime.onMessage)
            └─ window.postMessage(SAB_BG, FORCE_BLOCK_RUN)
                 └─ page-script.ts (window message listener)
                      └─ main(forced=true)
                           ├─ bridgeRequest(FETCH_CSV) → injector → background → GitHub
                           └─ fetch(spclient.wg.spotify.com/collection/v2/write)

Progress reporting:
page-script.ts main()
  └─ bridgeNotify(PROGRESS_UPDATE, {current, total, status})
       └─ injector.ts forwards to extension runtime
            └─ background.ts
                 ├─ Sets badge text (⏳ while running, cleared when done)
                 ├─ Persists progress to chrome.storage.local
                 └─ Forwards to popup.ts (if open)
                      └─ Updates progress bar in real-time
```

### Tooling and scripts

The project is built with a modern TypeScript toolchain:

- **Package manager**: `pnpm`
- **Bundler**: `Vite` + `@crxjs/vite-plugin` (manifest-driven MV3 builds)
- **Language**: `TypeScript` (all new code, comments and TSDoc in English)
- **Lint/format**: `Biome` (`biome.json`)
- **Git hooks**: `Husky` + `Commitlint` (conventional commits)
- **Tests**: `Vitest` (`vitest` + `@vitest/coverage-v8`)

Available scripts in `package.json`:

```bash
# Start a dev build (useful together with Chrome's "Load unpacked" pointing to dist/)
pnpm dev

# Production build into dist/ (ready to load or zip for Chrome Web Store)
pnpm build

# Lint + format checks via Biome
pnpm lint
pnpm format

# Run unit tests
pnpm test
```

### Testing

Unit tests are written with **Vitest** and focus on pure utilities:

- `src/utils/csv.test.ts` – tests the CSV parser used by the page script.
- `popup/utils/html.test.ts` – tests the HTML escaping helper used in the popup UI.

To run the test suite locally:

```bash
pnpm install
pnpm test
```

Git hooks (via Husky) can be extended to include `pnpm test` in the `pre-commit` step to ensure tests stay green before every commit.

### Reloading during development

After editing a file: go to `chrome://extensions` → click the reload icon on the extension → reload Spotify.

For `page-script.js` logs: open Spotify DevTools (F12) → Console, filter by `[AI Blocker]`.
For service worker logs: `chrome://extensions` → "Service worker" → Inspect.

### Permissions used

| Permission | Reason |
|---|---|
| `storage` | Store blocked artist IDs and last-run timestamp |
| `scripting` | Read Spotify's DOM to get now-playing info (popup) |
| `tabs` | Find the open Spotify tab |
| `alarms` | Automatic 24h run |
| `contextMenus` | Right-click menu on Spotify |
| `host: open.spotify.com` | Inject the content script |
| `host: spclient.wg.spotify.com` | Call Spotify's block API |
| `host: raw.githubusercontent.com` | Download the AI artist list |

---

## Credits

- AI artist list and original script: [CennoxX/spotify-ai-blocker](https://github.com/CennoxX/spotify-ai-blocker) — MIT License
- This extension ports the original script's logic and adds UX improvements: real-time progress bar, badge icon while running, and confirmation dialog on manual runs

---

## License

MIT
