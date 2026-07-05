# @galalem/react-router

A plug-and-play React router with **auth and RBAC as first-class route configuration**.

Delete your `<RequireAuth>` and `<RequireRole>` wrappers. Declare access on the route.

```tsx
createRouter({
  routes: [
    { path: "/", component: Home },
    { path: "/dashboard", component: Dashboard, auth: true },
    {
      prefix: "/admin",
      layout: AdminShell,
      auth: true,
      roles: ["admin"],
      children: [
        { path: "/users", component: Users },
        { path: "/settings", component: Settings },
      ],
    },
  ],
});
```

> **Status:** early development — API subject to change until v0.1.

## Why

Every non-trivial React app rewrites the same three wrappers: `<RequireAuth>`, `<RequireRole>`, and a redirect helper. Existing routers stay unopinionated by design, so the boilerplate is on you.

`@galalem/react-router` takes a stance: **a route is a data object, and its access requirements belong on that object.** Configure auth once, and every guarded route enforces it.

> Looking for deeper docs? See **[docs/](./docs/)** — mental model, guards & auth, nested layouts, metadata, and URL state.

## Install

```bash
npm i @galalem/react-router
```

Requires React `>=19`.

## Quick start

```tsx
import { createRouter, RouterProvider, Link, useRouter } from "@galalem/react-router";

const router = createRouter({
  auth: {
    currentUser: () => authStore.user(),
    loginPath: "/login",
  },
  routes: [
    { path: "/", component: Home },
    { path: "/login", component: Login },
    { path: "/dashboard", component: Dashboard, auth: true },
    { path: "/admin", component: Admin, auth: true, roles: ["admin"] },
  ],
});

function App() {
  return <RouterProvider router={router} />;
}

// Optional: wait for the initial navigation before mounting.
// Avoids a first-render flash if the initial URL triggers a redirect
// (e.g. an auth-gated route redirecting to /login).
await router.ready;
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

// Persistent UI (nav, footer) goes in a root layout — every route inherits it.
function AppShell({ children }) {
  return (
    <>
      <Nav />
      {children}
    </>
  );
}

function Nav() {
  const { push } = useRouter();
  return (
    <nav>
      <Link to="/">Home</Link>
      <Link to="/dashboard">Dashboard</Link>
      <button onClick={() => push("/admin")}>Admin</button>
    </nav>
  );
}

// Wire the layout in the route tree:
//   layout(AppShell, [ { path: "/", component: Home }, ... ])
```

## Core concepts

### Routes are configuration

```ts
type Route = {
  path: string;
  component: ComponentType;
  auth?: boolean;
  roles?: string[];
  guards?: Guard[];
};
```

**Lazy loading is free** — `component` accepts any `ComponentType`, including `React.lazy`. Your bundler code-splits the chunk and any CSS that chunk imports:

```tsx
const AdminPage = React.lazy(() => import("./AdminPage"));

routes: [{ path: "/admin", component: AdminPage, auth: true, roles: ["admin"] }];
```

Wrap `<RouterProvider>` in a `<Suspense fallback={...}>` if you want a loading state during chunk fetches.

### Route groups

Groups let a set of routes share a URL prefix, a layout, and access rules. No `<Outlet />`, no JSX nesting — just data.

```ts
{
  prefix: "/admin",
  layout: AdminShell,
  auth: true,
  roles: ["admin"],
  children: [
    { path: "/users", component: Users },
    { path: "/users/:id", component: UserDetail },
  ],
}
```

Groups can nest. Child paths concatenate onto parent prefixes; child guards run after parent guards.

### Group shortcuts

For small sections, shortcut helpers read better than a literal object:

```ts
import { prefix, auth, roles, layout, guards } from "@galalem/react-router";

routes: [
  { path: "/", component: Home },
  prefix("/admin", auth(roles(["admin"], layout(AdminShell, [
    { path: "/users", component: Users },
    { path: "/users/:id", component: UserDetail },
  ])))),
];
```

Each helper returns a route group; compose them in any order. Both forms produce the same route tree.

### Nested layouts (without `<Outlet />`)

Layouts nest naturally by nesting groups. Each group's `layout` wraps every descendant, so stacking layouts gives you nested UI shells for free:

```ts
{
  layout: AppLayout,
  children: [{
    prefix: "/users",
    layout: UserPage,
    children: [
      { path: "/:page", component: PaginatedPage },
    ],
  }],
}
```

For URL `/users/42`, the router renders:

```tsx
<AppLayout>
  <UserPage>
    <PaginatedPage />
  </UserPage>
</AppLayout>
```

**No `<Outlet />` needed.** Each layout is a plain React component that receives its inner content through `children`:

