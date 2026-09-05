---
"@galalem/react-router": minor
---

First-class support for code-split (lazy) components. Anywhere the router takes a component — `Route.component` and `layout` on either a `Route` or a `RouteGroup` — you can now pass a `{ lazy }` loader instead of the component itself, and the router splits the chunk. The loader only fires after every guard on the route has resolved, so a route rejected by `auth` or `roles` never fetches its code. Layouts share the same shape, so there's no separate `lazyLayout` field.

```ts
createRouter({
  suspenseFallback: <Spinner />,
  routes: [
    auth([
      roles(["admin"], [
        {
          path: "/admin",
          component: { lazy: () => import("./pages/admin/page") },
          layout: { lazy: () => import("./layouts/admin-shell") },
        },
      ]),
    ]),
  ],
});
```

The loader accepts either a module with a `default` export or the component itself. A single `suspenseFallback` on `createRouter` wraps every matched page in `<Suspense>` — inside the layouts, so the app shell stays mounted while the page falls back. That same boundary covers a `React.lazy` passed directly to `component`.
