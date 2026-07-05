// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHistory, type HistoryApi } from "../src/history";

describe("createHistory", () => {
  let history: HistoryApi;

  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    history = createHistory();
  });

  afterEach(() => {
    history.destroy();
  });

  it("reports the current pathname", () => {
    window.history.replaceState({}, "", "/users");
    expect(history.current()).toBe("/users");
  });

  it("reports the current search string with leading '?'", () => {
    window.history.replaceState({}, "", "/users?tab=settings&page=2");
    expect(history.currentSearch()).toBe("?tab=settings&page=2");
  });

  it("reports the current hash with leading '#'", () => {
    window.history.replaceState({}, "", "/users#section");
    expect(history.currentHash()).toBe("#section");
  });

  it("returns empty strings when search or hash is absent", () => {
    window.history.replaceState({}, "", "/users");
    expect(history.currentSearch()).toBe("");
    expect(history.currentHash()).toBe("");
  });

  it("stores and reads a data payload under a namespaced key", () => {
    history.push("/a", { origin: "sidebar" });
    expect(history.currentData()).toEqual({ origin: "sidebar" });
  });

  it("currentData is undefined when no payload was passed", () => {
    history.push("/plain");
    expect(history.currentData()).toBeUndefined();
  });

  it("does not clobber unrelated history state fields", () => {
    // simulate another lib writing into history.state
    window.history.replaceState({ someOtherLib: "hi" }, "", "/carrier");
    // our currentData ignores it
    expect(history.currentData()).toBeUndefined();
  });

  it("push updates location and notifies subscribers", () => {
    const listener = vi.fn();
    history.subscribe(listener);

    history.push("/dashboard");

    expect(window.location.pathname).toBe("/dashboard");
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith("/dashboard");
  });

  it("replace updates location and notifies subscribers", () => {
    const listener = vi.fn();
    history.subscribe(listener);

    history.replace("/login");

    expect(window.location.pathname).toBe("/login");
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith("/login");
  });

  it("notifies subscribers on a popstate event (browser back/forward)", () => {
    const listener = vi.fn();
    history.subscribe(listener);

    window.history.replaceState({}, "", "/previous");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith("/previous");
  });

  it("supports multiple subscribers", () => {
    const first = vi.fn();
    const second = vi.fn();
    history.subscribe(first);
    history.subscribe(second);

    history.push("/multi");

    expect(first).toHaveBeenCalledWith("/multi");
    expect(second).toHaveBeenCalledWith("/multi");
  });

  it("returned unsubscribe function stops future notifications", () => {
    const listener = vi.fn();
    const unsubscribe = history.subscribe(listener);

    history.push("/first");
    unsubscribe();
    history.push("/second");

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith("/first");
  });

  it("destroy stops popstate notifications and clears listeners", () => {
    const listener = vi.fn();
    history.subscribe(listener);

    history.destroy();
    window.history.replaceState({}, "", "/gone");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(listener).not.toHaveBeenCalled();
  });
});
