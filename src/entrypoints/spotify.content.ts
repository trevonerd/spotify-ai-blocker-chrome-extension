import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { injectScript } from "wxt/utils/inject-script";
import {
  EXTENSION_BRIDGE_NS,
  type ExtensionBridgeMessage,
  type FetchCsvResponse,
  isPageCommand,
  PAGE_BRIDGE_NS,
  type PageBridgeMessage,
  type RuntimeMessage,
} from "../shared/messages";
import { loadExtensionState, saveBlockedState } from "../shared/storage";

export default defineContentScript({
  matches: ["https://open.spotify.com/*"],
  runAt: "document_start",
  allFrames: false,
  async main() {
    registerPageBridge();
    registerRuntimeBridge();
    await injectScript("/page-script.js", { keepInDom: true });
  },
});

function registerPageBridge(): void {
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window) return;
    const message = event.data as PageBridgeMessage;
    if (message.ns !== PAGE_BRIDGE_NS) return;

    if (message.type === "FETCH_CSV") {
      void replyToFetchCsv(message);
      return;
    }

    if (message.type === "GET_STORAGE") {
      void replyToGetStorage(message);
      return;
    }

    if (message.type === "BLOCKED_UPDATE") {
      const payload = message.payload;
      if (!payload) return;
      void saveBlockedState({
        blockedIds: payload.blockedIds,
        lastRunAt: payload.lastRunAt,
        lastRunCount: payload.lastRunCount,
      });
      return;
    }

    if (message.type === "PROGRESS_UPDATE") {
      const payload = message.payload ?? {};
      void browser.runtime
        .sendMessage({
          type: "PROGRESS_UPDATE",
          current: payload.current ?? 0,
          total: payload.total ?? 0,
          status: payload.status ?? "finished",
        } satisfies RuntimeMessage)
        .catch(() => {
          // The service worker can be waking up; progress will be refreshed from storage.
        });
    }
  });
}

async function replyToFetchCsv(message: Extract<PageBridgeMessage, { type: "FETCH_CSV" }>) {
  if (!message.reqId) return;

  let payload: FetchCsvResponse;
  try {
    payload = (await browser.runtime.sendMessage({
      type: "FETCH_CSV",
      force: message.payload?.force === true,
    } satisfies RuntimeMessage)) as FetchCsvResponse;
  } catch (err) {
    payload = { error: err instanceof Error ? err.message : "CSV fetch failed" };
  }

  postExtensionBridge({
    ns: EXTENSION_BRIDGE_NS,
    reqId: message.reqId,
    type: "FETCH_CSV_REPLY",
    payload,
  });
}

async function replyToGetStorage(message: Extract<PageBridgeMessage, { type: "GET_STORAGE" }>) {
  if (!message.reqId) return;

  const payload = await loadExtensionState();
  postExtensionBridge({
    ns: EXTENSION_BRIDGE_NS,
    reqId: message.reqId,
    type: "GET_STORAGE_REPLY",
    payload,
  });
}

function registerRuntimeBridge(): void {
  browser.runtime.onMessage.addListener((message) => {
    const maybeType = (message as { type?: unknown }).type;
    if (isPageCommand(maybeType)) {
      postExtensionBridge({ ns: EXTENSION_BRIDGE_NS, type: maybeType });
    }
  });
}

function postExtensionBridge(message: ExtensionBridgeMessage): void {
  window.postMessage(message, "*");
}
