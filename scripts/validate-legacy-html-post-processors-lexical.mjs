import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const devServerPath = join(repositoryRoot, "apps/web/src/dev-server.ts");
const devServerSource = await readFile(devServerPath, "utf8");

function validateLexicalHtmlFlow(source) {
  const sourceFile = ts.createSourceFile(
    "dev-server.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const violations = new Set();
  visitNode(sourceFile, new Scope(), violations);
  return [...violations];
}

class Scope {
  constructor(parent = null) {
    this.parent = parent;
    this.bindings = new Map();
  }

  declare(name, shape = new Set()) {
    this.bindings.set(name, cloneShape(shape));
  }

  lookup(name) {
    if (this.bindings.has(name)) return cloneShape(this.bindings.get(name));
    return this.parent ? this.parent.lookup(name) : new Set();
  }

  assign(name, shape) {
    if (this.bindings.has(name)) {
      this.bindings.set(name, cloneShape(shape));
      return;
    }
    if (this.parent?.has(name)) {
      this.parent.assign(name, shape);
      return;
    }
    this.bindings.set(name, cloneShape(shape));
  }

  has(name) {
    return this.bindings.has(name) || Boolean(this.parent?.has(name));
  }

  owner(name) {
    if (this.bindings.has(name)) return this;
    return this.parent?.owner(name) ?? null;
  }
}

function visitNode(node, scope, violations) {
  if (isFunctionLike(node)) {
    visitFunction(node, scope, violations);
    return;
  }

  if (ts.isBlock(node)) {
    const blockScope = new Scope(scope);
    for (const statement of node.statements) {
      visitNode(statement, blockScope, violations);
    }
    return;
  }

  if (ts.isVariableDeclaration(node)) {
    if (node.initializer) visitNode(node.initializer, scope, violations);
    const shape = node.initializer ? evaluate(node.initializer, scope) : new Set();
    declarePattern(node.name, shape, scope);
    return;
  }

  if (ts.isBinaryExpression(node)) {
    if (node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      visitNode(node.right, scope, violations);
      assignTarget(node.left, evaluate(node.right, scope), scope);
      return;
    }
    if (
      node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
      (hasTaint(evaluate(node.left, scope)) || hasTaint(evaluate(node.right, scope)))
    ) {
      violations.add(
        "lexical HTML-flow violation: string concatenation rewrites rendered HTML outside the legacy pipeline",
      );
    }
  }

  if (ts.isTemplateExpression(node)) {
    if (node.templateSpans.some((span) => hasTaint(evaluate(span.expression, scope)))) {
      violations.add(
        "lexical HTML-flow violation: template literal rewrites rendered HTML outside the legacy pipeline",
      );
    }
  }

  if (ts.isCallExpression(node)) {
    inspectCall(node, scope, violations);
  }

  ts.forEachChild(node, (child) => visitNode(child, scope, violations));
}

function visitFunction(node, parentScope, violations) {
  const functionScope = new Scope(parentScope);
  if (node.name && ts.isIdentifier(node.name)) {
    functionScope.declare(node.name.text);
  }
  for (const parameter of node.parameters ?? []) {
    declarePattern(parameter.name, new Set(), functionScope);
    if (parameter.initializer) {
      visitNode(parameter.initializer, functionScope, violations);
    }
  }
  if (node.body) visitNode(node.body, functionScope, violations);
}

function inspectCall(call, scope, violations) {
  const name = getCallName(call.expression);
  const receiver = getCallReceiver(call.expression);
  const consumesHtml =
    Boolean(receiver && hasTaint(evaluate(receiver, scope))) ||
    call.arguments.some((argument) => hasTaint(evaluate(argument, scope)));

  if (
    consumesHtml &&
    name !== "sendHtml" &&
    name !== "applyLegacyHtmlPostProcessorPipeline" &&
    !isRendererName(name)
  ) {
    violations.add(
      `lexical HTML-flow violation: ${name ?? "anonymous call"} consumes rendered HTML outside the legacy pipeline`,
    );
  }
}

function evaluate(expression, scope) {
  const node = unwrapExpression(expression);

  if (ts.isIdentifier(node)) return scope.lookup(node.text);

  if (ts.isCallExpression(node)) {
    const name = getCallName(node.expression);
    if (name === "applyLegacyHtmlPostProcessorPipeline" || isRendererName(name)) {
      return new Set([""]);
    }
    const receiver = getCallReceiver(node.expression);
    if (receiver && hasTaint(evaluate(receiver, scope))) {
      return new Set([""]);
    }
    if (node.arguments.some((argument) => hasTaint(evaluate(argument, scope)))) {
      return new Set([""]);
    }
    return new Set();
  }

  if (ts.isPropertyAccessExpression(node)) {
    return selectShape(evaluate(node.expression, scope), node.name.text);
  }

  if (ts.isElementAccessExpression(node)) {
    const key = getElementKey(node.argumentExpression);
    return key === null ? new Set() : selectShape(evaluate(node.expression, scope), key);
  }

  if (ts.isObjectLiteralExpression(node)) {
    return evaluateObject(node, scope);
  }

  if (ts.isArrayLiteralExpression(node)) {
    return evaluateArray(node, scope);
  }

  if (ts.isBinaryExpression(node)) {
    if (
      node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
      (hasTaint(evaluate(node.left, scope)) || hasTaint(evaluate(node.right, scope)))
    ) {
      return new Set([""]);
    }
    return new Set();
  }

  if (ts.isTemplateExpression(node)) {
    const containsHtml = node.templateSpans.some((span) =>
      hasTaint(evaluate(span.expression, scope)),
    );
    return containsHtml ? new Set([""]) : new Set();
  }

  if (ts.isConditionalExpression(node)) {
    return mergeShapes(evaluate(node.whenTrue, scope), evaluate(node.whenFalse, scope));
  }

  return new Set();
}

function evaluateObject(node, scope) {
  const shape = new Set();
  for (const property of node.properties) {
    if (ts.isSpreadAssignment(property)) {
      mergeInto(shape, evaluate(property.expression, scope));
      continue;
    }

    if (ts.isShorthandPropertyAssignment(property)) {
      mergeInto(shape, prefixShape(evaluate(property.name, scope), property.name.text));
      continue;
    }

    if (!ts.isPropertyAssignment(property)) continue;
    const key = getPropertyName(property.name);
    if (key === null) continue;
    mergeInto(shape, prefixShape(evaluate(property.initializer, scope), key));
  }
  return shape;
}

function evaluateArray(node, scope) {
  const shape = new Set();
  node.elements.forEach((element, index) => {
    if (ts.isOmittedExpression(element)) return;
    if (ts.isSpreadElement(element)) {
      mergeInto(shape, evaluate(element.expression, scope));
      return;
    }
    mergeInto(shape, prefixShape(evaluate(element, scope), String(index)));
  });
  return shape;
}

function declarePattern(pattern, shape, scope) {
  if (ts.isIdentifier(pattern)) {
    scope.declare(pattern.text, shape);
    return;
  }

  if (ts.isObjectBindingPattern(pattern)) {
    for (const element of pattern.elements) {
      let key = null;
      if (element.propertyName) {
        key = getPropertyName(element.propertyName);
      } else if (ts.isIdentifier(element.name)) {
        key = element.name.text;
      }
      if (key === null) continue;
      declarePattern(element.name, selectShape(shape, key), scope);
    }
    return;
  }

  if (ts.isArrayBindingPattern(pattern)) {
    pattern.elements.forEach((element, index) => {
      if (!ts.isBindingElement(element)) return;
      declarePattern(element.name, selectShape(shape, String(index)), scope);
    });
  }
}

function assignTarget(target, shape, scope) {
  if (ts.isIdentifier(target)) {
    scope.assign(target.text, shape);
    return;
  }

  const path = getStaticAccessPath(target);
  if (!path) return;
  const [root, ...segments] = path;
  const owner = scope.owner(root) ?? scope;
  const rootShape = owner.lookup(root);
  const prefix = segments.join(".");

  for (const existing of [...rootShape]) {
    if (existing === prefix || existing.startsWith(`${prefix}.`)) {
      rootShape.delete(existing);
    }
  }
  mergeInto(rootShape, prefixShape(shape, prefix));
  owner.assign(root, rootShape);
}

function getStaticAccessPath(node) {
  const expression = unwrapExpression(node);
  if (ts.isIdentifier(expression)) return [expression.text];

  if (ts.isPropertyAccessExpression(expression)) {
    const parent = getStaticAccessPath(expression.expression);
    return parent ? [...parent, expression.name.text] : null;
  }

  if (ts.isElementAccessExpression(expression)) {
    const key = getElementKey(expression.argumentExpression);
    const parent = getStaticAccessPath(expression.expression);
    return parent && key !== null ? [...parent, key] : null;
  }

  return null;
}

function selectShape(shape, key) {
  const selected = new Set();
  for (const path of shape) {
    if (path === key) selected.add("");
    if (path.startsWith(`${key}.`)) {
      selected.add(path.slice(key.length + 1));
    }
  }
  return selected;
}

function prefixShape(shape, key) {
  if (!key) return cloneShape(shape);
  const prefixed = new Set();
  for (const path of shape) {
    prefixed.add(path ? `${key}.${path}` : key);
  }
  return prefixed;
}

function mergeShapes(...shapes) {
  const merged = new Set();
  for (const shape of shapes) mergeInto(merged, shape);
  return merged;
}

function mergeInto(target, source) {
  for (const path of source) target.add(path);
}

function cloneShape(shape) {
  return new Set(shape ?? []);
}

function hasTaint(shape) {
  return shape.size > 0;
}

function unwrapExpression(expression) {
  let current = expression;
  while (
    ts.isAwaitExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function getCallName(expression) {
  const node = unwrapExpression(expression);
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node)) {
    return getElementKey(node.argumentExpression);
  }
  return null;
}

function getCallReceiver(expression) {
  const node = unwrapExpression(expression);
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    return node.expression;
  }
  return null;
}

