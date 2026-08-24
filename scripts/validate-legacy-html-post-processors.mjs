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
const inventoryKeys = inventoryEntries.map(
  (entry) => `${entry.modulePath}#${entry.exportName}`,
);

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
      analyzeBlock(statement.body, new Set(), violations, expectedIdsByRoute, sourceFile);
    }
  }

  return violations;
}

function analyzeBlock(block, inheritedTaint, violations, expectedIdsByRoute, sourceFile) {
  const tainted = new Set(inheritedTaint);

  for (const statement of block.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!declaration.initializer) continue;
        inspectExpression(declaration.initializer, tainted, violations, expectedIdsByRoute, sourceFile);
        if (
          ts.isIdentifier(declaration.name) &&
          expressionProducesHtml(declaration.initializer, tainted)
        ) {
          tainted.add(declaration.name.text);
        }
      }
      continue;
    }

    if (ts.isExpressionStatement(statement)) {
      inspectExpression(statement.expression, tainted, violations, expectedIdsByRoute, sourceFile);
      continue;
    }

    if (ts.isIfStatement(statement)) {
      inspectExpression(statement.expression, tainted, violations, expectedIdsByRoute, sourceFile);
      analyzeNestedStatement(
        statement.thenStatement,
        tainted,
        violations,
        expectedIdsByRoute,
        sourceFile,
      );
      if (statement.elseStatement) {
        analyzeNestedStatement(
          statement.elseStatement,
          tainted,
          violations,
          expectedIdsByRoute,
          sourceFile,
        );
      }
      continue;
    }

    if (ts.isTryStatement(statement)) {
      analyzeBlock(statement.tryBlock, tainted, violations, expectedIdsByRoute, sourceFile);
      if (statement.catchClause?.block) {
        analyzeBlock(statement.catchClause.block, tainted, violations, expectedIdsByRoute, sourceFile);
      }
      if (statement.finallyBlock) {
        analyzeBlock(statement.finallyBlock, tainted, violations, expectedIdsByRoute, sourceFile);
      }
      continue;
    }

    if (ts.isBlock(statement)) {
      analyzeBlock(statement, tainted, violations, expectedIdsByRoute, sourceFile);
    }
  }
}

function analyzeNestedStatement(statement, tainted, violations, expectedIdsByRoute, sourceFile) {
  if (ts.isBlock(statement)) {
    analyzeBlock(statement, new Set(tainted), violations, expectedIdsByRoute, sourceFile);
    return;
  }

  const syntheticBlock = ts.factory.createBlock([statement], true);
  analyzeBlock(syntheticBlock, new Set(tainted), violations, expectedIdsByRoute, sourceFile);
}

function inspectExpression(expression, tainted, violations, expectedIdsByRoute, sourceFile) {
  const node = unwrapExpression(expression);

  if (ts.isBinaryExpression(node)) {
    inspectExpression(node.left, tainted, violations, expectedIdsByRoute, sourceFile);
    inspectExpression(node.right, tainted, violations, expectedIdsByRoute, sourceFile);
    return;
  }

  if (!ts.isCallExpression(node)) return;

  const name = getCallName(node.expression);
  if (name === "applyLegacyHtmlPostProcessorPipeline") {
    validatePipelineCall(node, tainted, violations, expectedIdsByRoute, sourceFile);
    return;
  }

  if (name !== "sendHtml" && !isRendererName(name)) {
    const consumesHtml = node.arguments.some((argument) =>
      expressionProducesHtml(argument, tainted),
    );
    if (consumesHtml) {
      violations.push(
        `structural HTML-flow violation: ${name ?? "anonymous call"} consumes rendered HTML outside applyLegacyHtmlPostProcessorPipeline`,
      );
    }
  }

  for (const argument of node.arguments) {
    inspectExpression(argument, tainted, violations, expectedIdsByRoute, sourceFile);
  }
}

function validatePipelineCall(call, tainted, violations, expectedIdsByRoute, sourceFile) {
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
    inspectExpression(input, tainted, violations, expectedIdsByRoute, sourceFile);
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
      (property) =>
        ts.isPropertyAssignment(property) &&
        getPropertyName(property.name) === "id",
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
  if (!ts.isCallExpression(node)) return false;

  const name = getCallName(node.expression);
  if (name === "applyLegacyHtmlPostProcessorPipeline" || isRendererName(name)) return true;
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
    failures.push(`structural guard self-test rejected canonical flow: ${allowedFailures.join(" | ")}`);
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
