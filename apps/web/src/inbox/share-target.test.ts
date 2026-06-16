import assert from "node:assert/strict";

import { createInboxItemFromShareTarget, maskSharedFinancialText } from "./index.js";

sharedTextCreatesProcessableInboxItem();
missingAuthenticationIsRejected();
emptyPayloadIsRejected();
maskingHidesSensitivePreview();

function sharedTextCreatesProcessableInboxItem(): void {
  const result = createInboxItemFromShareTarget({
    organizationId: "org-demo",
    financialProfileId: "profile-demo",
    userId: "user-demo",
    title: "Compra aprovada",
    text: "Compra aprovada no cartao 4111 1111 1111 1111 em Mercado Demo R$ 123,45",
    url: "https://example.invalid/comprovante",
    receivedAt: "2026-06-16T12:00:00.000Z",
    source: "web_share_target",
  });

  assert.equal(result.accepted, true);
  assert.equal(result.item?.status, "received");
  assert.equal(result.item?.source, "web_share_target");
  assert.equal(result.item?.organizationId, "org-demo");
  assert.equal(result.item?.financialProfileId, "profile-demo");
  assert.equal(result.item?.maskedPreview.includes("4111"), false);
  assert.equal(result.item?.maskedPreview.includes("R$ 123,45"), false);
}

function missingAuthenticationIsRejected(): void {
  const result = createInboxItemFromShareTarget({
    text: "Mensagem bancaria ficticia",
    receivedAt: "2026-06-16T12:00:00.000Z",
    source: "manual_paste",
  });

  assert.equal(result.accepted, false);
  assert.equal(result.errorMessage, "Entre no SolverFin antes de compartilhar uma mensagem financeira.");
}

function emptyPayloadIsRejected(): void {
  const result = createInboxItemFromShareTarget({
    organizationId: "org-demo",
    financialProfileId: "profile-demo",
    userId: "user-demo",
    receivedAt: "2026-06-16T12:00:00.000Z",
    source: "web_share_target",
  });

  assert.equal(result.accepted, false);
  assert.equal(result.errorMessage, "Nao encontramos texto para enviar a inbox.");
}

function maskingHidesSensitivePreview(): void {
  const masked = maskSharedFinancialText(
    "CPF 123.456.789-00 cartao 5555 5555 5555 4444 valor R$ 987,65",
  );

  assert.equal(masked.includes("123.456"), false);
  assert.equal(masked.includes("5555 5555"), false);
  assert.equal(masked.includes("R$ 987,65"), false);
}
