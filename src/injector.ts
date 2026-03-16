/**
 * Content script entrypoint.
 *
 * @remarks
 * Injects `page-script.ts` into the real Spotify page context and bridges
 * messages between that page script and the extension runtime APIs.
 */

((): void => {
  // Inject page-script into the real page context.
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("src/page-script.ts");
  (document.head || document.documentElement).appendChild(script);

  // page-script → extension bridge.
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window) return;
    if ((event.data as { ns?: string }).ns !== "SAB_PAGE") return;

    const { reqId, type, payload } = event.data as {
      reqId: string;
      type: string;
      payload?: unknown;
    };

    if (type === "FETCH_CSV") {
      chrome.runtime.sendMessage(
        { type: "FETCH_CSV", force: (payload as { force?: boolean })?.force === true },
        (response) => {
          window.postMessage(
            { ns: "SAB_BG", reqId, type: "FETCH_CSV_REPLY", payload: response },
            "*",
          );
        },
      );
    }

    if (type === "BLOCKED_UPDATE") {
      const typed = payload as {
        blockedIds: string[];
        lastRunAt: string | null;
        lastRunCount: number;
      };
      chrome.storage.local.set({
        blockedIds: typed.blockedIds,
        lastRunAt: typed.lastRunAt,
        lastRunCount: typed.lastRunCount,
      });
    }

    if (type === "GET_STORAGE") {
      chrome.storage.local.get(["blockedIds", "lastRunAt", "lastRunCount"], (data) => {
        window.postMessage({ ns: "SAB_BG", reqId, type: "GET_STORAGE_REPLY", payload: data }, "*");
      });
    }

    if (type === "PROGRESS_UPDATE") {
      const typed = payload as {
        current?: number;
        total?: number;
        status?: string;
      };
      chrome.runtime.sendMessage(
        {
          type: "PROGRESS_UPDATE",
          current: typed.current ?? 0,
          total: typed.total ?? 0,
          status: typed.status ?? "finished",
        },
        () => {
          void chrome.runtime.lastError;
        },
      );
    }
  });

  // extension → page-script bridge.
  chrome.runtime.onMessage.addListener((message) => {
    const allowed = ["TRIGGER_BLOCK_RUN", "FORCE_BLOCK_RUN", "CMD_REPORT_ARTIST"] as const;
    if (allowed.includes(message.type)) {
      window.postMessage({ ns: "SAB_BG", type: message.type }, "*");
    }
  });
})();
