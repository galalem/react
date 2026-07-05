export type HistoryListener = (path: string) => void;

export type HistoryApi = {
  current: () => string;
  currentSearch: () => string;
  currentHash: () => string;
  currentData: () => unknown;
  push: (path: string, data?: unknown) => void;
  replace: (path: string, data?: unknown) => void;
  back: () => void;
  forward: () => void;
  subscribe: (listener: HistoryListener) => () => void;
  destroy: () => void;
};

const DATA_NAMESPACE = "__galalem_router_data";

function readData(): unknown {
  const state = window.history.state as
    | { [DATA_NAMESPACE]?: unknown }
    | null
    | undefined;
  return state && DATA_NAMESPACE in state ? state[DATA_NAMESPACE] : undefined;
}

export function createHistory(): HistoryApi {
  const listeners = new Set<HistoryListener>();

  const notify = (): void => {
    const currentPath = window.location.pathname;
    for (const listener of listeners) listener(currentPath);
  };

  const onPopState = (): void => notify();
  window.addEventListener("popstate", onPopState);

  return {
    current: () => window.location.pathname,
    currentSearch: () => window.location.search,
    currentHash: () => window.location.hash,
    currentData: () => readData(),

    push: (path, data) => {
      const state = data === undefined ? {} : { [DATA_NAMESPACE]: data };
      window.history.pushState(state, "", path);
      notify();
    },

    replace: (path, data) => {
      const state = data === undefined ? {} : { [DATA_NAMESPACE]: data };
      window.history.replaceState(state, "", path);
      notify();
    },

    back: () => {
      window.history.back();
    },

    forward: () => {
      window.history.forward();
    },

    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    destroy: () => {
      window.removeEventListener("popstate", onPopState);
      listeners.clear();
    },
  };
}
