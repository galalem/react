import { joinSegments, normalizePath, splitSegments } from "./path";

const CURRENT_DIRECTORY = ".";
const PARENT_DIRECTORY = "..";

// A scheme ("https:", "mailto:") or a protocol-relative "//host" target leaves
// the app entirely, so it is not ours to resolve and passes through untouched.
const EXTERNAL_TARGET = /^(?:[a-zA-Z][a-zA-Z\d+\-.]*:|\/\/)/;

// Declared locally rather than pulling in @types/node: this is a browser
// package, and `process` is only ever read through the guard below so that an
// unbundled ESM consumer with no `process` at all still works.
declare const process: { env?: { NODE_ENV?: string } } | undefined;

function isDevelopment(): boolean {
  return typeof process !== "undefined" && process?.env?.NODE_ENV !== "production";
}

type PathParts = { path: string; search: string; hash: string };

function splitParts(target: string): PathParts {
  const hashIndex = target.indexOf("#");
  const hash = hashIndex === -1 ? "" : target.slice(hashIndex);
  const withoutHash = hashIndex === -1 ? target : target.slice(0, hashIndex);

  const searchIndex = withoutHash.indexOf("?");
  const search = searchIndex === -1 ? "" : withoutHash.slice(searchIndex);
  const path = searchIndex === -1 ? withoutHash : withoutHash.slice(0, searchIndex);

  return { path, search, hash };
}

/** Strips the query and hash from a path string, leaving the pathname. */
export function pathnameOf(target: string): string {
  return splitParts(target).path;
}

/**
 * Resolves a `to` against the path the current route is mounted at, so a
 * component mounted under two prefixes can link within itself without knowing
 * which prefix it is under.
 *
 * A `to` with a leading "/" is already absolute and is returned verbatim —
 * every existing call site keeps its exact meaning, trailing slash included.
 *
 * Anything else resolves against `base` treated as a **directory**, which is
 * the one place this deliberately parts ways with the browser's own rules:
 * `to="edit"` on `/groups/7` gives `/groups/7/edit`, not the `/groups/edit`
 * the URL spec would produce by dropping the base's last segment. That makes
 * `to={id}` on a list mean "my child" whether the URL is `/groups` or
 * `/groups/`. Query- and hash-only targets do follow the spec.
 *
 * `base` is the current path and may carry its query ("/groups/7?tab=2"),
 * which a hash-only `to` needs in order to preserve it.
 */
export function resolvePath(to: string, base: string): string {
  if (EXTERNAL_TARGET.test(to)) return to;
  if (to.startsWith("/")) return to;

  const target = splitParts(to);
  const origin = splitParts(base);
  const basePath = normalizePath(origin.path);

  // Nothing to resolve: the path stays put. Per the URL spec a query-only
  // target replaces the whole query and drops the hash, while a hash-only one
  // keeps the query it landed on.
  if (target.path === "") {
    if (target.search !== "") return basePath + target.search + target.hash;
    if (target.hash !== "") return basePath + origin.search + target.hash;
    return basePath + origin.search;
  }

  const segments = splitSegments(origin.path);
  let stepsPastRoot = 0;

  for (const segment of target.path.split("/")) {
    if (segment === "" || segment === CURRENT_DIRECTORY) continue;
    if (segment === PARENT_DIRECTORY) {
      if (segments.length === 0) stepsPastRoot++;
      else segments.pop();
      continue;
    }
    segments.push(segment);
  }

  const resolved = joinSegments(segments) + target.search + target.hash;

  // Clamping at the root matches the URL spec, but the usual way to get here
  // is an off-by-one `..` in a component mounted shallower than its author
  // assumed — which would otherwise navigate home in silence.
  if (stepsPastRoot > 0 && isDevelopment()) {
    console.warn(
      `[@galalem/react-router] to="${to}" walks ${stepsPastRoot} level(s) past the root from "${basePath}". Clamped at the root: "${resolved}".`,
    );
  }

  return resolved;
}

/**
 * Guard redirects fire mid-navigation, where "the current route" could mean
 * either the route being left or the one being entered. Rather than pick one,
 * the router asks for an absolute target and reads a relative one as
 * root-relative — the same thing it did before `to` resolution existed.
 */
export function resolveRedirect(redirect: string): string {
  if (EXTERNAL_TARGET.test(redirect) || redirect.startsWith("/")) return redirect;
  if (isDevelopment()) {
    console.warn(
      `[@galalem/react-router] guard redirect "${redirect}" is relative; guard redirects must be absolute. Reading it as "/${redirect}".`,
    );
  }
  return "/" + redirect;
}
