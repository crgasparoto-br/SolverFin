import { formatMinorCurrency } from "@solverfin/shared";

export const FINANCIAL_INSIGHT_CALCULATION_VERSION = "financial-insights-v2" as const;

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
  status:
    | "pending_review"
    | "duplicate"
    | "planned"
    | "posted"
    | "reconciled"
    | "suggested"
    | "voided";
  amountMinor: number;
  currency: string;
  occurredOn: string;
  categoryId?: string;
  merchantKey?: string;
  description?: string;
}

export interface InsightBudget {
  id?: string;
  organizationId: string;
  financialProfileId: string;
  categoryId: string;
  plannedAmountMinor: number;
  currency: string;
  periodStartOn: string;
  periodEndOn: string;
}

export interface FinancialInsightEvidenceItem {
  label: string;
  value: number;
  unit: "minor_currency" | "percentage" | "count";
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
  items?: readonly FinancialInsightEvidenceItem[];
}

export interface FinancialInsightComparison {
  kind: "previous_period" | "planned_budget";
  periodStartOn?: string;
  periodEndOn?: string;
}

export interface FinancialInsightFilters {
  currency: string;
  categoryId?: string;
  merchantKey?: string;
}

export interface FinancialInsightNavigation {
  view: "transactions" | "budgets" | "cash_flow";
  categoryId?: string;
  merchantKey?: string;
}

export interface FinancialInsight {
  kind: FinancialInsightKind;
  severity: FinancialInsightSeverity;
  confidence: FinancialInsightConfidence;
  title: string;
  explanation: string;
  currency: string;
  evidence: FinancialInsightEvidence;
  filters: FinancialInsightFilters;
  comparison?: FinancialInsightComparison;
  limitations: readonly string[];
  navigation?: FinancialInsightNavigation;
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
  projectedBalanceSourceFingerprint?: string;
  projectionPeriodEndOn?: string;
  currency?: string;
  increaseThresholdPercent?: number;
  minimumComparableTransactionCount?: number;
  minRecurringOccurrences?: number;
  recurringAmountTolerancePercent?: number;
}

export interface FinancialInsightExplanationProvider {
  explain(input: {
    kind: Exclude<FinancialInsightKind, "insufficient_data">;
    title: string;
    deterministicExplanation: string;
    currency: string;
    evidence: FinancialInsightEvidence;
    limitations: readonly string[];
  }): Promise<string>;
}

const DEFAULT_INCREASE_THRESHOLD_PERCENT = 25;
const DEFAULT_MINIMUM_COMPARABLE_TRANSACTION_COUNT = 2;
const DEFAULT_MIN_RECURRING_OCCURRENCES = 3;
const DEFAULT_RECURRING_AMOUNT_TOLERANCE_PERCENT = 20;
const REALIZED_STATUSES = new Set<InsightTransaction["status"]>(["posted", "reconciled"]);
const UNREVIEWED_STATUSES = new Set<InsightTransaction["status"]>([
  "pending_review",
  "duplicate",
  "suggested",
]);
const PROVIDER_QUANTITATIVE_CLAIM = new RegExp(
  [
    "\\d",
    "\\b(?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\\b",
    "\\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\\b",
    "percent(?:ual|age)?",
    "por\\s+cento",
    "dobr\\w*",
    "triplic\\w*",
    "metade",
    "half",
    "double",
    "triple",
    "aument\\w*",
    "cres(?:c|ç)\\w*",
    "subi\\w*",
    "reduz\\w*",
    "diminui\\w*",
    "cai\\w*",
    "maior(?:es)?",
    "menor(?:es)?",
    "mais",
    "menos",
    "higher",
    "lower",
    "increase\\w*",
    "decrease\\w*",
    "grew",
    "fell",
  ].join("|"),
  "iu",
);

