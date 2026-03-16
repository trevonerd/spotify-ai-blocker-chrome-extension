import { parseCsv } from "./utils/csv";

/**
 * Page script entrypoint.
 *
 * @remarks
 * Runs in the real Spotify page context (not the isolated content-script
 * world). Intercepts `window.fetch` to capture the auth token and orchestrates
 * the AI-artist blocking flow via Spotify's internal APIs.
 */

((): void => {
  const NS_PAGE = "SAB_PAGE";
  const NS_BG = "SAB_BG";
  const BLOCK_ENDPOINT = "https://spclient.wg.spotify.com/collection/v2/write?market=from_token";
  const BATCH_SIZE = 50;
  const BATCH_DELAY = (): number => 600 + Math.random() * 300;
  const MAX_RETRIES = 3;

  let authHeader: string | null = null;
  let hasRun = false;

  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });

  const todayISO = (): string => new Date().toISOString().slice(0, 10);

  const makeReqId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  function bridgeRequest<TPayload, TResponse>(
    type: string,
    payload: TPayload | null = null,
  ): Promise<TResponse> {
    return new Promise((resolve, reject) => {
      const reqId = makeReqId();
      const replyType = `${type}_REPLY`;

      const timer = setTimeout(() => {
        window.removeEventListener("message", handler);
        reject(new Error(`[AI Blocker] Bridge timeout: ${type}`));
      }, 15_000);

      function handler(event: MessageEvent): void {
        if (event.source !== window) return;
        if ((event.data as { ns?: string }).ns !== NS_BG) return;
        if ((event.data as { reqId?: string }).reqId !== reqId) return;
        if ((event.data as { type?: string }).type !== replyType) return;
        clearTimeout(timer);
        window.removeEventListener("message", handler);
        resolve((event.data as { payload: TResponse }).payload);
      }

      window.addEventListener("message", handler);
      window.postMessage({ ns: NS_PAGE, reqId, type, payload }, "*");
    });
  }

  const bridgeNotify = <TPayload>(type: string, payload: TPayload | null = null): void => {
    window.postMessage({ ns: NS_PAGE, type, payload }, "*");
  };

  const sendProgress = (current: number, total: number, status: string): void => {
    bridgeNotify("PROGRESS_UPDATE", { current, total, status });
  };

  interface StoredState {
    blockedIds: string[];
    lastRunAt: string | null;
    lastRunCount: number;
  }

  async function loadStorage(): Promise<StoredState> {
    const data = await bridgeRequest<null, StoredState>("GET_STORAGE");
    return {
      blockedIds: Array.isArray(data?.blockedIds) ? data.blockedIds : [],
      lastRunAt: data?.lastRunAt ?? null,
      lastRunCount: data?.lastRunCount ?? 0,
    };
  }

  const saveStorage = (
    blockedIds: string[],
    lastRunAt: string | null,
    lastRunCount: number,
  ): void => bridgeNotify("BLOCKED_UPDATE", { blockedIds, lastRunAt, lastRunCount });

  function getUsername(): string | null {
    const key = Object.keys(window.localStorage).find(
      (k) => k.includes(":") && !k.startsWith("anonymous:"),
    );
    return key?.split(":")[0] ?? null;
  }

  interface NowPlayingInfo {
    artistName: string | null;
    artistId: string | null;
    artistUrl: string | null;
    trackUrl: string | null;
  }

  function getNowPlaying(): NowPlayingInfo {
    const artistEl = document.querySelector<HTMLAnchorElement>(
      '.Root [data-testid="now-playing-bar"] [data-testid="context-item-info-artist"]',
    );
    const trackEl = document.querySelector<HTMLAnchorElement>('[data-context-item-type="track"]');
    const trackUrl = trackEl
      ? `https://open.spotify.com/track/${trackEl.href.split("track%3A").pop()}`
      : null;

    const artistHref = artistEl?.href ?? "";
    const artistId = artistHref.match(/\/artist\/([^\s?]+)/i)?.[1] ?? null;

    return {
      artistName: artistEl?.innerText?.trim() || null,
      artistId,
      artistUrl: artistEl?.href ?? null,
      trackUrl,
    };
  }

  async function callBlockApi(ids: string[]): Promise<boolean> {
    const username = getUsername();
    if (!authHeader || !username) {
      console.warn("[AI Blocker] Missing auth or username — skipping batch");
      return false;
    }
    try {
      const resp = await fetch(BLOCK_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          authorization: authHeader,
        },
        body: JSON.stringify({
          username,
          set: "artistban",
          items: ids.map((id) => ({ uri: `spotify:artist:${id}` })),
        }),
      });
      if (resp.ok) return true;
      if (resp.status === 401) {
        console.warn("[AI Blocker] Auth token expired");
        authHeader = null;
      } else {
        console.warn(`[AI Blocker] Block API returned ${resp.status}`);
      }
    } catch (err) {
      console.error("[AI Blocker] Network error:", err);
    }
    return false;
  }

  async function blockBatchWithRetry(ids: string[]): Promise<boolean> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      if (await callBlockApi(ids)) return true;
      if (attempt < MAX_RETRIES) {
        await sleep(1000 * attempt);
      }
    }
    return false;
  }

  function showToast(message: string): void {
    document.getElementById("sab-toast-root")?.remove();

    const root = Object.assign(document.createElement("div"), { id: "sab-toast-root" });
    root.style.cssText =
      "position:fixed;bottom:90px;left:50%;transform:translateX(-50%);" +
      "z-index:2147483647;pointer-events:none;";

    const toast = document.createElement("div");
    toast.id = "sab-toast";
    toast.style.cssText =
      "display:flex;align-items:center;gap:8px;" +
      "background:#1ed760;color:#000;" +
      "padding:10px 18px;border-radius:500px;" +
      "box-shadow:0 4px 24px rgba(0,0,0,.5);" +
      "font-family:'Circular Std',CircularSp,'Helvetica Neue',Helvetica,Arial,sans-serif;" +
      "font-size:13px;font-weight:700;white-space:nowrap;" +
      "opacity:1;transition:opacity .4s ease;";

    const iconWrapper = document.createElement("span");
    iconWrapper.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="#000" aria-hidden="true"><path d="M6 12c0-1.296.41-2.496 1.11-3.477l8.366 8.368A6 6 0 0 1 6 12m10.89 3.476L8.524 7.11a6 6 0 0 1 8.367 8.367z"/><path d="M1 12C1 5.925 5.925 1 12 1s11 4.925 11 11-4.925 11-11 11S1 18.075 1 12m11-8a8 8 0 1 0 0 16 8 8 0 0 0 0-16"/></svg>';

    const messageText = document.createElement("span");
    messageText.textContent = message;

    toast.appendChild(iconWrapper);
    toast.appendChild(messageText);
    root.appendChild(toast);

    document.body.appendChild(root);
    setTimeout(() => {
      const el = document.getElementById("sab-toast");
      if (el) el.style.opacity = "0";
      setTimeout(() => {
        root.remove();
      }, 400);
    }, 4000);
  }

  async function main(forced = false): Promise<void> {
    if (hasRun && !forced) return;
    hasRun = true;

    try {
      console.log(`[AI Blocker] Starting run (forced=${forced})…`);

      const { blockedIds, lastRunAt } = await loadStorage();
      const blockedSet = new Set(blockedIds);
      const today = todayISO();

      if (!forced && lastRunAt === today) {
        console.log("[AI Blocker] Already ran today. Skipping.");
        return;
      }

      const result = (await bridgeRequest<
        { force: boolean },
        { csv: string; fromCache: boolean } | { error: string }
      >("FETCH_CSV", { force: forced })) as { csv: string; fromCache: boolean } | { error: string };

      if ("error" in result) {
        console.error("[AI Blocker] CSV fetch failed:", result.error);
        return;
      }

      const allArtists = parseCsv(result.csv);
      const toBlock = allArtists.filter((a) => !blockedSet.has(a.id));

      console.log(
        `[AI Blocker] ${allArtists.length} in CSV | ${toBlock.length} new to block` +
          (result.fromCache ? " (cached)" : " (fresh)"),
      );

      if (toBlock.length === 0) {
        saveStorage([...blockedSet], today, 0);
        console.log("[AI Blocker] Already up to date.");
        return;
      }

      sendProgress(0, toBlock.length, "started");

      let successCount = 0;
      let allSucceeded = true;

      for (let i = 0; i < toBlock.length; i += BATCH_SIZE) {
        const batch = toBlock.slice(i, i + BATCH_SIZE);
        const batchIds = batch.map((a) => a.id);

        if (await blockBatchWithRetry(batchIds)) {
          for (const id of batchIds) blockedSet.add(id);
          successCount += batchIds.length;
          sendProgress(successCount, toBlock.length, "running");
          console.log(
            `[AI Blocker] ${successCount}/${toBlock.length} blocked\n${batch
              .map((a) => `  ✗ ${a.name}`)
              .join("\n")}`,
          );
        } else {
          console.warn(`[AI Blocker] Batch ${Math.floor(i / BATCH_SIZE) + 1} failed`);
          allSucceeded = false;
        }

        if (i + BATCH_SIZE < toBlock.length) {
          await sleep(BATCH_DELAY());
        }
      }

      saveStorage([...blockedSet], allSucceeded ? today : lastRunAt, successCount);
      sendProgress(successCount, toBlock.length, "finished");
      if (successCount > 0) {
        showToast(`🤖 ${successCount} AI artist${successCount !== 1 ? "s" : ""} blocked!`);
      }
      console.log(`[AI Blocker] Done. ${successCount} new artists blocked.`);
    } catch (err) {
      console.error("[AI Blocker] Unexpected error:", err);
      sendProgress(0, 0, "finished");
    } finally {
      hasRun = false;
    }
  }

  window.addEventListener("message", async (event: MessageEvent) => {
    if (event.source !== window) return;
    if ((event.data as { ns?: string }).ns !== NS_BG) return;

    const { type } = event.data as { type: string };

    if (type === "TRIGGER_BLOCK_RUN") {
      await main(false);
      return;
    }

    if (type === "FORCE_BLOCK_RUN") {
      hasRun = false;
      await main(true);
      return;
    }

    if (type === "CMD_REPORT_ARTIST") {
      const { artistName, artistId, artistUrl, trackUrl } = getNowPlaying();
      if (!artistId) {
        showToast("⚠️ No artist playing right now");
        return;
      }

      const { blockedIds, lastRunAt, lastRunCount } = await loadStorage();
      const blockedSet = new Set(blockedIds);
      if (!blockedSet.has(artistId)) {
        if (await blockBatchWithRetry([artistId])) {
          blockedSet.add(artistId);
          saveStorage([...blockedSet], lastRunAt, lastRunCount + 1);
        }
      }

      const url =
        "https://github.com/CennoxX/spotify-ai-blocker/issues/new" +
        "?template=ai-artist.yml" +
        `&title=${encodeURIComponent(`[AI-Artist] ${artistName ?? ""}`)}` +
        `&artist_name=${encodeURIComponent(artistName ?? "")}` +
        `&artist_url=${encodeURIComponent(artistUrl ?? "")}` +
        `&example_track_url=${encodeURIComponent(trackUrl ?? "")}`;
      window.open(url, "_blank", "noopener");
    }
  });

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const init = args[1] as RequestInit | undefined;
    let rawAuth: string | null = null;

    if (init?.headers instanceof Headers) {
      rawAuth = init.headers.get("authorization");
    } else if (init?.headers && typeof init.headers === "object") {
      const headersRecord = init.headers as Record<string, string>;
      rawAuth = headersRecord.authorization ?? headersRecord.Authorization ?? null;
    }

    if (rawAuth && rawAuth !== authHeader) {
      authHeader = rawAuth;
      if (!hasRun) {
        void main(false).catch((e) => {
          console.error("[AI Blocker]", e);
        });
      }
    }

    return originalFetch(...args);
  };

  console.log("[AI Blocker] page-script ready — waiting for Spotify auth token…");
})();
