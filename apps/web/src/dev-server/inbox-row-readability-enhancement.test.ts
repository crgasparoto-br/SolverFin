import assert from "node:assert/strict";
import test from "node:test";

import { enhanceInboxRowReadability } from "./inbox-row-readability-enhancement.js";

const page = `<!doctype html>
<html lang="pt-BR">
  <head><title>Inbox - SolverFin</title></head>
  <body><main class="inbox-page"></main></body>
</html>`;

test("reduz o seletor da linha e usa apresentação circular", () => {
  const enhanced = enhanceInboxRowReadability(page);

  assert.match(enhanced, /data-inbox-row-readability="enhanced"/);
  assert.match(
    enhanced,
    /input\[type="checkbox"\] \{[\s\S]*?appearance: none !important;[\s\S]*?border-radius: 50%;[\s\S]*?flex: 0 0 16px !important;[\s\S]*?height: 16px !important;[\s\S]*?width: 16px !important;/,
  );
  assert.match(
    enhanced,
    /input\[type="checkbox"\]:checked \{[\s\S]*?box-shadow: inset 0 0 0 3px var\(--surface\);/,
  );
  assert.match(
    enhanced,
    /input\[type="checkbox"\]:focus-visible \{[\s\S]*?outline: 2px solid var\(--cyan\);/,
  );
});

test("amplia status e conta e permite quebra sem truncamento", () => {
  const enhanced = enhanceInboxRowReadability(page);

  assert.match(
    enhanced,
    /--inbox-table-columns: 28px 84px 38px 68px 60px minmax\(110px, 1\.05fr\) 76px minmax\(116px, 0\.9fr\) minmax\(160px, 1\.35fr\) 122px;/,
  );
  assert.match(
    enhanced,
    /\.import-table-status,[\s\S]*?overflow: visible !important;[\s\S]*?overflow-wrap: anywhere;[\s\S]*?text-overflow: clip !important;[\s\S]*?white-space: normal !important;/,
  );
  assert.match(
    enhanced,
    /\.import-table-cell-account,[\s\S]*?\.row-summary-value-preview,[\s\S]*?overflow-wrap: anywhere;[\s\S]*?text-overflow: clip !important;[\s\S]*?white-space: normal !important;/,
  );
  assert.match(enhanced, /@media \(min-width: 1024px\) \{[\s\S]*?min-width: 848px;/);
});

test("mantém o seletor compacto também no mobile", () => {
  const enhanced = enhanceInboxRowReadability(page);

  assert.match(
    enhanced,
    /@media \(max-width: 520px\) \{[\s\S]*?grid-template-columns: 20px minmax\(0, 1fr\) !important;[\s\S]*?min-width: 20px;/,
  );
});

test("não duplica o aprimoramento", () => {
  const enhanced = enhanceInboxRowReadability(page);
  const repeated = enhanceInboxRowReadability(enhanced);

  assert.equal(repeated, enhanced);
  assert.equal(repeated.match(/data-inbox-row-readability="enhanced"/g)?.length, 1);
});
