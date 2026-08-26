import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const devServerPath = join(repositoryRoot, "apps/web/src/dev-server.ts");
const selfTestOnly = process.argv.includes("--self-test-only");

function emptyShape(arraySpan = null) {
  return {
    html: new Set(),
    renderer: new Set(),
    arraySpan,
  };
}

function cloneShape(shape) {
  return {
    html: new Set(shape?.html ?? []),
    renderer: new Set(shape?.renderer ?? []),
    arraySpan: Number.isInteger(shape?.arraySpan) ? shape.arraySpan : null,
  };
}

function hasHtml(shape) {
  return shape.html.size > 0;
}

function hasRenderer(shape) {
  return shape.renderer.size > 0;
}

function mergeShapes(...shapes) {
  const merged = emptyShape();
  for (const shape of shapes) {
    for (const path of shape?.html ?? []) merged.html.add(path);
    for (const path of shape?.renderer ?? []) merged.renderer.add(path);
  }
  return merged;
}

function mapPaths(paths, mapper) {
  const mapped = new Set();
  for (const path of paths) {
    const value = mapper(path);
    if (value !== null) mapped.add(value);
  }
  return mapped;
}

function prefixShape(shape, key) {
  if (!key) return cloneShape(shape);
  const prefix = (path) => (path ? `${key}.${path}` : key);
  return {
    html: mapPaths(shape.html, prefix),
    renderer: mapPaths(shape.renderer, prefix),
    arraySpan: null,
  };
}

function selectShape(shape, key) {
  const select = (path) => {
    if (path === key) return "";
    return path.startsWith(`${key}.`) ? path.slice(key.length + 1) : null;
  };
  return {
    html: mapPaths(shape.html, select),
    renderer: mapPaths(shape.renderer, select),
    arraySpan: null,
  };
}

function omitShapeKeys(shape, keys) {
  const excluded = new Set(keys);
  const keep = (path) => {
    if (!path) return null;
    const [head] = path.split(".");
    return excluded.has(head) ? null : path;
  };
  return {
    html: mapPaths(shape.html, keep),
    renderer: mapPaths(shape.renderer, keep),
    arraySpan: null,
  };
}

function sliceArrayShape(shape, startIndex) {
  const slice = (path) => {
    if (!path) return null;
    const [head, ...tail] = path.split(".");
    const index = Number(head);
    if (!Number.isInteger(index) || index < startIndex) return null;
    const shifted = String(index - startIndex);
    return tail.length > 0 ? `${shifted}.${tail.join(".")}` : shifted;
  };
  return {
    html: mapPaths(shape.html, slice),
    renderer: mapPaths(shape.renderer, slice),
    arraySpan: Math.max(0, inferArraySpan(shape) - startIndex),
  };
}

function shiftArrayShape(shape, offset) {
  const shift = (path) => {
    const [head, ...tail] = path.split(".");
    const index = Number(head);
    if (!Number.isInteger(index) || index < 0) return path;
    const shifted = String(index + offset);
    return tail.length > 0 ? `${shifted}.${tail.join(".")}` : shifted;
  };
  return {
    html: mapPaths(shape.html, shift),
    renderer: mapPaths(shape.renderer, shift),
    arraySpan: null,
  };
}

function inferArraySpan(shape) {
  if (Number.isInteger(shape.arraySpan)) return shape.arraySpan;
  let maxIndex = -1;
  for (const paths of [shape.html, shape.renderer]) {
    for (const path of paths) {
      const [head] = path.split(".");
      const index = Number(head);
      if (Number.isInteger(index) && index >= 0) {
        maxIndex = Math.max(maxIndex, index);
      }
    }
  }
  return maxIndex + 1;
}

class Scope {
  constructor(parent = null) {
    this.parent = parent;
    this.bindings = new Map();
  }

  declare(name, shape = emptyShape()) {
    this.bindings.set(name, cloneShape(shape));
  }

  owner(name) {
    if (this.bindings.has(name)) return this;
    return this.parent?.owner(name) ?? null;
  }

  lookup(name) {
    if (this.bindings.has(name)) return cloneShape(this.bindings.get(name));
    return this.parent ? this.parent.lookup(name) : null;
  }

  assign(name, shape) {
    const owner = this.owner(name);
    if (owner) {
      owner.bindings.set(name, cloneShape(shape));
      return;
    }
    this.declare(name, shape);
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
    declarePattern(
      node.name,
      node.initializer ? evaluate(node.initializer, scope) : emptyShape(),
      scope,
    );
    return;
  }

