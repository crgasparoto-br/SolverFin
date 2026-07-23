import assert from "node:assert/strict";
import test from "node:test";

import { enhanceInboxStatusAndActions } from "./inbox-status-and-actions-enhancement.js";

const page = `<!doctype html>
<html lang="pt-BR">
  <head><title>Inbox - SolverFin</title></head>
  <body><main class="inbox-page"><div id="import-batch-detail"></div></main></body>
</html>`;

test("remove destaque de fundo da coluna status e aplica cores aos textos finais", () => {
  const enhanced = enhanceInboxStatusAndActions(page);

  assert.match(enhanced, /data-inbox-status-actions="enhanced"/);
  assert.match(enhanced, /\.import-table-status,[\s\S]*?background: transparent !important;/);
  assert.match(enhanced, /data-row-state=\\?"rejected\\?"[\s\S]*?color: #b91c1c !important;/);
  assert.match(
    enhanced,
    /data-controlled-status=\\?"confirmed\\?"[\s\S]*?color: #15803d !important;/,
  );
});

test("inclui tooltip descritivo, acessível e reposicionado para os botões de ações", () => {
  const enhanced = enhanceInboxStatusAndActions(page);

  assert.match(enhanced, /inbox-action-tooltip-layer/);
  assert.match(enhanced, /setAttribute\("role", "tooltip"\)/);
  assert.match(enhanced, /control\.dataset\.tooltip = description/);
  assert.match(enhanced, /setAttribute\("aria-describedby", tooltipId\)/);
  assert.match(enhanced, /pointerover/);
  assert.match(enhanced, /focusin/);
  assert.match(enhanced, /event\.key === "Escape"/);
});

test("não duplica o aprimoramento", () => {
  const enhanced = enhanceInboxStatusAndActions(page);
  assert.equal(enhanceInboxStatusAndActions(enhanced), enhanced);
});
