# @galalem/react-router — Documentation

Deeper guides for building with `@galalem/react-router`. The [package README](../README.md) is the quick reference; these docs cover the *why* and the patterns.

## Guides

- **[Guards and auth](./guards-and-auth.md)** — auth flows, RBAC with role expressions, post-login return, writing your own guards.
- **[Nested layouts](./layouts.md)** — layered UI shells without `<Outlet />`. What's different, when to reach for it.
- **[Page metadata](./metadata.md)** — `<title>` and `<meta>` tags: static, function form, and dynamic via `router.setMeta`.
- **[URL state and navigation payloads](./url-state.md)** — query, hash, and the `data` escape hatch. When to keep things stateless.

## Mental model

`@galalem/react-router` treats a route as a **data object**, not a JSX tree. Everything about a route — its path, its component, its access rules, its layout, its metadata — is a field on that object. The router then walks the tree, matches the URL, runs guards, and renders.

That's the whole model. Three consequences worth internalizing:

### 1. Layouts are plain React components

There's no `<Outlet />`. When you nest routes under a group with a `layout`, the router composes:

```tsx
<AppLayout>
  <AdminShell>
    <MatchedComponent />
  </AdminShell>
</AppLayout>
```

The layouts receive their inner content via a normal `children` prop. They know nothing about the router. You could render them in Storybook.

Read more: [Nested layouts](./layouts.md).

### 2. Access is declarative

Auth and RBAC aren't wrapper components — they're fields:

```ts
{ path: "/admin", component: Admin, auth: true, roles: ["admin"] }
```

Groups push these rules **down** the tree. A child can't opt out. To exempt a route, hoist it out of the group.

Read more: [Guards and auth](./guards-and-auth.md).

### 3. Routes stay reproducible from the URL

Anyone opening a URL directly, refreshing, or using browser back should land in the same state as someone who navigated there through your UI. That's the invariant.

We give you an escape hatch — `router.push(to, data)` — but position it as exactly that. Don't put real state in `data`; a refresh will lose it.

Read more: [URL state and navigation payloads](./url-state.md).

## Coexistence with React Router

You don't have to rewrite your app. Mount `@galalem/react-router` under one of React Router's routes and let it take over that subtree:

```tsx
// React Router
<Route path="/admin/*" element={
  <RouterProvider router={adminRouter}>
  </RouterProvider>
} />
```

Sub-mount is the supported adoption path for v0.1. Sibling mode (both routers writing to the same history) is deferred — the popstate and scroll-restoration conflicts aren't worth solving until we have real users pushing on it.

## When not to use this

- **You need SSR today.** We're client-only in v0.1. Use Remix, Next, or TanStack Router.
- **You want file-system routing.** Deferred to a future Vite plugin. Explicit route config is the only supported API right now.
- **You need data loaders integrated with your router.** We deliberately don't touch data fetching. Bring your own (SWR, React Query, RSC — whatever). If you want data-driven `<meta>` tags, `router.setMeta` covers it.

## Non-goals for v0.1

Documented at the top of the source design doc but worth stating publicly:

- JSX-tree route nesting (`<Route><Route/></Route>`)
- `<Outlet />` primitive
- Route model binding (Laravel-style)
- Scroll restoration
- View transitions API integration
- Relative links

Some of these may land in v0.2. All of them are intentional omissions, not oversights.

## Where to look next

- New to the library? Read the [package README](../README.md) end to end first.
- Building auth-gated routes? [Guards and auth](./guards-and-auth.md).
- Coming from React Router and confused by no-`<Outlet />`? [Nested layouts](./layouts.md).
- Need dynamic page titles from a fetch? [Page metadata](./metadata.md).
- Wondering where query params and hash live? [URL state](./url-state.md).
