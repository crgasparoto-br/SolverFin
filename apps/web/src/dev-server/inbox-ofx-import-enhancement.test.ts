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
  it("accepts CSV and OFX while keeping mapping controls exclusive to CSV", () => {
    const html = enhanceInboxOfxImport(canonicalFixture());

    assert.match(html, /data-inbox-ofx-import-enhanced/);
    assert.match(html, /Importar CSV ou OFX/);
    assert.match(html, /accept="\.csv,\.ofx,text\/csv,text\/plain,application\/x-ofx"/);
    assert.match(html, /function selectedImportKind\(\)/);
    assert.match(html, /if \(name\.endsWith\("\.ofx"\)\) return "ofx"/);
    assert.match(html, /const csvOnly = kind !== "ofx"/);
    assert.match(html, /delimiterField\.hidden = !csvOnly/);
    assert.match(html, /mappingFields\.hidden = true/);
  });

  it("uses separate OFX routes and omits CSV mapping fields from OFX payloads", () => {
    const html = enhanceInboxOfxImport(canonicalFixture());

    assert.match(html, /"\/api\/import-batches\/" \+ fileData\.kind \+ "\/preview"/);
    assert.match(html, /"\/api\/import-batches\/" \+ fileData\.kind/);
    assert.match(html, /fileData\.kind === "csv" \? \{ csvDelimiter:/);
    assert.doesNotMatch(html, /sourceKind=csv&status=all/);
    assert.match(html, /\/api\/import-batches\?status=all/);
  });

  it("renders a mixed history with source labels and localized preview states", () => {
    const html = enhanceInboxOfxImport(canonicalFixture());

    assert.match(
      html,
      /const labels = \{ csv: "CSV", ofx: "OFX", bank_message: "Mensagem bancária", manual: "Manual" \}/,
    );
    assert.match(html, /ready: "Pronto para revisão"/);
    assert.match(html, /blocked: "Importação bloqueada"/);
    assert.match(html, /return labels\[sourceKind\] \|\| "Outra origem"/);
    assert.match(html, /formatSourceKind\(batch\.sourceKind\)/);
    assert.match(html, /preview\.suggestions/);
    assert.match(html, /Extratos importados/);
    assert.match(html, /Importe CSV ou OFX/);
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
