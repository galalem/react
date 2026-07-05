// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect, type ReactNode } from "react";
import type { LayoutComponent, Router } from "../src/types";
import { createRouter } from "../src/router";
import { Link, NavLink, RouterProvider, useRouter } from "../src/react";

const Home = () => <div data-testid="home">home</div>;
const Dashboard = () => <div data-testid="dashboard">dashboard</div>;
const CustomForbidden = () => <div data-testid="custom-403">no way</div>;

const AppShell: LayoutComponent = ({ children }: { children: ReactNode }) => (
  <div data-testid="shell">shell:{children}</div>
);
const InnerShell: LayoutComponent = ({ children }: { children: ReactNode }) => (
  <div data-testid="inner">inner:{children}</div>
);

let routers: Router[] = [];
function trackRouter(router: Router): Router {
  routers.push(router);
  return router;
}

beforeEach(() => {
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  cleanup();
  for (const router of routers) router.destroy();
  routers = [];
});

describe("RouterProvider", () => {
  it("renders the matched component", async () => {
    const router = trackRouter(
      createRouter({ routes: [{ path: "/", component: Home }] }),
    );
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    expect(screen.getByTestId("home")).toBeDefined();
  });

  it("wraps the matched component in layouts, outermost first", async () => {
    const router = trackRouter(
      createRouter({
        routes: [
          {
            layout: AppShell,
            children: [
              {
                layout: InnerShell,
                children: [{ path: "/", component: Home }],
              },
            ],
          },
        ],
      }),
    );
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    const shell = screen.getByTestId("shell");
    const inner = screen.getByTestId("inner");
    const home = screen.getByTestId("home");
    expect(shell.contains(inner)).toBe(true);
    expect(inner.contains(home)).toBe(true);
  });

  it("renders the user-supplied error component when an error is set", async () => {
    window.history.replaceState({}, "", "/blocked");
    const router = trackRouter(
      createRouter({
        errors: { 403: CustomForbidden },
        routes: [
          { path: "/", component: Home },
          {
            path: "/blocked",
            component: Home,
            guards: [() => ({ deny: true })],
          },
        ],
      }),
    );
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    expect(screen.getByTestId("custom-403")).toBeDefined();
  });

  it("falls back to a default 404 when no user component is provided", async () => {
    window.history.replaceState({}, "", "/nope");
    const router = trackRouter(
      createRouter({ routes: [{ path: "/", component: Home }] }),
    );
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    expect(screen.getByText(/404/)).toBeDefined();
    expect(screen.getByText(/not found/i)).toBeDefined();
  });

  it("falls back to a default 403 when no user component is provided", async () => {
    window.history.replaceState({}, "", "/blocked");
    const router = trackRouter(
      createRouter({
        routes: [
          { path: "/", component: Home },
          {
            path: "/blocked",
            component: Home,
            guards: [() => ({ deny: true })],
          },
        ],
      }),
    );
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    expect(screen.getByText(/403/)).toBeDefined();
  });

  it("re-renders when the router state changes", async () => {
    const router = trackRouter(
      createRouter({
        routes: [
          { path: "/", component: Home },
          { path: "/dashboard", component: Dashboard },
        ],
      }),
    );
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    expect(screen.getByTestId("home")).toBeDefined();

    await act(async () => {
      router.push("/dashboard");
    });
    expect(screen.getByTestId("dashboard")).toBeDefined();
  });
});

