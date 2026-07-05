// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType, ReactNode } from "react";
import type { Guard, LayoutComponent, Router } from "../src/types";
import { createRouter } from "../src/router";

const Home: ComponentType = () => null;
const Dashboard: ComponentType = () => null;
const UserDetail: ComponentType = () => null;
const Admin: ComponentType = () => null;
const Login: ComponentType = () => null;
const Forbidden: ComponentType = () => null;
const NotFound: ComponentType = () => null;
const TooMany: ComponentType = () => null;

const AdminShell: LayoutComponent = ({ children }: { children: ReactNode }) =>
  children as ReactNode as null;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let routers: Router[] = [];
function trackRouter(router: Router): Router {
  routers.push(router);
  return router;
}

beforeEach(() => {
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  for (const router of routers) router.destroy();
  routers = [];
});

describe("createRouter — basic matching", () => {
  it("matches the initial path on mount", async () => {
    const router = trackRouter(
      createRouter({
        routes: [{ path: "/", component: Home }],
      }),
    );
    await flush();
    const state = router.getState();
    expect(state.path).toBe("/");
    expect(state.component).toBe(Home);
    expect(state.error).toBeNull();
  });

  it("sets error 404 when no route matches", async () => {
    window.history.replaceState({}, "", "/nope");
    const router = trackRouter(
      createRouter({ routes: [{ path: "/", component: Home }] }),
    );
    await flush();
    expect(router.getState().error).toBe(404);
    expect(router.getState().component).toBeNull();
  });

  it("push navigates and re-matches", async () => {
    const router = trackRouter(
      createRouter({
        routes: [
          { path: "/", component: Home },
          { path: "/dashboard", component: Dashboard },
        ],
      }),
    );
    await flush();
    router.push("/dashboard");
    await flush();
    expect(router.getState().component).toBe(Dashboard);
    expect(router.getState().path).toBe("/dashboard");
  });

  it("captures params from a matched route", async () => {
    window.history.replaceState({}, "", "/users/42");
    const router = trackRouter(
      createRouter({
        routes: [{ path: "/users/:id", component: UserDetail }],
      }),
    );
    await flush();
    expect(router.getState().params).toEqual({ id: "42" });
  });

  it("first-matching route wins (order matters)", async () => {
    window.history.replaceState({}, "", "/users/42");
    const First: ComponentType = () => null;
    const Second: ComponentType = () => null;
    const router = trackRouter(
      createRouter({
        routes: [
          { path: "/users/:id", component: First },
          { path: "/users/:id", component: Second },
        ],
      }),
    );
    await flush();
    expect(router.getState().component).toBe(First);
  });
});

describe("createRouter — query and hash", () => {
  it("carries the parsed query object on state", async () => {
    window.history.replaceState({}, "", "/users?tab=settings&page=2");
    const router = trackRouter(
      createRouter({ routes: [{ path: "/users", component: Home }] }),
    );
    await router.ready;
    expect(router.getState().search).toBe("?tab=settings&page=2");
    expect(router.getState().query).toEqual({ tab: "settings", page: "2" });
  });

  it("empty query object when no search string is present", async () => {
    const router = trackRouter(
      createRouter({ routes: [{ path: "/", component: Home }] }),
    );
    await router.ready;
    expect(router.getState().search).toBe("");
    expect(router.getState().query).toEqual({});
  });

  it("carries the hash", async () => {
    window.history.replaceState({}, "", "/#top");
    const router = trackRouter(
      createRouter({ routes: [{ path: "/", component: Home }] }),
    );
    await router.ready;
    expect(router.getState().hash).toBe("#top");
  });

  it("push with query updates state.query", async () => {
    const router = trackRouter(
      createRouter({
        routes: [
          { path: "/", component: Home },
          { path: "/search", component: Home },
        ],
      }),
    );
    await router.ready;
    router.push("/search?q=hello");
    await flush();
    expect(router.getState().path).toBe("/search");
    expect(router.getState().query).toEqual({ q: "hello" });
  });
});

