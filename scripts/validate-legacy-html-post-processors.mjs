import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const devServerPath = join(repositoryRoot, "apps/web/src/dev-server.ts");
const inventoryPath = join(
  repositoryRoot,
  "apps/web/src/dev-server/legacy-html-post-processors.ts",
);

const [devServerSource, inventorySource] = await Promise.all([
  readFile(devServerPath, "utf8"),
  readFile(inventoryPath, "utf8"),
]);

const failures = [];
const importPattern = /import\s*\{([\s\S]*?)\}\s*from\s*"([^"]+)";/g;
const importedBindings = [];

for (const match of devServerSource.matchAll(importPattern)) {
  const modulePath = match[2];
  for (const rawBinding of match[1].split(",")) {
    const binding = rawBinding.trim().replace(/^type\s+/, "");
    if (!binding) continue;

    const [exportName, alias] = binding.split(/\s+as\s+/);
    importedBindings.push({
      modulePath,
      exportName: exportName.trim(),
      localName: (alias ?? exportName).trim(),
    });
  }
}

const inventoryEntryPattern =
  /\{\s*id:\s*"([^"]+)"[\s\S]*?route:\s*"([^"]+)"[\s\S]*?order:\s*(\d+)[\s\S]*?owner:\s*"([^"]+)"[\s\S]*?module:\s*"([^"]+)"[\s\S]*?exportName:\s*"([^"]+)"/g;
const inventoryEntries = [...inventorySource.matchAll(inventoryEntryPattern)].map((match) => ({
  id: match[1],
  route: match[2],
  order: Number(match[3]),
  owner: match[4],
  modulePath: `./dev-server/${match[5].replace(/^\.\//, "")}`,
  exportName: match[6],
}));

const budgetMatch = inventorySource.match(/LEGACY_HTML_POST_PROCESSOR_BUDGET\s*=\s*(\d+)/);
const budget = budgetMatch ? Number(budgetMatch[1]) : Number.NaN;
if (!Number.isInteger(budget)) {
  failures.push("LEGACY_HTML_POST_PROCESSOR_BUDGET is missing or invalid");
} else if (inventoryEntries.length !== budget) {
  failures.push(
    `legacy inventory has ${inventoryEntries.length} entries but budget is ${budget}; every entry must declare owner/route/order/module/export and removals must ratchet the budget down`,
  );
}

for (const entry of inventoryEntries) {
  if (!entry.owner.trim()) {
    failures.push(`${entry.id} must declare a non-empty owner`);
  }
}

const importedByKey = new Map(
  importedBindings.map((entry) => [`${entry.modulePath}#${entry.exportName}`, entry]),
);
const inventoryKeys = inventoryEntries.map((entry) => `${entry.modulePath}#${entry.exportName}`);

for (const key of inventoryKeys) {
  if (!importedByKey.has(key)) {
    failures.push(`legacy inventory entry is not imported by dev-server.ts: ${key}`);
  }
}

const uniqueIds = new Set(inventoryEntries.map((entry) => entry.id));
if (uniqueIds.size !== inventoryEntries.length) {
  failures.push("legacy inventory contains duplicate ids");
}

const routes = [...new Set(inventoryEntries.map((entry) => entry.route))];
for (const route of routes) {
  const routeEntries = inventoryEntries.filter((entry) => entry.route === route);
  const expectedOrder = routeEntries.map((_, index) => index + 1);
  const actualOrder = routeEntries.map((entry) => entry.order);
  if (JSON.stringify(actualOrder) !== JSON.stringify(expectedOrder)) {
    failures.push(
      `${route} order must be contiguous and explicit: expected ${expectedOrder.join(",")}, received ${actualOrder.join(",")}`,
    );
  }

  const routePattern = new RegExp(
    `applyLegacyHtmlPostProcessorPipeline\\(\\s*"${escapeRegExp(route)}"`,
  );
  if (!routePattern.test(devServerSource)) {
    failures.push(`${route} is inventoried but does not use applyLegacyHtmlPostProcessorPipeline`);
  }
}

