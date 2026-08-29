import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const sourceRoot = resolve(root, "apps/web/src/dev-server");
const boundaryRoot = resolve(sourceRoot, "accounts-cards");

const expectedModules = [
  "types.ts",
  "view-model.ts",
  "presentation.ts",
  "components.ts",
  "dialogs.ts",
  "runtime.ts",
  "styles.ts",
  "page.ts",
  "view-model.test.ts",
];

const failures = [];

for (const moduleName of expectedModules) {
  const filePath = resolve(boundaryRoot, moduleName);
  if (!existsSync(filePath)) failures.push(`missing boundary module: ${moduleName}`);
}

const facadePath = resolve(sourceRoot, "accounts-cards-page.ts");
const facade = readFileSync(facadePath, "utf8").trim();
if (facade !== 'export { renderAccountsCardsPage } from "./accounts-cards/page.js";') {
  failures.push(
    "accounts-cards-page.ts must remain a compatibility facade for the structured page module",
  );
}

const page = readFileSync(resolve(boundaryRoot, "page.ts"), "utf8");
for (const importNeedle of [
  'from "./components.js"',
  'from "./dialogs.js"',
  'from "./runtime.js"',
  'from "./styles.js"',
  'from "./view-model.js"',
]) {
  if (!page.includes(importNeedle)) {
    failures.push(`page.ts is not composed through ${importNeedle}`);
  }
}

for (const forbiddenNeedle of [
  "function apiFormScript",
  "function masterPageScript",
  "function baseCss",
]) {
  if (page.includes(forbiddenNeedle)) {
    failures.push(`page.ts still owns extracted responsibility: ${forbiddenNeedle}`);
  }
}

const viewModel = readFileSync(resolve(boundaryRoot, "view-model.ts"), "utf8");
for (const forbiddenNeedle of [
  "apiGet(",
  "<script",
  "<style",
  "renderAuthenticatedShellDocument",
]) {
  if (viewModel.includes(forbiddenNeedle)) {
    failures.push(`view-model.ts crossed its data-preparation boundary: ${forbiddenNeedle}`);
  }
}

const legacyShimPath = resolve(sourceRoot, "accounts-cards-page-dialog-only.ts");
const expectedLegacyShim =
  'export { keepCardInstrumentsInsideEditDialog } from "./accounts-cards-dialog-transition.js";';
if (!existsSync(legacyShimPath)) {
  failures.push("accounts-cards-page-dialog-only.ts compatibility shim is missing");
} else if (readFileSync(legacyShimPath, "utf8").trim() !== expectedLegacyShim) {
  failures.push(
    "accounts-cards-page-dialog-only.ts must remain a thin compatibility shim without a renderer implementation",
  );
}

const transitionPath = resolve(sourceRoot, "accounts-cards-dialog-transition.ts");
if (!existsSync(transitionPath)) {
  failures.push("accounts-cards-dialog-transition.ts is missing");
} else {
  const transition = readFileSync(transitionPath, "utf8");
  if (!transition.includes("export function moveCardInstrumentsToDedicatedDialog")) {
    failures.push("dialog transition must expose the active HTML migration transform");
  }
  if (!transition.includes("keepCardInstrumentsInsideEditDialog")) {
    failures.push("dialog transition must preserve the compatibility transform export");
  }
  if (transition.includes("export async function renderAccountsCardsPage")) {
    failures.push("dialog transition must not expose a parallel page renderer");
  }
}

const obsoleteTransitionPath = resolve(boundaryRoot, "dialog-transition.ts");
if (existsSync(obsoleteTransitionPath)) {
  failures.push("legacy dialog transition must stay outside the structured accounts-cards boundary");
}

const server = readFileSync(resolve(root, "apps/web/src/dev-server.ts"), "utf8");
for (const transitionalProcessor of [
  "accounts-cards-tabs",
  "accounts-cards-standardization",
  "accounts-cards-action-menus",
]) {
  if (!server.includes(`id: "${transitionalProcessor}"`)) {
    failures.push(
      `intentional transition processor disappeared without route migration: ${transitionalProcessor}`,
    );
  }
}

if (failures.length > 0) {
  console.error("Accounts/Cards UI boundary contract failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Accounts/Cards UI boundary contract: ok");
