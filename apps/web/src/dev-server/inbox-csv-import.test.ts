import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const currentDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(currentDir, "inbox-page.js"), "utf8");

describe("Inbox CSV import review contract", () => {
  it("keeps preview separate from persisted batch creation and requires consent", () => {
    assert.match(source, /\/api\/import-batches\/csv\/preview/);
    assert.match(source, /consentAccepted:\s*true/);
    assert.match(source, /MAX_CSV_BYTES/);
    assert.match(source, /extensão \.csv/);
    assert.match(source, /fileData\.content\s*=\s*""/);
    assert.doesNotMatch(source, /state\.fileContent/);
  });

  it("renders only the normalized preview sample", () => {
    assert.match(source, /sourceRowNumber/);
    assert.match(source, /amountMinor/);
    assert.match(source, /Descrição/);
    assert.doesNotMatch(source, /Object\.keys\(preview\.csv\.sampleRows/);
  });

  it("preserves the opened batch in the URL and restores it after reload", () => {
    assert.match(source, /URLSearchParams|searchParams/);
    assert.match(source, /importBatchId/);
    assert.match(source, /history\.replaceState/);
    assert.match(source, /initialBatchId/);
    assert.match(source, /import-detail-heading/);
  });

  it("supports complete filtering, eligibility and stable selection", () => {
    for (const value of [
      "eligible",
      "candidate_pending",
      "approved_created",
      "reconciled",
      "duplicate_ignored",
      "rejected",
      "problems",
    ]) {
      assert.match(source, new RegExp(value));
    }
    assert.match(source, /Selecionar elegíveis/);
    assert.match(source, /state\.selected/);
    assert.match(source, /rowState/);
  });

  it("confirms bulk totals and recovers state after request failures", () => {
    assert.match(source, /Receitas:/);
    assert.match(source, /Despesas:/);
    assert.match(source, /Cada linha será validada e processada separadamente/);
    assert.match(source, /recoverAfterFailure/);
    assert.match(source, /O lote foi atualizado para evitar repetição indevida/);
    assert.match(source, /IMPORT_REVIEW_CANDIDATE_PENDING/);
  });

  it("shows profile, account and read-only final states with statement navigation", () => {
    assert.match(source, /Perfil:/);
    assert.match(source, /Conta:/);
    assert.match(source, /somente para consulta/);
    assert.match(source, /Ver no Extrato/);
    assert.match(source, /statementUrl/);
    assert.match(source, /params\.set\("accountId"/);
    assert.match(source, /params\.set\("month"/);
  });

  it("does not retain raw CSV in browser storage", () => {
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /indexedDB/);
  });

  it("exposes accessible modal, status and row actions", () => {
    assert.match(source, /aria-labelledby="csv-import-title"/);
    assert.match(source, /aria-labelledby="csv-line-edit-title"/);
    assert.match(source, /data-line-action="edit"/);
    assert.match(source, /lineEditDialog\.showModal\(\)/);
    assert.match(source, /lineEditDialog\.addEventListener\("close", restoreLineEditFocus\)/);
    assert.doesNotMatch(source, /rowForm\.addEventListener\("submit"/);
    assert.match(source, /role="alert"/);
    assert.match(source, /aria-live="polite"/);
    assert.match(source, /aria-label="Selecionar linha/);
  });
});
