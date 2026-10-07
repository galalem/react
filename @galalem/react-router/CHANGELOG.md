# @galalem/react-router

## 0.1.3

### Patch Changes

- 2f8eebf: Routes and route groups accept `data`: an object, or a sync or async function of the route context. Group data cascades into children (child keys win), and the payload passed to `router.push`, `router.replace`, or `<Link data>` extends it — `useRouter().data` sees `{ ...routeData, ...payload }`, including on URL-driven navigation (initial load, refresh). Data functions run only after every guard passes; the navigation waits for them, a throw renders the `500` error component, and `meta` functions receive the resolved data. The router does no fetching or caching of its own. A non-object payload replaces the route data instead of merging.

  New `router.setData(partial)`, also on `useRouter()`, shallow-merges into the current `data` (in-memory, cleared on the next navigation). The `RouteData`, `RouteDataConfig` and `RouteDataResolver` types are exported.

## 0.1.2

### Patch Changes

- 1cedf11: First-class support for code-split (lazy) components. Anywhere the router takes a component — `Route.component` and `layout` on either a `Route` or a `RouteGroup` — you can now pass a `{ lazy }` loader instead of the component itself, and the router splits the chunk. The loader only fires after every guard on the route has resolved, so a route rejected by `auth` or `roles` never fetches its code. Layouts share the same shape, so there's no separate `lazyLayout` field.

  ```ts
  createRouter({
    suspenseFallback: <Spinner />,
    routes: [
      auth([
        roles(
          ["admin"],
          [
            {
              path: "/admin",
              component: { lazy: () => import("./pages/admin/page") },
              layout: { lazy: () => import("./layouts/admin-shell") },
            },
          ]
        ),
      ]),
    ],
  });
  ```

  The loader accepts either a module with a `default` export or the component itself. A `lazy()` helper is exported as a shorthand for the object form (`component: lazy(() => import("./page"))`). A single `suspenseFallback` on `createRouter` wraps every matched page in `<Suspense>` — inside the layouts, so the app shell stays mounted while the page falls back. That same boundary covers a `React.lazy` passed directly to `component`.

## 0.1.1

### Patch Changes

- be5b872: Allow `AuthConfig.currentUser` and `AuthConfig.userRoles` to return a promise. Guards already supported async work; requiring the auth hooks to be synchronous forced apps whose "current user" came from an async source (fetch, IndexedDB, a token refresh) to cache eagerly or wrap the router. Both hooks now accept sync **or** async implementations — existing sync configs keep working unchanged.

  ```ts
  createRouter({
    auth: {
      currentUser: async () => (await api.session()).user,
      userRoles: async (user) => await api.rolesFor(user),
      loginPath: "/login",
    },
    routes: [
      /* ... */
    ],
  });
  ```

## 0.1.0

### Minor Changes

- Initial release.

  A React router where auth and role requirements are declared on the route itself — no `<RequireAuth>` / `<RequireRole>` wrappers. Ships `createRouter`, `<RouterProvider>`, `<Link>`, and `useRouter`, plus role-expression matching and nested route groups with shared layout + guards.
  Requires React ^19.