describe("useRouter", () => {
  it("returns the current path and params", async () => {
    window.history.replaceState({}, "", "/users/42");
    const router = trackRouter(
      createRouter({
        routes: [
          {
            path: "/users/:id",
            component: () => {
              const { path, params } = useRouter();
              return (
                <div>
                  <span data-testid="path">{path}</span>
                  <span data-testid="id">{params.id}</span>
                </div>
              );
            },
          },
        ],
      }),
    );
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    expect(screen.getByTestId("path").textContent).toBe("/users/42");
    expect(screen.getByTestId("id").textContent).toBe("42");
  });

  it("exposes push and re-renders on state change", async () => {
    const NavButton = () => {
      const { push, path } = useRouter();
      return (
        <div>
          <span data-testid="current">{path}</span>
          <button onClick={() => push("/dashboard")}>go</button>
        </div>
      );
    };
    const router = trackRouter(
      createRouter({
        routes: [
          { path: "/", component: NavButton },
          { path: "/dashboard", component: NavButton },
        ],
      }),
    );
    await act(async () => {
      render(<RouterProvider router={router} />);
    });

    expect(screen.getByTestId("current").textContent).toBe("/");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "go" }));
    });
    expect(screen.getByTestId("current").textContent).toBe("/dashboard");
  });

  it("throws when used outside a RouterProvider", () => {
    const Consumer = () => {
      useRouter();
      return null;
    };
    // Suppress the error boundary console noise.
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow(/RouterProvider/);
    consoleSpy.mockRestore();
  });
});

