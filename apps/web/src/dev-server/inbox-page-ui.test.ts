import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/dev-server/inbox-page.ts"), "utf8");

assert.match(source, /name="mappingStrategy"/, "strategy selector is rendered");
assert.match(source, /name="mappingAmount"/, "signed amount selector is rendered");
assert.match(source, /name="mappingIncomeAmount"/, "income selector is rendered");
assert.match(source, /name="mappingExpenseAmount"/, "expense selector is rendered");
assert.match(source, /Interpretação aplicada/, "preview explains the applied interpretation");
assert.match(source, /candidate\.endsWith\(" balance"\)/, "suffix balance aliases are filtered");
assert.match(source, /csv\.valueCandidates \|\| \{\}/, "detected value candidates reach the mapping UI");
assert.match(
  source,
  /\(mapping && mapping\.incomeAmount\) \|\| candidates\.incomeAmount/,
  "split candidates remain selected while the strategy is unresolved",
);
assert.match(
  source,
  /mappingStrategy\.value = detectedStrategy \|\| ""/,
  "ambiguous strategy stays unselected",
);
assert.doesNotMatch(source, /mappingKind|mappingExternalId/, "legacy controls are absent");