```tsx
function UserPage({ children }) {
  return (
    <div>
      <Breadcrumb />
      {children}
    </div>
  );
}
```

That means your layouts have zero router knowledge — you can render them in Storybook, tests, or an entirely different app without touching a routing hook. The router composes the tree at render time; layouts just receive their input.

Same tree with shortcuts:

```ts
layout(AppLayout, prefix("/users", layout(UserPage, [
  { path: "/:page", component: PaginatedPage },
])))
```

### Guards

A guard is an async (or sync) function that decides whether a navigation is allowed.

```ts
type Guard = (ctx: RouteContext) => Promise<GuardResult> | GuardResult;
type GuardResult =
  | true
  | { redirect: string }
  | { deny: true }
  | { error: HttpError };
```

`auth: true` and `roles: [...]` are built-in guards — write your own for anything else (feature flags, subscription tier, tenant checks). Returning `{ error: 429 }` from a guard renders the matching error component (see below).

#### Role expressions

`roles` is a polish-notation expression, borrowed from Odoo's domain system. `&` (AND) and `|` (OR) are prefix operators that consume the next 2 sub-expressions. Bare strings default to AND across the top level.

```ts
roles: ["admin"]                              // admin only
roles: ["admin", "editor"]                    // admin AND editor
roles: ["|", "admin", "editor"]               // admin OR editor
roles: ["|", "admin", "&", "editor", "publisher"]  // admin OR (editor AND publisher)
```

For anyone who'd rather not hand-write polish notation, use the `and()` and `or()` builders:

```ts
import { and, or } from "@galalem/react-router";

roles: or("admin", "editor")                       // → ["|", "admin", "editor"]
roles: and("admin", "editor")                      // → ["&", "admin", "editor"]
roles: or("admin", and("editor", "publisher"))     // admin OR (editor AND publisher)
```

Both are variadic — `and(a, b, c)` left-folds to `((a AND b) AND c)`. Nested calls compose freely.

When groups merge, role expressions concatenate — parent constraints stay in effect, child constraints get AND'd on top.

### Error components

Supply a map of components to render on error. The router emits `404` (no match) and `403` (guard denied). Guards can trigger other codes.

```ts
createRouter({
  errors: {
    403: Forbidden,
    404: NotFound,
    429: TooManyRequests,
  },
  routes: [/* ... */],
});
```

Keys are typed against `HttpError` — TypeScript flags unsupported codes at compile time. Defaults ship for `403` and `404` — a plain heading with a status message. Nothing fancy.

> **Error pages render without any route-level layout.** The error component sits at the DOM root — no `AppShell`, no nav, no wrappers. This is intentional: layouts belong to routes, and an error page isn't the route the user asked for. If you want your app chrome visible on a 404, wrap your error component itself in whatever layout you want. Layouts are plain React components with a `children` prop, so there's nothing router-specific about doing this:
>
> ```tsx
> const NotFound = () => (
>   <AppShell>
>     <h1>Not found</h1>
>   </AppShell>
> );
> ```
>
> No `errorLayout` config field is planned — the "layouts are plain components" story already covers this case.

### Post-login return

When the auth guard redirects an unauthenticated user to `loginPath`, it appends the intended URL as a query param (`?redirectUrl=<encoded>` by default). After a successful login, call `router.redirect(fallback)` to send them back:

```tsx
function LoginPage() {
  const { redirect } = useRouter();
  async function handleLogin() {
    await authStore.login(/* ... */);
    redirect("/dashboard"); // used only if no redirectUrl param is present
  }
  return <button onClick={handleLogin}>Log in</button>;
}
```

Customize the param name (`redirectParam: "next"`) or disable the append entirely (`redirectParam: false`) in `AuthConfig`.

`router.redirect(fallback)` rejects anything that isn't a same-origin absolute path — no `//other.com`, no `javascript:` — falling back on the supplied path when the encoded target is unsafe. Same-origin absolute paths only, no external URLs.

### Page metadata (title + meta tags)

Every route can declare a `meta` field — a static object, or a function of the route context. The `title` key is special: it sets `document.title`. Other keys become `<meta>` elements — anything with a `:` in the key is emitted as `property="..."` (Open Graph / Twitter), everything else as `name="..."`.

```ts
routes: [
  {
    path: "/",
    component: Home,
    meta: {
      title: "Home | MyApp",
      description: "Welcome to MyApp",
      "og:title": "Home",
      "og:image": "https://example.com/hero.png",
    },
  },
  {
    path: "/users/:id",
    component: UserDetail,
    meta: (ctx) => ({ title: `User ${ctx.params.id} | MyApp` }),
  },
];
```

