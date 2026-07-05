import { describe, expect, it } from "vitest";
import type { ComponentType, ReactNode } from "react";
import type { Guard, LayoutComponent } from "../src/types";
import { flattenRoutes } from "../src/tree";

const Home: ComponentType = () => null;
const Users: ComponentType = () => null;
const UserDetail: ComponentType = () => null;
const Settings: ComponentType = () => null;

const AdminShell: LayoutComponent = ({ children }: { children: ReactNode }) =>
  children as ReactNode as null;
const InnerShell: LayoutComponent = ({ children }: { children: ReactNode }) =>
  children as ReactNode as null;

describe("flattenRoutes", () => {
  describe("flat input", () => {
    it("returns leaves untouched with empty inherited fields", () => {
      const result = flattenRoutes([
        { path: "/", component: Home },
        { path: "/users", component: Users },
      ]);
      expect(result).toEqual([
        {
          path: "/",
          component: Home,
          layouts: [],
          guards: [],
          auth: false,
          roles: [],
        },
        {
          path: "/users",
          component: Users,
          layouts: [],
          guards: [],
          auth: false,
          roles: [],
        },
      ]);
    });

    it("carries own auth, roles, guards, and layout on a solo route", () => {
      const isLoggedIn: Guard = () => true;
      const result = flattenRoutes([
        {
          path: "/dashboard",
          component: Home,
          auth: true,
          roles: ["viewer"],
          guards: [isLoggedIn],
          layout: AdminShell,
        },
      ]);
      expect(result).toEqual([
        {
          path: "/dashboard",
          component: Home,
          layouts: [AdminShell],
          guards: [isLoggedIn],
          auth: true,
          roles: ["viewer"],
        },
      ]);
    });
  });

  describe("prefix concatenation", () => {
    it("prepends a group prefix to child paths", () => {
      const result = flattenRoutes([
        {
          prefix: "/admin",
          children: [{ path: "/users", component: Users }],
        },
      ]);
      expect(result[0].path).toBe("/admin/users");
    });

    it("concatenates nested prefixes", () => {
      const result = flattenRoutes([
        {
          prefix: "/admin",
          children: [
            {
              prefix: "/users",
              children: [{ path: "/:id", component: UserDetail }],
            },
          ],
        },
      ]);
      expect(result[0].path).toBe("/admin/users/:id");
    });

    it("maps a child path of '/' to the group prefix (index route)", () => {
      const result = flattenRoutes([
        {
          prefix: "/admin",
          children: [{ path: "/", component: Home }],
        },
      ]);
      expect(result[0].path).toBe("/admin");
    });

    it("normalizes a trailing slash on the group prefix", () => {
      const result = flattenRoutes([
        {
          prefix: "/admin/",
          children: [{ path: "/users", component: Users }],
        },
      ]);
      expect(result[0].path).toBe("/admin/users");
    });

    it("adds a leading slash if the child path lacks one", () => {
      const result = flattenRoutes([
        {
          prefix: "/admin",
          children: [{ path: "users", component: Users }],
        },
      ]);
      expect(result[0].path).toBe("/admin/users");
    });

    it("throws on paths that would produce '//'", () => {
      expect(() =>
        flattenRoutes([
          {
            prefix: "/admin",
            children: [{ path: "//users", component: Users }],
          },
        ]),
      ).toThrow(/\/\//);
    });
  });

  describe("inheritance", () => {
    it("propagates auth: true from a group to children", () => {
      const result = flattenRoutes([
        {
          auth: true,
          children: [{ path: "/dashboard", component: Home }],
        },
      ]);
      expect(result[0].auth).toBe(true);
    });

    it("cannot be turned off by a child (no opt-out)", () => {
      const result = flattenRoutes([
        {
          auth: true,
          children: [
            { path: "/dashboard", component: Home, auth: false },
          ],
        },
      ]);
      expect(result[0].auth).toBe(true);
    });

    it("merges roles additively", () => {
      const result = flattenRoutes([
        {
          roles: ["admin"],
          children: [
            {
              path: "/",
              component: Home,
              roles: ["editor"],
            },
          ],
        },
      ]);
      expect(result[0].roles).toEqual(["admin", "editor"]);
    });

    it("preserves role-expression operators when merging", () => {
      const result = flattenRoutes([
        {
          roles: ["admin"],
          children: [
            {
              path: "/",
              component: Home,
              roles: ["|", "editor", "viewer"],
            },
          ],
        },
      ]);
      // Concatenation yields: admin AND (editor OR viewer)
      expect(result[0].roles).toEqual(["admin", "|", "editor", "viewer"]);
    });

    it("stacks layouts outermost-first", () => {
      const result = flattenRoutes([
        {
          layout: AdminShell,
          children: [
            {
              layout: InnerShell,
              children: [{ path: "/users", component: Users }],
            },
          ],
        },
      ]);
      expect(result[0].layouts).toEqual([AdminShell, InnerShell]);
    });

    it("appends a route's own layout after inherited layouts", () => {
      const result = flattenRoutes([
        {
          layout: AdminShell,
          children: [
            { path: "/users", component: Users, layout: InnerShell },
          ],
        },
      ]);
      expect(result[0].layouts).toEqual([AdminShell, InnerShell]);
    });

    it("runs parent guards before child guards", () => {
      const parent: Guard = () => true;
      const child: Guard = () => true;
      const result = flattenRoutes([
        {
          guards: [parent],
          children: [
            { path: "/", component: Home, guards: [child] },
          ],
        },
      ]);
      expect(result[0].guards).toEqual([parent, child]);
    });
  });

  describe("combined groups", () => {
    it("applies prefix + layout + auth + roles to all children of a group", () => {
      const result = flattenRoutes([
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
      ]);

      expect(result).toEqual([
        {
          path: "/admin/users",
          component: Users,
          layouts: [AdminShell],
          guards: [],
          auth: true,
          roles: ["admin"],
        },
        {
          path: "/admin/settings",
          component: Settings,
          layouts: [AdminShell],
          guards: [],
          auth: true,
          roles: ["admin"],
        },
      ]);
    });

    it("keeps sibling routes independent", () => {
      const result = flattenRoutes([
        { path: "/", component: Home },
        {
          prefix: "/admin",
          auth: true,
          children: [{ path: "/users", component: Users }],
        },
      ]);

      expect(result[0]).toMatchObject({ path: "/", auth: false });
      expect(result[1]).toMatchObject({ path: "/admin/users", auth: true });
    });
  });
});
