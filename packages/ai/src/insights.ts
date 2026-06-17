import { formatMinorCurrency } from "@solverfin/shared";

export type FinancialInsightKind =
  | "category_spending_increase"
  | "merchant_spending_increase"
  | "probable_subscription"
  | "negative_balance_risk"
  | "budget_exceeded"
  | "monthly_summary"
  | "insufficient_data";
export type FinancialInsightSeverity = "info" | "warning" | "critical";
export type FinancialInsightConfidence = "high" | "medium" | "low";

type SpendingIncreaseInsightKind = Extract<
  FinancialInsightKind,
  "category_spending_increase" | "merchant_spending_increase"
>;

export interface InsightTransaction {
  id: string;
  organizationId: string;
  financialProfileId: string;
  kind: "income" | "expense" | "transfer";
  status: "planned" | "posted" | "reconciled" | "suggested" | "voided";
  amountMinor: number;
  occurredOn: string;
  categoryId?: string;
  merchantKey?: string;
  description?: string;
}

export interface InsightBudget {
  organizationId: string;
  financialProfileId: string;
  categoryId: string;
  plannedAmountMinor: number;
  periodStartOn: string;
  periodEndOn: string;
}

export interface FinancialInsightEvidence {
  label: string;
  currentAmountMinor?: number;
  previousAmountMinor?: number;
  deltaAmountMinor?: number;
  percentChange?: number;
  count?: number;
  periodStartOn: string;
  periodEndOn: string;
}

export interface FinancialInsight {
  kind: FinancialInsightKind;
  severity: FinancialInsightSeverity;
  confidence: FinancialInsightConfidence;
  title: string;
  explanation: string;
  evidence: FinancialInsightEvidence;
  sources: readonly string[];
}

export interface GenerateFinancialInsightsInput {
  organizationId: string;
  financialProfileId: string;
  currentPeriod: {
    startOn: string;
    endOn: string;
  };
  previousPeriod: {
    startOn: string;
    endOn: string;
  };
  transactions: readonly InsightTransaction[];
  budgets?: readonly InsightBudget[];
  projectedBalanceMinor?: number;
  currency?: string;
  increaseThresholdPercent?: number;
  minRecurringOccurrences?: number;
}

const DEFAULT_INCREASE_THRESHOLD_PERCENT = 25;
const DEFAULT_MIN_RECURRING_OCCURRENCES = 3;

export function generateFinancialInsights(
  input: GenerateFinancialInsightsInput,
): FinancialInsight[] {
  const transactions = input.transactions.filter(
    (transaction) =>
      transaction.organizationId === input.organizationId &&
      transaction.financialProfileId === input.financialProfileId &&
      transaction.status !== "voided",
  );
  const current = filterByPeriod(
    transactions,
    input.currentPeriod.startOn,
    input.currentPeriod.endOn,
  );
  const previous = filterByPeriod(
    transactions,
    input.previousPeriod.startOn,
    input.previousPeriod.endOn,
  );
  const insights = [
    ...buildSpendingIncreaseInsights(input, current, previous),
    ...buildSubscriptionInsights(input, transactions),
    ...buildNegativeBalanceInsight(input),
    ...buildBudgetInsights(input, current),
    buildMonthlySummary(input, current, previous),
  ];

  if (current.length === 0 && previous.length === 0) {
    return [
      {
        kind: "insufficient_data",
        severity: "info",
        confidence: "low",
        title: "Dados insuficientes para gerar insights",
        explanation:
          "Ainda nao ha lancamentos suficientes nos periodos comparados para apontar variacoes com seguranca.",
        evidence: {
          label: "lancamentos_comparados",
          count: 0,
          periodStartOn: input.currentPeriod.startOn,
          periodEndOn: input.currentPeriod.endOn,
        },
        sources: ["transactions"],
      },
    ];
  }

  return insights;
}

function buildSpendingIncreaseInsights(
  input: GenerateFinancialInsightsInput,
  current: readonly InsightTransaction[],
  previous: readonly InsightTransaction[],
): FinancialInsight[] {
  const threshold = input.increaseThresholdPercent ?? DEFAULT_INCREASE_THRESHOLD_PERCENT;
  const byCategory = compareExpenseGroups(
    current,
    previous,
    (transaction) => transaction.categoryId,
  );
  const byMerchant = compareExpenseGroups(
    current,
    previous,
    (transaction) => transaction.merchantKey,
  );

  return [
    ...buildIncreaseInsightsForGroup(input, byCategory, threshold, "category_spending_increase"),
    ...buildIncreaseInsightsForGroup(input, byMerchant, threshold, "merchant_spending_increase"),
  ];
}

