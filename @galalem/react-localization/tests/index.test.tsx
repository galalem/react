// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { __, T, setTranslations } from "../src/index";

beforeEach(() => setTranslations({})); // reset the global dict between tests

describe("__", () => {
  it("returns the key unchanged when no translation exists", () => {
    expect(__("hello world")).toBe("hello world");
  });
  it("returns the translation when the key exists", () => {
    setTranslations({ "hello world": "bonjour le monde" });
    expect(__("hello world")).toBe("bonjour le monde");
  });
  it("returns falsy string values verbatim (not the key)", () => {
    setTranslations({ zero: "0", empty: "" });
    expect(__("zero")).toBe("0");
    expect(__("empty")).toBe("");
  });
});

describe("<T>", () => {
  it("renders the key unchanged when no translation exists", () => {
    render(<T>hello world</T>);
    expect(screen.getByText("hello world")).toBeTruthy();
  });
  it("renders the translation when the key exists", () => {
    setTranslations({ "hello world": "hola mundo" });
    render(<T>hello world</T>);
    expect(screen.getByText("hola mundo")).toBeTruthy();
  });
});

// --- useLocale + auto-subscribe ---------------------------------------------

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

describe("useLocale + <T> auto-subscribe", () => {
  it("useLocale() returns undefined before any locale is active", async () => {
    const m = await fresh();
    function Show() {
      const l = m.useLocale();
      return <span>{l ?? "none"}</span>;
    }
    render(<Show />);
    expect(screen.getByText("none")).toBeTruthy();
  });

  it("<T> re-renders after setLocale swaps the dictionary", async () => {
    const m = await fresh();
    m.init({ en: { hi: "Hi" }, es: { hi: "Hola" } });
    await m.setLocale("en");

    render(createElement(m.T, null, "hi"));
    expect(screen.getByText("Hi")).toBeTruthy();

    await act(async () => {
      await m.setLocale("es");
    });
    expect(screen.getByText("Hola")).toBeTruthy();
  });

  it("useLocale() alongside __() triggers a re-render on setLocale", async () => {
    const m = await fresh();
    m.init({ en: { hi: "Hi" }, es: { hi: "Hola" } });
    await m.setLocale("en");

    function Greet() {
      m.useLocale();
      return <span>{m.__("hi")}</span>;
    }

    render(<Greet />);
    expect(screen.getByText("Hi")).toBeTruthy();

    await act(async () => {
      await m.setLocale("es");
    });
    expect(screen.getByText("Hola")).toBeTruthy();
  });
});