export function generateFinancialInsights(
  input: GenerateFinancialInsightsInput,
): FinancialInsight[] {
  const currency = normalizeCurrency(input.currency);
  const scoped = input.transactions.filter(
    (transaction) =>
      transaction.organizationId === input.organizationId &&
      transaction.financialProfileId === input.financialProfileId &&
      transaction.currency === currency &&
      transaction.status !== "voided",
  );
  const realized = scoped.filter((transaction) => REALIZED_STATUSES.has(transaction.status));
  const current = filterByPeriod(realized, input.currentPeriod.startOn, input.currentPeriod.endOn);
  const previous = filterByPeriod(
    realized,
    input.previousPeriod.startOn,
    input.previousPeriod.endOn,
  );
  const commonLimitations = buildCommonLimitations(input, scoped, current, previous, currency);

  const actionable = [
    ...buildSpendingIncreaseInsights(input, current, previous, currency, commonLimitations),
    ...buildSubscriptionInsights(input, realized, currency, commonLimitations),
    ...buildNegativeBalanceInsight(input, currency, commonLimitations),
    ...buildBudgetInsights(input, realized, currency, commonLimitations),
  ];
  if (current.length === 0) {
    return [...actionable, buildInsufficientDataInsight(input, currency, commonLimitations)];
  }
  return [
    ...actionable,
    buildMonthlySummary(input, current, previous, currency, commonLimitations),
  ];
}

export async function explainFinancialInsightWithProvider(
  insight: FinancialInsight,
  provider: FinancialInsightExplanationProvider | undefined,
): Promise<string> {
  if (provider === undefined || insight.kind === "insufficient_data") {
    return insight.explanation;
  }

  try {
    const text = (
      await provider.explain({
        kind: insight.kind,
        title: insight.title,
        deterministicExplanation: insight.explanation,
        currency: insight.currency,
        evidence: insight.evidence,
        limitations: insight.limitations,
      })
    ).trim();

    // Provider text is narrative-only. Reject any wording that makes a quantitative claim,
    // including numbers written as words or comparative/magnitude language.
    if (text.length === 0 || text.length > 600 || PROVIDER_QUANTITATIVE_CLAIM.test(text)) {
      return insight.explanation;
    }
    return text;
  } catch {
    return insight.explanation;
  }
}

function buildSpendingIncreaseInsights(
  input: GenerateFinancialInsightsInput,
  current: readonly InsightTransaction[],
  previous: readonly InsightTransaction[],
  currency: string,
  commonLimitations: readonly string[],
): FinancialInsight[] {
  const threshold = input.increaseThresholdPercent ?? DEFAULT_INCREASE_THRESHOLD_PERCENT;
  const minimumCount =
    input.minimumComparableTransactionCount ?? DEFAULT_MINIMUM_COMPARABLE_TRANSACTION_COUNT;
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
    ...buildIncreaseInsightsForGroup(
      input,
      byCategory,
      threshold,
      minimumCount,
      "category_spending_increase",
      currency,
      commonLimitations,
    ),
    ...buildIncreaseInsightsForGroup(
      input,
      byMerchant,
      threshold,
      minimumCount,
      "merchant_spending_increase",
      currency,
      commonLimitations,
    ),
  ];
}

function buildIncreaseInsightsForGroup(
  input: GenerateFinancialInsightsInput,
  groups: ReadonlyMap<string, GroupComparison>,
  threshold: number,
  minimumCount: number,
  kind: SpendingIncreaseInsightKind,
  currency: string,
  commonLimitations: readonly string[],
): FinancialInsight[] {
  const insights: FinancialInsight[] = [];

  for (const [label, group] of groups) {
    if (
      group.previousAmountMinor <= 0 ||
      group.currentAmountMinor <= group.previousAmountMinor ||
      group.currentCount < minimumCount ||
      group.previousCount < minimumCount
    ) {
      continue;
    }

    const deltaAmountMinor =
      group.currentAmountMinor - group.previousAmountMinor;
    const ratio = deltaAmountMinor / group.previousAmountMinor;
    const exactPercentChange = ratio * 100;
    if (exactPercentChange < threshold) continue;
    const percentChange = Math.round(exactPercentChange);

    const categoryId = kind === "category_spending_increase" ? label : undefined;
    const merchantKey = kind === "merchant_spending_increase" ? label : undefined;
    insights.push({
      kind,
      severity: buildIncreaseSeverity(exactPercentChange, threshold),
      confidence:
        group.currentCount >= minimumCount + 1 && group.previousCount >= minimumCount + 1
          ? "high"
          : "medium",
      title: buildIncreaseTitle(kind, label),
      explanation: buildIncreaseExplanation(percentChange),
      currency,
      evidence: {
        label,
        currentAmountMinor: group.currentAmountMinor,
        previousAmountMinor: group.previousAmountMinor,
        deltaAmountMinor,
        percentChange,
        count: group.currentCount,
        periodStartOn: input.currentPeriod.startOn,
        periodEndOn: input.currentPeriod.endOn,
      },
      filters: {
        currency,
        ...(categoryId === undefined ? {} : { categoryId }),
        ...(merchantKey === undefined ? {} : { merchantKey }),
      },
      comparison: {
        kind: "previous_period",
        periodStartOn: input.previousPeriod.startOn,
        periodEndOn: input.previousPeriod.endOn,
      },
      limitations: commonLimitations,
      navigation: {
        view: "transactions",
        ...(categoryId === undefined ? {} : { categoryId }),
        ...(merchantKey === undefined ? {} : { merchantKey }),
      },
      sources: [...group.currentSourceIds, ...group.previousSourceIds],
    });
  }

  return insights;
}

