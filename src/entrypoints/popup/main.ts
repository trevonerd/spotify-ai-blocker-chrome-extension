import { type Browser, browser } from "wxt/browser";
import type { NowPlayingInfo, ProgressPayload, RuntimeMessage } from "../../shared/messages";
import { isProgressStatus } from "../../shared/messages";
import { loadBlockProgress, loadExtensionState } from "../../shared/storage";
import { escHtml } from "../../utils/html";
import { getPopupRefs, type PopupRefs } from "./dom";
import { countCsvRows, formatInteger, getLastRunText, getProgressView } from "./view-model";

type SpotifyTab = Browser.tabs.Tab;

let refs: PopupRefs;
let spotifyTab: SpotifyTab | null = null;
let nowPlaying: NowPlayingInfo | null = null;
let resetTimer: number | undefined;

async function getSpotifyTab(): Promise<SpotifyTab | null> {
  const tabs = await browser.tabs.query({ url: "https://open.spotify.com/*" });
  return tabs[0] ?? null;
}

async function fetchNowPlaying(tabId: number): Promise<NowPlayingInfo | null> {
  try {
    return ((await browser.runtime.sendMessage({
      type: "GET_NOW_PLAYING",
      tabId,
    } satisfies RuntimeMessage)) ?? null) as NowPlayingInfo | null;
  } catch {
    return null;
  }
}

function renderStats(state: Awaited<ReturnType<typeof loadExtensionState>>): void {
  refs.blocked.textContent = formatInteger(
    Array.isArray(state.blockedIds) ? state.blockedIds.length : 0,
  );

  const csvCount = countCsvRows(state.csvCache?.data);
  refs.csv.textContent = csvCount == null ? "-" : formatInteger(csvCount);

  const lastRun = getLastRunText(state);
  refs.dot.classList.toggle("active", lastRun.isFresh);
  refs.lastRun.textContent = lastRun.text;
}

function renderNowPlaying(info: NowPlayingInfo | null): void {
  nowPlaying = info;

  if (!info?.artistId) {
    refs.nowPlayingCard.className = "now-playing-card empty";
    refs.nowPlayingCard.innerHTML = '<span class="np-empty">Nothing playing right now</span>';
    refs.report.disabled = true;
    refs.report.textContent = "Report as AI Artist";
    return;
  }

  refs.nowPlayingCard.className = "now-playing-card";
  const coverHtml = info.coverDataUrl
    ? `<img class="cover" src="${info.coverDataUrl}" alt="" />`
    : `<div class="cover-ph" aria-hidden="true">
         <svg width="20" height="20" viewBox="0 0 24 24" fill="#535353">
           <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
         </svg>
       </div>`;

  refs.nowPlayingCard.innerHTML = `
    ${coverHtml}
    <div class="np-info">
      <div class="np-track" title="${escHtml(info.trackName)}">${escHtml(
        info.trackName ?? "Unknown track",
      )}</div>
      <div class="np-artist" title="${escHtml(info.artistName)}">${escHtml(
        info.artistName ?? "Unknown artist",
      )}</div>
    </div>`;

  refs.report.disabled = false;
  refs.report.textContent = "Report as AI Artist";
}

function updateProgress(progress: ProgressPayload): void {
  const view = getProgressView(progress.current, progress.total, progress.status);
  refs.progress.hidden = !view.visible;
  refs.progressFill.style.width = `${view.percent}%`;
  refs.progressLabel.textContent = view.label;
  refs.run.disabled = view.runDisabled;
  refs.run.textContent = view.runLabel;

  if (progress.status === "finished") {
    void loadExtensionState().then(renderStats);
    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      refs.progress.hidden = true;
      refs.progressFill.style.width = "0%";
      refs.run.disabled = false;
      refs.run.textContent = "Run now";
      refs.runNote.textContent = "Automatic every 24 h and on Spotify page load";
    }, 3000);
  }
}

function showRunConfirmation(): void {
  if (!spotifyTab?.id) {
    refs.runNote.textContent = "Open Spotify Web Player first.";
    refs.warning.hidden = false;
    return;
  }

  refs.confirmRun.hidden = false;
  refs.run.disabled = true;
  refs.runNote.textContent = "Manual runs can call Spotify many times.";
}

function hideRunConfirmation(): void {
  refs.confirmRun.hidden = true;
  refs.run.disabled = false;
  refs.runNote.textContent = "Automatic every 24 h and on Spotify page load";
}

async function forceRun(): Promise<void> {
  if (!spotifyTab?.id) return;

  refs.confirmRun.hidden = true;
  refs.run.disabled = true;
  refs.run.textContent = "Running...";
  refs.runNote.textContent = "Blocking AI artists...";

  try {
    await browser.tabs.sendMessage(spotifyTab.id, { type: "FORCE_BLOCK_RUN" });
  } catch {
    refs.run.disabled = false;
    refs.run.textContent = "Run now";
    refs.runNote.textContent = "Spotify tab is not ready yet. Reload Spotify and try again.";
  }
}

async function reportCurrentArtist(): Promise<void> {
  if (!nowPlaying || !spotifyTab?.id) return;

  refs.report.disabled = true;
  refs.report.textContent = "Reporting + blocking...";

  try {
    await browser.tabs.sendMessage(spotifyTab.id, { type: "CMD_REPORT_ARTIST" });
    refs.report.textContent = "Reported";
  } catch {
    refs.report.textContent = "Spotify tab is not ready";
  }

  window.setTimeout(() => {
    refs.report.textContent = "Report as AI Artist";
    refs.report.disabled = !nowPlaying?.artistId;
  }, 3000);
}

async function hydrateCsvStats(): Promise<void> {
  try {
    await browser.runtime.sendMessage({ type: "FETCH_CSV", force: false } satisfies RuntimeMessage);
    renderStats(await loadExtensionState());
  } catch {
    refs.csv.textContent = "-";
    refs.runNote.textContent = "Could not refresh the blocklist. Try again later.";
  }
}

async function init(): Promise<void> {
  refs = getPopupRefs();
  refs.version?.replaceChildren(`v${browser.runtime.getManifest().version}`);

  const [tab, state] = await Promise.all([getSpotifyTab(), loadExtensionState()]);
  spotifyTab = tab;
  refs.warning.hidden = Boolean(spotifyTab);
  renderStats(state);

  if (!state.csvCache?.data) {
    refs.csv.textContent = "Loading";
    void hydrateCsvStats();
  }

  const progress = await loadBlockProgress();
  if (progress && isProgressStatus(progress.status) && progress.status !== "finished") {
    updateProgress(progress);
  }

  if (spotifyTab?.id != null) {
    renderNowPlaying(await fetchNowPlaying(spotifyTab.id));
  } else {
    renderNowPlaying(null);
  }

  refs.run.addEventListener("click", showRunConfirmation);
  refs.confirmRunYes.addEventListener("click", () => {
    void forceRun();
  });
  refs.confirmRunNo.addEventListener("click", hideRunConfirmation);
  refs.report.addEventListener("click", () => {
    void reportCurrentArtist();
  });

  browser.runtime.onMessage.addListener((message) => {
    const maybeProgress = message as Partial<RuntimeMessage>;
    if (maybeProgress.type === "PROGRESS_UPDATE" && isProgressStatus(maybeProgress.status)) {
      updateProgress({
        current: maybeProgress.current ?? 0,
        total: maybeProgress.total ?? 0,
        status: maybeProgress.status,
      });
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  void init();
});
