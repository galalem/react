# @galalem/react-router

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