function buildSubscriptionInsights(
  input: GenerateFinancialInsightsInput,
  transactions: readonly InsightTransaction[],
  currency: string,
  commonLimitations: readonly string[],
): FinancialInsight[] {
  const minOccurrences = input.minRecurringOccurrences ?? DEFAULT_MIN_RECURRING_OCCURRENCES;
  const tolerance =
    input.recurringAmountTolerancePercent ?? DEFAULT_RECURRING_AMOUNT_TOLERANCE_PERCENT;
  const groups = new Map<string, InsightTransaction[]>();

  for (const transaction of transactions) {
    if (transaction.kind !== "expense" || transaction.merchantKey === undefined) continue;
    const group = groups.get(transaction.merchantKey) ?? [];
    group.push(transaction);
    groups.set(transaction.merchantKey, group);
  }

  const insights: FinancialInsight[] = [];
  for (const [merchantKey, group] of groups) {
    const monthly = findLatestConsecutiveMonths(buildMonthlyMerchantSeries(group));
    if (
      monthly.length < minOccurrences ||
      monthly.at(-1)?.month !== input.currentPeriod.startOn.slice(0, 7)
    ) {
      continue;
    }

    const amounts = monthly.map((item) => item.amountMinor);
    const exactAverage =
      amounts.reduce((sum, value) => sum + value, 0) / amounts.length;
    const average = Math.round(exactAverage);
    const exactMaxDeviationPercent = Math.max(
      ...amounts.map((value) => {
        const deviation = Math.abs(value - exactAverage);
        return (deviation / Math.max(1, exactAverage)) * 100;
      }),
    );
    if (exactMaxDeviationPercent > tolerance) continue;
    const maxDeviationPercent = Math.round(exactMaxDeviationPercent);

    insights.push({
      kind: "probable_subscription",
      severity: "info",
      confidence: monthly.length >= minOccurrences + 1 ? "high" : "medium",
      title: `Possivel recorrencia em ${merchantKey}`,
      explanation: buildSubscriptionExplanation(monthly.length),
      currency,
      evidence: {
        label: merchantKey,
        currentAmountMinor: average,
        percentChange: maxDeviationPercent,
        count: monthly.length,
        periodStartOn: monthly[0]?.firstOn ?? input.currentPeriod.startOn,
        periodEndOn: monthly.at(-1)?.lastOn ?? input.currentPeriod.endOn,
      },
      filters: { currency, merchantKey },
      limitations: [
        ...commonLimitations,
        `Recorrencia inferida exige meses consecutivos e variacao de valor de ate ${tolerance}%.`,
      ],
      navigation: { view: "transactions", merchantKey },
      sources: monthly.flatMap((item) => item.sourceIds),
    });
  }
  return insights;
}

function buildNegativeBalanceInsight(
  input: GenerateFinancialInsightsInput,
  currency: string,
  commonLimitations: readonly string[],
): FinancialInsight[] {
  if (input.projectedBalanceMinor === undefined || input.projectedBalanceMinor >= 0) return [];

  return [
    {
      kind: "negative_balance_risk",
      severity: "critical",
      confidence: "medium",
      title: "Risco de saldo negativo",
      explanation:
        "A projecao deterministica para o fim do periodo fica abaixo de zero. Revise compromissos planejados e premissas antes de decidir.",
      currency,
      evidence: {
        label: "saldo_projetado",
        currentAmountMinor: input.projectedBalanceMinor,
        periodStartOn: input.currentPeriod.startOn,
        periodEndOn: input.projectionPeriodEndOn ?? input.currentPeriod.endOn,
      },
      filters: { currency },
      limitations: [
        ...commonLimitations,
        "A projecao considera saldos de abertura, movimentos confirmados e lancamentos planejados no horizonte.",
      ],
      navigation: { view: "cash_flow" },
      sources: [input.projectedBalanceSourceFingerprint ?? "projected_balance"],
    },
  ];
}

