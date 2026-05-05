/**
 * Background service worker entrypoint.
 *
 * @remarks
 * Handles alarms, tab updates, context menus, CSV caching and now-playing
 * requests for the popup. Runs as a Manifest V3 service worker.
 */

const CSV_URL =
  "https://raw.githubusercontent.com/CennoxX/spotify-ai-blocker/refs/heads/main/SpotifyAiArtists.csv";
const ALARM_NAME = "daily-block-check";
const CACHE_KEY = "csvCache";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Clean up stale running state from crashed worker.
chrome.storage.local.get("blockProgress", (data: { blockProgress?: { status?: string } }) => {
  if (data.blockProgress?.status === "running" || data.blockProgress?.status === "started") {
    chrome.storage.local.set({
      blockProgress: {
        current: 0,
        total: 0,
        status: "finished",
        updatedAt: Date.now(),
      },
    });
    chrome.action.setBadgeText({ text: "" });
  }
});

function scheduleAlarm(): void {
  chrome.alarms.get(ALARM_NAME, (existing) => {
    if (!existing) {
      chrome.alarms.create(ALARM_NAME, {
        delayInMinutes: 1,
        periodInMinutes: 24 * 60,
      });
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  scheduleAlarm();
  // Preload CSV on install so popup stats have data even before first run.
  void fetchCsv(false).catch(() => {
    // Ignore failures; popup can trigger another fetch later.
  });
});

chrome.runtime.onStartup.addListener(() => {
  scheduleAlarm();
  // Refresh CSV cache on browser startup (if stale).
  void fetchCsv(false).catch(() => {
    // Ignore failures; popup can trigger another fetch later.
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    void triggerOnAllSpotifyTabs("TRIGGER_BLOCK_RUN");
  }
});

async function triggerOnAllSpotifyTabs(type: string): Promise<void> {
  const tabs = await chrome.tabs.query({ url: "https://open.spotify.com/*" });
  for (const tab of tabs) {
    if (tab.id != null) {
      sendToTab(tab.id, type);
    }
  }
}

function sendToTab(tabId: number, type: string): void {
  chrome.tabs.sendMessage(tabId, { type }, () => {
    // Swallow potential "no receiver" errors when tab has no content script.
    void chrome.runtime.lastError;
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url?.startsWith("https://open.spotify.com/")) {
    // Delay gives page-script time to inject and set up.
    setTimeout(() => {
      sendToTab(tabId, "TRIGGER_BLOCK_RUN");
    }, 3000);
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "report-ai-artist" && tab?.id != null) {
    sendToTab(tab.id, "CMD_REPORT_ARTIST");
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "FETCH_CSV") {
    void fetchCsv(message.force === true)
      .then(sendResponse)
      .catch((err: Error) => {
        sendResponse({ error: err.message });
      });
    return true;
  }

  if (message.type === "GET_NOW_PLAYING") {
    void getNowPlayingWithCover(message.tabId)
      .then(sendResponse)
      .catch(() => {
        sendResponse(null);
      });
    return true;
  }

  if (message.type === "PROGRESS_UPDATE") {
    const { current, total, status } = message;
    if (status === "started" || status === "running") {
      chrome.action.setBadgeText({ text: "⏳" });
      chrome.action.setBadgeBackgroundColor({ color: "#FFA500" });
    } else if (status === "finished") {
      chrome.action.setBadgeText({ text: "" });
    }
    chrome.storage.local.set({
      blockProgress: { current, total, status, updatedAt: Date.now() },
    });
  }
});

async function fetchCsv(force = false): Promise<{ csv: string; fromCache: boolean }> {
  const { [CACHE_KEY]: cache } = (await chrome.storage.local.get(CACHE_KEY)) as {
    [CACHE_KEY]?: { data?: string; fetchedAt?: number };
  };

  if (!force && cache?.data && cache.fetchedAt && Date.now() - cache.fetchedAt < ONE_DAY_MS) {
    return { csv: cache.data as string, fromCache: true };
  }

  const resp = await fetch(CSV_URL);
  if (!resp.ok) {
    throw new Error(`GitHub returned HTTP ${resp.status}`);
  }
  const data = await resp.text();

  await chrome.storage.local.set({ [CACHE_KEY]: { data, fetchedAt: Date.now() } });
  return { csv: data, fromCache: false };
}

interface NowPlayingInfo {
  artistName: string | null;
  artistId: string | null;
  artistUrl: string | null;
  trackName: string | null;
  trackUrl: string | null;
  coverUrl?: string | null;
  coverDataUrl?: string | null;
}

async function getNowPlayingWithCover(tabId: number | undefined): Promise<NowPlayingInfo | null> {
  if (tabId == null) {
    return null;
  }

  let results: chrome.scripting.InjectionResult<NowPlayingInfo>[];
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId },
      func: readNowPlayingFromDOM,
    });
  } catch {
    return null;
  }

  const info = results?.[0]?.result ?? null;
  if (!info) {
    return null;
  }

  if (info.coverUrl) {
    try {
      const resp = await fetch(info.coverUrl);
      const buffer = await resp.arrayBuffer();
      const type = resp.headers.get("content-type") || "image/jpeg";
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      info.coverDataUrl = `data:${type};base64,${b64}`;
    } catch {
      info.coverDataUrl = null;
    }
    delete info.coverUrl;
  }

  return info;
}

/**
 * Reads now-playing information from the Spotify DOM.
 * Retries with fallback selectors to handle race conditions
 * where the now-playing bar hasn't updated yet.
 *
 * @returns A Promise resolving to metadata about the current artist and track,
 *          or null-valued object if nothing is playing after max retries.
 */
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
    const maxAttempts = 25;
    const intervalMs = 200;

    function tryQuery(): void {
      attempts++;

      const artistEl = artistSelectors
        .map((s) => document.querySelector<HTMLAnchorElement>(s))
        .find((el) => el != null);
      const trackEl = trackSelectors
        .map((s) => document.querySelector<HTMLAnchorElement>(s))
        .find((el) => el != null);
      const coverEl = coverSelectors
        .map((s) => document.querySelector<HTMLImageElement>(s))
        .find((el) => el != null);

      if (artistEl && trackEl) {
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

      setTimeout(tryQuery, intervalMs);
    }

    tryQuery();
  });
}
