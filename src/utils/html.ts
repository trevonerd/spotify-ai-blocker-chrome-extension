/**
 * Escape a string for safe insertion into HTML.
 *
 * @param value - Raw string value to escape.
 * @returns Escaped HTML-safe string.
 */
export function escHtml(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[c] ?? c;
  });
}