function buildBudgetInsights(
  input: GenerateFinancialInsightsInput,
  realized: readonly InsightTransaction[],
  currency: string,
  commonLimitations: readonly string[],
): FinancialInsight[] {
  const budgets = (input.budgets ?? []).filter(
    (budget) =>
      budget.organizationId === input.organizationId &&
      budget.financialProfileId === input.financialProfileId &&
      budget.currency === currency &&
      budget.periodStartOn <= input.currentPeriod.endOn &&
      budget.periodEndOn >= input.currentPeriod.startOn,
  );
  const insights: FinancialInsight[] = [];

  for (const budget of budgets) {
    const matching = realized.filter(
      (transaction) =>
        transaction.kind === "expense" &&
        transaction.categoryId === budget.categoryId &&
        transaction.occurredOn >= budget.periodStartOn &&
        transaction.occurredOn <= budget.periodEndOn,
    );
    const spent = matching.reduce((sum, transaction) => sum + transaction.amountMinor, 0);
    if (spent <= budget.plannedAmountMinor) continue;

    insights.push({
      kind: "budget_exceeded",
      severity: "warning",
      confidence: "high",
      title: `Orcamento excedido em ${budget.categoryId}`,
      explanation: "O total realizado ultrapassou o valor planejado para a categoria no periodo.",
      currency,
      evidence: {
        label: budget.categoryId,
        currentAmountMinor: spent,
        previousAmountMinor: budget.plannedAmountMinor,
        deltaAmountMinor: spent - budget.plannedAmountMinor,
        percentChange: Math.round(
          ((spent - budget.plannedAmountMinor) / Math.max(1, budget.plannedAmountMinor)) * 100,
        ),
        count: matching.length,
        periodStartOn: budget.periodStartOn,
        periodEndOn: budget.periodEndOn,
      },
      filters: { currency, categoryId: budget.categoryId },
      comparison: { kind: "planned_budget" },
      limitations: commonLimitations,
      navigation: { view: "budgets", categoryId: budget.categoryId },
      sources: [
        ...(budget.id === undefined ? [] : [budget.id]),
        ...matching.map((transaction) => transaction.id),
      ],
    });
  }
  return insights;
}

function buildMonthlySummary(
  input: GenerateFinancialInsightsInput,
  current: readonly InsightTransaction[],
  previous: readonly InsightTransaction[],
  currency: string,
  commonLimitations: readonly string[],
): FinancialInsight {
  const currentIncome = sumByKind(current, "income");
  const currentExpense = sumByKind(current, "expense");
  const currentBalance = currentIncome - currentExpense;
  const previousExpense = sumByKind(previous, "expense");
  const percentChange = calculateOptionalPercentChange(currentExpense, previousExpense);
  const limitations = [...commonLimitations];
  if (previous.length === 0) {
    limitations.push("Nao ha periodo anterior com dados realizados para uma comparacao completa.");
  }
  if ((input.budgets ?? []).filter((budget) => budget.currency === currency).length === 0) {
    limitations.push("Nenhum orcamento na moeda analisada foi informado para este periodo.");
  }

  const summaryItems: FinancialInsightEvidenceItem[] = [
    { label: "receitas", value: currentIncome, unit: "minor_currency" },
    { label: "despesas", value: currentExpense, unit: "minor_currency" },
    { label: "saldo", value: currentBalance, unit: "minor_currency" },
    { label: "despesas_periodo_anterior", value: previousExpense, unit: "minor_currency" },
  ];
  if (percentChange !== undefined) {
    summaryItems.push({
      label: "variacao_despesas_percentual",
      value: percentChange,
      unit: "percentage",
    });
  }
  summaryItems.push(...buildTopCategoryVariations(current, previous));

  return {
    kind: "monthly_summary",
    severity: "info",
    confidence: current.length > 0 ? "high" : "low",
    title: "Resumo financeiro do periodo",
    explanation: `O periodo teve receitas de ${formatMoney(currentIncome, currency)}, despesas de ${formatMoney(currentExpense, currency)} e saldo realizado de ${formatMoney(currentBalance, currency)}.`,
    currency,
    evidence: {
      label: "despesas_do_periodo",
      currentAmountMinor: currentExpense,
      previousAmountMinor: previousExpense,
      deltaAmountMinor: currentExpense - previousExpense,
      ...(percentChange === undefined ? {} : { percentChange }),
      count: current.length,
      periodStartOn: input.currentPeriod.startOn,
      periodEndOn: input.currentPeriod.endOn,
      items: summaryItems,
    },
    filters: { currency },
    ...(previous.length === 0
      ? {}
      : {
          comparison: {
            kind: "previous_period" as const,
            periodStartOn: input.previousPeriod.startOn,
            periodEndOn: input.previousPeriod.endOn,
          },
        }),
    limitations,
    navigation: { view: "transactions" },
    sources: [...current, ...previous].map((transaction) => transaction.id),
  };
}

