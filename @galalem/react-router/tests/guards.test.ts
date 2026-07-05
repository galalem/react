import { describe, expect, it, vi } from "vitest";
import type { AuthConfig, Guard, RouteContext } from "../src/types";
import { authGuard, rolesGuard, runGuards } from "../src/guards";

const emptyContext: RouteContext = {
  path: "/",
  search: "",
  hash: "",
  params: {},
  user: null,
  data: undefined,
};

function makeAuthConfig(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return {
    currentUser: () => null,
    loginPath: "/login",
    ...overrides,
  };
}

describe("runGuards", () => {
  it("returns true when the list is empty", async () => {
    await expect(runGuards([], emptyContext)).resolves.toBe(true);
  });

  it("returns true when every guard returns true", async () => {
    const guardOne: Guard = () => true;
    const guardTwo: Guard = () => true;
    await expect(runGuards([guardOne, guardTwo], emptyContext)).resolves.toBe(
      true,
    );
  });

  it("short-circuits on the first non-true result", async () => {
    const first = vi.fn<Guard>(() => true);
    const second = vi.fn<Guard>(() => ({ redirect: "/login" }));
    const third = vi.fn<Guard>(() => true);

    const result = await runGuards([first, second, third], emptyContext);

    expect(result).toEqual({ redirect: "/login" });
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(third).not.toHaveBeenCalled();
  });

  it("preserves execution order", async () => {
    const order: string[] = [];
    const first: Guard = () => {
      order.push("first");
      return true;
    };
    const second: Guard = () => {
      order.push("second");
      return true;
    };

    await runGuards([first, second], emptyContext);
    expect(order).toEqual(["first", "second"]);
  });

  it("awaits async guards", async () => {
    const async: Guard = async () => {
      await Promise.resolve();
      return { deny: true };
    };
    await expect(runGuards([async], emptyContext)).resolves.toEqual({
      deny: true,
    });
  });

  it("mixes sync and async guards", async () => {
    const syncGuard: Guard = () => true;
    const asyncGuard: Guard = async () => ({ error: 429 });

    await expect(
      runGuards([syncGuard, asyncGuard], emptyContext),
    ).resolves.toEqual({ error: 429 });
  });
});

describe("authGuard", () => {
  it("redirects to loginPath with the encoded intended URL when no user is present", () => {
    const guard = authGuard(makeAuthConfig({ currentUser: () => null }));
    expect(guard(emptyContext)).toEqual({ redirect: "/login?redirectUrl=%2F" });
  });

  it("redirects when currentUser returns undefined", () => {
    const guard = authGuard(
      makeAuthConfig({ currentUser: () => undefined }),
    );
    expect(guard(emptyContext)).toEqual({ redirect: "/login?redirectUrl=%2F" });
  });

  it("passes when a user is present", () => {
    const guard = authGuard(
      makeAuthConfig({ currentUser: () => ({ id: 1 }) }),
    );
    expect(guard(emptyContext)).toBe(true);
  });

  it("encodes the full URL — path + search + hash", () => {
    const guard = authGuard(makeAuthConfig({ currentUser: () => null }));
    const result = guard({
      path: "/admin/users",
      search: "?tab=roles",
      hash: "#top",
      params: {},
      user: null,
      data: undefined,
    });
    expect(result).toEqual({
      redirect: `/login?redirectUrl=${encodeURIComponent("/admin/users?tab=roles#top")}`,
    });
  });

  it("uses a custom redirectParam name when configured", () => {
    const guard = authGuard(
      makeAuthConfig({ currentUser: () => null, redirectParam: "next" }),
    );
    expect(guard(emptyContext)).toEqual({ redirect: "/login?next=%2F" });
  });

  it("skips the param entirely when redirectParam is false", () => {
    const guard = authGuard(
      makeAuthConfig({ currentUser: () => null, redirectParam: false }),
    );
    expect(guard(emptyContext)).toEqual({ redirect: "/login" });
  });

  it("appends with '&' when loginPath already has a query string", () => {
    const guard = authGuard(
      makeAuthConfig({
        currentUser: () => null,
        loginPath: "/login?flow=sso",
      }),
    );
    expect(guard(emptyContext)).toEqual({
      redirect: "/login?flow=sso&redirectUrl=%2F",
    });
  });
});

describe("rolesGuard", () => {
  it("redirects to loginPath with the encoded intended URL when no user is present", () => {
    const guard = rolesGuard(
      ["admin"],
      makeAuthConfig({ currentUser: () => null }),
    );
    expect(guard(emptyContext)).toEqual({ redirect: "/login?redirectUrl=%2F" });
  });

  it("passes when the required list is empty (no roles required)", () => {
    const guard = rolesGuard(
      [],
      makeAuthConfig({ currentUser: () => ({ id: 1 }) }),
    );
    expect(guard(emptyContext)).toBe(true);
  });

  it("throws when userRoles is not supplied but roles are required", () => {
    const guard = rolesGuard(
      ["admin"],
      makeAuthConfig({ currentUser: () => ({ id: 1 }) }),
    );
    expect(() => guard(emptyContext)).toThrow(/userRoles/);
  });

  it("passes when the user has every required role (AND semantics)", () => {
    const guard = rolesGuard(
      ["admin", "editor"],
      makeAuthConfig({
        currentUser: () => ({ roles: ["admin", "editor", "viewer"] }),
        userRoles: (user) => (user as { roles: string[] }).roles,
      }),
    );
    expect(guard(emptyContext)).toBe(true);
  });

  it("denies when a required role is missing (renders 403 in place, no redirect)", () => {
    const guard = rolesGuard(
      ["admin", "editor"],
      makeAuthConfig({
        currentUser: () => ({ roles: ["admin"] }),
        userRoles: (user) => (user as { roles: string[] }).roles,
      }),
    );
    expect(guard(emptyContext)).toEqual({ deny: true });
  });

  it("denies when user has none of the required roles", () => {
    const guard = rolesGuard(
      ["admin"],
      makeAuthConfig({
        currentUser: () => ({ roles: ["viewer"] }),
        userRoles: (user) => (user as { roles: string[] }).roles,
      }),
    );
    expect(guard(emptyContext)).toEqual({ deny: true });
  });

  it("supports OR via '|' — passes with either operand", () => {
    const configuration = makeAuthConfig({
      currentUser: () => ({ roles: ["editor"] }),
      userRoles: (user) => (user as { roles: string[] }).roles,
    });
    const guard = rolesGuard(["|", "admin", "editor"], configuration);
    expect(guard(emptyContext)).toBe(true);
  });

  it("supports nested expressions — admin OR (editor AND publisher)", () => {
    const requiredRoles = ["|", "admin", "&", "editor", "publisher"];
    const editorOnly = rolesGuard(
      requiredRoles,
      makeAuthConfig({
        currentUser: () => ({ roles: ["editor"] }),
        userRoles: (user) => (user as { roles: string[] }).roles,
      }),
    );
    expect(editorOnly(emptyContext)).toEqual({ deny: true });

    const editorAndPublisher = rolesGuard(
      requiredRoles,
      makeAuthConfig({
        currentUser: () => ({ roles: ["editor", "publisher"] }),
        userRoles: (user) => (user as { roles: string[] }).roles,
      }),
    );
    expect(editorAndPublisher(emptyContext)).toBe(true);
  });
});
