// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

const STORAGE_KEY = "@galalem/react-localization:locale";

type Mod = typeof import("../src/index");

/** Re-import the module fresh so its singleton state is isolated per test. */
async function fresh(): Promise<Mod> {
  vi.resetModules();
  return import("../src/index");
}

/** Mount the hook once and hand back its `result` for imperative test flows. */
function mountHook(m: Mod) {
  return renderHook(() => m.useLocale()).result;
}

/** Replace navigator with a minimal stub for language detection. */
function setBrowserLanguages(...languages: string[]): void {
  vi.stubGlobal("navigator", { language: languages[0], languages });
}

/** A working in-memory localStorage (Node's experimental global one isn't usable here). */
function createStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, value),
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createStorage());
  // Default to a non-matching language so init() does not auto-select unless a
  // test opts in — keeps loader/caching assertions deterministic.
  setBrowserLanguages("zz");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("init guards", () => {
  it("throws for init() without the plugin", async () => {
    const m = await fresh();
    expect(() => m.init()).toThrow(/needs the Vite plugin/);
  });

  it("throws for init({ folder }) without the plugin", async () => {
    const m = await fresh();
    expect(() => m.init({ folder: "src/lang" })).toThrow(/needs the Vite plugin/);
  });
});

describe("load", () => {
  it("resolves inline translations", async () => {
    const m = await fresh();
    m.init({ en: { hello: "Hello" } });
    await expect(m.load("en")).resolves.toEqual({ hello: "Hello" });
  });

  it("calls a loader once and caches the result", async () => {
    const m = await fresh();
    const loader = vi.fn(async () => ({ default: { hi: "Hi" } }));
    m.init({ en: loader });

    await m.load("en");
    await m.load("en");

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("re-init clears the cache so new content is picked up", async () => {
    const m = await fresh();
    m.init({ en: async () => ({ default: { k: "v1" } }) });
    await m.load("en");

    m.init({ en: async () => ({ default: { k: "v2" } }) });
    await expect(m.load("en")).resolves.toEqual({ k: "v2" });
  });

  it("rejects for an unknown locale", async () => {
    const m = await fresh();
    m.init({ en: { a: "A" } });
    await expect(m.load("fr")).rejects.toThrow(/Unknown locale/);
  });

  it("warns about empty-string values", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const m = await fresh();
    m.init({ en: { good: "G", bad: "" } });

    await m.load("en");

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("empty-string"));
  });
});

describe("useLocale().getSupportedLocales", () => {
  it("lists registered locales in order", async () => {
    const m = await fresh();
    m.init({ en: { a: "A" }, fr: { b: "B" } });
    const result = mountHook(m);
    expect(result.current.getSupportedLocales()).toEqual(["en", "fr"]);
  });
});

describe("detectLocale", () => {
  it("matches an exact browser tag", async () => {
    const m = await fresh();
    m.init({ "en-US": { a: "A" }, fr: { b: "B" } });
    setBrowserLanguages("en-US");
    expect(m.detectLocale()).toBe("en-US");
  });

  it("falls back to the base language", async () => {
    const m = await fresh();
    m.init({ en: { a: "A" } });
    setBrowserLanguages("en-GB");
    expect(m.detectLocale()).toBe("en");
  });

  it("returns undefined when nothing matches", async () => {
    const m = await fresh();
    m.init({ en: { a: "A" } });
    setBrowserLanguages("de");
    expect(m.detectLocale()).toBeUndefined();
  });
});