function buildTopCategoryVariations(
  current: readonly InsightTransaction[],
  previous: readonly InsightTransaction[],
): FinancialInsightEvidenceItem[] {
  if (previous.length === 0) return [];
  const currentTotals = sumExpenseByCategory(current);
  const previousTotals = sumExpenseByCategory(previous);
  const categories = new Set([...currentTotals.keys(), ...previousTotals.keys()]);
  return [...categories]
    .map((categoryId) => ({
      categoryId,
      delta: (currentTotals.get(categoryId) ?? 0) - (previousTotals.get(categoryId) ?? 0),
    }))
    .filter((item) => item.delta !== 0)
    .sort(
      (left, right) =>
        Math.abs(right.delta) - Math.abs(left.delta) ||
        left.categoryId.localeCompare(right.categoryId),
    )
    .slice(0, 3)
    .map((item) => ({
      label: `variacao_categoria:${item.categoryId}`,
      value: item.delta,
      unit: "minor_currency" as const,
    }));
}

function sumExpenseByCategory(transactions: readonly InsightTransaction[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.kind !== "expense") continue;
    const categoryId = transaction.categoryId ?? "sem_categoria";
    totals.set(categoryId, (totals.get(categoryId) ?? 0) + transaction.amountMinor);
  }
  return totals;
}

function buildInsufficientDataInsight(
  input: GenerateFinancialInsightsInput,
  currency: string,
  commonLimitations: readonly string[],
): FinancialInsight {
  return {
    kind: "insufficient_data",
    severity: "info",
    confidence: "low",
    title: "Dados insuficientes para gerar insights",
    explanation:
      "Ainda nao ha lancamentos realizados suficientes nos periodos comparados para apontar variacoes com seguranca.",
    currency,
    evidence: {
      label: "lancamentos_realizados_comparados",
      count: 0,
      periodStartOn: input.currentPeriod.startOn,
      periodEndOn: input.currentPeriod.endOn,
    },
    filters: { currency },
    limitations: commonLimitations,
    sources: [],
  };
}

interface GroupComparison {
  currentAmountMinor: number;
  previousAmountMinor: number;
  currentCount: number;
  previousCount: number;
  currentSourceIds: string[];
  previousSourceIds: string[];
}

interface MonthlyMerchantSeriesItem {
  month: string;
  amountMinor: number;
  firstOn: string;
  lastOn: string;
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
    if (transaction.kind !== "expense") continue;
    const key = keyFn(transaction);
    if (key === undefined || key.length === 0) continue;

    const group = groups.get(key) ?? {
      currentAmountMinor: 0,
      previousAmountMinor: 0,
      currentCount: 0,
      previousCount: 0,
      currentSourceIds: [],
      previousSourceIds: [],
    };
    if (period === "current") {
      group.currentAmountMinor += transaction.amountMinor;
      group.currentCount += 1;
      group.currentSourceIds.push(transaction.id);
    } else {
      group.previousAmountMinor += transaction.amountMinor;
      group.previousCount += 1;
      group.previousSourceIds.push(transaction.id);
    }
    groups.set(key, group);
  }
}

function buildMonthlyMerchantSeries(
  transactions: readonly InsightTransaction[],
): MonthlyMerchantSeriesItem[] {
  const monthly = new Map<string, MonthlyMerchantSeriesItem>();
  for (const transaction of transactions) {
    const month = transaction.occurredOn.slice(0, 7);
    const current = monthly.get(month) ?? {
      month,
      amountMinor: 0,
      firstOn: transaction.occurredOn,
      lastOn: transaction.occurredOn,
      sourceIds: [],
    };
    current.amountMinor += transaction.amountMinor;
    current.firstOn =
      current.firstOn < transaction.occurredOn ? current.firstOn : transaction.occurredOn;
    current.lastOn =
      current.lastOn > transaction.occurredOn ? current.lastOn : transaction.occurredOn;
    current.sourceIds.push(transaction.id);
    monthly.set(month, current);
  }
  return [...monthly.values()].sort((left, right) => left.month.localeCompare(right.month));
}

