import { describe, expect, it } from "vitest";
import type { ComponentType, ReactNode } from "react";
import type { Guard, LayoutComponent } from "../src/types";
import { auth, guards, layout, prefix, roles } from "../src/shortcuts";

const Home: ComponentType = () => null;
const Users: ComponentType = () => null;
const AdminShell: LayoutComponent = ({ children }: { children: ReactNode }) =>
  children as ReactNode as null;

describe("shortcuts", () => {
  it("prefix wraps children with a prefix", () => {
    const group = prefix("/admin", [{ path: "/users", component: Users }]);
    expect(group).toEqual({
      prefix: "/admin",
      children: [{ path: "/users", component: Users }],
    });
  });

  it("auth wraps children with auth: true", () => {
    const group = auth([{ path: "/", component: Home }]);
    expect(group).toEqual({
      auth: true,
      children: [{ path: "/", component: Home }],
    });
  });

  it("roles wraps children with a roles list", () => {
    const group = roles(["admin", "owner"], [{ path: "/", component: Home }]);
    expect(group).toEqual({
      roles: ["admin", "owner"],
      children: [{ path: "/", component: Home }],
    });
  });

  it("layout wraps children with a layout component", () => {
    const group = layout(AdminShell, [{ path: "/", component: Home }]);
    expect(group).toEqual({
      layout: AdminShell,
      children: [{ path: "/", component: Home }],
    });
  });

  it("guards wraps children with a guard list", () => {
    const featureFlag: Guard = () => true;
    const group = guards([featureFlag], [{ path: "/", component: Home }]);
    expect(group).toEqual({
      guards: [featureFlag],
      children: [{ path: "/", component: Home }],
    });
  });

  it("shortcuts compose — each nesting produces a group with a single field set", () => {
    const composed = prefix(
      "/admin",
      auth(roles(["admin"], layout(AdminShell, [{ path: "/users", component: Users }]))),
    );

    expect(composed).toEqual({
      prefix: "/admin",
      children: [
        {
          auth: true,
          children: [
            {
              roles: ["admin"],
              children: [
                {
                  layout: AdminShell,
                  children: [{ path: "/users", component: Users }],
                },
              ],
            },
          ],
        },
      ],
    });
  });
});