describe("createRouter — layouts", () => {
  it("passes the layout stack from the matched flat route into state", async () => {
    const router = trackRouter(
      createRouter({
        routes: [
          {
            prefix: "/admin",
            layout: AdminShell,
            children: [{ path: "/", component: Admin }],
          },
        ],
      }),
    );
    window.history.replaceState({}, "", "/admin");
    router.reload();
    await flush();
    expect(router.getState().layouts).toEqual([AdminShell]);
    expect(router.getState().component).toBe(Admin);
  });
});

describe("createRouter — guards", () => {
  it("redirects to loginPath when auth is required and no user is present", async () => {
    const router = trackRouter(
      createRouter({
        auth: {
          currentUser: () => null,
          loginPath: "/login",
        },
        routes: [
          { path: "/login", component: Login },
          { path: "/dashboard", component: Dashboard, auth: true },
        ],
      }),
    );
    router.push("/dashboard");
    await flush();
    await flush();
    expect(router.getState().path).toBe("/login");
    expect(router.getState().component).toBe(Login);
  });

  it("passes when auth is satisfied", async () => {
    const router = trackRouter(
      createRouter({
        auth: {
          currentUser: () => ({ id: 1 }),
          loginPath: "/login",
        },
        routes: [
          { path: "/", component: Home },
          { path: "/dashboard", component: Dashboard, auth: true },
        ],
      }),
    );
    router.push("/dashboard");
    await flush();
    expect(router.getState().component).toBe(Dashboard);
  });

  it("renders error 403 on { deny: true }", async () => {
    const deny: Guard = () => ({ deny: true });
    const router = trackRouter(
      createRouter({
        routes: [
          { path: "/", component: Home },
          { path: "/blocked", component: Dashboard, guards: [deny] },
        ],
      }),
    );
    router.push("/blocked");
    await flush();
    expect(router.getState().error).toBe(403);
    expect(router.getState().component).toBeNull();
  });

  it("renders the error code from { error: N }", async () => {
    const rateLimit: Guard = () => ({ error: 429 });
    const router = trackRouter(
      createRouter({
        routes: [
          { path: "/", component: Home },
          { path: "/limited", component: Dashboard, guards: [rateLimit] },
        ],
      }),
    );
    router.push("/limited");
    await flush();
    expect(router.getState().error).toBe(429);
  });

  it("throws at createRouter when auth: true but no auth config", () => {
    expect(() =>
      createRouter({
        routes: [{ path: "/", component: Home, auth: true }],
      }),
    ).toThrow(/auth/);
  });

  it("throws at createRouter when roles are used but no auth config", () => {
    expect(() =>
      createRouter({
        routes: [{ path: "/", component: Home, roles: ["admin"] }],
      }),
    ).toThrow(/auth/);
  });

  it("enforces roles via expression semantics — renders 403 in place, no redirect", async () => {
    const router = trackRouter(
      createRouter({
        auth: {
          currentUser: () => ({ roles: ["viewer"] }),
          userRoles: (user) => (user as { roles: string[] }).roles,
          loginPath: "/login",
        },
        errors: { 403: Forbidden },
        routes: [
          { path: "/login", component: Login },
          { path: "/admin", component: Admin, auth: true, roles: ["admin"] },
        ],
      }),
    );
    router.push("/admin");
    await flush();
    await flush();
    // Path stays on /admin; the 403 error surfaces in state and gets rendered in place.
    expect(router.getState().path).toBe("/admin");
    expect(router.getState().error).toBe(403);
    expect(router.getState().component).toBeNull();
    expect(router.getState().layouts).toEqual([]);
  });
});

