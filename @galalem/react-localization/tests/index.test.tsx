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

// --- Interpolation ----------------------------------------------------------

/** init + activate a single locale, returning the hook result. */
async function withLocale(dict: Record<string, string | null>) {
  const m = await fresh();
  m.init({ en: dict });
  const { result } = renderHook(() => m.useLocale());
  await act(async () => {
    await result.current.setLocale("en");
  });
  return { m, result };
}

describe("interpolation", () => {
  it("substitutes placeholders in the translation", async () => {
    const { result } = await withLocale({ "Hello, {name}": "Hola, {name}" });
    expect(result.current.__("Hello, {name}", { name: "Ada" })).toBe("Hola, Ada");
  });

  it("substitutes repeated and multiple placeholders", async () => {
    const { result } = await withLocale({});
    expect(result.current.__("{a}-{b}-{a}", { a: "x", b: "y" })).toBe("x-y-x");
  });

  it("accepts number values, including 0", async () => {
    const { result } = await withLocale({});
    expect(result.current.__("{count} items", { count: 0 })).toBe("0 items");
  });

  it("allows letters, digits and underscores in names", async () => {
    const { result } = await withLocale({});
    expect(result.current.__("{0} {first_name} {A1}", { 0: "a", first_name: "b", A1: "c" })).toBe(
      "a b c",
    );
  });

  it("leaves placeholders without a matching arg as-is", async () => {
    const { result } = await withLocale({});
    expect(result.current.__("Hi {name}, {other}", { name: "Ada" })).toBe("Hi Ada, {other}");
  });

  it("ignores braces that aren't valid placeholders", async () => {
    const { result } = await withLocale({});
    const args = { name: "Ada", "first-name": "x", " name ": "x", "": "x" };
    expect(result.current.__("{ name } {first-name} {} {name!}", args)).toBe(
      "{ name } {first-name} {} {name!}",
    );
  });

  it("matches the inner placeholder of double braces", async () => {
    const { result } = await withLocale({});
    expect(result.current.__("{{name}}", { name: "Ada" })).toBe("{Ada}");
  });

  it("does not re-substitute placeholders inside values", async () => {
    const { result } = await withLocale({});
    expect(result.current.__("{a} {b}", { a: "{b}", b: "B" })).toBe("{b} B");
  });

  it("ignores inherited properties of the args object", async () => {
    const { result } = await withLocale({});
    expect(result.current.__("{toString} {constructor}", {})).toBe("{toString} {constructor}");
  });

  it("interpolates the key when the value is null or missing", async () => {
    const { result } = await withLocale({ "Hi {name}": null });
    expect(result.current.__("Hi {name}", { name: "Ada" })).toBe("Hi Ada");
    expect(result.current.__("Bye {name}", { name: "Ada" })).toBe("Bye Ada");
  });

  it("leaves placeholders untouched when no args are passed", async () => {
    const { result } = await withLocale({ "Hi {name}": "Hola {name}" });
    expect(result.current.__("Hi {name}")).toBe("Hola {name}");
  });

  it("<T args> substitutes placeholders", async () => {
    const { m } = await withLocale({ "Hello, {name}": "Hola, {name}" });
    render(createElement(m.T, { args: { name: "Ada" } }, "Hello, {name}"));
    expect(screen.getByText("Hola, Ada")).toBeTruthy();
  });

  it("<T args> re-renders with the new template after setLocale", async () => {
    const m = await fresh();
    m.init({ en: { "Hi {name}": "Hi {name}" }, es: { "Hi {name}": "Hola {name}" } });
    const { result } = renderHook(() => m.useLocale());
    await act(async () => {
      await result.current.setLocale("en");
    });
    render(createElement(m.T, { args: { name: "Ada" } }, "Hi {name}"));
    expect(screen.getByText("Hi Ada")).toBeTruthy();
    await act(async () => {
      await result.current.setLocale("es");
    });
    expect(screen.getByText("Hola Ada")).toBeTruthy();
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
