import { describe, expect, it } from "vitest";
import { buildReportUrl, buildTrackUrl, extractArtistId, extractUsername } from "./spotify";

describe("extractArtistId", () => {
  it("extracts id from a standard artist pathname", () => {
    expect(extractArtistId("/artist/2HYEkQARMRVBcPPzKeoRaz")).toBe("2HYEkQARMRVBcPPzKeoRaz");
  });

  it("extracts id when pathname has trailing query string", () => {
    expect(extractArtistId("/artist/2HYEkQARMRVBcPPzKeoRaz?foo=bar")).toBe(
      "2HYEkQARMRVBcPPzKeoRaz",
    );
  });

  it("returns null for non-artist pathnames", () => {
    expect(extractArtistId("/track/18qp1CmyLZnTj6ca4D8qJ2")).toBeNull();
    expect(extractArtistId("/")).toBeNull();
    expect(extractArtistId("")).toBeNull();
  });

  it("returns null when artist segment is empty", () => {
    expect(extractArtistId("/artist/")).toBeNull();
  });
});

describe("buildReportUrl", () => {
  it("builds a correctly structured GitHub issue URL", () => {
    const url = buildReportUrl({
      artistName: "Chillo Vino",
      artistUrl: "https://open.spotify.com/artist/2HYEkQARMRVBcPPzKeoRaz",
      exampleTrackUrl: "https://open.spotify.com/track/18qp1CmyLZnTj6ca4D8qJ2",
    });

    expect(url).toContain("https://github.com/CennoxX/spotify-ai-blocker/issues/new");
    expect(url).toContain("template=ai-artist.yml");
    expect(url).toContain(encodeURIComponent("[AI-Artist] Chillo Vino"));
    expect(url).toContain(`artist_name=${encodeURIComponent("Chillo Vino")}`);
    expect(url).toContain(
      `artist_url=${encodeURIComponent("https://open.spotify.com/artist/2HYEkQARMRVBcPPzKeoRaz")}`,
    );
    expect(url).toContain(
      `example_track_url=${encodeURIComponent("https://open.spotify.com/track/18qp1CmyLZnTj6ca4D8qJ2")}`,
    );
  });

  it("defaults example_track_url to empty string when omitted", () => {
    const url = buildReportUrl({
      artistName: "Test Artist",
      artistUrl: "https://open.spotify.com/artist/abc123",
    });

    expect(url).toContain("example_track_url=");
    // Ends with empty encoded value
    expect(url.endsWith("example_track_url=")).toBe(true);
  });

  it("encodes special characters in artist name", () => {
    const url = buildReportUrl({
      artistName: "AC/DC & More",
      artistUrl: "https://open.spotify.com/artist/xyz",
    });

    expect(url).toContain(encodeURIComponent("AC/DC & More"));
    expect(url).not.toContain("AC/DC & More");
  });
});

describe("extractUsername", () => {
  it("returns the username from a colon-separated localStorage key", () => {
    expect(extractUsername(["johndoe:token123", "other-key"])).toBe("johndoe");
  });

  it("ignores anonymous: keys", () => {
    expect(extractUsername(["anonymous:abc", "johndoe:token"])).toBe("johndoe");
  });

  it("returns null when no valid key exists", () => {
    expect(extractUsername([])).toBeNull();
    expect(extractUsername(["anonymous:abc"])).toBeNull();
    expect(extractUsername(["no-colon-key"])).toBeNull();
  });

  it("returns the first matching username when multiple exist", () => {
    expect(extractUsername(["userA:tok1", "userB:tok2"])).toBe("userA");
  });
});

describe("buildTrackUrl", () => {
  it("builds a full Spotify track URL from an id", () => {
    expect(buildTrackUrl("18qp1CmyLZnTj6ca4D8qJ2")).toBe(
      "https://open.spotify.com/track/18qp1CmyLZnTj6ca4D8qJ2",
    );
  });
});
