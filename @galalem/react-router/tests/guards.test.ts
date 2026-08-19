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
  it("redirects to loginPath with the encoded intended URL when no user is present", async () => {
    const guard = authGuard(makeAuthConfig({ currentUser: () => null }));
    await expect(guard(emptyContext)).resolves.toEqual({
      redirect: "/login?redirectUrl=%2F",
    });
  });

  it("redirects when currentUser returns undefined", async () => {
    const guard = authGuard(
      makeAuthConfig({ currentUser: () => undefined }),
    );
    await expect(guard(emptyContext)).resolves.toEqual({
      redirect: "/login?redirectUrl=%2F",
    });
  });

  it("passes when a user is present", async () => {
    const guard = authGuard(
      makeAuthConfig({ currentUser: () => ({ id: 1 }) }),
    );
    await expect(guard(emptyContext)).resolves.toBe(true);
  });

  it("awaits an async currentUser", async () => {
    const guard = authGuard(
      makeAuthConfig({ currentUser: async () => ({ id: 1 }) }),
    );
    await expect(guard(emptyContext)).resolves.toBe(true);
  });

  it("redirects when async currentUser resolves to null", async () => {
    const guard = authGuard(
      makeAuthConfig({ currentUser: async () => null }),
    );
    await expect(guard(emptyContext)).resolves.toEqual({
      redirect: "/login?redirectUrl=%2F",
    });
  });

  it("encodes the full URL — path + search + hash", async () => {
    const guard = authGuard(makeAuthConfig({ currentUser: () => null }));
    await expect(
      guard({
        path: "/admin/users",
        search: "?tab=roles",
        hash: "#top",
        params: {},
        user: null,
        data: undefined,
      }),
    ).resolves.toEqual({
      redirect: `/login?redirectUrl=${encodeURIComponent("/admin/users?tab=roles#top")}`,
    });
  });

  it("uses a custom redirectParam name when configured", async () => {
    const guard = authGuard(
      makeAuthConfig({ currentUser: () => null, redirectParam: "next" }),
    );
    await expect(guard(emptyContext)).resolves.toEqual({
      redirect: "/login?next=%2F",
    });
  });

  it("skips the param entirely when redirectParam is false", async () => {
    const guard = authGuard(
      makeAuthConfig({ currentUser: () => null, redirectParam: false }),
    );
    await expect(guard(emptyContext)).resolves.toEqual({ redirect: "/login" });
  });

  it("appends with '&' when loginPath already has a query string", async () => {
    const guard = authGuard(
      makeAuthConfig({
        currentUser: () => null,
        loginPath: "/login?flow=sso",
      }),
    );
    await expect(guard(emptyContext)).resolves.toEqual({
      redirect: "/login?flow=sso&redirectUrl=%2F",
    });
  });
});

describe("rolesGuard", () => {
  it("redirects to loginPath with the encoded intended URL when no user is present", async () => {
    const guard = rolesGuard(
      ["admin"],
      makeAuthConfig({ currentUser: () => null }),
    );
    await expect(guard(emptyContext)).resolves.toEqual({
      redirect: "/login?redirectUrl=%2F",
    });
  });

  it("passes when the required list is empty (no roles required)", async () => {
    const guard = rolesGuard(
      [],
      makeAuthConfig({ currentUser: () => ({ id: 1 }) }),
    );
    await expect(guard(emptyContext)).resolves.toBe(true);
  });

  it("throws when userRoles is not supplied but roles are required", async () => {
    const guard = rolesGuard(
      ["admin"],
      makeAuthConfig({ currentUser: () => ({ id: 1 }) }),
    );
    await expect(guard(emptyContext)).rejects.toThrow(/userRoles/);
  });

  it("passes when the user has every required role (AND semantics)", async () => {
    const guard = rolesGuard(
      ["admin", "editor"],
      makeAuthConfig({
        currentUser: () => ({ roles: ["admin", "editor", "viewer"] }),
        userRoles: (user) => (user as { roles: string[] }).roles,
      }),
    );
    await expect(guard(emptyContext)).resolves.toBe(true);
  });

  it("denies when a required role is missing (renders 403 in place, no redirect)", async () => {
    const guard = rolesGuard(
      ["admin", "editor"],
      makeAuthConfig({
        currentUser: () => ({ roles: ["admin"] }),
        userRoles: (user) => (user as { roles: string[] }).roles,
      }),
    );
    await expect(guard(emptyContext)).resolves.toEqual({ deny: true });
  });

  it("denies when user has none of the required roles", async () => {
    const guard = rolesGuard(
      ["admin"],
      makeAuthConfig({
        currentUser: () => ({ roles: ["viewer"] }),
        userRoles: (user) => (user as { roles: string[] }).roles,
      }),
    );
    await expect(guard(emptyContext)).resolves.toEqual({ deny: true });
  });

  it("supports OR via '|' — passes with either operand", async () => {
    const configuration = makeAuthConfig({
      currentUser: () => ({ roles: ["editor"] }),
      userRoles: (user) => (user as { roles: string[] }).roles,
    });
    const guard = rolesGuard(["|", "admin", "editor"], configuration);
    await expect(guard(emptyContext)).resolves.toBe(true);
  });

  it("supports nested expressions — admin OR (editor AND publisher)", async () => {
    const requiredRoles = ["|", "admin", "&", "editor", "publisher"];
    const editorOnly = rolesGuard(
      requiredRoles,
      makeAuthConfig({
        currentUser: () => ({ roles: ["editor"] }),
        userRoles: (user) => (user as { roles: string[] }).roles,
      }),
    );
    await expect(editorOnly(emptyContext)).resolves.toEqual({ deny: true });

    const editorAndPublisher = rolesGuard(
      requiredRoles,
      makeAuthConfig({
        currentUser: () => ({ roles: ["editor", "publisher"] }),
        userRoles: (user) => (user as { roles: string[] }).roles,
      }),
    );
    await expect(editorAndPublisher(emptyContext)).resolves.toBe(true);
  });

  it("awaits an async currentUser + async userRoles", async () => {
    const guard = rolesGuard(
      ["admin"],
      makeAuthConfig({
        currentUser: async () => ({ id: 1 }),
        userRoles: async () => ["admin"],
      }),
    );
    await expect(guard(emptyContext)).resolves.toBe(true);
  });

  it("denies when async userRoles resolves without the required role", async () => {
    const guard = rolesGuard(
      ["admin"],
      makeAuthConfig({
        currentUser: async () => ({ id: 1 }),
        userRoles: async () => ["viewer"],
      }),
    );
    await expect(guard(emptyContext)).resolves.toEqual({ deny: true });
  });
});
