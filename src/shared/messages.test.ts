import { describe, expect, it } from "vitest";
import { isPageCommand, isProgressStatus } from "./messages";

describe("message guards", () => {
  it("accepts page commands", () => {
    expect(isPageCommand("TRIGGER_BLOCK_RUN")).toBe(true);
    expect(isPageCommand("FORCE_BLOCK_RUN")).toBe(true);
    expect(isPageCommand("CMD_REPORT_ARTIST")).toBe(true);
  });

  it("rejects non-page commands", () => {
    expect(isPageCommand("FETCH_CSV")).toBe(false);
    expect(isPageCommand("")).toBe(false);
    expect(isPageCommand(null)).toBe(false);
  });

  it("accepts progress statuses", () => {
    expect(isProgressStatus("started")).toBe(true);
    expect(isProgressStatus("running")).toBe(true);
    expect(isProgressStatus("finished")).toBe(true);
  });

  it("rejects unknown progress statuses", () => {
    expect(isProgressStatus("failed")).toBe(false);
    expect(isProgressStatus(undefined)).toBe(false);
  });
});
