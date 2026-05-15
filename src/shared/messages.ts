export const PAGE_BRIDGE_NS = "SAB_PAGE";
export const EXTENSION_BRIDGE_NS = "SAB_BG";

export const PAGE_COMMANDS = ["TRIGGER_BLOCK_RUN", "FORCE_BLOCK_RUN", "CMD_REPORT_ARTIST"] as const;

export type PageCommand = (typeof PAGE_COMMANDS)[number];
export type ProgressStatus = "started" | "running" | "finished";

export interface ProgressPayload {
  current: number;
  total: number;
  status: ProgressStatus;
}

export interface FetchCsvRequest {
  type: "FETCH_CSV";
  force?: boolean;
}

export interface FetchCsvSuccess {
  csv: string;
  fromCache: boolean;
}

export interface FetchCsvFailure {
  error: string;
}

export type FetchCsvResponse = FetchCsvSuccess | FetchCsvFailure;

export interface GetNowPlayingRequest {
  type: "GET_NOW_PLAYING";
  tabId?: number;
}

export interface NowPlayingInfo {
  artistName: string | null;
  artistId: string | null;
  artistUrl: string | null;
  trackName: string | null;
  trackUrl: string | null;
  coverUrl?: string | null;
  coverDataUrl?: string | null;
}

export type RuntimeMessage =
  | FetchCsvRequest
  | GetNowPlayingRequest
  | ({ type: "PROGRESS_UPDATE" } & ProgressPayload)
  | { type: PageCommand };

export type PageBridgeMessage =
  | {
      ns: typeof PAGE_BRIDGE_NS;
      reqId: string;
      type: "FETCH_CSV";
      payload?: { force?: boolean };
    }
  | {
      ns: typeof PAGE_BRIDGE_NS;
      reqId: string;
      type: "GET_STORAGE";
    }
  | {
      ns: typeof PAGE_BRIDGE_NS;
      type: "BLOCKED_UPDATE";
      payload: {
        blockedIds: string[];
        lastRunAt: string | null;
        lastRunCount: number;
      };
    }
  | {
      ns: typeof PAGE_BRIDGE_NS;
      type: "PROGRESS_UPDATE";
      payload: Partial<ProgressPayload>;
    };

export type ExtensionBridgeMessage =
  | {
      ns: typeof EXTENSION_BRIDGE_NS;
      reqId: string;
      type: "FETCH_CSV_REPLY";
      payload: FetchCsvResponse;
    }
  | {
      ns: typeof EXTENSION_BRIDGE_NS;
      reqId: string;
      type: "GET_STORAGE_REPLY";
      payload: StoredRunState;
    }
  | {
      ns: typeof EXTENSION_BRIDGE_NS;
      type: PageCommand;
    };

export interface StoredRunState {
  blockedIds?: string[];
  lastRunAt?: string | null;
  lastRunCount?: number;
}

export function isPageCommand(type: unknown): type is PageCommand {
  return typeof type === "string" && PAGE_COMMANDS.includes(type as PageCommand);
}

export function isProgressStatus(status: unknown): status is ProgressStatus {
  return status === "started" || status === "running" || status === "finished";
}
