import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const devServerPath = join(repositoryRoot, "apps/web/src/dev-server.ts");
const selfTestOnly = process.argv.includes("--self-test-only");

const emptyShape = () => ({ html: new Set(), renderer: new Set() });
const cloneShape = (shape) => ({
  html: new Set(shape?.html ?? []),
  renderer: new Set(shape?.renderer ?? []),
});
const hasHtml = (shape) => shape.html.size > 0;
const hasRenderer = (shape) => shape.renderer.size > 0;

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
  return { html: mapPaths(shape.html, prefix), renderer: mapPaths(shape.renderer, prefix) };
}

function selectShape(shape, key) {
  const select = (path) => {
    if (path === key) return "";
    return path.startsWith(`${key}.`) ? path.slice(key.length + 1) : null;
  };
  return { html: mapPaths(shape.html, select), renderer: mapPaths(shape.renderer, select) };
}

function shiftArrayShape(shape, offset) {
  const shift = (path) => {
    const [head, ...tail] = path.split(".");
    const index = Number(head);
    if (!Number.isInteger(index) || index < 0) return path;
    const shifted = String(index + offset);
    return tail.length > 0 ? `${shifted}.${tail.join(".")}` : shifted;
  };
  return { html: mapPaths(shape.html, shift), renderer: mapPaths(shape.renderer, shift) };
}

function inferArraySpan(shape) {
  let maxIndex = -1;
  for (const paths of [shape.html, shape.renderer]) {
    for (const path of paths) {
      const [head] = path.split(".");
      const index = Number(head);
      if (Number.isInteger(index) && index >= 0) maxIndex = Math.max(maxIndex, index);
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
    return this.bindings.has(name) ? this : (this.parent?.owner(name) ?? null);
  }
  lookup(name) {
    if (this.bindings.has(name)) return cloneShape(this.bindings.get(name));
    return this.parent ? this.parent.lookup(name) : null;
  }
  assign(name, shape) {
    const owner = this.owner(name);
    if (owner) owner.bindings.set(name, cloneShape(shape));
    else this.declare(name, shape);
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
    for (const statement of node.statements) visitNode(statement, blockScope, violations);
    return;
  }
  if (ts.isVariableDeclaration(node)) {
    if (node.initializer) visitNode(node.initializer, scope, violations);
    declarePattern(node.name, node.initializer ? evaluate(node.initializer, scope) : emptyShape(), scope);
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
      if (hasHtml(evaluate(node.left, scope)) || hasHtml(evaluate(node.right, scope))) {
        violations.add("flow regression violation: += rewrites rendered HTML outside the legacy pipeline");
        assignTarget(node.left, { html: new Set([""]), renderer: new Set() }, scope);
      }
      return;
    }
    if (
      node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
      (hasHtml(evaluate(node.left, scope)) || hasHtml(evaluate(node.right, scope)))
    ) {
      violations.add("flow regression violation: + rewrites rendered HTML outside the legacy pipeline");
    }
  }
  if (
    ts.isTemplateExpression(node) &&
    node.templateSpans.some((span) => hasHtml(evaluate(span.expression, scope)))
  ) {
    violations.add("flow regression violation: template literal rewrites rendered HTML outside the legacy pipeline");
  }
  if (ts.isCallExpression(node)) inspectCall(node, scope, violations);
  ts.forEachChild(node, (child) => visitNode(child, scope, violations));
}

function visitFunction(node, parentScope, violations) {
  const scope = new Scope(parentScope);
  if (node.name && ts.isIdentifier(node.name)) {
    scope.declare(node.name.text, {
      html: new Set(),
      renderer: isRendererName(node.name.text) ? new Set([""]) : new Set(),
    });
  }
  for (const parameter of node.parameters ?? []) {
    declarePattern(parameter.name, emptyShape(), scope);
    if (parameter.initializer) visitNode(parameter.initializer, scope, violations);
  }
  if (node.body) visitNode(node.body, scope, violations);
}

