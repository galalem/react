import type { ComponentType, ReactNode } from "react";

export type RouteParams = Record<string, string>;

export type RouteContext = {
  path: string;
  search: string;
  hash: string;
  params: RouteParams;
  user: unknown;
  /**
   * Optional payload attached to this navigation via `router.push(to, data)`,
   * `router.replace(to, data)`, or `<Link data={...} />`. `undefined` on
   * URL-driven navigation (initial load, refresh, direct address bar entry).
   * Prefer stateless routes; use this as an escape hatch only.
   */
  data: unknown;
};

export type MetaMap = Record<string, string>;

/**
 * Route metadata. Static object, or a function of the route context.
 *
 * The `title` key is special: it sets `document.title`. All other keys become
 * `<meta>` elements — keys containing `:` are emitted as `property="..."`
 * (Open Graph / Twitter), others as `name="..."`.
 */
export type MetaConfig = MetaMap | ((context: RouteContext) => MetaMap);

export type HttpError =
  | 400
  | 401
  | 402
  | 403
  | 404
  | 405
  | 408
  | 409
  | 410
  | 418
  | 422
  | 429
  | 500
  | 501
  | 502
  | 503
  | 504;

export type GuardResult =
  | true
  | { redirect: string }
  | { deny: true }
  | { error: HttpError };

export type Guard = (ctx: RouteContext) => Promise<GuardResult> | GuardResult;

export type LayoutComponent = ComponentType<{ children: ReactNode }>;

export type Route = {
  path: string;
  component: ComponentType;
  layout?: LayoutComponent;
  auth?: boolean;
  roles?: string[];
  guards?: Guard[];
  meta?: MetaConfig;
};

export type RouteGroup = {
  prefix?: string;
  layout?: LayoutComponent;
  auth?: boolean;
  roles?: string[];
  guards?: Guard[];
  children: RouteEntry[];
};

export type RouteEntry = Route | RouteGroup;

export type AuthConfig = {
  currentUser: () => unknown;
  userRoles?: (user: unknown) => string[];
  loginPath: string;
  /**
   * Query-param name used to preserve the intended URL when auth redirects a user
   * to the login page. Defaults to `"redirectUrl"`. Set to `false` to disable
   * the append entirely.
   */
  redirectParam?: string | false;
};

export type ErrorComponentMap = Partial<Record<HttpError, ComponentType>>;

export type CreateRouterOptions = {
  routes: RouteEntry[];
  auth?: AuthConfig;
  errors?: ErrorComponentMap;
};

export type RouterState = {
  path: string;
  params: RouteParams;
  search: string;
  query: Record<string, string>;
  hash: string;
  component: ComponentType | null;
  layouts: LayoutComponent[];
  meta: MetaMap;
  data: unknown;
  error: HttpError | null;
};

export type RouterStateListener = (state: RouterState) => void;

export type Router = {
  push: (to: string, data?: unknown) => void;
  replace: (to: string, data?: unknown) => void;
  back: () => void;
  forward: () => void;
  reload: () => void;
  /**
   * Merge extra metadata into the current route's meta (`document.title` and
   * `<meta>` tags update accordingly). Naturally cleared on the next navigation.
   */
  setMeta: (meta: MetaMap) => void;
  /**
   * Reads the `redirectUrl` query param from the current URL (or the auth
   * config's `redirectParam`) and navigates there via `replace`. Falls back to
   * the supplied path when no param is present or when the encoded target
   * would leave the origin.
   */
  redirect: (fallback?: string) => void;
  getState: () => RouterState;
  subscribe: (listener: RouterStateListener) => () => void;
  errors: ErrorComponentMap;
  destroy: () => void;
  /**
   * Resolves once the initial navigation has settled — a component has matched,
   * an error has been produced, or a redirect chain has terminated. Await this
   * before mounting to avoid a null-first-render flash.
   */
  ready: Promise<void>;
};

export type MatchResult = { params: RouteParams } | null;

// Internal: a route after group flattening — carries inherited config
// and the ordered stack of layouts to apply.
export type FlatRoute = {
  path: string;
  component: ComponentType;
  layouts: LayoutComponent[];
  guards: Guard[];
  auth: boolean;
  roles: string[];
  meta: MetaConfig | undefined;
};
