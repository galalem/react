// Role expressions use Odoo-style polish notation:
//   ["admin"]                          → admin
//   ["admin", "editor"]                → admin AND editor     (default across top-level tokens)
//   ["|", "admin", "editor"]           → admin OR editor
//   ["&", "admin", "editor"]           → explicit admin AND editor
//   ["|", "admin", "&", "editor", "x"] → admin OR (editor AND x)
//
// `&` and `|` are prefix operators consuming the next 2 sub-expressions.
// Use the `and()` and `or()` builders below to compose expressions without
// hand-writing polish notation.

type Node =
  | { kind: "role"; role: string }
  | { kind: "and"; left: Node; right: Node }
  | { kind: "or"; left: Node; right: Node };

function isOperator(token: string): boolean {
  return token === "&" || token === "|";
}

function parseExpression(tokens: string[], cursor: number): [Node, number] {
  if (cursor >= tokens.length) {
    throw new Error(
      `Role expression is malformed: operator without enough operands.`,
    );
  }

  const head = tokens[cursor];

  if (isOperator(head)) {
    const [left, afterLeft] = parseExpression(tokens, cursor + 1);
    const [right, afterRight] = parseExpression(tokens, afterLeft);
    const node: Node =
      head === "&"
        ? { kind: "and", left, right }
        : { kind: "or", left, right };
    return [node, afterRight];
  }

  return [{ kind: "role", role: head }, cursor + 1];
}

function parseRoleExpression(tokens: string[]): Node | null {
  if (tokens.length === 0) return null;

  let cursor = 0;
  let current: Node | null = null;

  while (cursor < tokens.length) {
    const [node, next] = parseExpression(tokens, cursor);
    cursor = next;
    current = current === null ? node : { kind: "and", left: current, right: node };
  }

  return current;
}

function evaluateNode(node: Node, userRoles: Set<string>): boolean {
  if (node.kind === "role") return userRoles.has(node.role);
  if (node.kind === "and") {
    return (
      evaluateNode(node.left, userRoles) &&
      evaluateNode(node.right, userRoles)
    );
  }
  return (
    evaluateNode(node.left, userRoles) ||
    evaluateNode(node.right, userRoles)
  );
}

export function evaluateRoleExpression(
  expression: string[],
  userRoles: Iterable<string>,
): boolean {
  const tree = parseRoleExpression(expression);
  if (tree === null) return true;
  return evaluateNode(tree, new Set(userRoles));
}

// Expression builders — compose without hand-writing polish notation.

type RoleExpression = string | string[];

function toTokens(expression: RoleExpression): string[] {
  return typeof expression === "string" ? [expression] : expression;
}

function foldWith(operator: "&" | "|", expressions: RoleExpression[]): string[] {
  if (expressions.length === 0) return [];
  if (expressions.length === 1) return toTokens(expressions[0]);

  let result = toTokens(expressions[0]);
  for (let i = 1; i < expressions.length; i++) {
    result = [operator, ...result, ...toTokens(expressions[i])];
  }
  return result;
}

export function and(...expressions: RoleExpression[]): string[] {
  return foldWith("&", expressions);
}

export function or(...expressions: RoleExpression[]): string[] {
  return foldWith("|", expressions);
}
