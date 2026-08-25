import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const devServerPath = join(repositoryRoot, "apps/web/src/dev-server.ts");
const source = await readFile(devServerPath, "utf8");
const failures = [
  ...validateLexicalHtmlFlow(source),
  ...runLexicalGuardSelfTests(),
];

if (failures.length > 0) {
  console.error("SolverFin lexical HTML-flow contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("SolverFin lexical HTML-flow contract OK: scoped bindings, closures and aggregate aliases are guarded.");
}

function validateLexicalHtmlFlow(sourceText) {
  const sourceFile = ts.createSourceFile(
    "dev-server.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const rootScope = { id: 0, parent: null, label: "source", bindings: new Set() };
  const scopeByNode = new WeakMap();
  const allScopes = [rootScope];

  buildScopes(sourceFile, rootScope);

  const tainted = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    walk(sourceFile, rootScope, (node, scope) => {
      if (ts.isVariableDeclaration(node) && node.initializer) {
        propagateInitializer(node.name, node.initializer, scope);
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      ) {
        const target = referenceKey(node.left, scope);
        if (target) propagateValueToKey(node.right, scope, target);
      }
    });
  }

  const violations = [];
  walk(sourceFile, rootScope, (node, scope) => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      if (expressionProducesHtml(node.left, scope) || expressionProducesHtml(node.right, scope)) {
        violations.push("lexical HTML-flow violation: string concatenation rewrites rendered HTML outside applyLegacyHtmlPostProcessorPipeline");
      }
      return;
    }
    if (ts.isTemplateExpression(node)) {
      if (node.templateSpans.some((span) => expressionProducesHtml(span.expression, scope))) {
        violations.push("lexical HTML-flow violation: template literal rewrites rendered HTML outside applyLegacyHtmlPostProcessorPipeline");
      }
      return;
    }
    if (!ts.isCallExpression(node)) return;
    const name = callName(node.expression);
    if (name === "applyLegacyHtmlPostProcessorPipeline" || name === "sendHtml" || isRendererName(name)) {
      return;
    }
    const receiver = callReceiver(node.expression);
    const consumesHtml =
      (receiver ? expressionProducesHtml(receiver, scope) : false) ||
      node.arguments.some((argument) => expressionProducesHtml(argument, scope));
    if (consumesHtml) {
      violations.push(
        `lexical HTML-flow violation: ${name ?? "anonymous call"} consumes rendered HTML outside applyLegacyHtmlPostProcessorPipeline`,
      );
    }
  });
  return [...new Set(violations)];

  function buildScopes(node, scope) {
    let currentScope = scope;
    if (isFunctionLikeWithBody(node)) {
      currentScope = { id: allScopes.length, parent: scope, label: "function", bindings: new Set() };
      allScopes.push(currentScope);
      for (const parameter of node.parameters ?? []) registerBindingNames(parameter.name, currentScope);
    }
    scopeByNode.set(node, currentScope);
    if (ts.isVariableDeclaration(node)) registerBindingNames(node.name, currentScope);
    if (ts.isFunctionDeclaration(node) && node.name && scope !== currentScope) {
      scope.bindings.add(node.name.text);
    }
    if (ts.isClassDeclaration(node) && node.name) currentScope.bindings.add(node.name.text);
    ts.forEachChild(node, (child) => buildScopes(child, currentScope));
  }

  function walk(node, scope, visit) {
    const currentScope = scopeByNode.get(node) ?? scope;
    visit(node, currentScope);
    ts.forEachChild(node, (child) => walk(child, currentScope, visit));
  }

  function registerBindingNames(name, scope) {
    if (ts.isIdentifier(name)) {
      scope.bindings.add(name.text);
      return;
    }
    if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
      for (const element of name.elements) {
        if (ts.isBindingElement(element)) registerBindingNames(element.name, scope);
      }
    }
  }

  function resolveBindingScope(name, scope) {
    let current = scope;
    while (current) {
      if (current.bindings.has(name)) return current;
      current = current.parent;
    }
    return rootScope;
  }

  function identifierKey(name, scope) {
    const owner = resolveBindingScope(name, scope);
    return `${owner.id}:${name}`;
  }

  function referenceKey(expression, scope) {
    const node = unwrap(expression);
    if (ts.isIdentifier(node)) return identifierKey(node.text, scope);
    if (ts.isPropertyAccessExpression(node)) {
      const base = referenceKey(node.expression, scope);
      return base ? `${base}.${node.name.text}` : null;
    }
    if (ts.isElementAccessExpression(node)) {
      const base = referenceKey(node.expression, scope);
      const argument = unwrap(node.argumentExpression);
      if (base && (ts.isStringLiteralLike(argument) || ts.isNumericLiteral(argument))) {
        return `${base}.${argument.text}`;
      }
    }
    return null;
  }

  function mark(key) {
    if (key && !tainted.has(key)) {
      tainted.add(key);
      changed = true;
    }
  }

  function copyDescendants(fromKey, toKey) {
    if (!fromKey || !toKey) return;
    for (const key of [...tainted]) {
      if (key.startsWith(`${fromKey}.`)) {
        mark(`${toKey}${key.slice(fromKey.length)}`);
      }
    }
  }

  function propagateInitializer(bindingName, initializer, scope) {
    if (ts.isIdentifier(bindingName)) {
      propagateValueToKey(initializer, scope, identifierKey(bindingName.text, scope));
      return;
    }
    const sourceKey = referenceKey(initializer, scope);
    if (!sourceKey) return;
    if (ts.isObjectBindingPattern(bindingName)) {
      for (const element of bindingName.elements) {
        if (!ts.isBindingElement(element) || !ts.isIdentifier(element.name)) continue;
        const property = element.propertyName ? propertyName(element.propertyName) : element.name.text;
        if (!property) continue;
        const fromKey = `${sourceKey}.${property}`;
        const toKey = identifierKey(element.name.text, scope);
        if (tainted.has(fromKey)) mark(toKey);
        copyDescendants(fromKey, toKey);
      }
      return;
    }
    if (ts.isArrayBindingPattern(bindingName)) {
      for (let index = 0; index < bindingName.elements.length; index += 1) {
        const element = bindingName.elements[index];
        if (!ts.isBindingElement(element) || !ts.isIdentifier(element.name)) continue;
        const fromKey = `${sourceKey}.${index}`;
        const toKey = identifierKey(element.name.text, scope);
        if (tainted.has(fromKey)) mark(toKey);
        copyDescendants(fromKey, toKey);
      }
    }
  }

  function propagateValueToKey(expression, scope, targetKey) {
    const node = unwrap(expression);
    if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        if (ts.isPropertyAssignment(property)) {
          const name = propertyName(property.name);
          if (name) propagateValueToKey(property.initializer, scope, `${targetKey}.${name}`);
        } else if (ts.isShorthandPropertyAssignment(property)) {
          propagateValueToKey(property.name, scope, `${targetKey}.${property.name.text}`);
        } else if (ts.isSpreadAssignment(property)) {
          const fromKey = referenceKey(property.expression, scope);
          copyDescendants(fromKey, targetKey);
        }
      }
      return;
    }
    if (ts.isArrayLiteralExpression(node)) {
      let targetIndex = 0;
      for (const element of node.elements) {
        if (ts.isOmittedExpression(element)) {
          targetIndex += 1;
          continue;
        }
        if (ts.isSpreadElement(element)) {
          const fromKey = referenceKey(element.expression, scope);
          const numericEntries = [...tainted]
            .filter((key) => fromKey && key.startsWith(`${fromKey}.`))
            .map((key) => ({ key, suffix: key.slice(fromKey.length + 1) }))
            .filter((entry) => /^\d+(?:\.|$)/.test(entry.suffix));
          let maxIndex = -1;
          for (const entry of numericEntries) {
            const [indexText, ...rest] = entry.suffix.split(".");
            const sourceIndex = Number(indexText);
            maxIndex = Math.max(maxIndex, sourceIndex);
            const suffix = rest.length ? `.${rest.join(".")}` : "";
            mark(`${targetKey}.${targetIndex + sourceIndex}${suffix}`);
          }
          targetIndex += maxIndex + 1;
          continue;
        }
        propagateValueToKey(element, scope, `${targetKey}.${targetIndex}`);
        targetIndex += 1;
      }
      return;
    }
    if (expressionProducesHtml(node, scope)) mark(targetKey);
    const fromKey = referenceKey(node, scope);
    copyDescendants(fromKey, targetKey);
  }

  function expressionProducesHtml(expression, scope) {
    const node = unwrap(expression);
    const key = referenceKey(node, scope);
    if (key && tainted.has(key)) return true;
    if (ts.isObjectLiteralExpression(node)) {
      return node.properties.some((property) => {
        if (ts.isPropertyAssignment(property)) return expressionProducesHtml(property.initializer, scope);
        if (ts.isShorthandPropertyAssignment(property)) return expressionProducesHtml(property.name, scope);
        if (ts.isSpreadAssignment(property)) {
          const fromKey = referenceKey(property.expression, scope);
          return [...tainted].some((value) => fromKey && value.startsWith(`${fromKey}.`));
        }
        return false;
      });
    }
    if (ts.isArrayLiteralExpression(node)) {
      return node.elements.some(
        (element) => !ts.isOmittedExpression(element) &&
          expressionProducesHtml(ts.isSpreadElement(element) ? element.expression : element, scope),
      );
    }
    if (ts.isBinaryExpression(node)) {
      return node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
        (expressionProducesHtml(node.left, scope) || expressionProducesHtml(node.right, scope));
    }
    if (ts.isTemplateExpression(node)) {
      return node.templateSpans.some((span) => expressionProducesHtml(span.expression, scope));
    }
    if (ts.isConditionalExpression(node)) {
      return expressionProducesHtml(node.whenTrue, scope) || expressionProducesHtml(node.whenFalse, scope);
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const receiverKey = referenceKey(node.expression, scope);
      if ([...tainted].some((value) => receiverKey && value.startsWith(`${receiverKey}.`))) return true;
      return expressionProducesHtml(node.expression, scope);
    }
    if (!ts.isCallExpression(node)) return false;
    const name = callName(node.expression);
    if (name === "applyLegacyHtmlPostProcessorPipeline" || isRendererName(name)) return true;
    const receiver = callReceiver(node.expression);
    if (receiver && expressionProducesHtml(receiver, scope)) return true;
    return node.arguments.some((argument) => expressionProducesHtml(argument, scope));
  }
}

