import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing";

let storageModule: typeof import("./storage");

beforeAll(async () => {
  vi.stubGlobal("chrome", fakeBrowser);
  storageModule = await import("./storage");
});

describe("WXT storage adapter", () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it("keeps legacy local storage keys behind WXT storage items", () => {
    expect(storageModule.blockedIdsItem.key).toBe("local:blockedIds");
    expect(storageModule.lastRunAtItem.key).toBe("local:lastRunAt");
    expect(storageModule.lastRunCountItem.key).toBe("local:lastRunCount");
    expect(storageModule.csvCacheItem.key).toBe("local:csvCache");
    expect(storageModule.blockProgressItem.key).toBe("local:blockProgress");
  });

  it("loads stable default state when storage is empty", async () => {
    await expect(storageModule.loadExtensionState()).resolves.toEqual({
      blockedIds: [],
      lastRunAt: null,
      lastRunCount: 0,
      csvCache: {},
    });
    await expect(storageModule.loadCsvCache()).resolves.toEqual({});
    await expect(storageModule.loadBlockProgress()).resolves.toBeNull();
  });

  it("saves blocked state through WXT storage", async () => {
    await storageModule.saveBlockedState({
      blockedIds: ["artist-1", "artist-2"],
      lastRunAt: "2026-05-15",
      lastRunCount: 2,
    });

    await expect(fakeBrowser.storage.local.get()).resolves.toMatchObject({
      blockedIds: ["artist-1", "artist-2"],
      lastRunAt: "2026-05-15",
      lastRunCount: 2,
    });
  });

  it("saves CSV cache and block progress through WXT storage", async () => {
    await storageModule.saveCsvCache({ data: "name,id\nA,1", fetchedAt: 123 });
    await storageModule.saveBlockProgress({ current: 1, total: 2, status: "running" });

    await expect(storageModule.loadCsvCache()).resolves.toEqual({
      data: "name,id\nA,1",
      fetchedAt: 123,
    });
    await expect(storageModule.loadBlockProgress()).resolves.toMatchObject({
      current: 1,
      total: 2,
      status: "running",
    });
  });
});