const pipelineInvocationCount = (
  devServerSource.match(/applyLegacyHtmlPostProcessorPipeline\s*\(/g) ?? []
).length;
if (pipelineInvocationCount !== routes.length) {
  failures.push(
    `expected exactly ${routes.length} legacy pipeline invocations, found ${pipelineInvocationCount}`,
  );
}

for (const entry of inventoryEntries) {
  const imported = importedByKey.get(`${entry.modulePath}#${entry.exportName}`);
  if (!imported) continue;

  const callPattern = new RegExp(`\\b${escapeRegExp(imported.localName)}\\s*\\(`, "g");
  const callCount = (devServerSource.match(callPattern) ?? []).length;
  if (callCount !== 1) {
    failures.push(
      `${imported.localName} must have exactly one runtime invocation through the legacy pipeline; found ${callCount}`,
    );
    continue;
  }

  const transformPattern = new RegExp(
    `transform:\\s*\\(currentHtml\\)\\s*=>\\s*${escapeRegExp(imported.localName)}\\s*\\(\\s*currentHtml(?:\\s*[,\\)])`,
  );
  if (!transformPattern.test(devServerSource)) {
    failures.push(
      `${imported.localName} is invoked outside the explicit legacy pipeline transform contract`,
    );
  }
}

failures.push(...validateHtmlFlowArchitecture(devServerSource, inventoryEntries));
failures.push(...runStructuralGuardSelfTests());

if (failures.length > 0) {
  console.error("SolverFin legacy HTML post-processor contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `SolverFin legacy HTML post-processor contract OK: ${inventoryEntries.length}/${budget} residual adapters across ${routes.length} routes with structural HTML-flow guard.`,
  );
}

function validateHtmlFlowArchitecture(source, entries) {
  const sourceFile = ts.createSourceFile(
    "dev-server.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const violations = [];
  const expectedIdsByRoute = new Map();
  for (const entry of entries) {
    const ids = expectedIdsByRoute.get(entry.route) ?? [];
    ids.push(entry.id);
    expectedIdsByRoute.set(entry.route, ids);
  }

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.body) {
      analyzeFunctionBody(statement.body, violations, expectedIdsByRoute, sourceFile);
    }
  }

  return violations;
}

function analyzeFunctionBody(body, violations, expectedIdsByRoute, sourceFile) {
  const tainted = collectTaintedIdentifiers(body);

  const visit = (node) => {
    inspectSyntaxNode(node, tainted, violations, expectedIdsByRoute, sourceFile);
    ts.forEachChild(node, visit);
  };

  visit(body);
}

function collectTaintedIdentifiers(body) {
  const tainted = new Set();
  let changed = true;

  while (changed) {
    changed = false;

    const visit = (node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        expressionProducesHtml(node.initializer, tainted) &&
        !tainted.has(node.name.text)
      ) {
        tainted.add(node.name.text);
        changed = true;
      }

      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left) &&
        expressionProducesHtml(node.right, tainted) &&
        !tainted.has(node.left.text)
      ) {
        tainted.add(node.left.text);
        changed = true;
      }

      ts.forEachChild(node, visit);
    };

    visit(body);
  }

  return tainted;
}

function inspectSyntaxNode(node, tainted, violations, expectedIdsByRoute, sourceFile) {
  if (ts.isBinaryExpression(node)) {
    if (
      node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
      (expressionProducesHtml(node.left, tainted) || expressionProducesHtml(node.right, tainted))
    ) {
      violations.push(
        "structural HTML-flow violation: string concatenation rewrites rendered HTML outside applyLegacyHtmlPostProcessorPipeline",
      );
    }
    return;
  }

  if (ts.isTemplateExpression(node)) {
    if (node.templateSpans.some((span) => expressionProducesHtml(span.expression, tainted))) {
      violations.push(
        "structural HTML-flow violation: template literal rewrites rendered HTML outside applyLegacyHtmlPostProcessorPipeline",
      );
    }
    return;
  }

  if (!ts.isCallExpression(node)) return;

  const name = getCallName(node.expression);
  if (name === "applyLegacyHtmlPostProcessorPipeline") {
    validatePipelineCall(node, violations, expectedIdsByRoute, sourceFile);
    return;
  }

  if (name !== "sendHtml" && !isRendererName(name)) {
    const receiver = getCallReceiver(node.expression);
    const consumesHtml =
      (receiver ? expressionProducesHtml(receiver, tainted) : false) ||
      node.arguments.some((argument) => expressionProducesHtml(argument, tainted));
    if (consumesHtml) {
      violations.push(
        `structural HTML-flow violation: ${name ?? "anonymous call"} consumes rendered HTML outside applyLegacyHtmlPostProcessorPipeline`,
      );
    }
  }
}