Router-owned tags carry a `data-galalem-router` attribute so cleanup on navigation is precise — nothing leaks between routes. When a route has no `meta.title`, `document.title` is restored to whatever was in `<title>` when the provider first mounted.

**Dynamic metadata after a fetch** — call `router.setMeta(partial)` from a component. Merges into the current route's meta (route-level keys stay unless overridden). Cleared automatically on the next navigation.

```tsx
function UserPage() {
  const { params, setMeta } = useRouter();
  const user = useSWR(`/api/users/${params.id}`);
  useEffect(() => {
    if (user) setMeta({ title: `${user.name} | MyApp` });
  }, [user, setMeta]);
  return <ProfileCard user={user} />;
}
```

### Attaching data to a navigation

`router.push(to, data)` and `router.replace(to, data)` accept an optional payload that rides along under `window.history.state`. Available on `useRouter().data` and inside guards via `RouteContext.data`. Survives browser back/forward; `undefined` on URL-driven navigation (initial load, refresh, direct address bar entry).

```tsx
router.push("/dashboard", { fromSidebar: true });

// or from a Link:
<Link to="/dashboard" data={{ fromSidebar: true }}>Go</Link>

// inside the destination:
const { data } = useRouter();
```

> **Prefer stateless routes.** `data` is an escape hatch for hints (e.g. "which panel opened this?"). Don't put real state in it — a user opening the URL directly, or refreshing, sees `undefined`.

### Query strings and hash

`useRouter()` exposes `search` (raw `?tab=settings`), `query` (parsed object), and `hash`. `Link` and `router.push` accept any URL string including a query — the router preserves it.

```tsx
function Filters() {
  const { push, query } = useRouter();
  const activeTab = query.tab ?? "all";

  return (
    <div>
      <button onClick={() => push("/users?tab=admin")}>Admins</button>
      <button onClick={() => push("/users?tab=all")}>All</button>
      <p>Showing: {activeTab}</p>
    </div>
  );
}
```

### Active links with NavLink

`NavLink` is `Link` with active-state awareness. Give it an `activeClassName` or a function-form `className`:

```tsx
<NavLink to="/users" activeClassName="active" className="nav-link">
  Users
</NavLink>

<NavLink to="/users" className={({ isActive }) => isActive ? "on" : "off"}>
  Users
</NavLink>
```

By default matching is exact. Set `exact={false}` for prefix mode (`/admin` stays active on `/admin/users`, `/admin/settings`, etc.). Path-segment safe — `/user` doesn't match `/users`.

`aria-current="page"` is set automatically when active.

### Coexistence with React Router

For v0.1, mount `@galalem/react-router` under an existing React Router route:

```tsx
<Route path="/admin/*" element={<RouterProvider router={adminRouter}>{/* ... */}</RouterProvider>} />
```

You can migrate one section at a time.

## API surface (v0.1)

| Export | Purpose |
|---|---|
| `createRouter(options)` | Build a router instance from route config |
| `RouterProvider` | Mounts the router in your React tree |
| `Link` | Anchor that navigates without a page reload |
| `NavLink` | `Link` with `isActive` awareness, `activeClassName`, and `aria-current` |
| `useRouter()` | Access `push`, `replace`, `back`, `redirect`, `setMeta`, `path`, `params`, `search`, `query`, `hash`, `data` |
| `router.redirect(fallback?)` | Reads `redirectUrl` from query, navigates there via replace (falls back to `fallback ?? "/"`) |
| `router.setMeta(partial)` | Merges runtime metadata into the current route's meta; cleared on next navigation |
| `router.push(to, data?)` / `router.replace(to, data?)` | Optional payload attached to the navigation (`useRouter().data`, `RouteContext.data`) |
| `router.ready` | Promise that resolves once the initial navigation (and any redirects) has settled |
| `matchPath(pattern, path)` | Pure matcher, exported for tests and SSR |
| `prefix(path, children)` | Group shortcut — shared URL prefix |
| `auth(children)` | Group shortcut — all children require auth |
| `roles(list, children)` | Group shortcut — all children require these roles |
| `layout(component, children)` | Group shortcut — wrap all children in a layout |
| `guards(list, children)` | Group shortcut — run these guards on all children |
| `errors` option | Map of status code → component (`{ "403": Forbidden, "404": NotFound }`) |

## Roadmap

- v0.1 — Core router, auth guard, RBAC guard, route groups, group shortcuts, `Link`, `useRouter`, `matchPath`
- v0.2 — Devtools, sibling-mode coexistence with React Router
- Later — File-system routing via a Vite plugin

## License

MIT © Galalem
