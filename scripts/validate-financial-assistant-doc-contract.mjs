import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const documentationFiles = [
  "docs/ARCHITECTURE.md",
  "docs/PRODUCT.md",
  "docs/PRIVACY.md",
  "docs/STATUS_MATRIX.md",
  "docs/FINANCIAL_ASSISTANT.md",
  "docs/ai/assistant-and-insights.md",
  "docs/ai/providers.md",
  "docs/adr/0011-read-only-financial-assistant.md",
];

const forbiddenAssistantProviderClaims = [
  /narrativa qualitativa/i,
  /narrativa opcional do assistente/i,
  /provider opcional de narrativa/i,
  /assistente[^\n]{0,180}(?:restrito|limitado|serve apenas)[^\n]{0,80}narrativa/i,
];

const failures = [];

for (const relativePath of documentationFiles) {
  const content = await readFile(resolve(relativePath), "utf8");

  for (const pattern of forbiddenAssistantProviderClaims) {
    if (pattern.test(content)) {
      failures.push(`${relativePath}: contrato antigo de narrativa livre (${pattern})`);
    }
  }

  if (!content.includes("DIRECT") || !content.includes("CONTEXTUAL")) {
    failures.push(`${relativePath}: deve registrar as diretivas fechadas DIRECT e CONTEXTUAL`);
  }
}

assert.deepEqual(
  failures,
  [],
  `Contrato documental do assistente divergente:\n${failures.map((item) => `- ${item}`).join("\n")}`,
);

console.log("Financial assistant documentation contract is consistent.");
