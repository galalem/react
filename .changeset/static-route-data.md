---
"@galalem/react-router": patch
---

Routes and route groups accept a static `data` object. Group data cascades into children (child keys win), and the payload passed to `router.push`, `router.replace`, or `<Link data>` extends it — `useRouter().data` and `RouteContext.data` see `{ ...routeData, ...payload }`. Static data is present on URL-driven navigation too (initial load, refresh). A non-object payload replaces the static data instead of merging. The `RouteData` type is exported.
