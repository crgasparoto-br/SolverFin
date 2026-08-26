import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const devServerPath = join(repositoryRoot, "apps/web/src/dev-server.ts");
const selfTestOnly = process.argv.includes("--self-test-only");

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
  let offset = 0;
  for (const element of node.elements) {
    if (ts.isOmittedExpression(element)) {
      offset += 1;
      continue;
    }
    if (ts.isSpreadElement(element)) {
      const spreadShape = evaluate(element.expression, scope);
      mergeInto(shape, shiftArrayShape(spreadShape, offset));
      offset += inferArraySpan(spreadShape);
      continue;
    }
    mergeInto(shape, prefixShape(evaluate(element, scope), String(offset)));
    offset += 1;
  }
  shape.arraySpan = offset;
  return shape;
}

function declarePattern(pattern, shape, scope) {
  if (ts.isIdentifier(pattern)) {
    scope.declare(pattern.text, shape);
    return;
  }

  if (ts.isObjectBindingPattern(pattern)) {
    const excludedKeys = [];
    for (const element of pattern.elements) {
      if (element.dotDotDotToken) {
        declarePattern(element.name, omitShapeKeys(shape, excludedKeys), scope);
        continue;
      }
      let key = null;
      if (element.propertyName) {
        key = getPropertyName(element.propertyName);
      } else if (ts.isIdentifier(element.name)) {
        key = element.name.text;
      }
      if (key === null) continue;
      excludedKeys.push(key);
      declarePattern(element.name, selectShape(shape, key), scope);
    }
    return;
  }

  if (ts.isArrayBindingPattern(pattern)) {
    pattern.elements.forEach((element, index) => {
      if (!ts.isBindingElement(element)) return;
      const selected = element.dotDotDotToken
        ? sliceArrayShape(shape, index)
        : selectShape(shape, String(index));
      declarePattern(element.name, selected, scope);
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
    const excludedKeys = [];
    for (const property of node.properties) {
      if (ts.isSpreadAssignment(property)) {
        assignTarget(property.expression, omitShapeKeys(shape, excludedKeys), scope);
        continue;
      }
      if (ts.isShorthandPropertyAssignment(property)) {
        excludedKeys.push(property.name.text);
        assignTarget(property.name, selectShape(shape, property.name.text), scope);
        continue;
      }
      if (ts.isPropertyAssignment(property)) {
        const key = getPropertyName(property.name);
        if (key !== null) {
          excludedKeys.push(key);
          assignTarget(property.initializer, selectShape(shape, key), scope);
        }
      }
    }
    return;
  }

  if (ts.isArrayLiteralExpression(node)) {
    node.elements.forEach((element, index) => {
      if (ts.isOmittedExpression(element)) return;
      if (ts.isSpreadElement(element)) {
        assignTarget(element.expression, sliceArrayShape(shape, index), scope);
        return;
      }
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
  selected.arraySpan = null;
  return selected;
}

function omitShapeKeys(shape, keys) {
  const excluded = new Set(keys);
  const remaining = new Set();
  for (const path of shape) {
    if (!path) continue;
    const [head] = path.split(".");
    if (!excluded.has(head)) remaining.add(path);
  }
  remaining.arraySpan = null;
  return remaining;
}

function sliceArrayShape(shape, startIndex) {
  const sliced = new Set();
  for (const path of shape) {
    if (!path) continue;
    const [head, ...tail] = path.split(".");
    const index = Number(head);
    if (!Number.isInteger(index) || index < startIndex) continue;
    const shifted = String(index - startIndex);
    sliced.add(tail.length > 0 ? `${shifted}.${tail.join(".")}` : shifted);
  }
  sliced.arraySpan = Math.max(0, inferArraySpan(shape) - startIndex);
  return sliced;
}

function shiftArrayShape(shape, offset) {
  const shiftedShape = new Set();
  for (const path of shape) {
    const [head, ...tail] = path.split(".");
    const index = Number(head);
    if (!Number.isInteger(index) || index < 0) {
      shiftedShape.add(path);
      continue;
    }
    const shifted = String(index + offset);
    shiftedShape.add(tail.length > 0 ? `${shifted}.${tail.join(".")}` : shifted);
  }
  shiftedShape.arraySpan = null;
  return shiftedShape;
}

function inferArraySpan(shape) {
  if (Number.isInteger(shape?.arraySpan)) return shape.arraySpan;
  let maxIndex = -1;
  for (const path of shape ?? []) {
    const [head] = path.split(".");
    const index = Number(head);
    if (Number.isInteger(index) && index >= 0) {
      maxIndex = Math.max(maxIndex, index);
    }
  }
  return maxIndex + 1;
}

function prefixShape(shape, key) {
  if (!key) return cloneShape(shape);
  const prefixed = new Set();
  for (const path of shape) {
    prefixed.add(path ? `${key}.${path}` : key);
  }
  prefixed.arraySpan = null;
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
  const cloned = new Set(shape ?? []);
  cloned.arraySpan = Number.isInteger(shape?.arraySpan) ? shape.arraySpan : null;
  return cloned;
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
  if (ts.isComputedPropertyName(name)) {
    return getElementKey(name.expression);
  }
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
      "static computed object intermediary",
      `async function handle() {
        const rendered = await renderSyntheticPage();
        const box = { ["html"]: rendered };
        box["html"].replace(/foo/g, "bar");
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
      "shifted array spread",
      `async function handle() {
        const rendered = await renderSyntheticPage();
        const values = [rendered];
        const copy = ["plain", ...values];
        copy[1].replace(/foo/g, "bar");
      }`,
    ],
    [
      "array spread preserves trailing span",
      `async function handle() {
        const rendered = await renderSyntheticPage();
        const values = [rendered, "plain"];
        const copy = [...values, rendered];
        copy[2].replace(/foo/g, "bar");
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
      "computed destructuring",
      `async function handle() {
        const rendered = await renderSyntheticPage();
        const box = { html: rendered };
        const { ["html"]: html } = box;
        html.replace(/foo/g, "bar");
      }`,
    ],
    [
      "object rest destructuring",
      `async function handle() {
        const rendered = await renderSyntheticPage();
        const box = { ignored: "plain", html: rendered };
        const { ignored, ...rest } = box;
        rest.html.replace(/foo/g, "bar");
      }`,
    ],
    [
      "array rest destructuring",
      `async function handle() {
        const rendered = await renderSyntheticPage();
        const values = ["plain", rendered];
        const [, ...rest] = values;
        rest[0].replace(/foo/g, "bar");
      }`,
    ],
    [
      "object rest assignment",
      `async function handle() {
        const rendered = await renderSyntheticPage();
        const box = { ignored: "plain", html: rendered };
        let ignored;
        let rest;
        ({ ignored, ...rest } = box);
        rest.html.replace(/foo/g, "bar");
      }`,
    ],
    [
      "array rest assignment",
      `async function handle() {
        const rendered = await renderSyntheticPage();
        const values = ["plain", rendered];
        let rest;
        [, ...rest] = values;
        rest[0].replace(/foo/g, "bar");
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

  const arrayRestMutationShape = new Set(["1"]);
  arrayRestMutationShape.arraySpan = 2;
  const legacyArrayRestShape = selectShape(arrayRestMutationShape, "1");
  if (hasTaint(selectShape(legacyArrayRestShape, "0"))) {
    failures.push("lexical mutation control no longer distinguishes legacy array-rest propagation");
  }
  if (!hasTaint(selectShape(sliceArrayShape(arrayRestMutationShape, 1), "0"))) {
    failures.push("lexical array-rest propagation did not retain HTML provenance");
  }

  const objectRestMutationShape = new Set(["html"]);
  const legacyObjectRestShape = selectShape(objectRestMutationShape, "rest");
  if (hasTaint(selectShape(legacyObjectRestShape, "html"))) {
    failures.push("lexical mutation control no longer distinguishes legacy object-rest propagation");
  }
  if (!hasTaint(selectShape(omitShapeKeys(objectRestMutationShape, ["ignored"]), "html"))) {
    failures.push("lexical object-rest propagation did not retain HTML provenance");
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

const failures = [];
if (!selfTestOnly) {
  const devServerSource = await readFile(devServerPath, "utf8");
  failures.push(...validateLexicalHtmlFlow(devServerSource));
}
failures.push(...runSelfTests());

if (failures.length > 0) {
  console.error("SolverFin lexical HTML-flow guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else if (selfTestOnly) {
  console.log("SolverFin lexical HTML-flow self-tests OK.");
} else {
  console.log("SolverFin lexical HTML-flow guard OK.");
}
