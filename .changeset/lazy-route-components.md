---
"@galalem/react-router": minor
---

First-class support for code-split (lazy) route components. Set `lazy` on a route in place of `component` and the router splits the chunk, only fetching it after every guard on the route has resolved — so a route rejected by `auth` or `roles` never downloads its code. The loader accepts either a module with a `default` export or the component itself.

```ts
createRouter({
  suspenseFallback: <Spinner />,
  routes: [
    auth([
      roles(["admin"], [
        { path: "/admin", lazy: () => import("./pages/admin/page") },
      ]),
    ]),
  ],
});
```

A single `suspenseFallback` on `createRouter` wraps every matched page in `<Suspense>` — inside the layouts, so the app shell stays mounted while the page falls back. `component` still accepts any `ComponentType`, `React.lazy` included; the same router-level `<Suspense>` covers it.
