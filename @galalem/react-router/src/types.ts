import type { ComponentType as ReactComponentType, ReactNode } from "react";

export type RouteParams = Record<string, string>;

export type RouteContext = {
  path: string;
  search: string;
  hash: string;
  params: RouteParams;
  user: unknown;
  /**
   * The route's static `data` (declared on the route and its groups) merged
   * with the payload attached to this navigation via `router.push(to, data)`,
   * `router.replace(to, data)`, or `<Link data={...} />`. Keys from the
   * navigation payload override static keys of the same name. Only the
   * static part is present on URL-driven navigation (initial load, refresh,
   * direct address bar entry); `undefined` when neither is set.
   */
  data: unknown;
};

export type MetaMap = Record<string, string>;

export type RouteData = Record<string, unknown>;

/**
 * Computes a route's data at navigation time. Runs only after every guard on
 * the route has passed, so a rejected user never triggers it. May be async —
 * the navigation settles once it resolves. The router does no caching: the
 * function runs on every navigation to the route.
 *
 * Receives the route context; its `data` holds what is known before
 * resolvers run (object-form data from the route and its groups, extended by
 * the navigation payload).
 */
export type RouteDataResolver = (
  context: RouteContext,
) => RouteData | Promise<RouteData>;

/**
 * Data declared on a route or route group: an object, or a function returning
 * one (sync or async). Groups cascade into their children (child keys override
 * parent keys), and a navigation payload passed to `push`, `replace`, or
 * `<Link data>` is shallow-merged on top.
 */
export type RouteDataConfig = RouteData | RouteDataResolver;

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

/**
 * Deferred loader for a code-split component. Return the component directly,
 * or a module whose `default` export is the component — so
 * `{ lazy: () => import("./page") }` works with a default-exported component,
 * and `{ lazy: () => import("./page").then((m) => m.Page) }` works with a
 * named export.
 *
 * The `{ lazy }` object shape is the runtime discriminator between a lazy
 * loader and a bare component: a plain function is a component, an object
 * with a `lazy` key is a loader.
 *
 * The loader fires on demand, only after every guard on the route has
 * resolved — so a route rejected by `auth` or `roles` never fetches its chunk.
 */
export type LazyLoader<T = {}> = {
  lazy: () => Promise<ReactComponentType<T> | { default: ReactComponentType<T> }>;
};

/**
 * A component or a lazy loader for one. Accepted anywhere the router takes a
 * component — routes and layouts — so either can be code-split without a
 * dedicated `lazyLayout` field: wrap the loader in a `{ lazy }` object.
 */
export type ComponentType<T = {}> = ReactComponentType<T> | LazyLoader<T>;

export type LayoutComponent = ComponentType<{ children: ReactNode }>;

export type Route = {
  path: string;
  component: ComponentType;
  layout?: LayoutComponent;
  auth?: boolean;
  roles?: string[];
  guards?: Guard[];
  meta?: MetaConfig;
  data?: RouteDataConfig;
};

export type RouteGroup = {
  prefix?: string;
  layout?: LayoutComponent;
  auth?: boolean;
  roles?: string[];
  guards?: Guard[];
  data?: RouteDataConfig;
  children: RouteEntry[];
};

export type RouteEntry = Route | RouteGroup;

export type AuthConfig = {
  currentUser: () => unknown | Promise<unknown>;
  userRoles?: (user: unknown) => string[] | Promise<string[]>;
  loginPath: string;
  /**
   * Query-param name used to preserve the intended URL when auth redirects a user
   * to the login page. Defaults to `"redirectUrl"`. Set to `false` to disable
   * the append entirely.
   */
  redirectParam?: string | false;
};

export type ErrorComponentMap = Partial<Record<HttpError, ReactComponentType>>;

export type CreateRouterOptions = {
  routes: RouteEntry[];
  auth?: AuthConfig;
  errors?: ErrorComponentMap;
  /**
   * Fallback rendered while a lazy route's chunk is loading. Defaults to
   * `null` (no fallback). The Suspense boundary sits inside the route's
   * layouts, so the app shell stays mounted while the page falls back.
   * Applies to every matched route, so any `React.lazy` component reached
   * through `component` is also covered — you don't need to add your own
   * `<Suspense>`.
   */
  suspenseFallback?: ReactNode;
};

export type RouterState = {
  path: string;
  params: RouteParams;
  search: string;
  query: Record<string, string>;
  hash: string;
  component: ReactComponentType | null;
  layouts: ReactComponentType<{ children: ReactNode }>[];
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
   * Shallow-merge extra keys into the current route's `data` (replacing it
   * when the current value isn't a plain object). In-memory only — not written
   * to `history.state`, and naturally cleared on the next navigation.
   */
  setData: (data: RouteData) => void;
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
  /**
   * Fallback rendered while a lazy route's chunk is loading. Configured via
   * `createRouter({ suspenseFallback })`. `null` when unset.
   */
  suspenseFallback: ReactNode;
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
// and the ordered stack of layouts to apply. Both component and layouts are
// already resolved to a plain React ComponentType at this point; any lazy
// loaders have been wrapped in `React.lazy` upstream.
export type FlatRoute = {
  path: string;
  component: ReactComponentType;
  layouts: ReactComponentType<{ children: ReactNode }>[];
  guards: Guard[];
  auth: boolean;
  roles: string[];
  meta: MetaConfig | undefined;
  // Data configs from the outermost group down to the route itself.
  data: RouteDataConfig[];
};