function isFunctionLikeWithBody(node) {
  return Boolean(
    (ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)) && node.body,
  );
}

function unwrap(expression) {
  let current = expression;
  while (
    ts.isAwaitExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current)
  ) current = current.expression;
  return current;
}

function callName(expression) {
  const node = unwrap(expression);
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node)) {
    const argument = unwrap(node.argumentExpression);
    if (ts.isStringLiteralLike(argument)) return argument.text;
  }
  return null;
}

function callReceiver(expression) {
  const node = unwrap(expression);
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) return node.expression;
  return null;
}

function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function isRendererName(name) {
  return typeof name === "string" && name.startsWith("render");
}

function runLexicalGuardSelfTests() {
  const prohibited = [
    ["nested closure capture", `async function handleRequest(){const rendered=await renderSyntheticPage(token);const hidden=()=>rendered.replace(/x/g,"y");return hidden();}`],
    ["object spread alias", `async function handleRequest(){const rendered=await renderSyntheticPage(token);const box={html:rendered};const alias={...box};return alias.html.replace(/x/g,"y");}`],
    ["array container", `async function handleRequest(){const rendered=await renderSyntheticPage(token);const box=[rendered];return box[0].replace(/x/g,"y");}`],
    ["array destructuring", `async function handleRequest(){const rendered=await renderSyntheticPage(token);const box=[rendered];const [html]=box;return html.replace(/x/g,"y");}`],
    ["computed object alias", `async function handleRequest(){const rendered=await renderSyntheticPage(token);const box={html:rendered};const alias=box;return alias["html"].replace(/x/g,"y");}`],
  ];
  const allowed = [
    ["canonical pipeline", `async function handleRequest(){const html=await applyLegacyHtmlPostProcessorPipeline("/synthetic",await renderSyntheticPage(token),[]);sendHtml(response,200,html);}`],
    ["shadowed nested parameter", `async function handleRequest(){const rendered=await renderSyntheticPage(token);const safe=(rendered)=>rendered.replace(/x/g,"y");safe("plain text");sendHtml(response,200,rendered);}`],
  ];
  const failures = [];
  for (const [label, fixture] of prohibited) {
    const observed = validateLexicalHtmlFlow(fixture);
    if (!observed.some((message) => message.includes("consumes rendered HTML"))) {
      failures.push(`lexical guard self-test did not reject ${label}: ${observed.join(" | ") || "none"}`);
    }
  }
  for (const [label, fixture] of allowed) {
    const observed = validateLexicalHtmlFlow(fixture);
    if (observed.length > 0) failures.push(`lexical guard self-test rejected allowed ${label}: ${observed.join(" | ")}`);
  }
  return failures;
}
