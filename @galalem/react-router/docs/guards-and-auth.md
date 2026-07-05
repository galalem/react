# Guards and auth

The core pitch: **access rules go on the route, not in wrappers**. This guide walks through the built-in auth flow, RBAC via role expressions, and how to write your own guards.

## The three built-in fields

Every route accepts three fields that control access:

| Field | Meaning |
|---|---|
| `auth: true` | The user must be logged in (`currentUser()` must return non-null) |
| `roles: [...]` | The user must satisfy the role expression |
| `guards: [...]` | Arbitrary custom guards run in order |

Any combination is fine. They compile into a single guard pipeline internally, executed in this order per route:

1. `authGuard` (if `auth: true` or `roles` is set — roles imply auth)
2. `rolesGuard` (if `roles` is set)
3. Your custom `guards`, in the order you declared them

Parent-group guards run before child-route guards.

## The auth config

`createRouter` accepts an `auth` config with the hooks the built-in guards need:

```ts
createRouter({
  auth: {
    currentUser: () => authStore.user(),        // required
    userRoles: (user) => (user as User).roles,  // required if any route uses `roles`
    loginPath: "/login",                        // where authGuard redirects
    redirectParam: "redirectUrl",               // default; false disables
  },
  routes: [/* ... */],
});
```

**`currentUser`** is called every navigation. Return `null` / `undefined` for logged-out. Return anything else — an object, a token, a string — for logged-in. The router doesn't care about the shape.

**`userRoles`** is only needed if any route uses `roles`. It extracts a role list from whatever `currentUser` returns.

**`loginPath`** is where `authGuard` sends unauthenticated users.

**`redirectParam`** — the query param name used to encode the intended URL on the login redirect. See "Post-login return" below.

## Role expressions

`roles: ["admin"]` means "user must have admin." That's the trivial case. When you want AND/OR/nested logic, `roles` accepts a small polish-notation expression:

```ts
roles: ["admin"]                             // admin
roles: ["admin", "editor"]                   // admin AND editor
roles: ["|", "admin", "editor"]              // admin OR editor
roles: ["&", "|", "admin", "editor", "publisher"]  // (admin OR editor) AND publisher
```

`&` and `|` are prefix operators consuming the next 2 sub-expressions. Bare strings at the top level implicitly AND.

You almost never write polish notation by hand — use the `and()` / `or()` builders:

```ts
import { and, or } from "@galalem/react-router";

roles: or("admin", "editor")                       // ["|", "admin", "editor"]
roles: and("admin", or("editor", "publisher"))     // admin AND (editor OR publisher)
```

Both are variadic and left-fold: `and(a, b, c)` produces `((a AND b) AND c)`.

### Why AND at the top level?

Because groups push access rules **down** and merge additively. Parent `roles: ["admin"]` + child `roles: or("editor", "viewer")` concatenates to `["admin", "|", "editor", "viewer"]` — which reads as `admin AND (editor OR viewer)`. The parent's admin requirement stays in effect. That's the invariant: **children can't loosen a parent's access**.

## Guard result shape

A guard is any `(ctx: RouteContext) => GuardResult | Promise<GuardResult>`. The four possible results:

```ts
type GuardResult =
  | true                          // allow; continue to the next guard
  | { redirect: string }          // navigate elsewhere (flow redirect)
  | { deny: true }                // render the 403 error component in place
  | { error: HttpError };         // render the matching error component in place
```

**`true`** — pass. Router advances to the next guard.

**`{ redirect }`** — a flow redirect, meant for things like "unauthenticated user → login page". Router replaces the URL and navigates to the new target. Guards on the target route run fresh.

**`{ deny: true }`** — the user is authenticated but not allowed here. The router keeps the URL as-is and renders the 403 component. No layouts, no wrappers. This is how the built-in `rolesGuard` reports failure.

**`{ error: 429 }`** — like `deny`, but with a specific status code. The router renders whatever component you supplied in the `errors` map for that code (or a generic fallback).

The distinction between `redirect` and `deny` is deliberate:
- Redirect = "you shouldn't be here, but here's where you should go." URL changes.
- Deny = "you shouldn't see this content." URL stays.

