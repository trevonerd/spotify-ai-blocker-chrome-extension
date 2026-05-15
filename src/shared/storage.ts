import { storage } from "wxt/utils/storage";
import type { ProgressPayload } from "./messages";

export interface CsvCache {
  data?: string;
  fetchedAt?: number;
}

export interface ExtensionState {
  blockedIds?: string[];
  lastRunAt?: string | null;
  lastRunCount?: number;
  csvCache?: CsvCache;
  blockProgress?: ProgressPayload & { updatedAt: number };
}

export const blockedIdsItem = storage.defineItem<string[]>("local:blockedIds", { fallback: [] });
export const lastRunAtItem = storage.defineItem<string | null>("local:lastRunAt", {
  fallback: null,
});
export const lastRunCountItem = storage.defineItem<number>("local:lastRunCount", { fallback: 0 });
export const csvCacheItem = storage.defineItem<CsvCache>("local:csvCache", { fallback: {} });
export const blockProgressItem = storage.defineItem<
  (ProgressPayload & { updatedAt: number }) | null
>("local:blockProgress", { fallback: null });

export async function loadExtensionState(): Promise<ExtensionState> {
  const [blockedIds, lastRunAt, lastRunCount, csvCache] = await Promise.all([
    blockedIdsItem.getValue(),
    lastRunAtItem.getValue(),
    lastRunCountItem.getValue(),
    csvCacheItem.getValue(),
  ]);

  return { blockedIds, lastRunAt, lastRunCount, csvCache };
}

export async function loadCsvCache(): Promise<CsvCache | undefined> {
  return await csvCacheItem.getValue();
}

export async function saveCsvCache(cache: CsvCache): Promise<void> {
  await csvCacheItem.setValue(cache);
}

export async function saveBlockedState(state: {
  blockedIds: string[];
  lastRunAt: string | null;
  lastRunCount: number;
}): Promise<void> {
  await storage.setItems([
    { item: blockedIdsItem, value: state.blockedIds },
    { item: lastRunAtItem, value: state.lastRunAt },
    { item: lastRunCountItem, value: state.lastRunCount },
  ]);
}

export async function loadBlockProgress(): Promise<ExtensionState["blockProgress"] | null> {
  return await blockProgressItem.getValue();
}

export async function saveBlockProgress(progress: ProgressPayload): Promise<void> {
  await blockProgressItem.setValue({
    ...progress,
    updatedAt: Date.now(),
  });
}
