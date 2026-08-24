import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
const legacyModulePattern =
  /^\.\/dev-server\/.+(?:enhancement|standardization|finalizer)\.js$/;
const importPattern = /import\s*\{([\s\S]*?)\}\s*from\s*"([^"]+)";/g;
const importedProcessors = [];

for (const match of devServerSource.matchAll(importPattern)) {
  const modulePath = match[2];
  if (!legacyModulePattern.test(modulePath)) continue;

  for (const rawBinding of match[1].split(",")) {
    const binding = rawBinding.trim().replace(/^type\s+/, "");
    if (!binding) continue;

    const [exportName, alias] = binding.split(/\s+as\s+/);
    importedProcessors.push({
      modulePath,
      exportName: exportName.trim(),
      localName: (alias ?? exportName).trim(),
    });
  }
}

const inventoryEntryPattern =
  /\{\s*id:\s*"([^"]+)"[\s\S]*?route:\s*"([^"]+)"[\s\S]*?order:\s*(\d+)[\s\S]*?module:\s*"([^"]+)"[\s\S]*?exportName:\s*"([^"]+)"/g;
const inventoryEntries = [...inventorySource.matchAll(inventoryEntryPattern)].map((match) => ({
  id: match[1],
  route: match[2],
  order: Number(match[3]),
  modulePath: `./dev-server/${match[4].replace(/^\.\//, "")}`,
  exportName: match[5],
}));

const budgetMatch = inventorySource.match(/LEGACY_HTML_POST_PROCESSOR_BUDGET\s*=\s*(\d+)/);
const budget = budgetMatch ? Number(budgetMatch[1]) : Number.NaN;
if (!Number.isInteger(budget)) {
  failures.push("LEGACY_HTML_POST_PROCESSOR_BUDGET is missing or invalid");
} else if (inventoryEntries.length !== budget) {
  failures.push(
    `legacy inventory has ${inventoryEntries.length} entries but budget is ${budget}; removals must ratchet the budget down and additions are not a default extension path`,
  );
}

const sourceKeys = importedProcessors
  .map((entry) => `${entry.modulePath}#${entry.exportName}`)
  .sort();
const inventoryKeys = inventoryEntries
  .map((entry) => `${entry.modulePath}#${entry.exportName}`)
  .sort();

if (JSON.stringify(sourceKeys) !== JSON.stringify(inventoryKeys)) {
  const sourceSet = new Set(sourceKeys);
  const inventorySet = new Set(inventoryKeys);
  const unregistered = sourceKeys.filter((key) => !inventorySet.has(key));
  const stale = inventoryKeys.filter((key) => !sourceSet.has(key));
  if (unregistered.length > 0) {
    failures.push(`unregistered legacy imports: ${unregistered.join(", ")}`);
  }
  if (stale.length > 0) {
    failures.push(`stale legacy inventory entries: ${stale.join(", ")}`);
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

for (const processor of importedProcessors) {
  const callPattern = new RegExp(`\\b${escapeRegExp(processor.localName)}\\s*\\(`, "g");
  const callCount = (devServerSource.match(callPattern) ?? []).length;
  if (callCount !== 1) {
    failures.push(
      `${processor.localName} must have exactly one runtime invocation through the legacy pipeline; found ${callCount}`,
    );
    continue;
  }

  const transformPattern = new RegExp(
    `transform:\\s*\\(currentHtml\\)\\s*=>\\s*${escapeRegExp(processor.localName)}\\s*\\(\\s*currentHtml(?:\\s*[,\\)])`,
  );
  if (!transformPattern.test(devServerSource)) {
    failures.push(
      `${processor.localName} is invoked outside the explicit legacy pipeline transform contract`,
    );
  }
}

if (failures.length > 0) {
  console.error("SolverFin legacy HTML post-processor contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `SolverFin legacy HTML post-processor contract OK: ${inventoryEntries.length}/${budget} residual adapters across ${routes.length} routes.`,
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