`redirect` is a flow. `deny` / `error` is an error page.

## Writing your own guard

Anything that fits the type signature works. Examples:

**Feature flag guard:**

```ts
const featureFlag = (flag: string): Guard => async () => {
  const enabled = await flagStore.isEnabled(flag);
  return enabled ? true : { error: 404 };  // pretend the page doesn't exist
};

routes: [
  { path: "/reports", component: Reports, auth: true, guards: [featureFlag("reports")] },
];
```

**Subscription tier guard:**

```ts
const requireTier = (tier: "pro" | "enterprise"): Guard => (ctx) => {
  const user = ctx.user as { tier: string } | null;
  if (!user || !meetsTier(user.tier, tier)) return { redirect: "/upgrade" };
  return true;
};
```

**Async permission fetch:**

```ts
const canAccessProject: Guard = async (ctx) => {
  const projectId = ctx.params.projectId;
  const ok = await api.canAccess(projectId);
  return ok ? true : { deny: true };
};
```

Guards receive the full `RouteContext`: `path`, `search`, `hash`, `params`, `user` (whatever `auth.currentUser()` returned), and `data` (any payload passed via `router.push(to, data)`).

## Post-login return

When `authGuard` redirects an unauthenticated user, it appends the intended URL as a query param. If someone hits `/admin/users?tab=roles` while logged out:

```
/login?redirectUrl=%2Fadmin%2Fusers%3Ftab%3Droles
```

The full URL — path + search + hash — is URL-encoded and preserved. `loginPath` that already has a `?` gets `&` instead.

Your login page reads it back via `router.redirect(fallback)`:

```tsx
function LoginPage() {
  const { redirect } = useRouter();
  async function handleLogin() {
    await authStore.login(/* ... */);
    redirect("/dashboard");  // used only if no redirectUrl param is present
  }
  return <button onClick={handleLogin}>Log in</button>;
}
```

`router.redirect(fallback)` is not a general-purpose navigation. It has one job: complete the round-trip. Semantics:

- Reads the redirect param from the current URL.
- If present and safe (same-origin absolute path), navigates there via `replace`.
- If absent, navigates to `fallback` (defaults to `"/"`).
- Uses `replace`, not `push`, so the browser back button skips the login page.

### Safety

The redirect param is untrusted user input. `router.redirect` rejects anything that isn't a same-origin absolute path:

- `/dashboard` → allowed
- `//other.com/steal` → rejected (protocol-relative URL, open-redirect vector)
- `javascript:alert(1)` → rejected
- `https://evil.com` → rejected (doesn't start with `/`)

Rejected targets fall back to the supplied `fallback`. This prevents phishing via crafted login URLs like `/login?redirectUrl=//evil.com`.

### Customizing or disabling

```ts
auth: {
  // ...
  redirectParam: "next",   // match Django's convention
  // or
  redirectParam: false,    // don't encode the intended URL at all
}
```

Some apps prefer to always send users to a fixed post-login destination. Setting `redirectParam: false` skips the param entirely; `router.redirect(fallback)` just uses `fallback`.

## Failing fast on missing config

If any route declares `auth: true` or `roles: [...]` but you didn't pass an `auth` config to `createRouter`, we throw at construction time — not on the first navigation:

```
Route "/dashboard" requires auth, but no auth config was provided to createRouter.
```

The stack trace points at your `createRouter` call, not at some deferred navigation deep in the app. Fix once, forget forever.

## Testing guards

`matchPath` is exported so you can unit-test route patterns. `runGuards(guards, ctx)` is *not* exported, but you can construct guards directly and call them with a `RouteContext` object in tests:

```ts
import { authGuard } from "@galalem/react-router";  // not exported yet — see roadmap

// or write your own guard and test it as any pure async function
const guard = myFeatureFlagGuard("beta");
expect(await guard({ path: "/", search: "", hash: "", params: {}, user: null, data: undefined }))
  .toEqual({ error: 404 });
```

> **Note:** `authGuard` and `rolesGuard` are internal at v0.1. If there's demand to import them for tests, they'll be exported in a later patch.
