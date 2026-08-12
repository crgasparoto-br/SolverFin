import assert from "node:assert/strict";

import { parseAiSuggestionPayloadResponse } from "./ai-suggestion-payload-contract.js";
import { enhanceInboxHtmlWithStructuredPayloads } from "./inbox-structured-payload-enhancement.js";

rendersCategoryCriterionAndSafeFilters();
rendersSubscriptionCriterionAndMerchantFilter();
rendersSummaryCriterionAndCurrencyScope();

function rendersCategoryCriterionAndSafeFilters(): void {
  const suggestionId = "74444444-4444-4444-8444-444444444444";
  const categoryId = "85555555-5555-4555-8555-555555555555";
  const enhanced = renderInsight(suggestionId, {
    insightType: "trend",
    insightKind: "category_spending_increase",
    title: "Gasto maior na categoria Mercado",
    summary: "O gasto confirmado aumentou no período comparado.",
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
    limitations: ["Amostra mínima satisfeita."],
    calculationVersion: "financial-insights-v2",
    navigation: { view: "transactions", categoryId },
  });

  assert.match(enhanced, /data-insight-criterion="true"/);
  assert.match(enhanced, /Critério/);
  assert.match(enhanced, /25%/);
  assert.match(enhanced, /2 lançamentos realizados/);
  const filters = extractSection(enhanced, "data-insight-filters");
  assert.match(filters, /Filtros aplicados/);
  assert.match(filters, /Moeda: BRL/);
  assert.match(filters, /Categoria: conforme o título deste insight/);
  assert.doesNotMatch(filters, new RegExp(categoryId));
}

function rendersSubscriptionCriterionAndMerchantFilter(): void {
  const suggestionId = "75555555-5555-4555-8555-555555555555";
  const enhanced = renderInsight(suggestionId, {
    insightType: "trend",
    insightKind: "probable_subscription",
    title: "Possível recorrência em streaming sao",
    summary: "Há recorrência provável em meses consecutivos.",
    periodStartOn: "2026-06-01",
    periodEndOn: "2026-08-05",
    currency: "BRL",
    filters: { currency: "BRL", merchantKey: "streaming sao" },
    evidence: [
      { label: "valor_atual", value: 3990, unit: "minor_currency", currency: "BRL" },
      { label: "variacao_percentual", value: 8, unit: "percentage" },
      { label: "amostra", value: 3, unit: "count" },
    ],
    limitations: ["Recorrência é uma inferência determinística."],
    calculationVersion: "financial-insights-v2",
    navigation: { view: "transactions", merchantKey: "streaming sao" },
  });

  const criterion = extractSection(enhanced, "data-insight-criterion");
  assert.match(criterion, /3 meses consecutivos/);
  assert.match(criterion, /20%/);
  const filters = extractSection(enhanced, "data-insight-filters");
  assert.match(filters, /Estabelecimento analisado: streaming sao/);
  assert.doesNotMatch(filters, /normalizado/);
  const evidence = extractSection(enhanced, "data-insight-evidence");
  assert.match(evidence, /Valor médio mensal: R\$\s?39,90/);
  assert.match(evidence, /Maior desvio em relação à média: 8%/);
  assert.match(evidence, /Meses consecutivos considerados: 3/);
  assert.doesNotMatch(evidence, /valor_atual|variacao_percentual|amostra/);
}

function rendersSummaryCriterionAndCurrencyScope(): void {
  const suggestionId = "76666666-6666-4666-8666-666666666666";
  const enhanced = renderInsight(suggestionId, {
    insightType: "summary",
    insightKind: "monthly_summary",
    title: "Resumo financeiro do período",
    summary: "Resumo determinístico do período atual.",
    periodStartOn: "2026-08-01",
    periodEndOn: "2026-08-11",
    currency: "BRL",
    filters: { currency: "BRL" },
    evidence: [
      { label: "receitas", value: 30000, unit: "minor_currency", currency: "BRL" },
      { label: "despesas", value: 18000, unit: "minor_currency", currency: "BRL" },
      { label: "saldo", value: 12000, unit: "minor_currency", currency: "BRL" },
    ],
    limitations: [],
    calculationVersion: "financial-insights-v2",
    navigation: { view: "transactions" },
  });

  const criterion = extractSection(enhanced, "data-insight-criterion");
  assert.match(criterion, /Existe ao menos um lançamento realizado no período/);
  const filters = extractSection(enhanced, "data-insight-filters");
  assert.match(filters, /Moeda: BRL/);
  assert.match(filters, /Escopo: lançamentos realizados elegíveis do perfil no período/);
  assert.doesNotMatch(filters, /sha256-|financial-insights-v2/);
  assert.equal(
    (enhanced.match(/Resumo determinístico do período atual\./g) ?? []).length,
    1,
    "the insight summary must not be duplicated in the visible card",
  );
}

function renderInsight(suggestionId: string, proposal: Record<string, unknown>): string {
  const payload = parseAiSuggestionPayloadResponse({
    suggestionId,
    legacyProjection: false,
    payload: {
      contractVersion: 1,
      suggestionKind: "insight",
      payloadVersion: 2,
      origin: { kind: "rule" },
      fingerprint: `sha256-${"e".repeat(64)}`,
      confidence: 0.95,
      reasons: ["Cálculo determinístico."],
      target: { entityKind: "financial_profile" },
      proposal,
    },
  });

  return enhanceInboxHtmlWithStructuredPayloads(reviewRow(suggestionId), [payload]);
}

function extractSection(html: string, attribute: string): string {
  const match = html.match(new RegExp(`<div ${attribute}="true">([\\s\\S]*?)<\\/div>`));
  assert.ok(match?.[1], `Expected ${attribute} section.`);
  return match[1];
}

function reviewRow(suggestionId: string): string {
  return `
    <article class="maintenance-item">
      <div class="message-preview"><p>Resumo determinístico do período atual.</p></div>
      <div class="maintenance-actions" aria-label="Ações da sugestão ${suggestionId}"></div>
    </article>
  `;
}
