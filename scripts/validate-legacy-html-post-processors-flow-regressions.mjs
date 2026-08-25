import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const devServerPath = join(repositoryRoot, "apps/web/src/dev-server.ts");
const selfTestOnly = process.argv.includes("--self-test-only");

class Scope {
  constructor(parent = null) {
    this.parent = parent;
    this.bindings = new Map();
    this.rendererAliases = new Map();
  }

  declare(name, shape = new Set(), rendererAlias = false) {
    this.bindings.set(name, cloneShape(shape));
    this.rendererAliases.set(name, rendererAlias);
  }

  has(name) {
    return this.bindings.has(name) || Boolean(this.parent?.has(name));
  }

  owner(name) {
    if (this.bindings.has(name)) return this;
    return this.parent?.owner(name) ?? null;
  }

  lookup(name) {
    if (this.bindings.has(name)) return cloneShape(this.bindings.get(name));
    return this.parent ? this.parent.lookup(name) : new Set();
  }

  lookupRendererAlias(name) {
    if (this.rendererAliases.has(name)) return this.rendererAliases.get(name);
    return this.parent ? this.parent.lookupRendererAlias(name) : null;
  }

  assign(name, shape) {
    const owner = this.owner(name);
    if (owner) {
      owner.bindings.set(name, cloneShape(shape));
      return;
    }
    this.declare(name, shape, false);
  }

  assignRendererAlias(name, rendererAlias) {
    const owner = this.owner(name);
    if (owner) {
      owner.rendererAliases.set(name, rendererAlias);
      return;
    }
    this.declare(name, new Set(), rendererAlias);
  }
}

function validateHtmlFlowRegressions(source) {
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
    const rendererAlias = Boolean(
      node.initializer && isRendererReference(node.initializer, scope),
    );
    declarePattern(node.name, shape, rendererAlias, scope);
    return;
  }

  if (ts.isBinaryExpression(node)) {
    if (node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      visitNode(node.right, scope, violations);
      assignTarget(node.left, evaluate(node.right, scope), scope);
      assignRendererTarget(node.left, isRendererReference(node.right, scope), scope);
      return;
    }

    if (node.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken) {
      visitNode(node.right, scope, violations);
      const leftShape = evaluate(node.left, scope);
      const rightShape = evaluate(node.right, scope);
      if (hasTaint(leftShape) || hasTaint(rightShape)) {
        violations.add(
          "flow regression violation: += rewrites rendered HTML outside the legacy pipeline",
        );
        assignTarget(node.left, new Set([""]), scope);
      }
      return;
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
    functionScope.declare(node.name.text, new Set(), isRendererName(node.name.text));
  }
  for (const parameter of node.parameters ?? []) {
    declarePattern(parameter.name, new Set(), false, functionScope);
    if (parameter.initializer) visitNode(parameter.initializer, functionScope, violations);
  }
  if (node.body) visitNode(node.body, functionScope, violations);
}

function inspectCall(call, scope, violations) {
  const name = getCallName(call.expression);
  if (
    name === "sendHtml" ||
    name === "applyLegacyHtmlPostProcessorPipeline" ||
    isRendererCallable(call.expression, scope)
  ) {
    return;
  }

  const receiver = getCallReceiver(call.expression);
  const consumesHtml =
    Boolean(receiver && hasTaint(evaluate(receiver, scope))) ||
    call.arguments.some((argument) => hasTaint(evaluate(argument, scope)));

  if (consumesHtml) {
    violations.add(
      `flow regression violation: ${name ?? "anonymous call"} consumes rendered HTML outside the legacy pipeline`,
    );
  }
}

