import assert from "node:assert/strict";

import { parseAiSuggestionPayloadResponse } from "./ai-suggestion-payload-contract.js";
import { enhanceInboxHtmlWithStructuredPayloads } from "./inbox-structured-payload-enhancement.js";

rendersTypedPayloadWithoutInternalIdentifiers();
rendersVerifiableInsightEvidenceLimitationsAndNavigation();
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
  const html = reviewRow(suggestionId);
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

function rendersVerifiableInsightEvidenceLimitationsAndNavigation(): void {
  const suggestionId = "44444444-4444-4444-8444-444444444444";
  const categoryId = "55555555-5555-4555-8555-555555555555";
  const payload = parseAiSuggestionPayloadResponse({
    suggestionId,
    legacyProjection: false,
    payload: {
      contractVersion: 1,
      suggestionKind: "insight",
      payloadVersion: 2,
      origin: { kind: "rule" },
      fingerprint: `sha256-${"c".repeat(64)}`,
      confidence: 0.95,
      reasons: ["Cálculo determinístico."],
      target: { entityKind: "financial_profile" },
      proposal: {
        insightType: "trend",
        insightKind: "category_spending_increase",
        title: "Gasto maior na categoria Mercado",
        summary: "O gasto subiu em relação ao período anterior comparável.",
        periodStartOn: "2026-08-01",
        periodEndOn: "2026-08-11",
        currency: "BRL",
        filters: { currency: "BRL", categoryId },
        evidence: [
          { label: "valor_atual", value: 16000, unit: "minor_currency", currency: "BRL" },
          {
            label: "valor_anterior_ou_planejado",
            value: 10000,
            unit: "minor_currency",
            currency: "BRL",
          },
          { label: "variacao_percentual", value: 60, unit: "percentage" },
        ],
        comparison: {
          kind: "previous_period",
          currentValue: 16000,
          previousValue: 10000,
          unit: "minor_currency",
          percentChange: 60,
          previousPeriodStartOn: "2026-07-01",
          previousPeriodEndOn: "2026-07-11",
        },
        limitations: ["Lançamentos pendentes de revisão foram excluídos."],
        calculationVersion: "financial-insights-v2",
        navigation: { view: "transactions", categoryId },
      },
    },
  });

  const enhanced = enhanceInboxHtmlWithStructuredPayloads(reviewRow(suggestionId), [payload]);
  assert.match(enhanced, /Dados estruturados v1\.2/);
  assert.match(enhanced, /Evidências verificáveis/);
  assert.match(enhanced, /valor_atual: R\$\s?160,00/);
  assert.match(enhanced, /variacao_percentual: 60%/);
  assert.match(enhanced, /Limitações/);
  assert.match(enhanced, /pendentes de revisão foram excluídos/);
  assert.match(enhanced, /Confiança:<\/strong> 95%/);
  assert.match(
    enhanced,
    new RegExp(
      `href="/lancamentos\\?month=2026-08&amp;categoryId=${categoryId}" data-insight-navigation="true">Abrir lançamentos`,
    ),
  );
  assert.doesNotMatch(enhanced, new RegExp(`>${categoryId}<`));
  assert.doesNotMatch(enhanced, /financial-insights-v2|sha256-/);
}

function leavesUnrelatedRowsUntouched(): void {
  const html = '<article class="maintenance-item"><p>Sem ação compatível</p></article>';
  const payload = parseAiSuggestionPayloadResponse({
    suggestionId: "66666666-6666-4666-8666-666666666666",
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

function reviewRow(suggestionId: string): string {
  return `
    <article class="maintenance-item">
      <div class="message-preview"><p>Resumo anterior</p></div>
      <div class="maintenance-actions" aria-label="Ações da sugestão ${suggestionId}"></div>
    </article>
  `;
}
