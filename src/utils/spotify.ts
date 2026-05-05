/**
 * Pure utility functions for Spotify URL/ID parsing and GitHub issue URL building.
 */

/**
 * Extract the Spotify artist ID from a pathname like `/artist/2HYEkQARMRVBcPPzKeoRaz`.
 */
export function extractArtistId(pathname: string): string | null {
  return pathname.match(/\/artist\/([^/?]+)/)?.[1] ?? null;
}

/**
 * Build a GitHub issue URL pre-filled with AI-artist report data.
 */
export function buildReportUrl(params: {
  artistName: string;
  artistUrl: string;
  exampleTrackUrl?: string;
}): string {
  const { artistName, artistUrl, exampleTrackUrl = "" } = params;
  return (
    "https://github.com/CennoxX/spotify-ai-blocker/issues/new" +
    "?template=ai-artist.yml" +
    `&title=${encodeURIComponent(`[AI-Artist] ${artistName}`)}` +
    `&artist_name=${encodeURIComponent(artistName)}` +
    `&artist_url=${encodeURIComponent(artistUrl)}` +
    `&example_track_url=${encodeURIComponent(exampleTrackUrl)}`
  );
}

/**
 * Extract a username from a Spotify localStorage key like `username:token`.
 * Returns null if no matching key is found.
 */
export function extractUsername(keys: string[]): string | null {
  const key = keys.find((k) => k.includes(":") && !k.startsWith("anonymous:"));
  return key?.split(":")[0] ?? null;
}

/**
 * Build a full Spotify track URL from a track ID.
 */
export function buildTrackUrl(trackId: string): string {
  return `https://open.spotify.com/track/${trackId}`;
}
