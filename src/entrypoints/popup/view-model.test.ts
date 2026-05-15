import { describe, expect, it } from "vitest";
import { countCsvRows, getLastRunText, getProgressView } from "./view-model";

describe("popup view model", () => {
  it("counts non-empty CSV artist rows after the header", () => {
    expect(countCsvRows("name,id\nA,1\n\nB,2\n")).toBe(2);
    expect(countCsvRows(undefined)).toBeNull();
  });

  it("formats fresh and stale last-run text", () => {
    const today = new Date("2026-05-14T12:00:00.000Z");

    expect(getLastRunText({ lastRunAt: "2026-05-14", lastRunCount: 3 }, today)).toEqual({
      text: "Last run: today · +3 new",
      isFresh: true,
    });
    expect(getLastRunText({ lastRunAt: "2026-05-13", lastRunCount: 0 }, today)).toEqual({
      text: "Last run: 2026-05-13",
      isFresh: false,
    });
  });

  it("builds stable progress labels", () => {
    expect(getProgressView(12, 50, "running")).toMatchObject({
      visible: true,
      percent: 24,
      runDisabled: true,
    });
    expect(getProgressView(0, 0, "finished")).toMatchObject({
      visible: false,
      label: "Already up to date",
      runDisabled: false,
    });
  });
});