function findLatestConsecutiveMonths(
  series: readonly MonthlyMerchantSeriesItem[],
): MonthlyMerchantSeriesItem[] {
  if (series.length === 0) return [];
  const result: MonthlyMerchantSeriesItem[] = [];
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const current = series[index];
    if (current === undefined) break;
    const next = result[0];
    if (next !== undefined && monthIndex(next.month) - monthIndex(current.month) !== 1) break;
    result.unshift(current);
  }
  return result;
}

function monthIndex(month: string): number {
  const [yearText, monthText] = month.split("-");
  return Number(yearText) * 12 + Number(monthText) - 1;
}

function buildCommonLimitations(
  input: GenerateFinancialInsightsInput,
  scoped: readonly InsightTransaction[],
  current: readonly InsightTransaction[],
  previous: readonly InsightTransaction[],
  currency: string,
): string[] {
  const limitations: string[] = [];
  const relevantStart = input.previousPeriod.startOn;
  const relevantEnd = input.currentPeriod.endOn;
  const pendingCount = scoped.filter(
    (transaction) =>
      transaction.occurredOn >= relevantStart &&
      transaction.occurredOn <= relevantEnd &&
      UNREVIEWED_STATUSES.has(transaction.status),
  ).length;
  if (pendingCount > 0) {
    limitations.push(
      `${pendingCount} lancamento(s) pendente(s) de revisao, duplicado(s) ou sugerido(s) foram excluidos do calculo.`,
    );
  }
  const plannedCount = scoped.filter(
    (transaction) =>
      transaction.occurredOn >= relevantStart &&
      transaction.occurredOn <= relevantEnd &&
      transaction.status === "planned",
  ).length;
  if (plannedCount > 0) {
    limitations.push("Lancamentos planejados nao compoem os totais realizados deste insight.");
  }
  if (current.length === 0 || previous.length === 0) {
    limitations.push("A amostra comparavel entre os periodos e limitada.");
  }
  limitations.push(
    `Valores calculados isoladamente em ${currency}; moedas diferentes nao sao somadas.`,
  );
  return limitations;
}

function filterByPeriod(
  transactions: readonly InsightTransaction[],
  startOn: string,
  endOn: string,
): InsightTransaction[] {
  return transactions.filter(
    (transaction) => transaction.occurredOn >= startOn && transaction.occurredOn <= endOn,
  );
}

function sumByKind(
  transactions: readonly InsightTransaction[],
  kind: InsightTransaction["kind"],
): number {
  return transactions
    .filter((transaction) => transaction.kind === kind)
    .reduce((sum, transaction) => sum + transaction.amountMinor, 0);
}

function calculatePercentChange(current: number, previous: number): number {
  return Math.round(((current - previous) / previous) * 100);
}

function calculateOptionalPercentChange(current: number, previous: number): number | undefined {
  return previous <= 0 ? undefined : calculatePercentChange(current, previous);
}

function buildIncreaseSeverity(percentChange: number, threshold: number): FinancialInsightSeverity {
  return percentChange >= threshold * 2 ? "warning" : "info";
}

function buildIncreaseTitle(kind: SpendingIncreaseInsightKind, label: string): string {
  return kind === "category_spending_increase"
    ? `Gasto maior na categoria ${label}`
    : `Gasto maior com ${label}`;
}

function buildIncreaseExplanation(percentChange: number): string {
  return `O gasto subiu ${percentChange}% em relacao ao periodo anterior comparavel.`;
}

function buildSubscriptionExplanation(distinctMonths: number): string {
  return `Foram encontradas despesas de valor semelhante em ${distinctMonths} meses consecutivos para o mesmo merchant.`;
}

function normalizeCurrency(currency: string | undefined): string {
  const normalized = (currency ?? "BRL").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : "BRL";
}

function formatMoney(amountMinor: number, currency: string): string {
  return formatMinorCurrency(amountMinor, { currency });
}