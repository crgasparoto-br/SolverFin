import assert from "node:assert/strict";

import { parseAiSuggestionPayloadResponse } from "./ai-suggestion-payload-contract.js";
import { enhanceInboxHtmlWithStructuredPayloads } from "./inbox-structured-payload-enhancement.js";

rendersMonthlySummaryEvidenceWithoutInternalCategoryIds();
rendersCategoryNavigationWithPeriodAndCategoryContext();
rendersMerchantNavigationWithPeriodAndMerchantContext();
rendersBudgetNavigationWithCategoryContext();

function rendersMonthlySummaryEvidenceWithoutInternalCategoryIds(): void {
  const suggestionId = "77777777-7777-4777-8777-777777777777";
  const internalCategoryId = "88888888-8888-4888-8888-888888888888";
  const enhanced = renderInsight(suggestionId, {
    insightType: "summary",
    insightKind: "monthly_summary",
    title: "Resumo financeiro do período",
    summary: "O período teve receitas, despesas e saldo realizado calculados deterministicamente.",
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
  });

  assert.match(enhanced, /Evidências verificáveis/);
  assert.match(enhanced, /receitas: R\$\s?300,00/);
  assert.match(enhanced, /despesas: R\$\s?180,00/);
  assert.match(enhanced, /saldo: R\$\s?120,00/);
  assert.match(enhanced, /variacao_categoria:Mercado: R\$\s?30,00/);
  assert.match(enhanced, /variacao_despesas_percentual: 50%/);
  assert.match(
    enhanced,
    /href="\/lancamentos\?month=2026-08" data-insight-navigation="true">Abrir lançamentos/,
  );
  assert.doesNotMatch(enhanced, new RegExp(internalCategoryId));
  assert.doesNotMatch(enhanced, /financial-insights-v2|sha256-/);
}

function rendersCategoryNavigationWithPeriodAndCategoryContext(): void {
  const suggestionId = "71111111-1111-4111-8111-111111111111";
  const categoryId = "88888888-8888-4888-8888-888888888888";
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
      { label: "valor_anterior_ou_planejado", value: 10000, unit: "minor_currency", currency: "BRL" },
      { label: "variacao_percentual", value: 60, unit: "percentage" },
    ],
    limitations: ["Amostra mínima satisfeita."],
    calculationVersion: "financial-insights-v2",
    navigation: { view: "transactions", categoryId },
  });

  assert.match(
    enhanced,
    new RegExp(
      `href="/lancamentos\\?month=2026-08&amp;categoryId=${categoryId}" data-insight-navigation="true"`,
    ),
  );
}

function rendersMerchantNavigationWithPeriodAndMerchantContext(): void {
  const suggestionId = "72222222-2222-4222-8222-222222222222";
  const merchantKey = "streaming sao";
  const enhanced = renderInsight(suggestionId, {
    insightType: "trend",
    insightKind: "probable_subscription",
    title: "Possível recorrência em streaming sao",
    summary: "Há recorrência provável em meses consecutivos.",
    periodStartOn: "2026-08-01",
    periodEndOn: "2026-08-11",
    currency: "BRL",
    filters: { currency: "BRL", merchantKey },
    evidence: [{ label: merchantKey, value: 3990, unit: "minor_currency", currency: "BRL" }],
    limitations: ["Recorrência é uma inferência determinística."],
    calculationVersion: "financial-insights-v2",
    navigation: { view: "transactions", merchantKey },
  });

  assert.match(
    enhanced,
    /href="\/lancamentos\?month=2026-08&amp;merchantKey=streaming\+sao" data-insight-navigation="true"/,
  );
}

function rendersBudgetNavigationWithCategoryContext(): void {
  const suggestionId = "73333333-3333-4333-8333-333333333333";
  const categoryId = "89999999-9999-4999-8999-999999999999";
  const enhanced = renderInsight(suggestionId, {
    insightType: "anomaly",
    insightKind: "budget_exceeded",
    title: "Orçamento excedido em Mercado",
    summary: "O realizado confirmado excedeu o orçamento ativo.",
    periodStartOn: "2026-08-01",
    periodEndOn: "2026-08-31",
    currency: "BRL",
    filters: { currency: "BRL", categoryId },
    evidence: [
      { label: "valor_atual", value: 18000, unit: "minor_currency", currency: "BRL" },
      { label: "valor_anterior_ou_planejado", value: 12000, unit: "minor_currency", currency: "BRL" },
    ],
    limitations: [],
    calculationVersion: "financial-insights-v2",
    navigation: { view: "budgets", categoryId },
  });

  assert.match(
    enhanced,
    new RegExp(
      `href="/orcamentos\\?categoryId=${categoryId}" data-insight-navigation="true">Abrir orçamentos`,
    ),
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
      fingerprint: `sha256-${"d".repeat(64)}`,
      confidence: 0.95,
      reasons: ["Cálculo determinístico."],
      target: { entityKind: "financial_profile" },
      proposal,
    },
  });

  return enhanceInboxHtmlWithStructuredPayloads(reviewRow(suggestionId), [payload]);
}

function reviewRow(suggestionId: string): string {
  return `
    <article class="maintenance-item">
      <div class="message-preview"><p>Resumo anterior</p></div>
      <div class="maintenance-actions" aria-label="Ações da sugestão ${suggestionId}"></div>
    </article>
  `;
}
