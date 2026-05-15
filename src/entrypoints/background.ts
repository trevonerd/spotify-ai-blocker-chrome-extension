import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import type {
  FetchCsvResponse,
  NowPlayingInfo,
  PageCommand,
  ProgressPayload,
  RuntimeMessage,
} from "../shared/messages";
import { isProgressStatus } from "../shared/messages";
import {
  loadBlockProgress,
  loadCsvCache,
  saveBlockProgress,
  saveCsvCache,
} from "../shared/storage";

const CSV_URL =
  "https://raw.githubusercontent.com/CennoxX/spotify-ai-blocker/refs/heads/main/SpotifyAiArtists.csv";
const ALARM_NAME = "daily-block-check";
const CONTEXT_MENU_ID = "report-ai-artist";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export default defineBackground({
  type: "module",
  main() {
    void resetStaleProgress();
    registerLifecycleHandlers();
    registerRuntimeHandlers();
    registerTabHandlers();
    registerContextMenuHandler();
  },
});

async function resetStaleProgress(): Promise<void> {
  const progress = await loadBlockProgress();
  if (progress?.status === "running" || progress?.status === "started") {
    await saveBlockProgress({ current: 0, total: 0, status: "finished" });
    await browser.action.setBadgeText({ text: "" });
  }
}

function registerLifecycleHandlers(): void {
  browser.runtime.onInstalled.addListener(() => {
    void bootstrapBackground();
  });

  browser.runtime.onStartup.addListener(() => {
    void bootstrapBackground();
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
      void triggerOnAllSpotifyTabs("TRIGGER_BLOCK_RUN");
    }
  });
}

async function bootstrapBackground(): Promise<void> {
  await Promise.all([
    scheduleAlarm(),
    ensureContextMenu(),
    fetchCsv(false).catch(() => {
      // Popup and page script can retry later; startup should stay quiet.
    }),
  ]);
}

async function scheduleAlarm(): Promise<void> {
  const existing = await browser.alarms.get(ALARM_NAME);
  if (!existing) {
    await browser.alarms.create(ALARM_NAME, {
      delayInMinutes: 1,
      periodInMinutes: 24 * 60,
    });
  }
}

async function ensureContextMenu(): Promise<void> {
  await browser.contextMenus.removeAll();
  browser.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Report current Spotify artist as AI",
    contexts: ["page", "selection", "link"],
    documentUrlPatterns: ["https://open.spotify.com/*"],
  });
}

function registerContextMenuHandler(): void {
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === CONTEXT_MENU_ID && tab?.id != null) {
      void sendToTab(tab.id, "CMD_REPORT_ARTIST");
    }
  });
}

function registerTabHandlers(): void {
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.url?.startsWith("https://open.spotify.com/")) {
      setTimeout(() => {
        void sendToTab(tabId, "TRIGGER_BLOCK_RUN");
      }, 3000);
    }
  });
}

function registerRuntimeHandlers(): void {
  browser.runtime.onMessage.addListener((rawMessage, _sender, sendResponse) => {
    const response = handleRuntimeMessage(rawMessage as RuntimeMessage);

    if (response instanceof Promise) {
      void response.then(sendResponse);
      return true;
    }

    return response;
  });
}

export function handleRuntimeMessage(
  message: RuntimeMessage,
): boolean | Promise<FetchCsvResponse | NowPlayingInfo | null> {
  if (message.type === "FETCH_CSV") {
    return fetchCsv(message.force === true).catch((err: Error) => ({ error: err.message }));
  }

  if (message.type === "GET_NOW_PLAYING") {
    return getNowPlayingWithCover(message.tabId).catch(() => null);
  }

  if (message.type === "PROGRESS_UPDATE") {
    const { current, total, status } = message;
    if (!isProgressStatus(status)) {
      return false;
    }

    void updateBadgeAndProgress({ current, total, status });
    return false;
  }

  return false;
}

async function triggerOnAllSpotifyTabs(type: PageCommand): Promise<void> {
  const tabs = await browser.tabs.query({ url: "https://open.spotify.com/*" });
  await Promise.all(tabs.map((tab) => (tab.id == null ? undefined : sendToTab(tab.id, type))));
}

async function sendToTab(tabId: number, type: PageCommand): Promise<void> {
  try {
    await browser.tabs.sendMessage(tabId, { type });
  } catch {
    // Spotify tabs can briefly exist before the content script is ready.
  }
}

async function updateBadgeAndProgress(progress: {
  current: number;
  total: number;
  status: ProgressPayload["status"];
}): Promise<void> {
  if (progress.status === "started" || progress.status === "running") {
    await browser.action.setBadgeText({ text: "..." });
    await browser.action.setBadgeBackgroundColor({ color: "#ffa500" });
  } else {
    await browser.action.setBadgeText({ text: "" });
  }

  await saveBlockProgress(progress);
}

async function fetchCsv(force = false): Promise<FetchCsvResponse> {
  const cache = await loadCsvCache();

  if (!force && cache?.data && cache.fetchedAt && Date.now() - cache.fetchedAt < ONE_DAY_MS) {
    return { csv: cache.data, fromCache: true };
  }

  const resp = await fetch(CSV_URL);
  if (!resp.ok) {
    throw new Error(`GitHub returned HTTP ${resp.status}`);
  }

  const data = await resp.text();
  await saveCsvCache({ data, fetchedAt: Date.now() });
  return { csv: data, fromCache: false };
}

async function getNowPlayingWithCover(tabId: number | undefined): Promise<NowPlayingInfo | null> {
  if (tabId == null) {
    return null;
  }

  let info: NowPlayingInfo | null = null;
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: readNowPlayingFromDOM,
    });
    info = (results?.[0]?.result as NowPlayingInfo | undefined) ?? null;
  } catch {
    return null;
  }

  if (!info?.coverUrl) {
    return info;
  }

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

  return info;
}

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
      attempts += 1;

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
