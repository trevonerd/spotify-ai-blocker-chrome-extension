import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("parses valid CSV rows and skips header", () => {
    const input = "name,id\nArtist One,spotify:artist:123\nArtist Two, 456 \n";
    const result = parseCsv(input);
    expect(result).toEqual([
      { name: "Artist One", id: "spotify:artist:123" },
      { name: "Artist Two", id: "456" },
    ]);
  });

  it("ignores empty or malformed rows", () => {
    const input = "name,id\n,\nOnlyName,\n,OnlyId\nA,B\n";
    const result = parseCsv(input);
    expect(result).toEqual([{ name: "A", id: "B" }]);
  });

  it("returns empty array for empty or header-only CSV", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("name,id\n")).toEqual([]);
  });

  it("trims whitespace around values", () => {
    const input = "name,id\n  Artist  ,  123  \n";
    const result = parseCsv(input);
    expect(result).toEqual([{ name: "Artist", id: "123" }]);
  });
});
