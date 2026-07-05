import type { MatchResult, RouteParams } from "./types";

const WILDCARD = "*";

function normalize(p: string): string {
  const withLeading = p.startsWith("/") ? p : "/" + p;
  if (withLeading.length > 1 && withLeading.endsWith("/")) {
    return withLeading.slice(0, -1);
  }
  return withLeading;
}

function segments(p: string): string[] {
  const n = normalize(p);
  if (n === "/") return [];
  return n.slice(1).split("/");
}

export function matchPath(pattern: string, path: string): MatchResult {
  const patternSegments = segments(pattern);
  const pathSegments = segments(path);
  const params: RouteParams = {};

  for (let i = 0; i < patternSegments.length; i++) {
    const p = patternSegments[i];

    if (p === WILDCARD) {
      if (i !== patternSegments.length - 1) {
        throw new Error(
          `Wildcard "*" must be the last segment in pattern: ${pattern}`,
        );
      }
      params[WILDCARD] = pathSegments.slice(i).map(decodeURIComponent).join("/");
      return { params };
    }

    const a = pathSegments[i];
    if (a === undefined) return null;

    if (p.startsWith(":")) {
      const name = p.slice(1);
      if (name === "") return null;
      if (a === "") return null;
      params[name] = decodeURIComponent(a);
      continue;
    }

    if (p !== a) return null;
  }

  if (pathSegments.length !== patternSegments.length) return null;

  return { params };
}
