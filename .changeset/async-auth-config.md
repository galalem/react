---
"@galalem/react-router": patch
---

Allow `AuthConfig.currentUser` and `AuthConfig.userRoles` to return a promise. Guards already supported async work; requiring the auth hooks to be synchronous forced apps whose "current user" came from an async source (fetch, IndexedDB, a token refresh) to cache eagerly or wrap the router. Both hooks now accept sync **or** async implementations — existing sync configs keep working unchanged.

```ts
createRouter({
  auth: {
    currentUser: async () => (await api.session()).user,
    userRoles: async (user) => await api.rolesFor(user),
    loginPath: "/login",
  },
  routes: [/* ... */],
});
```
