import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const compiledTestDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(compiledTestDir, "..", "..");
const document = readFileSync(path.join(repoRoot, "docs", "CREDIT_CARD_GROUPING_MODEL.md"), "utf8");

runDocumentsCoreGroupingConcepts();
runDocumentsPurchaseAndRecurrenceTraceability();
runDocumentsApiAndRetiredLegacyFlow();

function runDocumentsCoreGroupingConcepts(): void {
  assertIncludes("cartao agrupador/fatura");
  assertIncludes("instrumento interno");
  assertIncludes("Titularidade e default");
  assertIncludes("`physical` ou `virtual`");
  assertIncludes("`primary` ou `additional`");
  assertIncludes("Um agrupador sem instrumentos ativos fica `blocked`");
  assertIncludes("Bandeira e limite total pertencem ao agrupador");
  assertIncludes(
    "A soma dos limites individuais dos instrumentos ativos nao pode ultrapassar o limite total do agrupador",
  );
}

function runDocumentsPurchaseAndRecurrenceTraceability(): void {
  assertIncludes(
    "A fatura e resolvida sempre pelo cartao agrupador e pelo periodo",
  );
  assertIncludes(
    "Compras feitas em instrumentos diferentes do mesmo agrupador entram na mesma fatura",
  );
  assertIncludes("`cardInstrumentId`");
  assertIncludes("Recorrencias preservam o instrumento definido na criacao");
  assertIncludes(
    "O default apenas sugere o instrumento em novas compras e novas recorrencias",
  );
}

function runDocumentsApiAndRetiredLegacyFlow(): void {
  assertIncludes("`GET /api/credit-card-accounts`");
  assertIncludes("`POST /api/credit-card-accounts`");
  assertIncludes("`PATCH /api/credit-card-accounts/:cardId/default-instrument`");
  assertIncludes("`POST /api/credit-card-accounts/:cardId/purchases`");
  assertIncludes("`POST /api/credit-card-instruments/:instrumentId/archive`");
  assertIncludes("`CardAdditionalLink` foi retirado do fluxo principal");
  assertIncludes(
    "`/api/card-additional-links` tambem nao participa do fluxo principal",
  );
}

function assertIncludes(expected: string): void {
  assert.match(
    document,
    new RegExp(escapeRegExp(expected)),
    `${expected} should be documented`,
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
