# Nested layouts

`@galalem/react-router` supports layered UI shells — headers, sidebars, section-specific chrome — without an `<Outlet />` primitive. This guide explains how, why, and what changes when you migrate from an Outlet-based router.

## The pattern

Nest `layout(...)` groups. Each layout wraps every route beneath it:

```ts
routes: [
  layout(AppShell, [
    { path: "/", component: Home },
    { path: "/about", component: About },
    prefix("/admin", layout(AdminShell, [
      { path: "/", component: AdminHome },
      { path: "/users", component: AdminUsers },
    ])),
  ]),
];
```

For URL `/admin/users`, the router renders:

```tsx
<AppShell>
  <AdminShell>
    <AdminUsers />
  </AdminShell>
</AppShell>
```

Outermost first, innermost last. The matched route component ends up at the deepest point.

## What a layout is

Just a React component that accepts a `children` prop:

```tsx
function AppShell({ children }: { children: ReactNode }) {
  return (
    <div>
      <TopNav />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
```

No hooks. No imports from the router. No knowledge that it's mounted inside a router at all. The router composes; the layout is oblivious.

The `LayoutComponent` type is exported for convenience, but any `ComponentType<{ children: ReactNode }>` works:

```ts
import type { LayoutComponent } from "@galalem/react-router";

const AppShell: LayoutComponent = ({ children }) => /* ... */;
```

## Comparison to `<Outlet />`

React Router's pattern:

```tsx
function AppLayout() {
  return (
    <div>
      <TopNav />
      <main>
        <Outlet />  {/* magic: the router injects the matched child here */}
      </main>
    </div>
  );
}
```

`<Outlet />` is a hook into the routing system. `AppLayout` can only render in a route tree that has an outlet context — you can't reuse it outside the router without stubbing the context.

The `@galalem/react-router` version:

```tsx
function AppShell({ children }: { children: ReactNode }) {
  return (
    <div>
      <TopNav />
      <main>{children}</main>
    </div>
  );
}
```

Just a component. Renders anywhere. Takes children. That's it.

**Practical differences you'll notice:**

| | React Router | `@galalem/react-router` |
|---|---|---|
| Layout knows about routing | Yes (`<Outlet />`) | No (`children`) |
| Reusable outside routes | Not really | Yes |
| Testable in isolation | Needs context stub | Just render it |
| Migrating an existing layout | Replace `<Outlet />` with `{children}` | — |

## Layouts and access rules

Layouts inherit the group's other fields. If a group has `auth: true`, every route under it needs auth, and the layout renders only when auth passes:

```ts
prefix("/admin", layout(AdminShell, [
  { path: "/", component: AdminHome, auth: true },
  { path: "/users", component: AdminUsers, auth: true, roles: ["admin"] },
]));
```

If auth fails, the router shows the login page or the 403 component — **not** the AdminShell wrapping a login prompt. Layouts are for successful matches only.

Read more: [Error pages are layout-less](../README.md#error-components) in the package README.

## Layouts on individual routes

The `layout` field also exists on `Route` (not just groups), for solo routes that need a layout without belonging to a group:

```ts
{ path: "/checkout", component: Checkout, layout: CheckoutFlow }
```

If the route is also inside a group with a layout, both apply — group's outermost, route's innermost.

## Migrating from React Router

The mechanical transformation:

**Before:**

```tsx
<Route element={<AppLayout />}>
  <Route path="/" element={<Home />} />
  <Route path="/admin" element={<AdminLayout />}>
    <Route path="users" element={<Users />} />
  </Route>
</Route>

function AppLayout() {
  return <div><TopNav /><Outlet /></div>;
}
```

**After:**

```tsx
routes: [
  layout(AppLayout, [
    { path: "/", component: Home },
    prefix("/admin", layout(AdminLayout, [
      { path: "/users", component: Users },
    ])),
  ]),
];

function AppLayout({ children }) {
  return <div><TopNav />{children}</div>;
}
```

Two changes per layout:
1. `<Outlet />` → `{children}`
2. Add a `children` prop to the layout's props type

The route tree becomes a data structure. Nesting is preserved.

## Common patterns

### Section-specific themes

```tsx
function AdminShell({ children }: { children: ReactNode }) {
  return <div data-theme="admin">{children}</div>;
}
```

### Loading skeletons at the layout level

```tsx
function DataLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {children}
    </Suspense>
  );
}
```

Wrap a lazy-loaded component in a layout that provides its Suspense boundary.

### Error boundaries per section

```tsx
function AdminShell({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary fallback={<AdminError />}>
      {children}
    </ErrorBoundary>
  );
}
```

Because a layout is just a component, it can hold React `<ErrorBoundary>`, `<Suspense>`, and anything else you'd normally put around a subtree.

## What layouts don't do

- **They don't run guards.** Access rules go on the route or group.
- **They don't get route params directly.** They receive `children`, not context. If a layout needs params, call `useRouter()` inside it.
- **They don't own the URL.** Only route configuration owns matching. Layouts render the winner.

## Non-goals

- **`<Outlet />` primitive.** Not exported. Not planned. See the README for why.
- **Sibling layouts / slots.** No API for "put the sidebar here and the main here" as separate slots. If you need that, define the shape in the layout itself and pass params through `useRouter()`.
- **Async layout components.** Layouts are synchronous React components. If you need async data, wrap the layout content in a Suspense boundary the layout itself provides, or fetch inside the route component.