function validatePipelineCall(call, violations, expectedIdsByRoute, sourceFile) {
  const routeArgument = unwrapExpression(call.arguments[0]);
  const route = ts.isStringLiteralLike(routeArgument) ? routeArgument.text : null;
  const input = call.arguments[1];
  const steps = unwrapExpression(call.arguments[2]);

  if (input) {
    const inputNode = unwrapExpression(input);
    if (ts.isCallExpression(inputNode) && !isRendererName(getCallName(inputNode.expression))) {
      violations.push(
        `structural HTML-flow violation: legacy pipeline input must be produced directly by a renderer, received ${getCallName(inputNode.expression) ?? inputNode.getText(sourceFile)}`,
      );
    }
  }

  if (!route || !expectedIdsByRoute.has(route)) return;
  if (!steps || !ts.isArrayLiteralExpression(steps)) {
    violations.push(`${route} legacy pipeline steps must be an explicit array literal`);
    return;
  }

  const receivedIds = [];
  for (const element of steps.elements) {
    if (!ts.isObjectLiteralExpression(element)) continue;
    const idProperty = element.properties.find(
      (property) => ts.isPropertyAssignment(property) && getPropertyName(property.name) === "id",
    );
    if (!idProperty || !ts.isPropertyAssignment(idProperty)) continue;
    const initializer = unwrapExpression(idProperty.initializer);
    if (ts.isStringLiteralLike(initializer)) receivedIds.push(initializer.text);
  }

  const expectedIds = expectedIdsByRoute.get(route);
  if (JSON.stringify(receivedIds) !== JSON.stringify(expectedIds)) {
    violations.push(
      `${route} pipeline step ids must match inventory exactly: expected [${expectedIds.join(", ")}], received [${receivedIds.join(", ")}]`,
    );
  }
}

function expressionProducesHtml(expression, tainted) {
  const node = unwrapExpression(expression);

  if (ts.isIdentifier(node)) return tainted.has(node.text);
  if (ts.isBinaryExpression(node)) {
    return (
      node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
      (expressionProducesHtml(node.left, tainted) || expressionProducesHtml(node.right, tainted))
    );
  }
  if (ts.isTemplateExpression(node)) {
    return node.templateSpans.some((span) => expressionProducesHtml(span.expression, tainted));
  }
  if (ts.isConditionalExpression(node)) {
    return (
      expressionProducesHtml(node.whenTrue, tainted) ||
      expressionProducesHtml(node.whenFalse, tainted)
    );
  }
  if (!ts.isCallExpression(node)) return false;

  const name = getCallName(node.expression);
  if (name === "applyLegacyHtmlPostProcessorPipeline" || isRendererName(name)) return true;
  const receiver = getCallReceiver(node.expression);
  if (receiver && expressionProducesHtml(receiver, tainted)) return true;
  return node.arguments.some((argument) => expressionProducesHtml(argument, tainted));
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
    const argument = unwrapExpression(node.argumentExpression);
    if (ts.isStringLiteralLike(argument)) return argument.text;
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

function getPropertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  return null;
}

function isRendererName(name) {
  return typeof name === "string" && name.startsWith("render");
}