function buildIncreaseInsightsForGroup(
  input: GenerateFinancialInsightsInput,
  groups: ReadonlyMap<string, GroupComparison>,
  threshold: number,
  kind: SpendingIncreaseInsightKind,
): FinancialInsight[] {
  const insights: FinancialInsight[] = [];

  for (const [label, group] of groups) {
    const hasIncrease = group.currentAmountMinor > group.previousAmountMinor;

    if (group.previousAmountMinor <= 0 || !hasIncrease) {
      continue;
    }

    const percentChange = calculatePercentChange(
      group.currentAmountMinor,
      group.previousAmountMinor,
    );

    if (percentChange < threshold) {
      continue;
    }

    insights.push({
      kind,
      severity: buildIncreaseSeverity(percentChange, threshold),
      confidence: group.currentCount >= 2 ? "high" : "medium",
      title: buildIncreaseTitle(kind, label),
      explanation: buildIncreaseExplanation(percentChange),
      evidence: {
        label,
        currentAmountMinor: group.currentAmountMinor,
        previousAmountMinor: group.previousAmountMinor,
        deltaAmountMinor: group.currentAmountMinor - group.previousAmountMinor,
        percentChange,
        count: group.currentCount,
        periodStartOn: input.currentPeriod.startOn,
        periodEndOn: input.currentPeriod.endOn,
      },
      sources: group.sourceIds,
    });
  }

  return insights;
}

function buildSubscriptionInsights(
  input: GenerateFinancialInsightsInput,
  transactions: readonly InsightTransaction[],
): FinancialInsight[] {
  const minOccurrences = input.minRecurringOccurrences ?? DEFAULT_MIN_RECURRING_OCCURRENCES;
  const groups = new Map<string, InsightTransaction[]>();

  for (const transaction of transactions) {
    if (transaction.kind !== "expense" || transaction.merchantKey === undefined) {
      continue;
    }

    const group = groups.get(transaction.merchantKey) ?? [];
    group.push(transaction);
    groups.set(transaction.merchantKey, group);
  }

  const insights: FinancialInsight[] = [];

  for (const [merchantKey, group] of groups) {
    const months = group.map((transaction) => transaction.occurredOn.slice(0, 7));
    const distinctMonths = new Set(months);

    if (distinctMonths.size < minOccurrences) {
      continue;
    }

    const total = group.reduce((sum, transaction) => {
      return sum + transaction.amountMinor;
    }, 0);
    const average = Math.round(total / group.length);

    insights.push({
      kind: "probable_subscription",
      severity: "info",
      confidence: distinctMonths.size >= minOccurrences + 1 ? "high" : "medium",
      title: `Possivel recorrencia em ${merchantKey}`,
      explanation: buildSubscriptionExplanation(distinctMonths.size),
      evidence: {
        label: merchantKey,
        currentAmountMinor: average,
        count: group.length,
        periodStartOn: firstDate(group),
        periodEndOn: lastDate(group),
      },
      sources: group.map((transaction) => transaction.id),
    });
  }

  return insights;
}

function buildNegativeBalanceInsight(input: GenerateFinancialInsightsInput): FinancialInsight[] {
  if (input.projectedBalanceMinor === undefined || input.projectedBalanceMinor >= 0) {
    return [];
  }

  return [
    {
      kind: "negative_balance_risk",
      severity: "critical",
      confidence: "medium",
      title: "Risco de saldo negativo",
      explanation:
        "A projecao informada para o periodo fica abaixo de zero. Revise compromissos previstos e premissas antes de tomar decisao.",
      evidence: {
        label: "saldo_projetado",
        currentAmountMinor: input.projectedBalanceMinor,
        periodStartOn: input.currentPeriod.startOn,
        periodEndOn: input.currentPeriod.endOn,
      },
      sources: ["projected_balance"],
    },
  ];
}

function buildBudgetInsights(
  input: GenerateFinancialInsightsInput,
  current: readonly InsightTransaction[],
): FinancialInsight[] {
  const budgets = (input.budgets ?? []).filter(
    (budget) =>
      budget.organizationId === input.organizationId &&
      budget.financialProfileId === input.financialProfileId,
  );
  const insights: FinancialInsight[] = [];

  for (const budget of budgets) {
    const spent = current
      .filter((transaction) => {
        return transaction.kind === "expense" && transaction.categoryId === budget.categoryId;
      })
      .reduce((sum, transaction) => {
        return sum + transaction.amountMinor;
      }, 0);

    if (spent <= budget.plannedAmountMinor) {
      continue;
    }

    insights.push({
      kind: "budget_exceeded",
      severity: "warning",
      confidence: "high",
      title: `Orcamento excedido em ${budget.categoryId}`,
      explanation: "O total realizado ultrapassou o valor planejado para a categoria no periodo.",
      evidence: {
        label: budget.categoryId,
        currentAmountMinor: spent,
        previousAmountMinor: budget.plannedAmountMinor,
        deltaAmountMinor: spent - budget.plannedAmountMinor,
        percentChange: Math.round((spent / Math.max(1, budget.plannedAmountMinor)) * 100),
        periodStartOn: budget.periodStartOn,
        periodEndOn: budget.periodEndOn,
      },
      sources: ["budget", budget.categoryId],
    });
  }

  return insights;
}

