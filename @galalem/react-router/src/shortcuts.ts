import type {
  Guard,
  LayoutComponent,
  RouteEntry,
  RouteGroup,
} from "./types";

type Children = RouteEntry | RouteEntry[];

function toArray(children: Children): RouteEntry[] {
  return Array.isArray(children) ? children : [children];
}

export function prefix(path: string, children: Children): RouteGroup {
  return { prefix: path, children: toArray(children) };
}

export function auth(children: Children): RouteGroup {
  return { auth: true, children: toArray(children) };
}

export function roles(list: string[], children: Children): RouteGroup {
  return { roles: list, children: toArray(children) };
}

export function layout(component: LayoutComponent, children: Children): RouteGroup {
  return { layout: component, children: toArray(children) };
}

export function guards(list: Guard[], children: Children): RouteGroup {
  return { guards: list, children: toArray(children) };
}
