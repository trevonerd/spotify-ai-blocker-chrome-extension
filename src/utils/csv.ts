/**
 * Parse the AI-artist CSV file into a structured representation.
 *
 * @param raw - Raw CSV text as downloaded from GitHub.
 * @returns Array of artist rows with `name` and `id`.
 */
export interface CsvArtistRow {
  name: string;
  id: string;
}

export function parseCsv(raw: string): CsvArtistRow[] {
  return raw
    .split("\n")
    .slice(1)
    .map((line) => line.split(",").map((s) => s.trim()))
    .filter(([name, id]) => Boolean(name) && Boolean(id))
    .map(([name, id]) => ({ name: name as string, id: id as string }));
}