function buildMonthlySummary(
  input: GenerateFinancialInsightsInput,
  current: readonly InsightTransaction[],
  previous: readonly InsightTransaction[],
): FinancialInsight {
  const currency = input.currency ?? "BRL";
  const currentIncome = sumByKind(current, "income");
  const currentExpense = sumByKind(current, "expense");
  const previousExpense = sumByKind(previous, "expense");
  const percentChange = calculateOptionalPercentChange(currentExpense, previousExpense);
  const incomeText = formatMoney(currentIncome, currency);
  const expenseText = formatMoney(currentExpense, currency);

  return {
    kind: "monthly_summary",
    severity: "info",
    confidence: current.length > 0 ? "high" : "low",
    title: "Resumo financeiro do periodo",
    explanation: `O periodo teve receitas de ${incomeText} e despesas de ${expenseText}.`,
    evidence: {
      label: "resumo_mensal",
      currentAmountMinor: currentIncome - currentExpense,
      previousAmountMinor: previousExpense,
      ...(percentChange === undefined ? {} : { percentChange }),
      count: current.length,
      periodStartOn: input.currentPeriod.startOn,
      periodEndOn: input.currentPeriod.endOn,
    },
    sources: current.map((transaction) => transaction.id),
  };
}

interface GroupComparison {
  currentAmountMinor: number;
  previousAmountMinor: number;
  currentCount: number;
  sourceIds: string[];
}

function compareExpenseGroups(
  current: readonly InsightTransaction[],
  previous: readonly InsightTransaction[],
  keyFn: (transaction: InsightTransaction) => string | undefined,
): ReadonlyMap<string, GroupComparison> {
  const groups = new Map<string, GroupComparison>();
  addGroupAmounts(groups, current, keyFn, "current");
  addGroupAmounts(groups, previous, keyFn, "previous");
  return groups;
}

function addGroupAmounts(
  groups: Map<string, GroupComparison>,
  transactions: readonly InsightTransaction[],
  keyFn: (transaction: InsightTransaction) => string | undefined,
  period: "current" | "previous",
): void {
  for (const transaction of transactions) {
    if (transaction.kind !== "expense") {
      continue;
    }

    const key = keyFn(transaction);

    if (key === undefined || key.length === 0) {
      continue;
    }

    const group = groups.get(key) ?? {
      currentAmountMinor: 0,
      previousAmountMinor: 0,
      currentCount: 0,
      sourceIds: [],
    };

    if (period === "current") {
      group.currentAmountMinor += transaction.amountMinor;
      group.currentCount += 1;
      group.sourceIds.push(transaction.id);
    } else {
      group.previousAmountMinor += transaction.amountMinor;
    }

    groups.set(key, group);
  }
}

function filterByPeriod(
  transactions: readonly InsightTransaction[],
  startOn: string,
  endOn: string,
): InsightTransaction[] {
  return transactions.filter((transaction) => {
    return transaction.occurredOn >= startOn && transaction.occurredOn <= endOn;
  });
}

function sumByKind(
  transactions: readonly InsightTransaction[],
  kind: InsightTransaction["kind"],
): number {
  return transactions
    .filter((transaction) => transaction.kind === kind)
    .reduce((sum, transaction) => sum + transaction.amountMinor, 0);
}

function firstDate(transactions: readonly InsightTransaction[]): string {
  const sorted = [...transactions].sort((left, right) => {
    return left.occurredOn.localeCompare(right.occurredOn);
  });

  return sorted[0]?.occurredOn ?? "";
}

function lastDate(transactions: readonly InsightTransaction[]): string {
  const sorted = [...transactions].sort((left, right) => {
    return right.occurredOn.localeCompare(left.occurredOn);
  });

  return sorted[0]?.occurredOn ?? "";
}

function calculatePercentChange(current: number, previous: number): number {
  return Math.round(((current - previous) / previous) * 100);
}

function calculateOptionalPercentChange(current: number, previous: number): number | undefined {
  if (previous <= 0) {
    return undefined;
  }

  return calculatePercentChange(current, previous);
}

function buildIncreaseSeverity(percentChange: number, threshold: number): FinancialInsightSeverity {
  return percentChange >= threshold * 2 ? "warning" : "info";
}

function buildIncreaseTitle(kind: SpendingIncreaseInsightKind, label: string): string {
  if (kind === "category_spending_increase") {
    return `Gasto maior na categoria ${label}`;
  }

  return `Gasto maior com ${label}`;
}

function buildIncreaseExplanation(percentChange: number): string {
  return `O gasto subiu ${percentChange}% em relacao ao periodo anterior comparavel.`;
}

function buildSubscriptionExplanation(distinctMonths: number): string {
  return `Foram encontradas despesas em ${distinctMonths} meses diferentes para o mesmo merchant.`;
}

function formatMoney(amountMinor: number, currency: string): string {
  return formatMinorCurrency(amountMinor, { currency });
}