function evaluate(expression, scope) {
  const node = unwrapExpression(expression);

  if (ts.isIdentifier(node)) return scope.lookup(node.text);

  if (ts.isCallExpression(node)) {
    const name = getCallName(node.expression);
    if (
      name === "applyLegacyHtmlPostProcessorPipeline" ||
      isRendererCallable(node.expression, scope)
    ) {
      return new Set([""]);
    }
    const receiver = getCallReceiver(node.expression);
    if (receiver && hasTaint(evaluate(receiver, scope))) return new Set([""]);
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

  if (ts.isObjectLiteralExpression(node)) return evaluateObject(node, scope);
  if (ts.isArrayLiteralExpression(node)) return evaluateArray(node, scope);

  if (ts.isBinaryExpression(node)) {
    if (
      (node.operatorToken.kind === ts.SyntaxKind.PlusToken ||
        node.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken) &&
      (hasTaint(evaluate(node.left, scope)) || hasTaint(evaluate(node.right, scope)))
    ) {
      return new Set([""]);
    }
    return new Set();
  }

  if (ts.isTemplateExpression(node)) {
    return node.templateSpans.some((span) => hasTaint(evaluate(span.expression, scope)))
      ? new Set([""])
      : new Set();
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

function declarePattern(pattern, shape, rendererAlias, scope) {
  if (ts.isIdentifier(pattern)) {
    scope.declare(pattern.text, shape, rendererAlias);
    return;
  }

  if (ts.isObjectBindingPattern(pattern)) {
    for (const element of pattern.elements) {
      const key = element.propertyName
        ? getPropertyName(element.propertyName)
        : ts.isIdentifier(element.name)
          ? element.name.text
          : null;
      if (key === null) continue;
      declarePattern(element.name, selectShape(shape, key), false, scope);
    }
    return;
  }

  if (ts.isArrayBindingPattern(pattern)) {
    pattern.elements.forEach((element, index) => {
      if (!ts.isBindingElement(element)) return;
      declarePattern(element.name, selectShape(shape, String(index)), false, scope);
    });
  }
}

function assignTarget(target, shape, scope) {
  const node = unwrapExpression(target);

  if (ts.isIdentifier(node)) {
    scope.assign(node.text, shape);
    return;
  }

  if (ts.isObjectLiteralExpression(node)) {
    for (const property of node.properties) {
      if (ts.isShorthandPropertyAssignment(property)) {
        assignTarget(property.name, selectShape(shape, property.name.text), scope);
        continue;
      }
      if (ts.isPropertyAssignment(property)) {
        const key = getPropertyName(property.name);
        if (key !== null) assignTarget(property.initializer, selectShape(shape, key), scope);
      }
    }
    return;
  }

  if (ts.isArrayLiteralExpression(node)) {
    node.elements.forEach((element, index) => {
      if (ts.isOmittedExpression(element) || ts.isSpreadElement(element)) return;
      assignTarget(element, selectShape(shape, String(index)), scope);
    });
    return;
  }

  const path = getStaticAccessPath(node);
  if (!path) return;
  const [root, ...segments] = path;
  const owner = scope.owner(root) ?? scope;
  const rootShape = owner.lookup(root);
  const prefix = segments.join(".");

  for (const existing of [...rootShape]) {
    if (existing === prefix || existing.startsWith(`${prefix}.`)) rootShape.delete(existing);
  }
  mergeInto(rootShape, prefixShape(shape, prefix));
  owner.assign(root, rootShape);
}

function assignRendererTarget(target, rendererAlias, scope) {
  const node = unwrapExpression(target);
  if (ts.isIdentifier(node)) scope.assignRendererAlias(node.text, rendererAlias);
}

function isRendererReference(expression, scope) {
  const node = unwrapExpression(expression);
  if (!ts.isIdentifier(node)) return false;
  const knownAlias = scope.lookupRendererAlias(node.text);
  if (knownAlias !== null) return knownAlias;
  return isRendererName(node.text);
}

function isRendererCallable(expression, scope) {
  const node = unwrapExpression(expression);
  if (ts.isIdentifier(node)) {
    const knownAlias = scope.lookupRendererAlias(node.text);
    if (knownAlias !== null) return knownAlias;
    return isRendererName(node.text);
  }
  return isRendererName(getCallName(node));
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
    if (path.startsWith(`${key}.`)) selected.add(path.slice(key.length + 1));
  }
  return selected;
}

function prefixShape(shape, key) {
  if (!key) return cloneShape(shape);
  const prefixed = new Set();
  for (const path of shape) prefixed.add(path ? `${key}.${path}` : key);
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
  if (ts.isElementAccessExpression(node)) return getElementKey(node.argumentExpression);
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
  if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return node.text;
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
  const rejectedCases = [
    [
      "compound assignment",
      `async function handle() {
        let html = await renderSyntheticPage();
        html += "<aside>new feature</aside>";
        sendHtml(response, 200, html);
      }`,
    ],
    [
      "compound assignment through property",
      `async function handle() {
        const box = { html: await renderSyntheticPage() };
        box.html += "<aside>new feature</aside>";
        sendHtml(response, 200, box.html);
      }`,
    ],
    [
      "renderer alias",
      `async function handle() {
        const produce = renderSyntheticPage;
        const html = await produce();
        html.replace(/foo/g, "bar");
      }`,
    ],
    [
      "renderer alias chain",
      `async function handle() {
        const first = renderSyntheticPage;
        const second = first;
        const html = await second();
        helper(html);
      }`,
    ],
    [
      "object destructuring assignment",
      `async function handle() {
        const rendered = await renderSyntheticPage();
        const box = { html: rendered };
        let html;
        ({ html } = box);
        html.replace(/foo/g, "bar");
      }`,
    ],
    [
      "array destructuring assignment",
      `async function handle() {
        const rendered = await renderSyntheticPage();
        const values = [rendered];
        let html;
        [html] = values;
        helper(html);
      }`,
    ],
  ];

  for (const [label, source] of rejectedCases) {
    if (validateHtmlFlowRegressions(source).length === 0) {
      failures.push(`flow-regression self-test did not reject ${label}`);
    }
  }

  const allowedCases = [
    [
      "canonical pipeline",
      `async function handle() {
        const html = await applyLegacyHtmlPostProcessorPipeline(
          "/synthetic",
          await renderSyntheticPage(),
          [{ id: "canonical", transform: (currentHtml) => canonicalAdapter(currentHtml) }],
        );
        sendHtml(response, 200, html);
      }`,
    ],
    [
      "shadowed renderer-like identifier",
      `async function handle() {
        const renderSyntheticPage = () => "plain text";
        const value = renderSyntheticPage();
        value.replace(/foo/g, "bar");
      }`,
    ],
  ];

  for (const [label, source] of allowedCases) {
    const observed = validateHtmlFlowRegressions(source);
    if (observed.length > 0) {
      failures.push(`flow-regression self-test rejected ${label}: ${observed.join(" | ")}`);
    }
  }

  return failures;
}

const selfTestFailures = runSelfTests();
if (selfTestFailures.length > 0) {
  console.error(selfTestFailures.join("\n"));
  process.exit(1);
}

if (selfTestOnly) {
  console.log("SolverFin HTML-flow regression self-tests OK.");
  process.exit(0);
}

const devServerSource = await readFile(devServerPath, "utf8");
const violations = validateHtmlFlowRegressions(devServerSource);
if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log("SolverFin HTML-flow regression guard OK.");
