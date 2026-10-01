import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import { enhanceInboxOfxImport } from "./inbox-ofx-import-enhancement.js";

const inboxPageSource = readFileSync(
  resolve(process.cwd(), "src/dev-server/inbox-page.ts"),
  "utf8",
);

function canonicalFixture(): string {
  return `<main>${inboxPageSource}</main>`;
}

describe("Inbox OFX import enhancement", () => {
  it("accepts CSV, OFX, XLSX and PDF with explicit structured-document controls", () => {
    const html = enhanceInboxOfxImport(canonicalFixture());

    assert.match(html, /data-inbox-ofx-import-enhanced/);
    assert.match(html, /data-inbox-document-import-enhanced/);
    assert.match(html, /Importar CSV, OFX, XLSX ou PDF/);
    assert.match(html, /accept="\.csv,\.ofx,\.xlsx,\.pdf/);
    assert.match(html, /function selectedImportKind\(\)/);
    assert.match(html, /if \(name\.endsWith\("\.ofx"\)\) return "ofx"/);
    assert.match(html, /if \(name\.endsWith\("\.xlsx"\)\) return "xlsx"/);
    assert.match(html, /if \(name\.endsWith\("\.pdf"\)\) return "pdf"/);
    assert.match(html, /const csvOnly = kind === "csv"/);
    assert.match(html, /name="documentClass"/);
    assert.match(html, /name="cardId"/);
    assert.match(html, /name="sheetName"/);
    assert.match(html, /delimiterField\.hidden = !csvOnly/);
    assert.match(html, /mappingFields\.hidden = true/);
  });

  it("uses source-specific routes and binary base64 payloads only for XLSX/PDF", () => {
    const html = enhanceInboxOfxImport(canonicalFixture());

    assert.match(html, /"\/api\/import-batches\/" \+ fileData\.kind \+ "\/preview"/);
    assert.match(html, /"\/api\/import-batches\/" \+ fileData\.kind/);
    assert.match(html, /fileData\.kind === "csv" \? \{ csvDelimiter:/);
    assert.match(html, /contentBase64: fileData\.contentBase64/);
    assert.match(html, /file\.arrayBuffer\(\)/);
    assert.match(html, /xlsxMapping: currentXlsxMapping\(\)/);
    assert.doesNotMatch(html, /sourceKind=csv&status=all/);
    assert.match(html, /\/api\/import-batches\?status=all/);
  });

  it("renders a mixed history with source labels and localized preview states", () => {
    const html = enhanceInboxOfxImport(canonicalFixture());

    assert.match(
      html,
      /const labels = \{ csv: "CSV", ofx: "OFX", xlsx: "XLSX", pdf: "PDF", bank_message: "Mensagem bancária", manual: "Manual" \}/,
    );
    assert.match(html, /ready: "Pronto para revisão"/);
    assert.match(html, /blocked: "Importação bloqueada"/);
    assert.match(html, /return labels\[sourceKind\] \|\| "Outra origem"/);
    assert.match(html, /formatSourceKind\(batch\.sourceKind\)/);
    assert.match(html, /preview\.suggestions/);
    assert.match(html, /Extratos importados/);
    assert.match(html, /Importe CSV, OFX, XLSX ou PDF/);
  });

  it("shows the homologated PDF parser and layout version in the preview", () => {
    const html = enhanceInboxOfxImport(canonicalFixture());

    assert.match(html, /const pdf = preview\.pdf \|\| \{\}/);
    assert.match(html, /Layout PDF reconhecido/);
    assert.match(html, /pdf\.institution/);
    assert.match(html, /pdf\.parserId/);
    assert.match(html, /pdf\.parserVersion/);
  });

  it("requires explicit card-instrument review for structured card rows", () => {
    const html = enhanceInboxOfxImport(canonicalFixture());

    assert.match(html, /csv-line-card-instrument-field/);
    assert.match(html, /payload\.cardInstrumentHint/);
    assert.match(html, /cardInstrumentId/);
    assert.match(html, /Selecione para confirmar/);
  });

  it("reloads the persisted source of truth before enabling retry after an ambiguous creation failure", () => {
    const html = enhanceInboxOfxImport(canonicalFixture());

    assert.match(
      html,
      /catch \(error\) \{\s*setStatus\(previewStatus, error\.message, "error"\);\s*await loadBatches\(\);\s*createButton\.disabled = false;/,
    );
  });

  it("preserves the query-string detail restoration and remains idempotent", () => {
    const enhanced = enhanceInboxOfxImport(canonicalFixture());

    assert.match(enhanced, /url\.searchParams\.set\("importBatchId", importBatchId\)/);
    assert.match(
      enhanced,
      /new URL\(window\.location\.href\)\.searchParams\.get\("importBatchId"\)/,
    );
    assert.equal(enhanceInboxOfxImport(enhanced), enhanced);
    assert.equal(enhanceInboxOfxImport("<main>Dashboard</main>"), "<main>Dashboard</main>");
  });
});
