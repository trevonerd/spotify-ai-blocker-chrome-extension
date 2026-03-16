/**
 * Popup UI entrypoint.
 *
 * @remarks
 * Renders stats, now-playing information and controls that talk to the
 * background/page scripts via Chrome extension messaging.
 */

import { escHtml } from "./utils/html";

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing element with id "${id}"`);
  }
  return el;
};

async function getSpotifyTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ url: "https://open.spotify.com/*" });
  return tabs[0] ?? null;
}

interface NowPlaying {
  artistName: string | null;
  artistId: string | null;
  artistUrl: string | null;
  trackName: string | null;
  trackUrl: string | null;
  coverDataUrl?: string | null;
}

function fetchNowPlaying(tabId: number): Promise<NowPlaying | null> {
  return new Promise<NowPlaying | null>((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_NOW_PLAYING", tabId }, (resp) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve((resp as NowPlaying | null) ?? null);
    });
  });
}

interface ExtensionState {
  blockedIds?: string[];
  lastRunAt?: string;
  lastRunCount?: number;
  csvCache?: { data?: string };
}

async function loadState(): Promise<ExtensionState> {
  return chrome.storage.local.get(["blockedIds", "lastRunAt", "lastRunCount", "csvCache"]);
}

function setCsvLoading(): void {
  elCsv.textContent = "Loading…";
}

const elWarning = $("el-warning");
const elBlocked = $("el-blocked");
const elCsv = $("el-csv");
const elDot = $("el-dot");
const elLastrun = $("el-lastrun");
const elRun = $("el-run") as HTMLButtonElement;
const elRunnote = $("el-runnote");
const elProgress = $("el-progress");
const elProgressFill = $("el-progress-fill") as HTMLDivElement;
const elProgressLabel = $("el-progress-label");
const elNpcard = $("el-npcard");
const elReport = $("el-report") as HTMLButtonElement & { _artistInfo?: NowPlayingWithCover };

function renderStats(state: ExtensionState): void {
  const count = Array.isArray(state.blockedIds) ? state.blockedIds.length : 0;
  elBlocked.textContent = count.toLocaleString();

  if (state.csvCache?.data) {
    const csvCount = state.csvCache.data
      .split("\n")
      .slice(1)
      .filter((l) => l.trim()).length;
    elCsv.textContent = csvCount.toLocaleString();
  } else {
    elCsv.textContent = "—";
  }

  const lastRun = state.lastRunAt;
  const today = new Date().toISOString().slice(0, 10);

  if (lastRun) {
    const isToday = lastRun === today;
    elDot.classList.toggle("active", isToday);
    elLastrun.textContent = isToday
      ? `Last run: today${state.lastRunCount ? ` · +${state.lastRunCount} new` : " · up to date"}`
      : `Last run: ${lastRun}`;
  } else {
    elLastrun.textContent = "Never run yet";
  }
}

type NowPlayingWithCover = NowPlaying | null;

function renderNowPlaying(info: NowPlayingWithCover): void {
  if (!info || !info.artistId) {
    elNpcard.className = "now-playing-card empty";
    elNpcard.innerHTML = '<span class="np-empty">Nothing playing right now</span>';
    elReport.disabled = true;
    return;
  }

  elNpcard.className = "now-playing-card";

  const coverHtml = info.coverDataUrl
    ? `<img class="cover" src="${info.coverDataUrl}" alt="" />`
    : `<div class="cover-ph">
         <svg width="20" height="20" viewBox="0 0 24 24" fill="#535353">
           <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
         </svg>
       </div>`;

  elNpcard.innerHTML = `
    ${coverHtml}
    <div class="np-info">
      <div class="np-track"  title="${escHtml(info.trackName)}">${escHtml(
        info.trackName ?? "Unknown track",
      )}</div>
      <div class="np-artist" title="${escHtml(info.artistName)}">${escHtml(
        info.artistName ?? "Unknown artist",
      )}</div>
    </div>`;

  elReport.disabled = false;
  elReport._artistInfo = info;
}

function updateProgress(current: number, total: number, status: string): void {
  if (status === "started" || status === "running") {
    elProgress.style.display = "";
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    elProgressFill.style.width = `${pct}%`;
    elProgressLabel.textContent =
      status === "started"
        ? "Starting…"
        : `${current.toLocaleString()} / ${total.toLocaleString()} artists blocked`;
    elRun.disabled = true;
    elRun.innerHTML = '<div class="spinner"></div>&nbsp;Running…';
  } else if (status === "finished") {
    elProgressFill.style.width = "100%";
    elProgressLabel.textContent =
      current > 0 ? `Done! ${current.toLocaleString()} artists blocked` : "Already up to date";
    void loadState().then(renderStats);
    setTimeout(() => {
      elProgress.style.display = "none";
      elProgressFill.style.width = "0%";
      elRun.disabled = false;
      elRun.textContent = "🔄 Run now";
      elRunnote.textContent = "Runs automatically every 24 h · and on Spotify page load";
    }, 3000);
  }
}

async function handleReport(spotifyTab: chrome.tabs.Tab | null): Promise<void> {
  const info = elReport._artistInfo as NowPlayingWithCover;
  if (!info) return;

  elReport.disabled = true;
  elReport.textContent = "⏳ Reporting + blocking…";

  if (spotifyTab?.id != null) {
    chrome.tabs.sendMessage(spotifyTab.id, { type: "CMD_REPORT_ARTIST" }, () => {
      void chrome.runtime.lastError;
    });
  }

  elReport.textContent = "✅ Reported!";
  setTimeout(() => {
    elReport.textContent = "🚨 Report as AI Artist on GitHub";
    elReport.disabled = false;
  }, 3000);
}

async function handleRun(spotifyTab: chrome.tabs.Tab | null): Promise<void> {
  if (!spotifyTab?.id) {
    elRunnote.textContent = "⚠️ Open Spotify Web Player first!";
    return;
  }

  if (!window.confirm("This will re-run the blocker now. Continue?")) return;

  elRun.disabled = true;
  elRun.innerHTML = '<div class="spinner"></div>&nbsp;Running…';
  elRunnote.textContent = "Blocking AI artists…";

  chrome.tabs.sendMessage(spotifyTab.id, { type: "FORCE_BLOCK_RUN" }, () => {
    void chrome.runtime.lastError;
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "PROGRESS_UPDATE") {
    updateProgress(message.current, message.total, message.status);
  }
});

async function init(): Promise<void> {
  const [spotifyTab, state] = await Promise.all([getSpotifyTab(), loadState()]);

  if (!spotifyTab) {
    elWarning.style.display = "";
  }

  renderStats(state);

  // If CSV is not yet loaded, ask background to fetch it once and refresh stats.
  if (!state.csvCache?.data) {
    setCsvLoading();
    chrome.runtime.sendMessage({ type: "FETCH_CSV", force: false }, () => {
      // Ignore errors; just try to refresh stats if CSV arrived.
      void loadState().then(renderStats);
    });
  }

  const { blockProgress } = (await chrome.storage.local.get("blockProgress")) as {
    blockProgress?: { current: number; total: number; status: string };
  };
  if (blockProgress && (blockProgress.status === "started" || blockProgress.status === "running")) {
    updateProgress(blockProgress.current, blockProgress.total, blockProgress.status);
  }

  if (spotifyTab?.id != null) {
    const info = await fetchNowPlaying(spotifyTab.id);
    renderNowPlaying(info);
  } else {
    renderNowPlaying(null);
  }

  elRun.addEventListener("click", () => {
    void handleRun(spotifyTab);
  });
  elReport.addEventListener("click", () => {
    void handleReport(spotifyTab);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const v = chrome.runtime.getManifest().version;
  const versionEl = document.getElementById("el-version");
  if (versionEl) {
    versionEl.textContent = `v${v}`;
  }
  void init();
});
