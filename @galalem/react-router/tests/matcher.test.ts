import { describe, expect, it } from "vitest";
import { matchPath } from "../src/matcher";

describe("matchPath", () => {
  describe("root", () => {
    it("matches root pattern to root path", () => {
      expect(matchPath("/", "/")).toEqual({ params: {} });
    });

    it("does not match root pattern to non-root path", () => {
      expect(matchPath("/", "/users")).toBeNull();
    });
  });

  describe("static segments", () => {
    it("matches identical single segment", () => {
      expect(matchPath("/users", "/users")).toEqual({ params: {} });
    });

    it("matches identical multi-segment", () => {
      expect(matchPath("/users/list", "/users/list")).toEqual({ params: {} });
    });

    it("returns null on mismatched segment", () => {
      expect(matchPath("/users", "/posts")).toBeNull();
    });

    it("is case-sensitive", () => {
      expect(matchPath("/users", "/Users")).toBeNull();
    });

    it("returns null when path is longer than pattern", () => {
      expect(matchPath("/users", "/users/42")).toBeNull();
    });

    it("returns null when path is shorter than pattern", () => {
      expect(matchPath("/users/42", "/users")).toBeNull();
    });
  });

  describe("named params", () => {
    it("captures a single param", () => {
      expect(matchPath("/users/:id", "/users/42")).toEqual({
        params: { id: "42" },
      });
    });

    it("captures multiple params", () => {
      expect(
        matchPath("/users/:userId/posts/:postId", "/users/42/posts/7"),
      ).toEqual({ params: { userId: "42", postId: "7" } });
    });

    it("URL-decodes param values", () => {
      expect(matchPath("/search/:q", "/search/hello%20world")).toEqual({
        params: { q: "hello world" },
      });
    });

    it("does not match empty segment against a param", () => {
      expect(matchPath("/users/:id", "/users/")).toBeNull();
    });

    it("returns null for malformed empty-name param", () => {
      expect(matchPath("/users/:", "/users/42")).toBeNull();
    });
  });

  describe("wildcard", () => {
    it("captures rest of the path under '*'", () => {
      expect(matchPath("/admin/*", "/admin/users/42")).toEqual({
        params: { "*": "users/42" },
      });
    });

    it("matches zero remaining segments as empty string", () => {
      expect(matchPath("/admin/*", "/admin")).toEqual({ params: { "*": "" } });
    });

    it("captures everything under a top-level wildcard", () => {
      expect(matchPath("/*", "/anything/goes/here")).toEqual({
        params: { "*": "anything/goes/here" },
      });
    });

    it("URL-decodes segments joined into the wildcard capture", () => {
      expect(matchPath("/files/*", "/files/hello%20world/foo")).toEqual({
        params: { "*": "hello world/foo" },
      });
    });

    it("throws when wildcard is not the last segment", () => {
      expect(() => matchPath("/admin/*/users", "/admin/x/users")).toThrow(
        /wildcard/i,
      );
    });
  });

  describe("normalization", () => {
    it("adds a leading slash if the pattern lacks one", () => {
      expect(matchPath("users", "/users")).toEqual({ params: {} });
    });

    it("adds a leading slash if the path lacks one", () => {
      expect(matchPath("/users", "users")).toEqual({ params: {} });
    });

    it("strips a trailing slash on the pattern", () => {
      expect(matchPath("/users/", "/users")).toEqual({ params: {} });
    });

    it("strips a trailing slash on the path", () => {
      expect(matchPath("/users", "/users/")).toEqual({ params: {} });
    });
  });
});