describe("createRouter — subscribers", () => {
  it("notifies subscribers on navigation", async () => {
    const router = trackRouter(
      createRouter({
        routes: [
          { path: "/", component: Home },
          { path: "/dashboard", component: Dashboard },
        ],
      }),
    );
    await flush();
    const listener = vi.fn();
    router.subscribe(listener);

    router.push("/dashboard");
    await flush();

    expect(listener).toHaveBeenCalled();
    expect(listener.mock.calls.at(-1)?.[0].component).toBe(Dashboard);
  });

  it("unsubscribing stops future notifications", async () => {
    const router = trackRouter(
      createRouter({
        routes: [
          { path: "/", component: Home },
          { path: "/other", component: Dashboard },
        ],
      }),
    );
    await flush();
    const listener = vi.fn();
    const unsubscribe = router.subscribe(listener);
    unsubscribe();

    router.push("/other");
    await flush();

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("createRouter — errors map", () => {
  it("exposes the user-supplied errors map on the router", () => {
    const router = trackRouter(
      createRouter({
        errors: { 403: Forbidden, 404: NotFound, 429: TooMany },
        routes: [{ path: "/", component: Home }],
      }),
    );
    expect(router.errors).toEqual({
      403: Forbidden,
      404: NotFound,
      429: TooMany,
    });
  });

  it("defaults errors to an empty object when omitted", () => {
    const router = trackRouter(
      createRouter({ routes: [{ path: "/", component: Home }] }),
    );
    expect(router.errors).toEqual({});
  });
});

describe("createRouter — ready", () => {
  it("resolves once the initial match is complete", async () => {
    const router = trackRouter(
      createRouter({ routes: [{ path: "/", component: Home }] }),
    );
    await router.ready;
    expect(router.getState().component).toBe(Home);
  });

  it("resolves once the initial 404 is set (no match)", async () => {
    window.history.replaceState({}, "", "/nope");
    const router = trackRouter(
      createRouter({ routes: [{ path: "/", component: Home }] }),
    );
    await router.ready;
    expect(router.getState().error).toBe(404);
  });

  it("waits for a redirect chain to terminate before resolving", async () => {
    window.history.replaceState({}, "", "/dashboard");
    const router = trackRouter(
      createRouter({
        auth: {
          currentUser: () => null,
          loginPath: "/login",
        },
        routes: [
          { path: "/login", component: Login },
          { path: "/dashboard", component: Dashboard, auth: true },
        ],
      }),
    );

    await router.ready;
    expect(router.getState().path).toBe("/login");
    expect(router.getState().component).toBe(Login);
  });

  it("stays resolved after subsequent navigations", async () => {
    const router = trackRouter(
      createRouter({
        routes: [
          { path: "/", component: Home },
          { path: "/dashboard", component: Dashboard },
        ],
      }),
    );
    await router.ready;

    router.push("/dashboard");
    await flush();

    // ready is a one-shot promise — still resolved.
    await expect(router.ready).resolves.toBeUndefined();
  });
});

describe("createRouter — reload and stale navigation", () => {
  it("reload re-runs the guards for the current path", async () => {
    let allow = false;
    const guard: Guard = () => (allow ? true : { deny: true });
    const router = trackRouter(
      createRouter({
        routes: [{ path: "/", component: Home, guards: [guard] }],
      }),
    );
    await flush();
    expect(router.getState().error).toBe(403);

    allow = true;
    router.reload();
    await flush();
    expect(router.getState().error).toBeNull();
    expect(router.getState().component).toBe(Home);
  });
});

describe("createRouter — meta (static)", () => {
  it("resolves a plain object meta into state", async () => {
    const router = trackRouter(
      createRouter({
        routes: [
          {
            path: "/",
            component: Home,
            meta: {
              title: "Home | MyApp",
              description: "Welcome",
              "og:title": "Home",
            },
          },
        ],
      }),
    );
    await router.ready;
    expect(router.getState().meta).toEqual({
      title: "Home | MyApp",
      description: "Welcome",
      "og:title": "Home",
    });
  });

  it("resolves a function meta with route context (params + query)", async () => {
    window.history.replaceState({}, "", "/users/42?tab=roles");
    const router = trackRouter(
      createRouter({
        routes: [
          {
            path: "/users/:id",
            component: UserDetail,
            meta: (ctx) => ({
              title: `User ${ctx.params.id}${ctx.search}`,
            }),
          },
        ],
      }),
    );
    await router.ready;
    expect(router.getState().meta.title).toBe("User 42?tab=roles");
  });

  it("emits empty meta on 404", async () => {
    window.history.replaceState({}, "", "/nope");
    const router = trackRouter(
      createRouter({
        routes: [{ path: "/", component: Home, meta: { title: "Home" } }],
      }),
    );
    await router.ready;
    expect(router.getState().meta).toEqual({});
  });

  it("emits empty meta on a denied route (403)", async () => {
    const deny: Guard = () => ({ deny: true });
    const router = trackRouter(
      createRouter({
        routes: [
          {
            path: "/",
            component: Home,
            meta: { title: "Home" },
            guards: [deny],
          },
        ],
      }),
    );
    await router.ready;
    expect(router.getState().meta).toEqual({});
  });
});

describe("createRouter — setMeta (imperative)", () => {
  it("merges new keys into the current route's meta", async () => {
    const router = trackRouter(
      createRouter({
        routes: [
          {
            path: "/",
            component: Home,
            meta: { title: "Home", description: "Static desc" },
          },
        ],
      }),
    );
    await router.ready;

    router.setMeta({ title: "Home (fetched)" });
    expect(router.getState().meta).toEqual({
      title: "Home (fetched)",
      description: "Static desc",
    });
  });

  it("does not touch route-level keys that were not overridden", async () => {
    const router = trackRouter(
      createRouter({
        routes: [
          {
            path: "/",
            component: Home,
            meta: { title: "Home", "og:image": "hero.png" },
          },
        ],
      }),
    );
    await router.ready;

    router.setMeta({ "og:description": "Fetched later" });
    expect(router.getState().meta).toEqual({
      title: "Home",
      "og:image": "hero.png",
      "og:description": "Fetched later",
    });
  });

  it("is cleared on next navigation (state.meta resets to next route's meta)", async () => {
    const router = trackRouter(
      createRouter({
        routes: [
          { path: "/", component: Home, meta: { title: "Home" } },
          { path: "/dashboard", component: Dashboard, meta: { title: "Dash" } },
        ],
      }),
    );
    await router.ready;

    router.setMeta({ title: "Home (custom)" });
    expect(router.getState().meta.title).toBe("Home (custom)");

    router.push("/dashboard");
    await flush();
    expect(router.getState().meta.title).toBe("Dash");
  });
});

describe("createRouter — data (payload attached to navigations)", () => {
  it("push passes data into state and the RouteContext", async () => {
    const router = trackRouter(
      createRouter({
        routes: [
          { path: "/", component: Home },
          { path: "/dashboard", component: Dashboard },
        ],
      }),
    );
    await router.ready;

    router.push("/dashboard", { from: "sidebar", tab: 3 });
    await flush();
    expect(router.getState().data).toEqual({ from: "sidebar", tab: 3 });
  });

  it("data is undefined on URL-driven navigation (initial load)", async () => {
    window.history.replaceState(null, "", "/");
    const router = trackRouter(
      createRouter({ routes: [{ path: "/", component: Home }] }),
    );
    await router.ready;
    expect(router.getState().data).toBeUndefined();
  });

  it("replace also carries data", async () => {
    const router = trackRouter(
      createRouter({
        routes: [
          { path: "/", component: Home },
          { path: "/other", component: Dashboard },
        ],
      }),
    );
    await router.ready;

    router.replace("/other", { reason: "auto" });
    await flush();
    expect(router.getState().data).toEqual({ reason: "auto" });
  });

  it("data is exposed on the RouteContext given to guards", async () => {
    let seenData: unknown = "not captured";
    const captureGuard: Guard = (ctx) => {
      seenData = ctx.data;
      return true;
    };
    const router = trackRouter(
      createRouter({
        routes: [
          { path: "/", component: Home },
          {
            path: "/dashboard",
            component: Dashboard,
            guards: [captureGuard],
          },
        ],
      }),
    );
    await router.ready;

    router.push("/dashboard", { origin: "welcome-banner" });
    await flush();
    expect(seenData).toEqual({ origin: "welcome-banner" });
  });
});

describe("createRouter — redirect (post-login return)", () => {
  it("navigates to the URL from the default redirectUrl query param", async () => {
    window.history.replaceState({}, "", "/login?redirectUrl=%2Fdashboard");
    const router = trackRouter(
      createRouter({
        routes: [
          { path: "/login", component: Login },
          { path: "/dashboard", component: Dashboard },
        ],
      }),
    );
    await router.ready;
    router.redirect();
    await flush();
    expect(router.getState().path).toBe("/dashboard");
    expect(router.getState().component).toBe(Dashboard);
  });

  it("falls back to the supplied path when no redirectUrl param is present", async () => {
    window.history.replaceState({}, "", "/login");
    const router = trackRouter(
      createRouter({
        routes: [
          { path: "/login", component: Login },
          { path: "/dashboard", component: Dashboard },
        ],
      }),
    );
    await router.ready;
    router.redirect("/dashboard");
    await flush();
    expect(router.getState().path).toBe("/dashboard");
  });

  it("defaults the fallback to '/'", async () => {
    window.history.replaceState({}, "", "/login");
    const router = trackRouter(
      createRouter({
        routes: [
          { path: "/", component: Home },
          { path: "/login", component: Login },
        ],
      }),
    );
    await router.ready;
    router.redirect();
    await flush();
    expect(router.getState().path).toBe("/");
  });

  it("rejects unsafe protocol-relative URLs (open-redirect prevention)", async () => {
    window.history.replaceState({}, "", "/login?redirectUrl=%2F%2Fevil.com%2F");
    const router = trackRouter(
      createRouter({
        routes: [
          { path: "/", component: Home },
          { path: "/login", component: Login },
        ],
      }),
    );
    await router.ready;
    router.redirect("/safe");
    await flush();
    expect(router.getState().path).toBe("/safe");
  });

  it("rejects unsafe javascript: URLs", async () => {
    window.history.replaceState(
      {},
      "",
      "/login?redirectUrl=javascript%3Aalert(1)",
    );
    const router = trackRouter(
      createRouter({
        routes: [
          { path: "/", component: Home },
          { path: "/login", component: Login },
        ],
      }),
    );
    await router.ready;
    router.redirect("/safe");
    await flush();
    expect(router.getState().path).toBe("/safe");
  });

  it("uses the custom redirectParam name when configured", async () => {
    window.history.replaceState({}, "", "/login?next=%2Fdashboard");
    const router = trackRouter(
      createRouter({
        auth: {
          currentUser: () => ({ id: 1 }),
          loginPath: "/login",
          redirectParam: "next",
        },
        routes: [
          { path: "/login", component: Login },
          { path: "/dashboard", component: Dashboard },
        ],
      }),
    );
    await router.ready;
    router.redirect();
    await flush();
    expect(router.getState().path).toBe("/dashboard");
  });

  it("ignores the query when redirectParam is false and just uses the fallback", async () => {
    window.history.replaceState({}, "", "/login?redirectUrl=%2Fdashboard");
    const router = trackRouter(
      createRouter({
        auth: {
          currentUser: () => ({ id: 1 }),
          loginPath: "/login",
          redirectParam: false,
        },
        routes: [
          { path: "/login", component: Login },
          { path: "/dashboard", component: Dashboard },
          { path: "/home", component: Home },
        ],
      }),
    );
    await router.ready;
    router.redirect("/home");
    await flush();
    expect(router.getState().path).toBe("/home");
  });
});

describe("createRouter — auth redirect encodes intended URL", () => {
  it("encodes the intended URL when auth guard redirects to login", async () => {
    window.history.replaceState({}, "", "/dashboard?ref=email");
    const router = trackRouter(
      createRouter({
        auth: {
          currentUser: () => null,
          loginPath: "/login",
        },
        routes: [
          { path: "/login", component: Login },
          { path: "/dashboard", component: Dashboard, auth: true },
        ],
      }),
    );
    await router.ready;
    expect(router.getState().path).toBe("/login");
    expect(router.getState().query.redirectUrl).toBe("/dashboard?ref=email");
  });
});
