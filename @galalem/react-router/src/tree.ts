import type {
  FlatRoute,
  Guard,
  LayoutComponent,
  Route,
  RouteEntry,
  RouteGroup,
} from "./types";

type InheritedContext = {
  prefix: string;
  layouts: LayoutComponent[];
  guards: Guard[];
  auth: boolean;
  roles: string[];
};

const EMPTY_CONTEXT: InheritedContext = {
  prefix: "",
  layouts: [],
  guards: [],
  auth: false,
  roles: [],
};

function isRouteGroup(entry: RouteEntry): entry is RouteGroup {
  return "children" in entry;
}

function joinPath(parent: string, child: string): string {
  const parentTrimmed = parent.endsWith("/") ? parent.slice(0, -1) : parent;
  const childWithLeadingSlash = child.startsWith("/") ? child : "/" + child;
  const combined = parentTrimmed + childWithLeadingSlash;

  if (combined.includes("//")) {
    throw new Error(
      `Invalid route path "${combined}" — contains "//". Check the prefix and child path.`,
    );
  }

  if (combined.length > 1 && combined.endsWith("/")) {
    return combined.slice(0, -1);
  }
  return combined || "/";
}

function mergeRoles(parent: string[], child: string[]): string[] {
  if (child.length === 0) return parent;
  if (parent.length === 0) return child;
  // Concatenate: the implicit AND at the top level of a role expression means
  // parent's constraints stay in effect and the child's are added.
  return [...parent, ...child];
}

function extendContext(
  context: InheritedContext,
  group: RouteGroup,
): InheritedContext {
  return {
    prefix: joinPath(context.prefix, group.prefix ?? ""),
    layouts: group.layout ? [...context.layouts, group.layout] : context.layouts,
    guards: group.guards ? [...context.guards, ...group.guards] : context.guards,
    auth: context.auth || (group.auth ?? false),
    roles: mergeRoles(context.roles, group.roles ?? []),
  };
}

function flattenRoute(route: Route, context: InheritedContext): FlatRoute {
  return {
    path: joinPath(context.prefix, route.path),
    component: route.component,
    layouts: route.layout ? [...context.layouts, route.layout] : context.layouts,
    guards: route.guards ? [...context.guards, ...route.guards] : context.guards,
    auth: context.auth || (route.auth ?? false),
    roles: mergeRoles(context.roles, route.roles ?? []),
    meta: route.meta,
  };
}

function walk(
  entries: RouteEntry[],
  context: InheritedContext,
  output: FlatRoute[],
): void {
  for (const entry of entries) {
    if (isRouteGroup(entry)) {
      walk(entry.children, extendContext(context, entry), output);
    } else {
      output.push(flattenRoute(entry, context));
    }
  }
}

export function flattenRoutes(entries: RouteEntry[]): FlatRoute[] {
  const output: FlatRoute[] = [];
  walk(entries, EMPTY_CONTEXT, output);
  return output;
}
