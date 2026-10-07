---
"@galalem/react-router": patch
---

Routes and route groups accept `data`: an object, or a sync or async function of the route context. Group data cascades into children (child keys win), and the payload passed to `router.push`, `router.replace`, or `<Link data>` extends it — `useRouter().data` sees `{ ...routeData, ...payload }`, including on URL-driven navigation (initial load, refresh). Data functions run only after every guard passes; the navigation waits for them, a throw renders the `500` error component, and `meta` functions receive the resolved data. The router does no fetching or caching of its own. A non-object payload replaces the route data instead of merging.

New `router.setData(partial)`, also on `useRouter()`, shallow-merges into the current `data` (in-memory, cleared on the next navigation). The `RouteData`, `RouteDataConfig` and `RouteDataResolver` types are exported.