function inspectCall(call, scope, violations) {
  const name = getCallName(call.expression);
  if (
    name === "sendHtml" ||
    name === "applyLegacyHtmlPostProcessorPipeline" ||
    isRendererCallable(call.expression, scope)
  ) return;
  const receiver = getCallReceiver(call.expression);
  if (
    Boolean(receiver && hasHtml(evaluate(receiver, scope))) ||
    call.arguments.some((argument) => hasHtml(evaluate(argument, scope)))
  ) {
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
      ? { html: new Set(), renderer: new Set([""]) }
      : emptyShape();
  }
  if (ts.isCallExpression(node)) {
    const name = getCallName(node.expression);
    if (name === "applyLegacyHtmlPostProcessorPipeline" || isRendererCallable(node.expression, scope)) {
      return { html: new Set([""]), renderer: new Set() };
    }
    const receiver = getCallReceiver(node.expression);
    return (receiver && hasHtml(evaluate(receiver, scope))) ||
      node.arguments.some((argument) => hasHtml(evaluate(argument, scope)))
      ? { html: new Set([""]), renderer: new Set() }
      : emptyShape();
  }
  if (ts.isPropertyAccessExpression(node)) return selectShape(evaluate(node.expression, scope), node.name.text);
  if (ts.isElementAccessExpression(node)) {
    const key = getElementKey(node.argumentExpression);
    return key === null ? emptyShape() : selectShape(evaluate(node.expression, scope), key);
  }
  if (ts.isObjectLiteralExpression(node)) return evaluateObject(node, scope);
  if (ts.isArrayLiteralExpression(node)) return evaluateArray(node, scope);
  if (
    ts.isBinaryExpression(node) &&
    (node.operatorToken.kind === ts.SyntaxKind.PlusToken || node.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken)
  ) {
    return hasHtml(evaluate(node.left, scope)) || hasHtml(evaluate(node.right, scope))
      ? { html: new Set([""]), renderer: new Set() }
      : emptyShape();
  }
  if (ts.isTemplateExpression(node)) {
    return node.templateSpans.some((span) => hasHtml(evaluate(span.expression, scope)))
      ? { html: new Set([""]), renderer: new Set() }
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
    if (ts.isSpreadAssignment(property)) shape = mergeShapes(shape, evaluate(property.expression, scope));
    else if (ts.isShorthandPropertyAssignment(property)) {
      shape = mergeShapes(shape, prefixShape(evaluate(property.name, scope), property.name.text));
    } else if (ts.isPropertyAssignment(property)) {
      const key = getPropertyName(property.name);
      if (key !== null) shape = mergeShapes(shape, prefixShape(evaluate(property.initializer, scope), key));
    }
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
  return shape;
}

function declarePattern(pattern, shape, scope) {
  if (ts.isIdentifier(pattern)) {
    scope.declare(pattern.text, shape);
    return;
  }
  if (ts.isObjectBindingPattern(pattern)) {
    for (const element of pattern.elements) {
      const key = element.propertyName
        ? getPropertyName(element.propertyName)
        : ts.isIdentifier(element.name)
          ? element.name.text
          : null;
      if (key !== null) declarePattern(element.name, selectShape(shape, key), scope);
    }
  } else if (ts.isArrayBindingPattern(pattern)) {
    pattern.elements.forEach((element, index) => {
      if (ts.isBindingElement(element)) declarePattern(element.name, selectShape(shape, String(index)), scope);
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
      if (ts.isShorthandPropertyAssignment(property)) assignTarget(property.name, selectShape(shape, property.name.text), scope);
      else if (ts.isPropertyAssignment(property)) {
        const key = getPropertyName(property.name);
        if (key !== null) assignTarget(property.initializer, selectShape(shape, key), scope);
      }
    }
    return;
  }
  if (ts.isArrayLiteralExpression(node)) {
    node.elements.forEach((element, index) => {
      if (!ts.isOmittedExpression(element) && !ts.isSpreadElement(element)) {
        assignTarget(element, selectShape(shape, String(index)), scope);
      }
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
      if (existing === prefix || existing.startsWith(`${prefix}.`)) paths.delete(existing);
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
  ) current = current.expression;
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
  return ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)
    ? node.expression
    : null;
}

function getElementKey(expression) {
  const node = unwrapExpression(expression);
  return ts.isStringLiteralLike(node) || ts.isNumericLiteral(node) ? node.text : null;
}

function getPropertyName(name) {
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)
    ? name.text
    : null;
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

const isRendererName = (name) => typeof name === "string" && name.startsWith("render");

function runSelfTests() {
  const failures = [];
  const rejectedCases = [
    ["compound assignment", 'async function h(){let html=await renderPage();html+="x";sendHtml(r,200,html)}'],
    ["compound assignment through property", 'async function h(){const b={html:await renderPage()};b.html+="x";sendHtml(r,200,b.html)}'],
    ["renderer alias", 'async function h(){const p=renderPage;const html=await p();html.replace(/x/g,"y")}'],
    ["renderer alias chain", 'async function h(){const a=renderPage;const b=a;helper(await b())}'],
    ["renderer stored in object", 'async function h(){const rs={page:renderPage};const html=await rs.page();html.replace(/x/g,"y")}'],
    ["renderer stored in array", 'async function h(){const rs=[renderPage];helper(await rs[0]())}'],
    ["renderer shifted array spread", 'async function h(){const rs=[renderPage];const copy=[null,...rs];helper(await copy[1]())}'],
    ["renderer array destructuring", 'async function h(){const rs=[renderPage];const [page]=rs;helper(await page())}'],
    ["renderer recovered by destructuring", 'async function h(){const rs={page:renderPage};const {page}=rs;const html=await page();html.replace(/x/g,"y")}'],
    ["renderer container spread", 'async function h(){const rs={page:renderPage};const copy={...rs};helper(await copy.page())}'],
    ["renderer assignment through property", 'async function h(){const rs={};rs.page=renderPage;const html=await rs.page();html.replace(/x/g,"y")}'],
    ["object destructuring assignment", 'async function h(){const b={html:await renderPage()};let html;({html}=b);html.replace(/x/g,"y")}'],
    ["array destructuring assignment", 'async function h(){const v=[await renderPage()];let html;[html]=v;helper(html)}'],
    ["neutral-name consumer", 'async function h(){const html=await renderPage();sendHtml(r,200,neutral(html))}'],
    ["pre-pipeline wrapper", 'async function h(){sendHtml(r,200,rewrite(await renderPage()))}'],
    ["loop-contained rewrite", 'async function h(){const html=await renderPage();for(const x of ["x"])html.replace(x,"y")}'],
    ["computed member rewrite", 'async function h(){const html=await renderPage();html["replace"](/x/g,"y")}'],
    ["direct concatenation", 'async function h(){const html=await renderPage();sendHtml(r,200,html+"x")}'],
    ["template rewrite", 'async function h(){const html=await renderPage();sendHtml(r,200,`<main>${html}</main>`)}'],
    ["closure capture", 'async function h(){const html=await renderPage();function n(){return html.replace(/x/g,"y")}return n()}'],
    ["arrow function container", 'const h=async()=>{const html=await renderPage();html.replace(/x/g,"y")}'],
    ["class method container", 'class H{async run(){const html=await renderPage();html.replace(/x/g,"y")}}'],
    ["object spread html alias", 'async function h(){const b={html:await renderPage()};const c={...b};c.html.replace(/x/g,"y")}'],
    ["array html alias", 'async function h(){const v=[await renderPage()];v[0].replace(/x/g,"y")}'],
    ["declaration destructuring", 'async function h(){const b={html:await renderPage()};const {html}=b;html.replace(/x/g,"y")}'],
  ];
  for (const [label, source] of rejectedCases) {
    if (validateHtmlFlowRegressions(source).length === 0) failures.push(`flow-regression self-test did not reject ${label}`);
  }
  const allowedCases = [
    ["canonical pipeline", 'async function h(){const html=await applyLegacyHtmlPostProcessorPipeline("/x",await renderPage(),[]);sendHtml(r,200,html)}'],
    ["shadowed renderer-like identifier", 'async function h(){const renderPage=()=>"text";const value=renderPage();value.replace(/x/g,"y")}'],
  ];
  for (const [label, source] of allowedCases) {
    const observed = validateHtmlFlowRegressions(source);
    if (observed.length > 0) failures.push(`flow-regression self-test rejected ${label}: ${observed.join(" | ")}`);
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
