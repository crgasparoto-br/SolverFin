import assert from "node:assert/strict";

import {
  explainFinancialInsightWithProvider,
  generateFinancialInsights,
  type FinancialInsight,
  type FinancialInsightExplanationProvider,
  type InsightTransaction,
} from "@solverfin/ai";

const organizationId = "org-insights-regression";
const financialProfileId = "profile-insights-regression";
const currentPeriod = { startOn: "2026-06-01", endOn: "2026-06-30" };
const previousPeriod = { startOn: "2026-05-01", endOn: "2026-05-31" };

budgetUsesExactBudgetPeriod();
monthlySummaryExposesIncomeExpenseBalanceAndTopVariations();
void providerCannotContradictNumbersWithWords();

function budgetUsesExactBudgetPeriod(): void {
  const insights = generateFinancialInsights({
    organizationId,
    financialProfileId,
    currentPeriod,
    previousPeriod,
    currency: "BRL",
    budgets: [
      {
        id: "budget-market",
        organizationId,
        financialProfileId,
        categoryId: "market",
        plannedAmountMinor: 5000,
        currency: "BRL",
        periodStartOn: "2026-06-15",
        periodEndOn: "2026-06-30",
      },
    ],
    transactions: [
      tx("outside-budget", "2026-06-05", 9000, "market"),
      tx("inside-budget", "2026-06-20", 1000, "market"),
    ],
  });

  assert.equal(
    insights.some((item) => item.kind === "budget_exceeded"),
    false,
    "expenses outside the budget period must not create a false budget_exceeded insight",
  );
}

function monthlySummaryExposesIncomeExpenseBalanceAndTopVariations(): void {
  const insights = generateFinancialInsights({
    organizationId,
    financialProfileId,
    currentPeriod,
    previousPeriod,
    currency: "BRL",
    transactions: [
      tx("income", "2026-06-02", 30000, "salary", "income"),
      tx("current-market", "2026-06-10", 9000, "market"),
      tx("current-rent", "2026-06-15", 9000, "rent"),
      tx("previous-market", "2026-05-10", 6000, "market"),
      tx("previous-rent", "2026-05-15", 6000, "rent"),
    ],
  });
  const summary = findInsight(insights, "monthly_summary");
  const evidence = new Map((summary.evidence.items ?? []).map((item) => [item.label, item.value]));

  assert.equal(evidence.get("receitas"), 30000);
  assert.equal(evidence.get("despesas"), 18000);
  assert.equal(evidence.get("saldo"), 12000);
  assert.equal(evidence.get("despesas_periodo_anterior"), 12000);
  assert.equal(evidence.get("variacao_despesas_percentual"), 50);
  assert.equal(evidence.get("variacao_categoria:market"), 3000);
  assert.equal(evidence.get("variacao_categoria:rent"), 3000);
  assert.match(summary.explanation, /saldo realizado/i);
}

async function providerCannotContradictNumbersWithWords(): Promise<void> {
  const summary = findInsight(
    generateFinancialInsights({
      organizationId,
      financialProfileId,
      currentPeriod,
      previousPeriod,
      currency: "BRL",
      transactions: [tx("expense", "2026-06-10", 18000, "market")],
    }),
    "monthly_summary",
  );
  const provider: FinancialInsightExplanationProvider = {
    async explain() {
      return "As despesas dobraram no período comparado.";
    },
  };

  assert.equal(await explainFinancialInsightWithProvider(summary, provider), summary.explanation);
}

function findInsight(
  insights: readonly FinancialInsight[],
  kind: FinancialInsight["kind"],
): FinancialInsight {
  const insight = insights.find((item) => item.kind === kind);
  if (insight === undefined) throw new Error(`Expected ${kind} insight.`);
  return insight;
}

function tx(
  id: string,
  occurredOn: string,
  amountMinor: number,
  categoryId: string,
  kind: InsightTransaction["kind"] = "expense",
): InsightTransaction {
  return {
    id,
    organizationId,
    financialProfileId,
    kind,
    status: "posted",
    amountMinor,
    currency: "BRL",
    occurredOn,
    categoryId,
    merchantKey: `merchant-${categoryId}`,
  };
}