function getElementKey(expression) {
  const node = unwrapExpression(expression);
  if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  return null;
}

function getPropertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function isFunctionLike(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

function isRendererName(name) {
  return typeof name === "string" && name.startsWith("render");
}

function runSelfTests() {
  const failures = [];
  const cases = [
    [
      "arrow function",
      `const handle = async () => {
        const rendered = await renderSyntheticPage();
        rendered.replace(/foo/g, "bar");
      };`,
    ],
    [
      "class method",
      `class Handler {
        async run() {
          const rendered = await renderSyntheticPage();
          rendered.replace(/foo/g, "bar");
        }
      }`,
    ],
    [
      "object intermediary",
      `async function handle() {
        const rendered = await renderSyntheticPage();
        const box = { html: rendered };
        box.html.replace(/foo/g, "bar");
      }`,
    ],
    [
      "closure capture",
      `async function handle() {
        const rendered = await renderSyntheticPage();
        function nested() {
          return rendered.replace(/foo/g, "bar");
        }
        return nested();
      }`,
    ],
    [
      "object spread",
      `async function handle() {
        const rendered = await renderSyntheticPage();
        const box = { html: rendered };
        const copy = { ...box };
        copy.html.replace(/foo/g, "bar");
      }`,
    ],
    [
      "array intermediary",
      `async function handle() {
        const rendered = await renderSyntheticPage();
        const values = [rendered];
        values[0].replace(/foo/g, "bar");
      }`,
    ],
    [
      "destructuring",
      `async function handle() {
        const rendered = await renderSyntheticPage();
        const box = { html: rendered };
        const { html } = box;
        html.replace(/foo/g, "bar");
      }`,
    ],
    [
      "computed member",
      `async function handle() {
        const rendered = await renderSyntheticPage();
        rendered["replace"](/foo/g, "bar");
      }`,
    ],
  ];

  for (const [label, source] of cases) {
    const observed = validateLexicalHtmlFlow(source);
    if (observed.length === 0) {
      failures.push(`lexical self-test did not reject ${label}`);
    }
  }

  const allowed = validateLexicalHtmlFlow(`
    async function handle() {
      const html = await applyLegacyHtmlPostProcessorPipeline(
        "/synthetic",
        await renderSyntheticPage(),
        [{ id: "canonical", transform: (currentHtml) => canonicalAdapter(currentHtml) }],
      );
      sendHtml(response, 200, html);
    }
  `);
  if (allowed.length > 0) {
    failures.push(`lexical self-test rejected canonical flow: ${allowed.join(" | ")}`);
  }

  const shadowing = validateLexicalHtmlFlow(`
    async function handle() {
      const rendered = await renderSyntheticPage();
      function nested() {
        const rendered = "plain text";
        return rendered.replace(/foo/g, "bar");
      }
      sendHtml(response, 200, rendered);
      return nested();
    }
  `);
  if (shadowing.length > 0) {
    failures.push(`lexical self-test rejected shadowing: ${shadowing.join(" | ")}`);
  }

  return failures;
}

const failures = validateLexicalHtmlFlow(devServerSource);
failures.push(...runSelfTests());

if (failures.length > 0) {
  console.error("SolverFin lexical HTML-flow guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("SolverFin lexical HTML-flow guard OK.");
}
