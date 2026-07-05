# Page metadata

`document.title`, `<meta>` tags, Open Graph, Twitter cards — all live on the `meta` field of a route. This guide covers both the static form (declared alongside the route) and the dynamic form (`router.setMeta` for post-fetch updates).

## The unified `meta` shape

One field, one convention. `meta.title` is a special key that sets `document.title`; every other key becomes a `<meta>` element:

```ts
meta: {
  title: "Home | MyApp",              // → document.title
  description: "Welcome to MyApp",    // → <meta name="description" content="...">
  "og:title": "Home",                 // → <meta property="og:title" content="...">
  "og:image": "https://.../hero.png", // → <meta property="og:image" content="...">
}
```

### Name vs. property

A key containing `:` is emitted as `property="..."`. A key without `:` is emitted as `name="..."`.

- `description` → `<meta name="description">`
- `og:title` → `<meta property="og:title">` (Open Graph)
- `twitter:card` → `<meta property="twitter:card">`

This isn't strictly correct in every browser spec, but it matches how OG and Twitter tags are used in practice. `name=` for `description`, `robots`, `keywords`, etc.; `property=` for OG and Twitter.

If you need a key like `<meta name="og-title">` (with a hyphen instead of a colon), you can — it just gets `name=` because it has no colon. Rare enough that the convention holds.

## Static form

The simplest case is a plain object on the route:

```ts
{
  path: "/",
  component: Home,
  meta: {
    title: "Home | MyApp",
    description: "Welcome",
  },
}
```

The router resolves this at match time and syncs the DOM.

## Function form

When you want to derive metadata from route params, query, or user, pass a function:

```ts
{
  path: "/users/:id",
  component: UserDetail,
  meta: (ctx) => ({
    title: `User ${ctx.params.id} | MyApp`,
    description: `Profile for user ${ctx.params.id}`,
  }),
}
```

The function receives the full `RouteContext`: `path`, `search`, `hash`, `params`, `user`, `data`. It runs synchronously at match time. No promises. If you need async data — like fetching the user's actual name — use `router.setMeta` from the component instead.

## Dynamic form: `router.setMeta`

For metadata that depends on fetched data, call `router.setMeta(partial)` from the component:

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

### Merge semantics

`setMeta` **merges** into the current route's meta. Existing keys are overwritten by the new call; keys not mentioned in the call are preserved.

```ts
// Route declared this:
meta: { title: "User", "og:image": "/default-avatar.png" }

// Component calls this after fetching:
setMeta({ title: "Jane Doe" });

// Effective meta:
// { title: "Jane Doe", "og:image": "/default-avatar.png" }
```

The route's `og:image` survives because `setMeta` didn't touch it. Common pattern: declare defaults on the route, override the ones you can only compute after a fetch.

### Cleanup on navigation

When the user navigates to a different route, `state.meta` is replaced entirely with the next route's meta (resolved fresh). All the `setMeta` overrides you accumulated for the previous route are gone — that's the guarantee.

You don't need to clean up manually. Component unmount doesn't need a cleanup call. The router handles it.

## What the router does to the DOM

On every state change (initial mount, navigation, `setMeta`):

1. **Remove** every `<meta>` element in `<head>` with the `data-galalem-router` attribute. Only tags the router itself added get removed; anything you put in `<head>` manually stays.
2. **Set** `document.title` to `state.meta.title` if present, otherwise restore the initial title captured when `<RouterProvider>` mounted.
3. **Add** new `<meta>` elements for every other key in `state.meta`, each carrying the `data-galalem-router` attribute.

The `data-galalem-router` marker is how the router distinguishes tags it owns from tags you or another library added. If you inspect the DOM you'll see it:

```html
<meta name="description" content="..." data-galalem-router>
<meta property="og:image" content="..." data-galalem-router>
```

Don't add this attribute to tags in your `index.html` — the router will delete them on nav.

## Initial title behavior

Whatever's in `<title>` when `<RouterProvider>` first mounts is captured as the initial title. When a route has no `meta.title`, the router restores it.

That means:
- The `<title>MyApp</title>` in your `index.html` is the "default" title.
- Routes that don't specify `meta.title` show "MyApp".
- Routes that do specify a title show it and restore "MyApp" on leaving.

If you want every route to have a specific title, always set `meta.title`. If you want a category of routes to share a fallback, declare that fallback in `index.html` and only override on specific routes.

## Common patterns

### Consistent title suffix

Every title should end with " | MyApp"? Do it in the route config directly — there's no template layer:

```ts
const withSuffix = (t: string) => `${t} | MyApp`;

routes: [
  { path: "/", component: Home, meta: { title: withSuffix("Home") } },
  { path: "/about", component: About, meta: { title: withSuffix("About") } },
];
```

Simpler than any abstraction I could offer.

### Dynamic OG image based on user

```tsx
function UserPage() {
  const { params, setMeta } = useRouter();
  const user = useSWR(`/api/users/${params.id}`);

  useEffect(() => {
    if (user) {
      setMeta({
        title: `${user.name} | MyApp`,
        "og:title": user.name,
        "og:image": user.avatarUrl,
      });
    }
  }, [user, setMeta]);

  return <ProfileCard user={user} />;
}
```

### Static description on the route, dynamic title in the component

```ts
{
  path: "/posts/:id",
  component: Post,
  meta: { description: "Read a post" },
}
```

```tsx
function Post() {
  const { params, setMeta } = useRouter();
  const post = useSWR(`/api/posts/${params.id}`);
  useEffect(() => {
    if (post) setMeta({ title: post.title });
  }, [post, setMeta]);
  // ...
}
```

Effective meta while loading: `{ description: "Read a post" }`.
After fetch: `{ title: post.title, description: "Read a post" }`.

## SEO caveat

We're a client-only router. Crawlers that don't execute JavaScript won't see the `<meta>` tags added at runtime. If SEO for social previews matters:

- LinkedIn, Slack, and Discord's crawlers **do** execute JavaScript (mostly). They'll see your tags.
- Google's crawler executes JS and generally indexes the rendered result.
- Simple `curl`-based fetchers won't see anything.

For true SSR-safe metadata, you need a server-rendering framework. `@galalem/react-router` doesn't do SSR in v0.1.

## Non-goals

- **A `useMeta` hook.** You already have `useRouter().setMeta`. Adding a hook variant would be a second API for the same thing. Skip.
- **Merging strategies on the config side.** The route's `meta` is a single object or a single function; no per-key inheritance from groups. If you need shared metadata across a route section, declare it at each route or write a small helper.
- **Group-level `meta`.** Considered, deferred. Metadata is expressive of the specific page, not the section. If demand shows up, add in v0.2.
