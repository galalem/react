import { describe, expect, it } from "vitest";
import { and, evaluateRoleExpression, or } from "../src/roleExpression";

describe("evaluateRoleExpression", () => {
  describe("edge cases", () => {
    it("returns true when the expression is empty", () => {
      expect(evaluateRoleExpression([], [])).toBe(true);
      expect(evaluateRoleExpression([], ["admin"])).toBe(true);
    });

    it("single role: passes when user has it, fails when not", () => {
      expect(evaluateRoleExpression(["admin"], ["admin"])).toBe(true);
      expect(evaluateRoleExpression(["admin"], ["editor"])).toBe(false);
      expect(evaluateRoleExpression(["admin"], [])).toBe(false);
    });
  });

  describe("implicit AND across top-level tokens", () => {
    it("requires every role when listed bare", () => {
      expect(
        evaluateRoleExpression(["admin", "editor"], ["admin", "editor"]),
      ).toBe(true);
      expect(
        evaluateRoleExpression(["admin", "editor"], ["admin"]),
      ).toBe(false);
      expect(evaluateRoleExpression(["admin", "editor"], [])).toBe(false);
    });
  });

  describe("explicit AND operator", () => {
    it("&: user needs both operands", () => {
      expect(
        evaluateRoleExpression(["&", "admin", "editor"], ["admin", "editor"]),
      ).toBe(true);
      expect(
        evaluateRoleExpression(["&", "admin", "editor"], ["admin"]),
      ).toBe(false);
    });
  });

  describe("OR operator", () => {
    it("|: user needs either operand", () => {
      expect(
        evaluateRoleExpression(["|", "admin", "editor"], ["admin"]),
      ).toBe(true);
      expect(
        evaluateRoleExpression(["|", "admin", "editor"], ["editor"]),
      ).toBe(true);
      expect(
        evaluateRoleExpression(["|", "admin", "editor"], ["viewer"]),
      ).toBe(false);
    });
  });

  describe("nested expressions", () => {
    it("admin OR (editor AND publisher)", () => {
      const expression = ["|", "admin", "&", "editor", "publisher"];
      expect(evaluateRoleExpression(expression, ["admin"])).toBe(true);
      expect(
        evaluateRoleExpression(expression, ["editor", "publisher"]),
      ).toBe(true);
      expect(evaluateRoleExpression(expression, ["editor"])).toBe(false);
      expect(evaluateRoleExpression(expression, ["publisher"])).toBe(false);
      expect(evaluateRoleExpression(expression, [])).toBe(false);
    });

    it("(admin OR editor) AND publisher — via explicit & wrapping the OR", () => {
      const expression = ["&", "|", "admin", "editor", "publisher"];
      expect(
        evaluateRoleExpression(expression, ["admin", "publisher"]),
      ).toBe(true);
      expect(
        evaluateRoleExpression(expression, ["editor", "publisher"]),
      ).toBe(true);
      expect(evaluateRoleExpression(expression, ["admin"])).toBe(false);
      expect(evaluateRoleExpression(expression, ["publisher"])).toBe(false);
    });

    it("merged parent + child: admin AND (editor OR viewer)", () => {
      const expression = ["admin", "|", "editor", "viewer"];
      expect(
        evaluateRoleExpression(expression, ["admin", "editor"]),
      ).toBe(true);
      expect(
        evaluateRoleExpression(expression, ["admin", "viewer"]),
      ).toBe(true);
      expect(evaluateRoleExpression(expression, ["admin"])).toBe(false);
      expect(evaluateRoleExpression(expression, ["editor"])).toBe(false);
    });
  });

  describe("malformed input", () => {
    it("throws on a dangling operator", () => {
      expect(() => evaluateRoleExpression(["|", "admin"], ["admin"])).toThrow(
        /malformed/i,
      );
    });

    it("throws on an operator with no operands", () => {
      expect(() => evaluateRoleExpression(["&"], [])).toThrow(/malformed/i);
    });
  });
});

describe("and()", () => {
  it("returns an empty array with no arguments", () => {
    expect(and()).toEqual([]);
  });

  it("returns the single expression untouched", () => {
    expect(and("admin")).toEqual(["admin"]);
  });

  it("wraps two roles as an AND expression", () => {
    expect(and("admin", "editor")).toEqual(["&", "admin", "editor"]);
  });

  it("left-folds three or more roles", () => {
    // ((a & b) & c) → ["&", "&", "a", "b", "c"]
    expect(and("a", "b", "c")).toEqual(["&", "&", "a", "b", "c"]);
  });

  it("evaluates the built expression correctly", () => {
    expect(evaluateRoleExpression(and("a", "b", "c"), ["a", "b", "c"])).toBe(true);
    expect(evaluateRoleExpression(and("a", "b", "c"), ["a", "b"])).toBe(false);
  });
});

describe("or()", () => {
  it("returns an empty array with no arguments", () => {
    expect(or()).toEqual([]);
  });

  it("returns the single expression untouched", () => {
    expect(or("admin")).toEqual(["admin"]);
  });

  it("wraps two roles as an OR expression", () => {
    expect(or("admin", "editor")).toEqual(["|", "admin", "editor"]);
  });

  it("left-folds three or more roles", () => {
    expect(or("a", "b", "c")).toEqual(["|", "|", "a", "b", "c"]);
  });

  it("evaluates the built expression correctly", () => {
    expect(evaluateRoleExpression(or("a", "b", "c"), ["a"])).toBe(true);
    expect(evaluateRoleExpression(or("a", "b", "c"), ["c"])).toBe(true);
    expect(evaluateRoleExpression(or("a", "b", "c"), ["d"])).toBe(false);
  });
});

describe("and()/or() composition", () => {
  it("or(admin, and(editor, publisher))", () => {
    const expression = or("admin", and("editor", "publisher"));
    expect(expression).toEqual(["|", "admin", "&", "editor", "publisher"]);
    expect(evaluateRoleExpression(expression, ["admin"])).toBe(true);
    expect(
      evaluateRoleExpression(expression, ["editor", "publisher"]),
    ).toBe(true);
    expect(evaluateRoleExpression(expression, ["editor"])).toBe(false);
  });

  it("and(or(admin, editor), publisher)", () => {
    const expression = and(or("admin", "editor"), "publisher");
    expect(evaluateRoleExpression(expression, ["admin", "publisher"])).toBe(true);
    expect(evaluateRoleExpression(expression, ["editor", "publisher"])).toBe(true);
    expect(evaluateRoleExpression(expression, ["admin"])).toBe(false);
  });
});
