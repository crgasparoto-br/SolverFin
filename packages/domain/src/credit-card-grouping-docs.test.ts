import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const document = readFileSync(
  path.join(repoRoot, "docs", "CREDIT_CARD_GROUPING_MODEL.md"),
  "utf8",
);

runDocumentsCreditCardGroupingModel();

function runDocumentsCreditCardGroupingModel(): void {
  assert.match(document, /cartao agrupador\/fatura/);
  assert.match(document, /instrumento interno/);
  assert.match(document, /Titularidade e default/);
  assert.match(document, /`physical` ou `virtual`/);
  assert.match(document, /`primary` ou `additional`/);
  assert.match(document, /instrumentos ativos fica `blocked`/);
  assert.match(document, /Bandeira e limite total pertencem ao agrupador/);
  assert.match(document, /soma dos limites individuais dos instrumentos ativos/);
  assert.match(document, /fatura e resolvida sempre pelo cartao agrupador/);
  assert.match(document, /instrumentos diferentes do mesmo agrupador entram na mesma fatura/);
  assert.match(document, /`cardInstrumentId`/);
  assert.match(document, /Recorrencias preservam o instrumento definido na criacao/);
  assert.match(document, /default apenas sugere o instrumento em novas compras/);
  assert.match(document, /`GET \/api\/credit-card-accounts`/);
  assert.match(document, /`POST \/api\/credit-card-accounts`/);
  assert.match(document, /`PATCH \/api\/credit-card-accounts\/:cardId\/default-instrument`/);
  assert.match(document, /`POST \/api\/credit-card-accounts\/:cardId\/purchases`/);
  assert.match(document, /`POST \/api\/credit-card-instruments\/:instrumentId\/archive`/);
  assert.match(document, /`CardAdditionalLink` foi retirado do fluxo principal/);
  assert.match(document, /`\/api\/card-additional-links` tambem nao participa/);
}
