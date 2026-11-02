---
"@galalem/react-router": patch
---

Resolve a relative `to` against the current route.

A `to` without a leading `/` was left to the browser's own rules, which drop the base's last segment and are sensitive to a trailing slash — so `to="edit"` on `/groups/7` navigated to `/groups/edit`. It now resolves against the matched route treated as a directory, giving `/groups/7/edit`, and `to=".."` gives `/groups`. This applies to `Link`, `NavLink` (`href` and active state), `router.push` and `router.replace`; a `to` with a leading `/` is unchanged.

Relative links were listed as a v0.1 non-goal and were never documented as working, hence the patch — but any call site that relied on the browser's resolution will now point somewhere else.

`..` past the root clamps at `/` and warns in development. Query- and hash-only targets follow the URL spec: `?tab=2` keeps the path and replaces the whole query, `#top` keeps the path and query. Inside a layout, pass an absolute `to`. Guard redirects must be absolute; a relative one is read as root-relative and warns in development.
