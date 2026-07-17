import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const currentDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(currentDir, "inbox-page.js"), "utf8");

describe("Inbox CSV import review contract", () => {
  it("keeps preview separate from persisted batch creation", () => {
    assert.match(source, /\/api\/import-batches\/csv\/preview/);
    assert.match(source, /\/api\/import-batches\/csv/);
    assert.match(source, /consentAccepted/);
    assert.match(source, /file\.text\(\)/);
    assert.match(source, /Iniciar revisão/);
  });

  it("supports persisted history and the full human review lifecycle", () => {
    assert.match(source, /Histórico de importações/);
    assert.match(source, /batchId/);
    assert.match(source, /\/approve-selected/);
    assert.match(source, /\/detect-duplicates/);
    assert.match(source, /\/discard/);
    assert.match(source, /method:\s*"PATCH"/);
    assert.match(source, /Ajuste o mapeamento ou o separador e visualize novamente/);
  });

  it("does not retain raw CSV in browser storage or render it in history", () => {
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /indexedDB/);
    assert.match(source, /state\.fileContent\s*=\s*""/);
  });

  it("exposes accessible modal, status and row actions", () => {
    assert.match(source, /aria-labelledby="csv-import-title"/);
    assert.match(source, /role="alert"/);
    assert.match(source, /aria-live="polite"/);
    assert.match(source, /aria-label="Selecionar linha/);
  });
});
