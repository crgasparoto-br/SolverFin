import assert from "node:assert/strict";

import { parseAiSuggestionPayloadResponse } from "./ai-suggestion-payload-contract.js";
import { enhanceInboxHtmlWithStructuredPayloads } from "./inbox-structured-payload-enhancement.js";

rendersTypedPayloadWithoutInternalIdentifiers();
leavesUnrelatedRowsUntouched();

function rendersTypedPayloadWithoutInternalIdentifiers(): void {
  const suggestionId = "11111111-1111-4111-8111-111111111111";
  const accountId = "22222222-2222-4222-8222-222222222222";
  const categoryId = "33333333-3333-4333-8333-333333333333";
  const fingerprint = `sha256-${"a".repeat(64)}`;
  const payload = parseAiSuggestionPayloadResponse({
    suggestionId,
    legacyProjection: false,
    payload: {
      contractVersion: 1,
      suggestionKind: "transaction_extraction",
      payloadVersion: 2,
      origin: { kind: "provider" },
      fingerprint,
      confidence: 0.94,
      reasons: ["Extração fictícia estruturada."],
      target: { entityKind: "transaction" },
      proposal: {
        occurredOn: "2026-08-04",
        kind: "expense",
        amountMinor: 4590,
        currency: "BRL",
        description: "Compra fictícia",
        direction: "outflow",
        accountId,
        categoryId,
      },
    },
  });
  const html = `
    <article class="maintenance-item">
      <div class="message-preview"><p>Resumo anterior</p></div>
      <div class="maintenance-actions" aria-label="Ações da sugestão ${suggestionId}"></div>
    </article>
  `;

  const enhanced = enhanceInboxHtmlWithStructuredPayloads(html, [payload]);

  assert.match(enhanced, /data-ai-structured-payload="true"/);
  assert.match(enhanced, /Dados estruturados v1\.2/);
  assert.match(enhanced, /Despesa de R\$\s?45,90/);
  assert.match(enhanced, /2026-08-04 · Compra fictícia/);
  assert.doesNotMatch(enhanced, new RegExp(fingerprint));
  assert.doesNotMatch(enhanced, new RegExp(accountId));
  assert.doesNotMatch(enhanced, new RegExp(categoryId));
  assert.doesNotMatch(enhanced, /provider|model/i);
}

function leavesUnrelatedRowsUntouched(): void {
  const html = '<article class="maintenance-item"><p>Sem ação compatível</p></article>';
  const payload = parseAiSuggestionPayloadResponse({
    suggestionId: "44444444-4444-4444-8444-444444444444",
    legacyProjection: false,
    payload: {
      contractVersion: 1,
      suggestionKind: "insight",
      payloadVersion: 1,
      origin: { kind: "system" },
      fingerprint: `sha256-${"b".repeat(64)}`,
      reasons: [],
      target: { entityKind: "financial_profile" },
      proposal: {
        insightType: "summary",
        title: "Resumo fictício",
        summary: "Sem dados financeiros reais.",
        periodStartOn: "2026-07-01",
        periodEndOn: "2026-07-31",
      },
    },
  });

  assert.equal(enhanceInboxHtmlWithStructuredPayloads(html, [payload]), html);
}
