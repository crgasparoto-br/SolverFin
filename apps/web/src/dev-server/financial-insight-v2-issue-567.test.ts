import assert from "node:assert/strict";

import { parseAiSuggestionPayloadResponse } from "./ai-suggestion-payload-contract.js";
import { enhanceInboxHtmlWithStructuredPayloads } from "./inbox-structured-payload-enhancement.js";

rendersMonthlySummaryEvidenceWithoutInternalCategoryIds();

function rendersMonthlySummaryEvidenceWithoutInternalCategoryIds(): void {
  const suggestionId = "77777777-7777-4777-8777-777777777777";
  const internalCategoryId = "88888888-8888-4888-8888-888888888888";
  const payload = parseAiSuggestionPayloadResponse({
    suggestionId,
    legacyProjection: false,
    payload: {
      contractVersion: 1,
      suggestionKind: "insight",
      payloadVersion: 2,
      origin: { kind: "rule" },
      fingerprint: `sha256-${"d".repeat(64)}`,
      confidence: 0.95,
      reasons: ["Cálculo determinístico."],
      target: { entityKind: "financial_profile" },
      proposal: {
        insightType: "summary",
        insightKind: "monthly_summary",
        title: "Resumo financeiro do período",
        summary:
          "O período teve receitas, despesas e saldo realizado calculados deterministicamente.",
        periodStartOn: "2026-08-01",
        periodEndOn: "2026-08-11",
        currency: "BRL",
        filters: { currency: "BRL" },
        evidence: [
          { label: "receitas", value: 30000, unit: "minor_currency", currency: "BRL" },
          { label: "despesas", value: 18000, unit: "minor_currency", currency: "BRL" },
          { label: "saldo", value: 12000, unit: "minor_currency", currency: "BRL" },
          {
            label: "variacao_categoria:Mercado",
            value: 3000,
            unit: "minor_currency",
            currency: "BRL",
          },
          { label: "variacao_despesas_percentual", value: 50, unit: "percentage" },
        ],
        comparison: {
          kind: "previous_period",
          currentValue: 18000,
          previousValue: 12000,
          unit: "minor_currency",
          percentChange: 50,
          previousPeriodStartOn: "2026-07-01",
          previousPeriodEndOn: "2026-07-11",
        },
        limitations: ["Lançamentos pendentes de revisão foram excluídos."],
        calculationVersion: "financial-insights-v2",
        navigation: { view: "transactions" },
      },
    },
  });

  const enhanced = enhanceInboxHtmlWithStructuredPayloads(reviewRow(suggestionId), [payload]);
  assert.match(enhanced, /Evidências verificáveis/);
  assert.match(enhanced, /receitas: R\$\s?300,00/);
  assert.match(enhanced, /despesas: R\$\s?180,00/);
  assert.match(enhanced, /saldo: R\$\s?120,00/);
  assert.match(enhanced, /variacao_categoria:Mercado: R\$\s?30,00/);
  assert.match(enhanced, /variacao_despesas_percentual: 50%/);
  assert.match(enhanced, /href="\/lancamentos" data-insight-navigation="true">Abrir lançamentos/);
  assert.doesNotMatch(enhanced, new RegExp(internalCategoryId));
  assert.doesNotMatch(enhanced, /financial-insights-v2|sha256-/);
}

function reviewRow(suggestionId: string): string {
  return `
    <article class="maintenance-item">
      <div class="message-preview"><p>Resumo anterior</p></div>
      <div class="maintenance-actions" aria-label="Ações da sugestão ${suggestionId}"></div>
    </article>
  `;
}
