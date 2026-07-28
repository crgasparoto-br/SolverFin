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

  it("renders a mixed history with source labels and uses OFX suggestions as preview rows", () => {
    const html = enhanceInboxOfxImport(canonicalFixture());

    assert.match(html, /sourceKind === "ofx" \? "OFX" : "CSV"/);
    assert.match(html, /formatSourceKind\(batch\.sourceKind\)/);
    assert.match(html, /preview\.suggestions/);
    assert.match(html, /Extratos importados/);
    assert.match(html, /Importe CSV ou OFX/);
  });

  it("preserves the query-string detail restoration and remains idempotent", () => {
    const enhanced = enhanceInboxOfxImport(canonicalFixture());

    assert.match(enhanced, /url\.searchParams\.set\("importBatchId", importBatchId\)/);
    assert.match(enhanced, /new URL\(window\.location\.href\)\.searchParams\.get\("importBatchId"\)/);
    assert.equal(enhanceInboxOfxImport(enhanced), enhanced);
    assert.equal(enhanceInboxOfxImport("<main>Dashboard</main>"), "<main>Dashboard</main>");
  });
});
