import { afterEach, describe, expect, it, vi } from "vitest";
import { pathnameOf, resolvePath, resolveRedirect } from "../src/resolve";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolvePath — absolute and external targets", () => {
  it("returns an absolute `to` verbatim", () => {
    expect(resolvePath("/users", "/groups/7")).toBe("/users");
  });

  it("preserves a trailing slash on an absolute `to`", () => {
    // Existing call sites got this string through to pushState untouched.
    expect(resolvePath("/users/", "/groups/7")).toBe("/users/");
  });

  it("leaves an absolute `to` with query and hash alone", () => {
    expect(resolvePath("/users?tab=all#top", "/groups/7")).toBe("/users?tab=all#top");
  });

  it("passes through targets that leave the app", () => {
    expect(resolvePath("https://example.com/x", "/groups")).toBe("https://example.com/x");
    expect(resolvePath("mailto:nobody@example.com", "/groups")).toBe(
      "mailto:nobody@example.com",
    );
    expect(resolvePath("//example.com/x", "/groups")).toBe("//example.com/x");
  });
});

describe("resolvePath — the base is a directory", () => {
  it("treats a bare segment as a child of the current route", () => {
    expect(resolvePath("7", "/groups")).toBe("/groups/7");
  });

  it("resolves the same way with or without a trailing slash on the base", () => {
    expect(resolvePath("7", "/groups/")).toBe("/groups/7");
  });

  it("does not drop the base's last segment the way the URL spec would", () => {
    expect(resolvePath("edit", "/groups/7")).toBe("/groups/7/edit");
  });

  it("resolves a multi-segment `to`", () => {
    expect(resolvePath("7/edit", "/groups")).toBe("/groups/7/edit");
  });

  it("resolves from the root", () => {
    expect(resolvePath("groups", "/")).toBe("/groups");
  });

  it("ignores a trailing slash on the `to`", () => {
    expect(resolvePath("edit/", "/groups/7")).toBe("/groups/7/edit");
  });
});

describe("resolvePath — dot segments", () => {
  it('reads "." as the current route', () => {
    expect(resolvePath(".", "/groups/7")).toBe("/groups/7");
  });

  it('strips a leading "./"', () => {
    expect(resolvePath("./edit", "/groups/7")).toBe("/groups/7/edit");
  });

  it('reads ".." as one level up', () => {
    expect(resolvePath("..", "/groups/7")).toBe("/groups");
  });

  it("walks up and back down again", () => {
    expect(resolvePath("../8", "/groups/7")).toBe("/groups/8");
  });

  it("walks up more than one level", () => {
    expect(resolvePath("../..", "/app/iam/groups")).toBe("/app");
  });
});

describe("resolvePath — popping past the root", () => {
  it("clamps at the root", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolvePath("../../..", "/groups")).toBe("/");
  });

  it("still appends the segments that follow", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolvePath("../../x", "/groups")).toBe("/x");
  });

  it("warns in development, naming the `to` and the base", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    resolvePath("../..", "/groups");
    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0][0] as string;
    expect(message).toContain('to="../.."');
    expect(message).toContain('"/groups"');
  });

  it("does not warn when every `..` has a segment to consume", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolvePath("../..", "/app/iam/groups")).toBe("/app");
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("resolvePath — query and hash", () => {
  it("keeps the path and replaces the whole query", () => {
    expect(resolvePath("?tab=2", "/groups/7?a=1")).toBe("/groups/7?tab=2");
  });

  it("drops the base hash on a query-only `to`, per the URL spec", () => {
    expect(resolvePath("?tab=2", "/groups/7?a=1#top")).toBe("/groups/7?tab=2");
  });

  it("keeps the query on a hash-only `to`", () => {
    expect(resolvePath("#section", "/groups/7?a=1")).toBe("/groups/7?a=1#section");
  });

  it("carries the `to`'s own query and hash onto a resolved path", () => {
    expect(resolvePath("edit?tab=2#top", "/groups/7?a=1")).toBe(
      "/groups/7/edit?tab=2#top",
    );
  });

  it("drops the base query when the path moves", () => {
    expect(resolvePath("edit", "/groups/7?a=1")).toBe("/groups/7/edit");
  });

  it("reads an empty `to` as the current path and query", () => {
    expect(resolvePath("", "/groups/7?a=1")).toBe("/groups/7?a=1");
  });
});

describe("resolvePath — the mount-point case from the issue", () => {
  const list = "groups";
  const row = "g-sup";

  it("points at the same component's child under either prefix", () => {
    expect(resolvePath(row, `/app/iam/${list}`)).toBe("/app/iam/groups/g-sup");
    expect(resolvePath(row, `/admin/iam/${list}`)).toBe("/admin/iam/groups/g-sup");
  });

  it("reaches the record's edit screen under either prefix", () => {
    expect(resolvePath("edit", "/app/iam/groups/7")).toBe("/app/iam/groups/7/edit");
    expect(resolvePath("edit", "/admin/iam/groups/7")).toBe(
      "/admin/iam/groups/7/edit",
    );
  });

  it("reaches the list from the record under either prefix", () => {
    expect(resolvePath("..", "/app/iam/groups/7")).toBe("/app/iam/groups");
    expect(resolvePath("..", "/admin/iam/groups/7")).toBe("/admin/iam/groups");
  });
});

describe("resolveRedirect", () => {
  it("returns an absolute redirect unchanged", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveRedirect("/login")).toBe("/login");
    expect(warn).not.toHaveBeenCalled();
  });

  it("reads a relative redirect as root-relative and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveRedirect("login")).toBe("/login");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("must be absolute");
  });

  it("passes an external redirect through", () => {
    expect(resolveRedirect("https://auth.example.com")).toBe(
      "https://auth.example.com",
    );
  });
});

describe("pathnameOf", () => {
  it("strips the query and hash", () => {
    expect(pathnameOf("/groups/7?a=1#top")).toBe("/groups/7");
    expect(pathnameOf("/groups/7")).toBe("/groups/7");
  });
});
