# URL state and navigation payloads

Everything the URL tells you — path, params, search, hash — lives on `useRouter()`. There's also a `data` field for the rare case where you need to attach a payload to a navigation that isn't in the URL. This guide covers all four and, importantly, when *not* to reach for `data`.

## What's on `useRouter()`

```ts
const {
  // navigation
  push, replace, back, forward, reload, redirect, setMeta,
  // reactive URL state
  path,     // "/users/42"
  params,   // { id: "42" }
  search,   // "?tab=roles"
  query,    // { tab: "roles" }
  hash,     // "#section"
  data,     // the route's static `data`, extended by router.push(to, data)
} = useRouter();
```

Every field re-renders the component when the URL changes. `useRouter()` uses React's `useSyncExternalStore` under the hood; you get the current snapshot on read and a re-render on any router state change.

## Path and params

The path is just `location.pathname`. `params` come from the matcher — dynamic segments in the route pattern become named entries:

```ts
{ path: "/users/:id/posts/:postId", component: Post }
// URL: /users/42/posts/7
// params: { id: "42", postId: "7" }
```

Params are URL-decoded automatically. `/search/hello%20world` matched against `/search/:q` gives `params.q === "hello world"`.

Wildcard `*` captures the rest under a special `"*"` key:

```ts
{ path: "/files/*", component: FileBrowser }
// URL: /files/reports/2026/q1.pdf
// params: { "*": "reports/2026/q1.pdf" }
```

## Query strings

`search` is the raw string with the leading `?`. `query` is a parsed object:

```ts
// URL: /users?tab=roles&page=2
search === "?tab=roles&page=2"
query  === { tab: "roles", page: "2" }
```

Values are always strings — the browser's `URLSearchParams` doesn't do type coercion, and neither do we. Parse to numbers or booleans in your component if you need to.

Duplicate keys collapse to the last value (`?tag=a&tag=b` → `query.tag === "b"`). If you need multi-value support, parse `search` yourself with `URLSearchParams`.

### Setting query params

There's no dedicated `setQuery` API. Just `push` a new URL:

```ts
push(`/users?tab=${nextTab}`);
```

Or, if you want to preserve other params:

```ts
const currentQuery = new URLSearchParams(search);
currentQuery.set("tab", nextTab);
push(`/users?${currentQuery.toString()}`);
```

Yes, it's two lines. A helper would be a good v0.2 addition; for v0.1, be explicit.

## Hash

Same story as search — raw string with the leading `#`, no parsing:

```ts
// URL: /docs#installation
hash === "#installation"
```

The router doesn't scroll to the hash target automatically. That's an app concern (scroll restoration is deferred to v0.2). If you need it today:

```tsx
useEffect(() => {
  if (hash) document.querySelector(hash)?.scrollIntoView();
}, [hash]);
```

## The `data` payload

`router.push(to, data)` and `router.replace(to, data)` accept an optional second argument that rides along with the navigation:

```ts
router.push("/dashboard", { fromSidebar: true });

// or from JSX:
<Link to="/dashboard" data={{ fromSidebar: true }}>Go</Link>

// in the destination:
const { data } = useRouter();
// data === { fromSidebar: true }
```

### Route data

Routes and groups can declare `data` too. Groups cascade into their children (child keys override parent keys), and the navigation payload is shallow-merged on top — so the payload *extends* the static data rather than replacing it:

```ts
{
  prefix: "/app",
  data: { section: "app", panel: "main" },
  children: [{ path: "/dashboard", component: Dashboard, data: { tab: 1 } }],
}

// Direct visit / refresh:
// data === { section: "app", panel: "main", tab: 1 }

router.push("/app/dashboard", { panel: "sidebar", from: "nav" });
// data === { section: "app", panel: "sidebar", tab: 1, from: "nav" }
```

Route data is always present, so it is safe to depend on — unlike the payload. The merge is shallow, and only plain-object payloads are merged: a string, array, or class instance passed to `push` replaces the route data outright. On a 404 there is no matched route, so `data` is just the payload.

### Computed route data

`data` can also be a function of the route context, sync or async. The router doesn't fetch anything itself and doesn't cache — it just calls your function and waits for it:

```ts
{
  path: "/users/:id",
  component: UserPage,
  data: async ({ params }) => ({ user: await api.getUser(params.id) }),
  meta: ({ data }) => ({ title: `${(data as { user: User }).user.name} | MyApp` }),
}
```