  if (ts.isBinaryExpression(node)) {
    if (node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      visitNode(node.right, scope, violations);
      assignTarget(node.left, evaluate(node.right, scope), scope);
      return;
    }

    if (node.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken) {
      visitNode(node.right, scope, violations);
      const leftShape = evaluate(node.left, scope);
      const rightShape = evaluate(node.right, scope);
      if (hasHtml(leftShape) || hasHtml(rightShape)) {
        violations.add(
          "flow regression violation: += rewrites rendered HTML outside the legacy pipeline",
        );
        assignTarget(
          node.left,
          { html: new Set([""]), renderer: new Set(), arraySpan: null },
          scope,
        );
      }
      return;
    }

    const leftShape = evaluate(node.left, scope);
    const rightShape = evaluate(node.right, scope);
    if (
      node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
      (hasHtml(leftShape) || hasHtml(rightShape))
    ) {
      violations.add(
        "flow regression violation: + rewrites rendered HTML outside the legacy pipeline",
      );
    }
  }

  if (
    ts.isTemplateExpression(node) &&
    node.templateSpans.some((span) => hasHtml(evaluate(span.expression, scope)))
  ) {
    violations.add(
      "flow regression violation: template literal rewrites rendered HTML outside the legacy pipeline",
    );
  }

  if (ts.isCallExpression(node)) {
    inspectCall(node, scope, violations);
  }

  ts.forEachChild(node, (child) => visitNode(child, scope, violations));
}

