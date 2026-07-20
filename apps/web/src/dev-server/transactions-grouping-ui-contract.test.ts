import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./transactions-page.js", import.meta.url), "utf8");

test("selection exposes accessible controls and complete member data", () => {
  assert.match(source, /aria-label="Selecionar lançamento/);
  assert.match(source, /data-category=/);
  assert.match(source, /data-status=/);
  assert.match(source, /data-selection-count/);
  assert.match(source, /data-selection-total/);
  assert.match(source, /data-selection-clear/);
  assert.match(source, /groupOpen\.disabled = !compatible\(items\)/);
});

test("group modal preserves selection on cancel and clears it only after success", () => {
  assert.match(source, /data-group-close[^>]*>Cancelar/);
  assert.match(source, /data-group-close.*groupModal\.close/);
  assert.match(
    source,
    /if \(response\.ok\) \{ selectable\.forEach\(\(input\) => input\.checked = false\)/,
  );
  assert.match(source, /error\.textContent = await message\(response\)/);
});

test("member markup escapes untrusted descriptions and shows category and status", () => {
  assert.match(source, /const safeText =/);
  assert.match(source, /\[date, description, category, status\]\.map\(safeText\)/);
  assert.doesNotMatch(source, /item\.description \+ " · " \+ \(item\.categoryName/);
});

test("currency, details and ungrouping follow the selected group", () => {
  assert.match(source, /money\(amountMinor, currency\)/);
  assert.match(source, /data-group-details/);
  assert.match(source, /data-group-ungroup/);
  assert.match(source, /send\([^\n]*"DELETE"/);
  assert.match(source, /window\.confirm\("Desagrupar estes lançamentos\?"\)/);
});

test("account or period navigation naturally discards in-memory selection", () => {
  assert.match(source, /autoForm\.requestSubmit\(\)/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});