describe("useLocale().setLocale", () => {
  it("switches and persists the choice", async () => {
    const m = await fresh();
    m.init({ en: { a: "A" }, fr: { b: "B" } });
    const result = mountHook(m);

    await act(async () => {
      await result.current.setLocale("fr");
    });

    expect(result.current.locale).toBe("fr");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("fr");
  });

  it("resolves once the locale is applied", async () => {
    const m = await fresh();
    m.init({ en: { hi: "Hi" }, es: { hi: "Hola" } });
    const result = mountHook(m);

    await act(async () => {
      await result.current.setLocale("es");
    });

    expect(result.current.__("hi")).toBe("Hola");
  });

  it("uses a custom storageKey from init settings", async () => {
    const m = await fresh();
    m.init({ en: { a: "A" }, fr: { b: "B" } }, { storageKey: "my-key" });
    const result = mountHook(m);

    await act(async () => {
      await result.current.setLocale("fr");
    });

    expect(localStorage.getItem("my-key")).toBe("fr");
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("warns and no-ops for an unknown locale", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const m = await fresh();
    m.init({ en: { a: "A" } });
    const result = mountHook(m);

    await act(async () => {
      await result.current.setLocale("zz");
    });

    expect(warn).toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("a newer setLocale wins over a slower stale one", async () => {
    const m = await fresh();

    // slow "fr" load — we control when it resolves
    let resolveSlow!: (v: { default: { greet: string } }) => void;
    const slow = () =>
      new Promise<{ default: { greet: string } }>((r) => {
        resolveSlow = r;
      });
    const fast = async () => ({ default: { greet: "Hallo" } });

    m.init({ fr: slow, de: fast });
    const result = mountHook(m);

    await act(async () => {
      const slowSwitch = result.current.setLocale("fr"); // kicks off slow load
      const fastSwitch = result.current.setLocale("de"); // wins the race
      await fastSwitch;
      resolveSlow({ default: { greet: "Salut" } }); // stale resolve
      await slowSwitch;
    });

    expect(result.current.locale).toBe("de");
    expect(result.current.__("greet")).toBe("Hallo"); // stale "fr" load did NOT clobber
  });

  it("logs and resolves cleanly when the loader rejects", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const m = await fresh();
    m.init({
      en: async () => {
        throw new Error("boom");
      },
    });
    const result = mountHook(m);

    await act(async () => {
      await expect(result.current.setLocale("en")).resolves.toBeUndefined();
    });

    expect(err).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load locale "en"'),
      expect.any(Error),
    );
    // currentLocale is set synchronously in applyLocale even though load rejected;
    // a fresh hook mount reads the module state as-is.
    expect(mountHook(m).current.locale).toBe("en");
  });

  it("re-init with a different storageKey uses the new key", async () => {
    const m = await fresh();
    m.init({ en: { a: "A" } }, { storageKey: "k1" });
    let result = mountHook(m);
    await act(async () => {
      await result.current.setLocale("en");
    });

    m.init({ en: { a: "A" }, fr: { b: "B" } }, { storageKey: "k2" });
    result = mountHook(m);
    await act(async () => {
      await result.current.setLocale("fr");
    });

    expect(localStorage.getItem("k2")).toBe("fr");
    // The previous key is not migrated or cleared — an explicit, testable contract.
    expect(localStorage.getItem("k1")).toBe("en");
  });
});

describe("auto-selection on init", () => {
  it("auto-detects the browser locale when nothing is stored", async () => {
    setBrowserLanguages("fr-FR");
    const m = await fresh();
    m.init({ en: { a: "A" }, fr: { b: "B" } });
    expect(mountHook(m).current.locale).toBe("fr");
  });

  it("prefers a stored preference over browser detection", async () => {
    localStorage.setItem(STORAGE_KEY, "fr");
    setBrowserLanguages("en-US");
    const m = await fresh();
    m.init({ en: { a: "A" }, fr: { b: "B" } });
    expect(mountHook(m).current.locale).toBe("fr");
  });

  it("ignores a stored preference that is no longer registered", async () => {
    localStorage.setItem(STORAGE_KEY, "xx");
    setBrowserLanguages("en-US");
    const m = await fresh();
    m.init({ en: { a: "A" } });
    expect(mountHook(m).current.locale).toBe("en"); // fell back to browser detection
  });
});