function visitFunction(node, parentScope, violations) {
  const functionScope = new Scope(parentScope);
  if (node.name && ts.isIdentifier(node.name)) {
    functionScope.declare(node.name.text, {
      html: new Set(),
      renderer: isRendererName(node.name.text) ? new Set([""]) : new Set(),
      arraySpan: null,
    });
  }
  for (const parameter of node.parameters ?? []) {
    declarePattern(parameter.name, emptyShape(), functionScope);
    if (parameter.initializer) {
      visitNode(parameter.initializer, functionScope, violations);
    }
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
    Boolean(receiver && hasHtml(evaluate(receiver, scope))) ||
    call.arguments.some((argument) => hasHtml(evaluate(argument, scope)));

  if (consumesHtml) {
    violations.add(
      `flow regression violation: ${name ?? "anonymous call"} consumes rendered HTML outside the legacy pipeline`,
    );
  }
}

function evaluate(expression, scope) {
  const node = unwrapExpression(expression);

  if (ts.isIdentifier(node)) {
    const known = scope.lookup(node.text);
    if (known !== null) return known;
    return isRendererName(node.text)
      ? { html: new Set(), renderer: new Set([""]), arraySpan: null }
      : emptyShape();
  }

  if (ts.isCallExpression(node)) {
    const name = getCallName(node.expression);
    if (
      name === "applyLegacyHtmlPostProcessorPipeline" ||
      isRendererCallable(node.expression, scope)
    ) {
      return { html: new Set([""]), renderer: new Set(), arraySpan: null };
    }
    const receiver = getCallReceiver(node.expression);
    if (
      Boolean(receiver && hasHtml(evaluate(receiver, scope))) ||
      node.arguments.some((argument) => hasHtml(evaluate(argument, scope)))
    ) {
      return { html: new Set([""]), renderer: new Set(), arraySpan: null };
    }
    return emptyShape();
  }

  if (ts.isPropertyAccessExpression(node)) {
    return selectShape(evaluate(node.expression, scope), node.name.text);
  }

  if (ts.isElementAccessExpression(node)) {
    const key = getElementKey(node.argumentExpression);
    return key === null ? emptyShape() : selectShape(evaluate(node.expression, scope), key);
  }

  if (ts.isObjectLiteralExpression(node)) return evaluateObject(node, scope);
  if (ts.isArrayLiteralExpression(node)) return evaluateArray(node, scope);

  if (ts.isBinaryExpression(node)) {
    const leftShape = evaluate(node.left, scope);
    const rightShape = evaluate(node.right, scope);
    if (
      (node.operatorToken.kind === ts.SyntaxKind.PlusToken ||
        node.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken) &&
      (hasHtml(leftShape) || hasHtml(rightShape))
    ) {
      return { html: new Set([""]), renderer: new Set(), arraySpan: null };
    }
    return emptyShape();
  }

  if (ts.isTemplateExpression(node)) {
    const consumesHtml = node.templateSpans.some((span) =>
      hasHtml(evaluate(span.expression, scope)),
    );
    return consumesHtml
      ? { html: new Set([""]), renderer: new Set(), arraySpan: null }
      : emptyShape();
  }

  if (ts.isConditionalExpression(node)) {
    return mergeShapes(evaluate(node.whenTrue, scope), evaluate(node.whenFalse, scope));
  }

  return emptyShape();
}

function evaluateObject(node, scope) {
  let shape = emptyShape();
  for (const property of node.properties) {
    if (ts.isSpreadAssignment(property)) {
      shape = mergeShapes(shape, evaluate(property.expression, scope));
      continue;
    }
    if (ts.isShorthandPropertyAssignment(property)) {
      shape = mergeShapes(shape, prefixShape(evaluate(property.name, scope), property.name.text));
      continue;
    }
    if (!ts.isPropertyAssignment(property)) continue;
    const key = getPropertyName(property.name);
    if (key === null) continue;
    shape = mergeShapes(shape, prefixShape(evaluate(property.initializer, scope), key));
  }
  return shape;
}

function evaluateArray(node, scope) {
  let shape = emptyShape();
  let offset = 0;
  for (const element of node.elements) {
    if (ts.isOmittedExpression(element)) {
      offset += 1;
      continue;
    }
    if (ts.isSpreadElement(element)) {
      const spreadShape = evaluate(element.expression, scope);
      shape = mergeShapes(shape, shiftArrayShape(spreadShape, offset));
      offset += inferArraySpan(spreadShape);
      continue;
    }
    shape = mergeShapes(shape, prefixShape(evaluate(element, scope), String(offset)));
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
      const key = element.propertyName
        ? getPropertyName(element.propertyName)
        : ts.isIdentifier(element.name)
          ? element.name.text
          : null;
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
  const rootShape = owner.lookup(root) ?? emptyShape();
  const prefix = segments.join(".");

  for (const paths of [rootShape.html, rootShape.renderer]) {
    for (const existing of [...paths]) {
      if (existing === prefix || existing.startsWith(`${prefix}.`)) {
        paths.delete(existing);
      }
    }
  }

  const replacement = prefixShape(shape, prefix);
  for (const value of replacement.html) rootShape.html.add(value);
  for (const value of replacement.renderer) rootShape.renderer.add(value);
  owner.assign(root, rootShape);
}

function isRendererCallable(expression, scope) {
  const node = unwrapExpression(expression);

  if (ts.isIdentifier(node)) {
    const known = scope.lookup(node.text);
    return known !== null ? hasRenderer(known) : isRendererName(node.text);
  }

  if (ts.isPropertyAccessExpression(node)) {
    return hasRenderer(selectShape(evaluate(node.expression, scope), node.name.text));
  }

  if (ts.isElementAccessExpression(node)) {
    const key = getElementKey(node.argumentExpression);
    return key !== null && hasRenderer(selectShape(evaluate(node.expression, scope), key));
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
      "renderer stored in object",
      `async function handle() {
        const renderers = { page: renderSyntheticPage };
        const html = await renderers.page();
        html.replace(/foo/g, "bar");
      }`,
    ],
    [
      "renderer stored in static computed object property",
      `async function handle() {
        const renderers = { ["page"]: renderSyntheticPage };
        const html = await renderers["page"]();
        html.replace(/foo/g, "bar");
      }`,
    ],
    [
      "renderer stored in array",
      `async function handle() {
        const renderers = [renderSyntheticPage];
        helper(await renderers[0]());
      }`,
    ],
    [
      "renderer shifted array spread",
      `async function handle() {
        const renderers = [renderSyntheticPage];
        const copy = [null, ...renderers];
        helper(await copy[1]());
      }`,
    ],
    [
      "renderer spread followed by renderer",
      `async function handle() {
        const renderers = [renderSyntheticPage, () => "plain"];
        const copy = [...renderers, renderAnotherPage];
        helper(await copy[2]());
      }`,
    ],
    [
      "renderer array destructuring",
      `async function handle() {
        const renderers = [renderSyntheticPage];
        const [page] = renderers;
        helper(await page());
      }`,
    ],
    [
      "renderer array rest destructuring",
      `async function handle() {
        const renderers = [() => "plain", renderSyntheticPage];
        const [, ...rest] = renderers;
        const html = await rest[0]();
        html.replace(/foo/g, "bar");
      }`,
    ],
    [
      "renderer recovered by destructuring",
      `async function handle() {
        const renderers = { page: renderSyntheticPage };
        const { page } = renderers;
        const html = await page();
        html.replace(/foo/g, "bar");
      }`,
    ],
    [
      "renderer recovered by computed destructuring",
      `async function handle() {
        const renderers = { page: renderSyntheticPage };
        const { ["page"]: page } = renderers;
        helper(await page());
      }`,
    ],
    [
      "renderer object rest destructuring",
      `async function handle() {
        const renderers = { ignored: () => "plain", page: renderSyntheticPage };
        const { ignored, ...rest } = renderers;
        helper(await rest.page());
      }`,
    ],
    [
      "renderer container spread",
      `async function handle() {
        const renderers = { page: renderSyntheticPage };
        const copy = { ...renderers };
        helper(await copy.page());
      }`,
    ],
    [
      "renderer assignment through property",
      `async function handle() {
        const renderers = {};
        renderers.page = renderSyntheticPage;
        const html = await renderers.page();
        html.replace(/foo/g, "bar");
      }`,
    ],
    [
      "renderer array rest assignment",
      `async function handle() {
        const renderers = [() => "plain", renderSyntheticPage];
        let rest;
        [, ...rest] = renderers;
        helper(await rest[0]());
      }`,
    ],
    [
      "renderer object rest assignment",
      `async function handle() {
        const renderers = { ignored: () => "plain", page: renderSyntheticPage };
        let ignored;
        let rest;
        ({ ignored, ...rest } = renderers);
        helper(await rest.page());
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
    [
      "neutral-name consumer",
      `async function handle() {
        const rendered = await renderSyntheticPage();
        const rewritten = neutralConsumer(rendered);
        sendHtml(response, 200, rewritten);
      }`,
    ],
    [
      "pre-pipeline wrapper",
      `async function handle() {
        const rewritten = rewriteFinalHtml(await renderSyntheticPage());
        sendHtml(response, 200, rewritten);
      }`,
    ],
    [
      "loop-contained rewrite",
      `async function handle() {
        const rendered = await renderSyntheticPage();
        for (const token of ["foo"]) {
          rendered.replace(token, "bar");
        }
      }`,
    ],
    [
      "computed member rewrite",
      `async function handle() {
        const rendered = await renderSyntheticPage();
        rendered["replace"](/foo/g, "bar");
      }`,
    ],
    [
      "direct concatenation",
      `async function handle() {
        const rendered = await renderSyntheticPage();
        const rewritten = rendered + "<aside>new feature</aside>";
        sendHtml(response, 200, rewritten);
      }`,
    ],
    [
      "template rewrite",
      [
        "async function handle() {",
        "  const rendered = await renderSyntheticPage();",
        "  const rewritten = `<main>${rendered}</main>`;",
        "  sendHtml(response, 200, rewritten);",
        "}",
      ].join("\n"),
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
      "arrow function container",
      `const handle = async () => {
        const rendered = await renderSyntheticPage();
        rendered.replace(/foo/g, "bar");
      };`,
    ],
    [
      "class method container",
      `class Handler {
        async run() {
          const rendered = await renderSyntheticPage();
          rendered.replace(/foo/g, "bar");
        }
      }`,
    ],
    [
      "object spread html alias",
      `async function handle() {
        const rendered = await renderSyntheticPage();
        const box = { html: rendered };
        const copy = { ...box };
        copy.html.replace(/foo/g, "bar");
      }`,
    ],
    [
      "array html alias",
      `async function handle() {
        const rendered = await renderSyntheticPage();
        const values = [rendered];
        values[0].replace(/foo/g, "bar");
      }`,
    ],
    [
      "declaration destructuring",
      `async function handle() {
        const rendered = await renderSyntheticPage();
        const box = { html: rendered };
        const { html } = box;
        html.replace(/foo/g, "bar");
      }`,
    ],
  ];

  for (const [label, source] of rejectedCases) {
    if (validateHtmlFlowRegressions(source).length === 0) {
      failures.push(`flow-regression self-test did not reject ${label}`);
    }
  }

  const arrayRestMutationShape = emptyShape(2);
  arrayRestMutationShape.renderer.add("1");
  const legacyArrayRestShape = selectShape(arrayRestMutationShape, "1");
  if (hasRenderer(selectShape(legacyArrayRestShape, "0"))) {
    failures.push("flow-regression mutation control no longer distinguishes legacy array-rest propagation");
  }
  if (!hasRenderer(selectShape(sliceArrayShape(arrayRestMutationShape, 1), "0"))) {
    failures.push("flow-regression array-rest propagation did not retain renderer provenance");
  }

  const objectRestMutationShape = emptyShape();
  objectRestMutationShape.renderer.add("page");
  const legacyObjectRestShape = selectShape(objectRestMutationShape, "rest");
  if (hasRenderer(selectShape(legacyObjectRestShape, "page"))) {
    failures.push("flow-regression mutation control no longer distinguishes legacy object-rest propagation");
  }
  if (!hasRenderer(selectShape(omitShapeKeys(objectRestMutationShape, ["ignored"]), "page"))) {
    failures.push("flow-regression object-rest propagation did not retain renderer provenance");
  }

  const computedSource = ts.createSourceFile(
    "computed.ts",
    `const renderers = { ["page"]: renderSyntheticPage };`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const computedDeclaration = computedSource.statements[0]?.declarationList?.declarations?.[0];
  const computedProperty = computedDeclaration?.initializer?.properties?.[0];
  if (!computedProperty || getPropertyName(computedProperty.name) !== "page") {
    failures.push("flow-regression static computed property name was not resolved");
  }

  const allowedCases = [
    [
      "canonical pipeline",
      `async function handle() {
        const html = await applyLegacyHtmlPostProcessorPipeline(
          "/synthetic",
          await renderSyntheticPage(),
          [],
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
