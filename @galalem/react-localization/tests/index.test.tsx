// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { createElement } from "react";

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

/** Re-import the module fresh so its singleton state is isolated per test. */
async function fresh() {
  vi.resetModules();
  vi.stubGlobal("localStorage", createStorage());
  // Non-matching browser languages so init() doesn't auto-select — keeps
  // assertions deterministic.
  vi.stubGlobal("navigator", { language: "zz", languages: ["zz"] });
  return await import("../src/index");
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useLocale().__", () => {
  it("returns the key unchanged when no translation exists", async () => {
    const m = await fresh();
    m.init({ en: { other: "value" } });
    const { result } = renderHook(() => m.useLocale());
    await act(async () => {
      await result.current.setLocale("en");
    });
    expect(result.current.__("hello world")).toBe("hello world");
  });

  it("returns the translation when the key exists", async () => {
    const m = await fresh();
    m.init({ fr: { "hello world": "bonjour le monde" } });
    const { result } = renderHook(() => m.useLocale());
    await act(async () => {
      await result.current.setLocale("fr");
    });
    expect(result.current.__("hello world")).toBe("bonjour le monde");
  });

  it("returns falsy string values verbatim (not the key)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const m = await fresh();
    m.init({ en: { zero: "0", empty: "" } });
    const { result } = renderHook(() => m.useLocale());
    await act(async () => {
      await result.current.setLocale("en");
    });
    expect(result.current.__("zero")).toBe("0");
    expect(result.current.__("empty")).toBe("");
    warn.mockRestore();
  });
});

describe("<T>", () => {
  it("renders the key unchanged when no translation exists", async () => {
    const m = await fresh();
    m.init({ en: {} });
    const { result } = renderHook(() => m.useLocale());
    await act(async () => {
      await result.current.setLocale("en");
    });
    render(createElement(m.T, null, "hello world"));
    expect(screen.getByText("hello world")).toBeTruthy();
  });

  it("renders the translation when the key exists", async () => {
    const m = await fresh();
    m.init({ es: { "hello world": "hola mundo" } });
    const { result } = renderHook(() => m.useLocale());
    await act(async () => {
      await result.current.setLocale("es");
    });
    render(createElement(m.T, null, "hello world"));
    expect(screen.getByText("hola mundo")).toBeTruthy();
  });
});

// --- useLocale + auto-subscribe ---------------------------------------------

describe("useLocale + <T> auto-subscribe", () => {
  it("useLocale().locale is undefined before any locale is active", async () => {
    const m = await fresh();
    function Show() {
      const { locale } = m.useLocale();
      return <span>{locale ?? "none"}</span>;
    }
    render(<Show />);
    expect(screen.getByText("none")).toBeTruthy();
  });

  it("<T> re-renders after setLocale swaps the dictionary", async () => {
    const m = await fresh();
    m.init({ en: { hi: "Hi" }, es: { hi: "Hola" } });
    const { result } = renderHook(() => m.useLocale());
    await act(async () => {
      await result.current.setLocale("en");
    });

    render(createElement(m.T, null, "hi"));
    expect(screen.getByText("Hi")).toBeTruthy();

    await act(async () => {
      await result.current.setLocale("es");
    });
    expect(screen.getByText("Hola")).toBeTruthy();
  });

  it("useLocale() + __() triggers a re-render on setLocale", async () => {
    const m = await fresh();
    m.init({ en: { hi: "Hi" }, es: { hi: "Hola" } });

    function Greet() {
      const { __ } = m.useLocale();
      return <span>{__("hi")}</span>;
    }

    const { result } = renderHook(() => m.useLocale());
    await act(async () => {
      await result.current.setLocale("en");
    });

    render(<Greet />);
    expect(screen.getByText("Hi")).toBeTruthy();

    await act(async () => {
      await result.current.setLocale("es");
    });
    expect(screen.getByText("Hola")).toBeTruthy();
  });
});
