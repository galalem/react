import { authGuard, rolesGuard, runGuards } from "./guards";
import { createHistory } from "./history";
import { matchPath } from "./matcher";
import { flattenRoutes } from "./tree";
import type {
  AuthConfig,
  CreateRouterOptions,
  FlatRoute,
  Guard,
  MetaConfig,
  MetaMap,
  RouteContext,
  RouteParams,
  Router,
  RouterState,
  RouterStateListener,
} from "./types";

function resolveMeta(
  config: MetaConfig | undefined,
  context: RouteContext,
): MetaMap {
  if (!config) return {};
  return typeof config === "function" ? config(context) : config;
}

function compileGuards(
  route: FlatRoute,
  authConfiguration: AuthConfig | undefined,
): Guard[] {
  const guards: Guard[] = [];

  if (route.auth) {
    if (!authConfiguration) {
      throw new Error(
        `Route "${route.path}" requires auth, but no auth config was provided to createRouter.`,
      );
    }
    guards.push(authGuard(authConfiguration));
  }

  if (route.roles.length > 0) {
    if (!authConfiguration) {
      throw new Error(
        `Route "${route.path}" requires roles, but no auth config was provided to createRouter.`,
      );
    }
    guards.push(rolesGuard(route.roles, authConfiguration));
  }

  guards.push(...route.guards);
  return guards;
}

function parseQuery(search: string): Record<string, string> {
  const query: Record<string, string> = {};
  const parameters = new URLSearchParams(search);
  for (const [key, value] of parameters) query[key] = value;
  return query;
}

const DEFAULT_REDIRECT_PARAM = "redirectUrl";

// Same-origin absolute paths only. Protects against open-redirect attacks
// via `?redirectUrl=//evil.com` or `?redirectUrl=javascript:...`.
function isSafeRedirectPath(candidate: unknown): candidate is string {
  return (
    typeof candidate === "string" &&
    candidate.startsWith("/") &&
    !candidate.startsWith("//")
  );
}

export function createRouter(options: CreateRouterOptions): Router {
  const flatRoutes = flattenRoutes(options.routes);
  const guardsByRoute = new Map<FlatRoute, Guard[]>();
  for (const route of flatRoutes) {
    guardsByRoute.set(route, compileGuards(route, options.auth));
  }

  const history = createHistory();
  const listeners = new Set<RouterStateListener>();

  let navigationGeneration = 0;
  let state: RouterState = {
    path: history.current(),
    params: {},
    search: history.currentSearch(),
    query: parseQuery(history.currentSearch()),
    hash: history.currentHash(),
    component: null,
    layouts: [],
    meta: {},
    data: history.currentData(),
    error: null,
  };

  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  const setState = (next: RouterState): void => {
    state = next;
    for (const listener of listeners) listener(state);
    if (state.component !== null || state.error !== null) {
      resolveReady();
    }
  };

  const findMatch = (
    path: string,
  ): { route: FlatRoute; params: RouteParams } | null => {
    for (const route of flatRoutes) {
      const result = matchPath(route.path, path);
      if (result) return { route, params: result.params };
    }
    return null;
  };

  const navigate = async (path: string): Promise<void> => {
    const generation = ++navigationGeneration;
    const search = history.currentSearch();
    const query = parseQuery(search);
    const hash = history.currentHash();
    const data = history.currentData();
    const match = findMatch(path);

    if (!match) {
      setState({
        path,
        params: {},
        search,
        query,
        hash,
        component: null,
        layouts: [],
        meta: {},
        data,
        error: 404,
      });
      return;
    }

    const guards = guardsByRoute.get(match.route)!;
    const context = {
      path,
      search,
      hash,
      params: match.params,
      user: options.auth?.currentUser() ?? null,
      data,
    };

    const result = await runGuards(guards, context);
    if (generation !== navigationGeneration) return;

    if (result === true) {
      setState({
        path,
        params: match.params,
        search,
        query,
        hash,
        component: match.route.component,
        layouts: match.route.layouts,
        meta: resolveMeta(match.route.meta, context),
        data,
        error: null,
      });
      return;
    }

    if ("redirect" in result) {
      history.replace(result.redirect);
      return;
    }

    if ("deny" in result) {
      setState({
        path,
        params: match.params,
        search,
        query,
        hash,
        component: null,
        layouts: [],
        meta: {},
        data,
        error: 403,
      });
      return;
    }

    setState({
      path,
      params: match.params,
      search,
      query,
      hash,
      component: null,
      layouts: [],
      meta: {},
      data,
      error: result.error,
    });
  };

  const historyUnsubscribe = history.subscribe((path) => {
    void navigate(path);
  });

  void navigate(history.current());

  const redirectParameterName =
    options.auth?.redirectParam === false
      ? null
      : options.auth?.redirectParam ?? DEFAULT_REDIRECT_PARAM;

  return {
    push: (to, data) => history.push(to, data),
    replace: (to, data) => history.replace(to, data),
    back: () => history.back(),
    forward: () => history.forward(),
    reload: () => {
      void navigate(history.current());
    },
    setMeta: (meta) => {
      setState({ ...state, meta: { ...state.meta, ...meta } });
    },
    redirect: (fallback = "/") => {
      const candidate = redirectParameterName
        ? state.query[redirectParameterName]
        : undefined;
      const target = isSafeRedirectPath(candidate) ? candidate : fallback;
      history.replace(target);
    },
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    errors: options.errors ?? {},
    destroy: () => {
      historyUnsubscribe();
      history.destroy();
      listeners.clear();
    },
    ready,
  };
}