describe("Link", () => {
  it("renders as an anchor with the href set to `to`", async () => {
    const router = trackRouter(
      createRouter({
        routes: [
          {
            path: "/",
            component: () => <Link to="/dashboard">dash</Link>,
          },
          { path: "/dashboard", component: Dashboard },
        ],
      }),
    );
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    const anchor = screen.getByRole("link", { name: "dash" });
    expect(anchor.getAttribute("href")).toBe("/dashboard");
  });

  it("intercepts a plain click and navigates via router.push", async () => {
    const router = trackRouter(
      createRouter({
        routes: [
          {
            path: "/",
            component: () => <Link to="/dashboard">dash</Link>,
          },
          { path: "/dashboard", component: Dashboard },
        ],
      }),
    );
    await act(async () => {
      render(<RouterProvider router={router} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("link", { name: "dash" }));
    });
    expect(screen.getByTestId("dashboard")).toBeDefined();
  });

  it("does not intercept when a modifier key is held (cmd/ctrl/shift/alt)", async () => {
    const pushSpy = vi.fn();
    const router = trackRouter(
      createRouter({
        routes: [
          {
            path: "/",
            component: () => <Link to="/dashboard">dash</Link>,
          },
          { path: "/dashboard", component: Dashboard },
        ],
      }),
    );
    router.push = pushSpy;

    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    fireEvent.click(screen.getByRole("link", { name: "dash" }), {
      metaKey: true,
    });
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("does not intercept a non-left-click", async () => {
    const pushSpy = vi.fn();
    const router = trackRouter(
      createRouter({
        routes: [
          {
            path: "/",
            component: () => <Link to="/dashboard">dash</Link>,
          },
          { path: "/dashboard", component: Dashboard },
        ],
      }),
    );
    router.push = pushSpy;

    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    fireEvent.click(screen.getByRole("link", { name: "dash" }), { button: 1 });
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("uses replace when the replace prop is set", async () => {
    const replaceSpy = vi.fn();
    const router = trackRouter(
      createRouter({
        routes: [
          {
            path: "/",
            component: () => <Link to="/dashboard" replace>dash</Link>,
          },
          { path: "/dashboard", component: Dashboard },
        ],
      }),
    );
    router.replace = replaceSpy;

    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    fireEvent.click(screen.getByRole("link", { name: "dash" }));
    expect(replaceSpy).toHaveBeenCalledWith("/dashboard", undefined);
  });

  it("calls the caller's onClick before navigating", async () => {
    const onClickSpy = vi.fn();
    const router = trackRouter(
      createRouter({
        routes: [
          {
            path: "/",
            component: () => (
              <Link to="/dashboard" onClick={onClickSpy}>
                dash
              </Link>
            ),
          },
          { path: "/dashboard", component: Dashboard },
        ],
      }),
    );
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("link", { name: "dash" }));
    });
    expect(onClickSpy).toHaveBeenCalledOnce();
    expect(screen.getByTestId("dashboard")).toBeDefined();
  });
});

describe("NavLink", () => {
  const Nav = () => (
    <nav>
      <NavLink to="/" activeClassName="active" className="link">
        home
      </NavLink>
      <NavLink to="/dashboard" activeClassName="active" className="link">
        dash
      </NavLink>
    </nav>
  );

  it("marks the active link with the activeClassName", async () => {
    const router = trackRouter(
      createRouter({
        routes: [
          { path: "/", component: Nav },
          { path: "/dashboard", component: Nav },
        ],
      }),
    );
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    const home = screen.getByRole("link", { name: "home" });
    const dash = screen.getByRole("link", { name: "dash" });
    expect(home.className).toBe("link active");
    expect(dash.className).toBe("link");
  });

  it("sets aria-current='page' on the active link", async () => {
    const router = trackRouter(
      createRouter({
        routes: [
          { path: "/", component: Nav },
          { path: "/dashboard", component: Nav },
        ],
      }),
    );
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    expect(
      screen.getByRole("link", { name: "home" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "dash" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("updates on navigation", async () => {
    const router = trackRouter(
      createRouter({
        routes: [
          { path: "/", component: Nav },
          { path: "/dashboard", component: Nav },
        ],
      }),
    );
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("link", { name: "dash" }));
    });
    expect(screen.getByRole("link", { name: "home" }).className).toBe("link");
    expect(screen.getByRole("link", { name: "dash" }).className).toBe(
      "link active",
    );
  });

  it("supports a function-form className", async () => {
    const FunctionalNav = () => (
      <NavLink
        to="/dashboard"
        className={({ isActive }) => (isActive ? "on" : "off")}
      >
        dash
      </NavLink>
    );
    window.history.replaceState({}, "", "/dashboard");
    const router = trackRouter(
      createRouter({
        routes: [{ path: "/dashboard", component: FunctionalNav }],
      }),
    );
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    expect(screen.getByRole("link", { name: "dash" }).className).toBe("on");
  });

  it("prefix mode (exact=false) treats a subpath as active", async () => {
    const PrefixNav = () => (
      <NavLink to="/admin" exact={false} activeClassName="active">
        admin
      </NavLink>
    );
    window.history.replaceState({}, "", "/admin/users");
    const router = trackRouter(
      createRouter({
        routes: [{ path: "/admin/users", component: PrefixNav }],
      }),
    );
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    expect(screen.getByRole("link", { name: "admin" }).className).toBe(
      "active",
    );
  });

  it("prefix mode does not match unrelated paths that share a substring", async () => {
    const PrefixNav = () => (
      <NavLink to="/user" exact={false} activeClassName="active">
        user
      </NavLink>
    );
    // "/users" starts with "/user" as a substring but not as a path segment.
    window.history.replaceState({}, "", "/users");
    const router = trackRouter(
      createRouter({
        routes: [{ path: "/users", component: PrefixNav }],
      }),
    );
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    expect(
      screen.getByRole("link", { name: "user" }).className,
    ).toBeFalsy();
  });
});

describe("RouterProvider — meta DOM sync", () => {
  const readMetaTags = () =>
    Array.from(document.head.querySelectorAll("meta[data-galalem-router]")).map(
      (el) => ({
        name: el.getAttribute("name"),
        property: el.getAttribute("property"),
        content: el.getAttribute("content"),
      }),
    );

  beforeEach(() => {
    document.title = "Baseline";
    for (const el of document.head.querySelectorAll("meta[data-galalem-router]"))
      el.remove();
  });

  it("sets document.title from meta.title", async () => {
    const router = trackRouter(
      createRouter({
        routes: [
          { path: "/", component: Home, meta: { title: "Home | MyApp" } },
        ],
      }),
    );
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    expect(document.title).toBe("Home | MyApp");
  });

  it("emits <meta name=\"...\"> for plain keys and <meta property=\"...\"> for keys containing ':'", async () => {
    const router = trackRouter(
      createRouter({
        routes: [
          {
            path: "/",
            component: Home,
            meta: {
              description: "Public page",
              "og:image": "https://example.com/hero.png",
              "twitter:card": "summary",
            },
          },
        ],
      }),
    );
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    expect(readMetaTags()).toEqual(
      expect.arrayContaining([
        { name: "description", property: null, content: "Public page" },
        { name: null, property: "og:image", content: "https://example.com/hero.png" },
        { name: null, property: "twitter:card", content: "summary" },
      ]),
    );
  });

  it("replaces router-owned meta tags on navigation (no leakage)", async () => {
    const router = trackRouter(
      createRouter({
        routes: [
          {
            path: "/",
            component: Home,
            meta: { title: "Home", description: "First" },
          },
          {
            path: "/dashboard",
            component: Dashboard,
            meta: { title: "Dash", "og:title": "Dashboard" },
          },
        ],
      }),
    );
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    expect(document.title).toBe("Home");
    expect(readMetaTags()).toEqual([
      { name: "description", property: null, content: "First" },
    ]);

    await act(async () => {
      router.push("/dashboard");
    });
    expect(document.title).toBe("Dash");
    expect(readMetaTags()).toEqual([
      { name: null, property: "og:title", content: "Dashboard" },
    ]);
  });

  it("restores the initial document.title when a route has no meta.title", async () => {
    const router = trackRouter(
      createRouter({
        routes: [
          { path: "/", component: Home, meta: { title: "Home" } },
          { path: "/plain", component: Dashboard },
        ],
      }),
    );
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    expect(document.title).toBe("Home");

    await act(async () => {
      router.push("/plain");
    });
    expect(document.title).toBe("Baseline");
  });
});

describe("Link — data prop", () => {
  it("passes the data payload into router.push", async () => {
    const pushSpy = vi.fn();
    const router = trackRouter(
      createRouter({
        routes: [
          {
            path: "/",
            component: () => (
              <Link to="/dashboard" data={{ tab: 3 }}>
                go
              </Link>
            ),
          },
          { path: "/dashboard", component: Dashboard },
        ],
      }),
    );
    router.push = pushSpy;

    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    fireEvent.click(screen.getByRole("link", { name: "go" }));
    expect(pushSpy).toHaveBeenCalledWith("/dashboard", { tab: 3 });
  });
});

describe("RouterProvider — setMeta DOM sync", () => {
  const readMetaTags = () =>
    Array.from(document.head.querySelectorAll("meta[data-galalem-router]")).map(
      (el) => ({
        name: el.getAttribute("name"),
        property: el.getAttribute("property"),
        content: el.getAttribute("content"),
      }),
    );

  beforeEach(() => {
    document.title = "Baseline";
    for (const el of document.head.querySelectorAll("meta[data-galalem-router]"))
      el.remove();
  });

  it("re-renders and updates document.title when a component calls setMeta", async () => {
    const Component = () => {
      const { setMeta } = useRouter();
      useEffect(() => {
        setMeta({ title: "Runtime title" });
      }, [setMeta]);
      return <div>content</div>;
    };
    const router = trackRouter(
      createRouter({
        routes: [
          { path: "/", component: Component, meta: { title: "Static" } },
        ],
      }),
    );
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    expect(document.title).toBe("Runtime title");
  });

  it("merges runtime meta with the route's static meta in the DOM", async () => {
    const Component = () => {
      const { setMeta } = useRouter();
      useEffect(() => {
        setMeta({ description: "runtime" });
      }, [setMeta]);
      return <div>content</div>;
    };
    const router = trackRouter(
      createRouter({
        routes: [
          {
            path: "/",
            component: Component,
            meta: { title: "Static", "og:title": "OG" },
          },
        ],
      }),
    );
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    expect(document.title).toBe("Static");
    expect(readMetaTags()).toEqual(
      expect.arrayContaining([
        { name: null, property: "og:title", content: "OG" },
        { name: "description", property: null, content: "runtime" },
      ]),
    );
  });
});

describe("useRouter — query and hash", () => {
  it("returns the parsed query object", async () => {
    window.history.replaceState({}, "", "/users?tab=settings");
    const Consumer = () => {
      const { query, search } = useRouter();
      return (
        <div>
          <span data-testid="search">{search}</span>
          <span data-testid="tab">{query.tab}</span>
        </div>
      );
    };
    const router = trackRouter(
      createRouter({ routes: [{ path: "/users", component: Consumer }] }),
    );
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    expect(screen.getByTestId("search").textContent).toBe("?tab=settings");
    expect(screen.getByTestId("tab").textContent).toBe("settings");
  });
});
