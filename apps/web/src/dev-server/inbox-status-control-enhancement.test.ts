import assert from "node:assert/strict";
import test from "node:test";

import {
  enhanceInboxStatusControl,
  resolveInboxControlledStatus,
} from "./inbox-status-control-enhancement.js";

const page = `<!doctype html>
<html lang="pt-BR">
  <head><title>Inbox - SolverFin</title></head>
  <body><main class="inbox-page"><div id="import-batch-detail"></div></main></body>
</html>`;

test("marca como corrigido quando uma linha pendente foi editada", () => {
  assert.equal(
    resolveInboxControlledStatus({
      status: "pending_review",
      createdAt: "2026-07-23T10:00:00.000Z",
      updatedAt: "2026-07-23T10:05:00.000Z",
    }),
    "corrected",
  );
  assert.equal(resolveInboxControlledStatus({ status: "edited" }), "corrected");
});

test("marca como confirmado quando a sugestão foi aprovada", () => {
  assert.equal(
    resolveInboxControlledStatus({
      status: "approved",
      createdAt: "2026-07-23T10:00:00.000Z",
      updatedAt: "2026-07-23T10:10:00.000Z",
    }),
    "confirmed",
  );
});

test("não altera linhas ainda não corrigidas ou rejeitadas", () => {
  const originalTimestamp = "2026-07-23T10:00:00.000Z";

  assert.equal(
    resolveInboxControlledStatus({
      status: "pending_review",
      createdAt: originalTimestamp,
      updatedAt: originalTimestamp,
    }),
    undefined,
  );
  assert.equal(
    resolveInboxControlledStatus({
      status: "rejected",
      createdAt: originalTimestamp,
      updatedAt: "2026-07-23T10:10:00.000Z",
    }),
    undefined,
  );
});

test("injeta captura antecipada e atualização acessível do status", () => {
  const enhanced = enhanceInboxStatusControl(page);

  assert.match(enhanced, /data-inbox-status-control="enhanced"/);
  assert.match(enhanced, /data-inbox-status-control-script="enhanced"/);
  assert.match(enhanced, /response\.clone\(\)\.json\(\)/);
  assert.match(enhanced, /solverfin:inbox-statuses-updated/);
  assert.match(enhanced, /corrected: "Corrigido"/);
  assert.match(enhanced, /confirmed: "Confirmado"/);
  assert.match(enhanced, /Lançamento criado/);
  assert.match(enhanced, /data-controlled-status/);
});

test("não duplica o controle de status", () => {
  const enhanced = enhanceInboxStatusControl(page);
  const repeated = enhanceInboxStatusControl(enhanced);

  assert.equal(repeated, enhanced);
  assert.equal(repeated.match(/data-inbox-status-control="enhanced"/g)?.length, 1);
  assert.equal(repeated.match(/data-inbox-status-control-script="enhanced"/g)?.length, 1);
});
