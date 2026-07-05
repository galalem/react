import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type ComponentType,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import type {
  ErrorComponentMap,
  HttpError,
  MetaMap,
  RouteParams,
  Router,
  RouterState,
} from "./types";

const METADATA_ATTRIBUTE = "data-galalem-router";

function syncMetaToDom(meta: MetaMap, initialTitle: string): void {
  // Wipe previous router-owned meta tags.
  const previous = document.head.querySelectorAll(`meta[${METADATA_ATTRIBUTE}]`);
  for (const element of previous) element.remove();

  // Title: use meta.title if set, otherwise restore the initial one.
  document.title = "title" in meta ? meta.title : initialTitle;

  // Emit fresh meta tags for the rest of the keys.
  for (const [key, value] of Object.entries(meta)) {
    if (key === "title") continue;
    const attribute = key.includes(":") ? "property" : "name";
    const element = document.createElement("meta");
    element.setAttribute(attribute, key);
    element.setAttribute("content", value);
    element.setAttribute(METADATA_ATTRIBUTE, "");
    document.head.appendChild(element);
  }
}

const RouterContext = createContext<Router | null>(null);

// Default error components — plain heading with the status. Users override via the errors map.

function DefaultForbidden(): ReactElement {
  return createElement("div", null, createElement("h1", null, "403 — Forbidden"));
}

function DefaultNotFound(): ReactElement {
  return createElement("div", null, createElement("h1", null, "404 — Not Found"));
}

function GenericError({ code }: { code: HttpError }): ReactElement {
  return createElement("div", null, createElement("h1", null, `${code} — Error`));
}

function resolveErrorComponent(
  code: HttpError,
  userMap: ErrorComponentMap,
): ComponentType {
  const userComponent = userMap[code];
  if (userComponent) return userComponent;
  if (code === 403) return DefaultForbidden;
  if (code === 404) return DefaultNotFound;
  return () => createElement(GenericError, { code });
}

function renderWithLayouts(state: RouterState): ReactNode {
  if (state.component === null) return null;
  let node: ReactNode = createElement(state.component);
  for (let index = state.layouts.length - 1; index >= 0; index--) {
    const Layout = state.layouts[index];
    node = createElement(Layout, null, node);
  }
  return node;
}

export function RouterProvider({ router }: { router: Router }): ReactElement {
  const subscribe = useCallback(
    (onChange: () => void) => router.subscribe(() => onChange()),
    [router],
  );
  const state = useSyncExternalStore(subscribe, router.getState);

  const initialTitleRef = useRef<string>("");
  useEffect(() => {
    initialTitleRef.current = document.title;
  }, []);
  useEffect(() => {
    syncMetaToDom(state.meta, initialTitleRef.current);
  }, [state.meta]);

  const content = useMemo<ReactNode>(() => {
    if (state.error !== null) {
      const ErrorComponent = resolveErrorComponent(state.error, router.errors);
      return createElement(ErrorComponent);
    }
    return renderWithLayouts(state);
  }, [state, router.errors]);

  return createElement(RouterContext.Provider, { value: router }, content);
}

export function useRouter(): Router & {
  path: string;
  params: RouteParams;
  search: string;
  query: Record<string, string>;
  hash: string;
  data: unknown;
} {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error(
      "useRouter must be used inside a <RouterProvider>.",
    );
  }
  const subscribe = useCallback(
    (onChange: () => void) => router.subscribe(() => onChange()),
    [router],
  );
  const state = useSyncExternalStore(subscribe, router.getState);

  return {
    ...router,
    path: state.path,
    params: state.params,
    search: state.search,
    query: state.query,
    hash: state.hash,
    data: state.data,
  };
}

function shouldInterceptClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  return true;
}

type LinkProps = {
  to: string;
  children?: ReactNode;
  replace?: boolean;
  data?: unknown;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">;

export function Link({
  to,
  children,
  replace = false,
  data,
  onClick,
  ...rest
}: LinkProps): ReactElement {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error("<Link> must be used inside a <RouterProvider>.");
  }

  const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (onClick) onClick(event);
    if (!shouldInterceptClick(event)) return;
    event.preventDefault();
    if (replace) router.replace(to, data);
    else router.push(to, data);
  };

  return createElement("a", { ...rest, href: to, onClick: handleClick }, children);
}

type NavLinkRenderProps = { isActive: boolean };
type NavLinkClassName =
  | string
  | ((state: NavLinkRenderProps) => string);
type NavLinkChildren =
  | ReactNode
  | ((state: NavLinkRenderProps) => ReactNode);

type NavLinkProps = Omit<LinkProps, "children" | "className"> & {
  activeClassName?: string;
  exact?: boolean;
  className?: NavLinkClassName;
  children?: NavLinkChildren;
};

function isActivePath(currentPath: string, to: string, exact: boolean): boolean {
  if (exact) return currentPath === to;
  if (currentPath === to) return true;
  return currentPath.startsWith(to.endsWith("/") ? to : to + "/");
}

export function NavLink({
  to,
  children,
  activeClassName,
  className,
  exact = true,
  replace = false,
  data,
  onClick,
  ...rest
}: NavLinkProps): ReactElement {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error("<NavLink> must be used inside a <RouterProvider>.");
  }
  const subscribe = useCallback(
    (onChange: () => void) => router.subscribe(() => onChange()),
    [router],
  );
  const state = useSyncExternalStore(subscribe, router.getState);
  const isActive = isActivePath(state.path, to, exact);

  const resolvedClassName = useMemo(() => {
    const base = typeof className === "function" ? className({ isActive }) : className;
    if (!isActive) return base;
    if (!activeClassName) return base;
    return base ? `${base} ${activeClassName}` : activeClassName;
  }, [className, activeClassName, isActive]);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (onClick) onClick(event);
    if (!shouldInterceptClick(event)) return;
    event.preventDefault();
    if (replace) router.replace(to, data);
    else router.push(to, data);
  };

  const resolvedChildren =
    typeof children === "function" ? children({ isActive }) : children;

  return createElement(
    "a",
    {
      ...rest,
      href: to,
      onClick: handleClick,
      className: resolvedClassName,
      "aria-current": isActive ? "page" : undefined,
    },
    resolvedChildren,
  );
}