- It runs **only after every guard passes**, so a rejected user never triggers it.
- Group and route functions run in parallel; results merge outermost-first like object data, and the payload still goes on top.
- The navigation settles when it resolves: the previous page stays mounted meanwhile, and `router.ready` waits for it. If a newer navigation starts first, the stale result is dropped.
- If it throws or rejects, the route renders the `500` error component and the error is logged with `console.error`.
- `meta` functions receive the resolved data.
- It runs on every navigation to the route. Want caching or dedup? Call into your own cache (React Query, SWR, …) from the function.

Guards — and the functions themselves — run before resolution, so their `RouteContext.data` holds what's known at that point: object-form data from the route and its groups, extended by the payload.

### Updating data: `router.setData`

`router.setData(partial)` (also on `useRouter()`) shallow-merges keys into the current `data` and re-renders consumers. Like `setMeta`, it's in-memory only — not written to `history.state` — and cleared on the next navigation.

```tsx
const { data, setData } = useRouter();
setData({ tab: 2 });
```

Under the hood, the navigation payload is stored in `window.history.state` under a namespaced key (`__galalem_router_data`) so browser back/forward preserve it and other libraries writing to `history.state` don't collide.

### When to use it

Genuine use cases:

- **"How did they get here?"** hints for analytics or UI decisions. `data: { source: "search-results" }` lets a landing page log the funnel without polluting the URL.
- **Optimistic previews.** Passing a summary object that the page renders instantly while the full record loads: `data: { userSummary: { name: "Jane" } }`.
- **Multi-step flows** where the previous step wants to seed the next.

### When *not* to use it

The navigation payload is absent when the user:

- Opens the URL directly in a new tab.
- Refreshes the page.
- Follows a link from an email or another site.
- Uses the address bar.

If your page silently breaks in any of those cases, the payload is the wrong tool. Move that state into the URL (query params), declare it as route data, or refetch it.

Rule of thumb: **would the page work correctly if the navigation payload were never passed?** If yes, `data` is a nice-to-have hint. If no, redesign — the page depends on state that isn't reproducible.

### Why not a global store?

Because global stores are shared across routes. `data` is scoped to a single navigation. When the user navigates elsewhere, the previous `data` is gone (the new route's `data` replaces it, or `undefined` if you didn't pass one). No cleanup. No cross-contamination between unrelated screens.

## `redirect` — a specialized navigation

`router.redirect(fallback)` isn't general-purpose. It's specifically for completing the post-login round-trip:

1. Read the `redirectUrl` query param (or whatever `AuthConfig.redirectParam` is set to).
2. If present and safe (same-origin absolute path), `replace` to that URL.
3. Otherwise, `replace` to `fallback` (defaults to `"/"`).

See [Guards and auth → Post-login return](./guards-and-auth.md#post-login-return).

## Reading location outside React

`useRouter()` requires React context. If you need URL state in a plain module (a data layer, an event handler outside components, an analytics wrapper), you have two options:

**Option 1: Reference the router directly.** `createRouter` returns the full API. Keep a reference:

```ts
export const router = createRouter({/* ... */});
router.push("/somewhere");
router.getState().path;
```

**Option 2: Subscribe.** Same shape as `useRouter` uses internally:

```ts
const unsubscribe = router.subscribe((state) => {
  analytics.trackPageView(state.path);
});
```

Both work outside components. Just remember: the router is per-app, not global — don't turn it into a module-level singleton if you're expecting hot module reloads or multiple router instances (tests, Storybook).

## Common patterns

### Preserving query params on navigation

```ts
push(`/other${search}${hash}`);
```

Straightforward. If the new path already has a query, use `URLSearchParams` to merge.

### Deep-linkable filters

```tsx
function UserList() {
  const { push, query } = useRouter();
  const filter = query.filter ?? "all";

  return (
    <>
      <select value={filter} onChange={(e) => push(`/users?filter=${e.target.value}`)}>
        <option value="all">All</option>
        <option value="admins">Admins</option>
      </select>
      {/* ... */}
    </>
  );
}
```

The filter state lives in the URL. Someone sharing this URL gets the same filter applied. Browser back returns to the previous filter. No `useState` needed.

### Debounced query updates

```tsx
function Search() {
  const { push, query } = useRouter();
  const [text, setText] = useState(query.q ?? "");

  useEffect(() => {
    const timer = setTimeout(() => {
      push(`/search?q=${encodeURIComponent(text)}`, undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [text, push]);

  return <input value={text} onChange={(e) => setText(e.target.value)} />;
}
```

Local state during typing, URL update after the debounce, deep-linkable result.
