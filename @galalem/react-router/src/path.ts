// Path-string helpers shared by the matcher and the relative-`to` resolver.
// Both need the same notion of "a path reduced to its segments", and the two
// drifting apart would mean a `to` could resolve to a path the matcher then
// reads differently.

export function normalizePath(path: string): string {
  const withLeadingSlash = path.startsWith("/") ? path : "/" + path;
  if (withLeadingSlash.length > 1 && withLeadingSlash.endsWith("/")) {
    return withLeadingSlash.slice(0, -1);
  }
  return withLeadingSlash;
}

export function splitSegments(path: string): string[] {
  const normalized = normalizePath(path);
  if (normalized === "/") return [];
  return normalized.slice(1).split("/");
}

export function joinSegments(segments: string[]): string {
  return segments.length === 0 ? "/" : "/" + segments.join("/");
}