function runStructuralGuardSelfTests() {
  const syntheticInventory = [
    {
      id: "canonical-adapter",
      route: "/synthetic",
      order: 1,
      owner: "synthetic-owner",
      modulePath: "./synthetic.js",
      exportName: "canonicalAdapter",
    },
  ];
  const expectedFailureFragments = [
    {
      label: "filename-independent post-processor",
      fragment: "newHtmlPostProcessor consumes rendered HTML",
      source: `
        async function handleRequest() {
          const rendered = await renderSyntheticPage(token);
          const rewritten = newHtmlPostProcessor(rendered);
          sendHtml(response, 200, rewritten);
        }
      `,
    },
    {
      label: "generic final-html rewriter",
      fragment: "rewriteFinalHtml consumes rendered HTML",
      source: `
        async function handleRequest() {
          const rendered = await renderSyntheticPage(token);
          const rewritten = rewriteFinalHtml(rendered);
          sendHtml(response, 200, rewritten);
        }
      `,
    },
    {
      label: "native replace",
      fragment: "replace consumes rendered HTML",
      source: `
        async function handleRequest() {
          const rendered = await renderSyntheticPage(token);
          const rewritten = rendered.replace(/foo/g, "bar");
          sendHtml(response, 200, rewritten);
        }
      `,
    },
    {
      label: "native replaceAll",
      fragment: "replaceAll consumes rendered HTML",
      source: `
        async function handleRequest() {
          const rendered = await renderSyntheticPage(token);
          const rewritten = rendered.replaceAll("foo", "bar");
          sendHtml(response, 200, rewritten);
        }
      `,
    },
    {
      label: "return-contained native replace",
      fragment: "replace consumes rendered HTML",
      source: `
        async function handleRequest() {
          return sendHtml(
            response,
            200,
            (await renderSyntheticPage(token)).replace(/foo/g, "bar"),
          );
        }
      `,
    },
    {
      label: "computed native replace",
      fragment: "replace consumes rendered HTML",
      source: `
        async function handleRequest() {
          const rendered = await renderSyntheticPage(token);
          const rewritten = rendered["replace"](/foo/g, "bar");
          sendHtml(response, 200, rewritten);
        }
      `,
    },
    {
      label: "loop-contained native replace",
      fragment: "replace consumes rendered HTML",
      source: `
        async function handleRequest() {
          const rendered = await renderSyntheticPage(token);
          for (const marker of markers) {
            const rewritten = rendered.replace(marker, "bar");
            sendHtml(response, 200, rewritten);
          }
        }
      `,
    },
    {
      label: "string concatenation",
      fragment: "string concatenation rewrites rendered HTML",
      source: `
        async function handleRequest() {
          const rendered = await renderSyntheticPage(token);
          const rewritten = rendered + "<div>extra</div>";
          sendHtml(response, 200, rewritten);
        }
      `,
    },
    {
      label: "template literal",
      fragment: "template literal rewrites rendered HTML",
      source: `
        async function handleRequest() {
          const rendered = await renderSyntheticPage(token);
          const rewritten = \`\${rendered}<div>extra</div>\`;
          sendHtml(response, 200, rewritten);
        }
      `,
    },
    {
      label: "pre-pipeline wrapper",
      fragment: "legacy pipeline input must be produced directly by a renderer",
      source: `
        async function handleRequest() {
          const html = await applyLegacyHtmlPostProcessorPipeline(
            "/synthetic",
            rewriteFinalHtml(await renderSyntheticPage(token)),
            [{ id: "canonical-adapter", transform: (currentHtml) => canonicalAdapter(currentHtml) }],
          );
          sendHtml(response, 200, html);
        }
      `,
    },
  ];

  const allowedSource = `
    async function handleRequest() {
      const html = await applyLegacyHtmlPostProcessorPipeline(
        "/synthetic",
        await renderSyntheticPage(token),
        [{ id: "canonical-adapter", transform: (currentHtml) => canonicalAdapter(currentHtml) }],
      );
      sendHtml(response, 200, html);
    }
  `;
  const allowedFailures = validateHtmlFlowArchitecture(allowedSource, syntheticInventory);
  const failures = [];
  if (allowedFailures.length > 0) {
    failures.push(
      `structural guard self-test rejected canonical flow: ${allowedFailures.join(" | ")}`,
    );
  }

  for (const testCase of expectedFailureFragments) {
    const observed = validateHtmlFlowArchitecture(testCase.source, syntheticInventory);
    if (!observed.some((failure) => failure.includes(testCase.fragment))) {
      failures.push(
        `structural guard self-test did not reject ${testCase.label}; observed: ${observed.join(" | ") || "none"}`,
      );
    }
  }

  return failures;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
