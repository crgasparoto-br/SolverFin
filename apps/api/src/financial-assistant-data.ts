import {
  classifyFinancialAssistantIntent,
  generateFinancialInsights,
  type AvailabilityCalculationResult,
  type FinancialAssistantConfidence,
  type FinancialAssistantEvidence,
  type FinancialAssistantIntent,
  type InsightTransaction,
} from "@solverfin/ai";
import type { TenantContext } from "@solverfin/domain";

import { query } from "./db.js";

interface CurrencyRow {
  currency: string;
}

interface CategoryRow {
  id: string;
  name: string;
}

interface TransactionRow {
  id: string;
  kind: string;
  status: string;
  amountMinor: number | string;
  currency: string;
  occurredOn: Date;
  plannedOn: Date;
  description: string;
  categoryId: string | null;
}

interface AggregateRow {
  amountMinor: number | string | null;
  count: number | string | null;
}

interface BalanceAggregateRow {
  openingBalanceMinor: number | string | null;
  realizedBalanceDeltaMinor: number | string | null;
  plannedBalanceDeltaMinor: number | string | null;
}

interface RecurrenceAggregateRow {
  count: number | string | null;
}

interface InvoiceAggregateRow {
  amountMinor: number | string | null;
  count: number | string | null;
}

export interface FinancialAssistantResolvedFilters {
  currency: string;
  periodStartOn: string;
  periodEndOn: string;
  categoryId?: string;
  categoryName?: string;
}

export type FinancialAssistantDataResolution =
  | {
      kind: "clarification";
      intent: FinancialAssistantIntent;
      message: string;
      filters: Partial<FinancialAssistantResolvedFilters>;
    }
  | {
      kind: "out_of_scope";
      intent: "out_of_scope";
      message: string;
    }
  | {
      kind: "evidence";
      intent: Exclude<FinancialAssistantIntent, "out_of_scope">;
      filters: FinancialAssistantResolvedFilters;
      evidence?: FinancialAssistantEvidence | undefined;
      availability?: AvailabilityCalculationResult | undefined;
    };

const REALIZED_STATUSES = ["POSTED", "RECONCILED"] as const;

export async function resolveFinancialAssistantData(
  context: TenantContext,
  question: string,
  now = new Date(),
): Promise<FinancialAssistantDataResolution> {
  const intent = classifyFinancialAssistantIntent(question);
  if (intent === "out_of_scope") {
    return {
      kind: "out_of_scope",
      intent,
      message:
        "Posso consultar saldo, gastos, faturas, parcelas, recorrencias e resumos do SolverFin. Nao executo operacoes nem recomendacoes profissionais.",
    };
  }

  const currencies = await listCurrencies(context);
  if (currencies.length === 0) {
    return {
      kind: "clarification",
      intent,
      message:
        "Ainda nao ha dados financeiros suficientes neste perfil para responder. Registre ou importe movimentacoes e tente novamente.",
      filters: {},
    };
  }

  const currency = resolveCurrency(question, currencies);
  if (currency === undefined) {
    return {
      kind: "clarification",
      intent,
      message: `Este perfil usa mais de uma moeda (${currencies.join(", ")}). Informe qual moeda devo analisar; nao faco conversao cambial automatica.`,
      filters: {},
    };
  }

  const period = resolvePeriod(question, intent, now);
  if (period === undefined) {
    return {
      kind: "clarification",
      intent,
      message:
        "Informe o periodo que deseja analisar, por exemplo: hoje, este mes, mes passado ou 2026-08.",
      filters: { currency },
    };
  }

  const category =
    intent === "category_spending" ? await resolveCategory(context, question) : undefined;
  const filters: FinancialAssistantResolvedFilters = {
    currency,
    periodStartOn: period.startOn,
    periodEndOn: period.endOn,
    ...(category ? { categoryId: category.id, categoryName: category.name } : {}),
  };

  if (intent === "daily_availability") {
    return {
      kind: "evidence",
      intent,
      filters,
      availability: await buildAvailability(context, filters, now),
    };
  }

  return {
    kind: "evidence",
    intent,
    filters,
    evidence: await buildEvidence(context, intent, filters, now),
  };
}

async function buildEvidence(
  context: TenantContext,
  intent: Exclude<FinancialAssistantIntent, "daily_availability" | "out_of_scope">,
  filters: FinancialAssistantResolvedFilters,
  now: Date,
): Promise<FinancialAssistantEvidence | undefined> {
  if (intent === "subscriptions") {
    return buildSubscriptionsEvidence(context, filters, now);
  }

  const realized = await aggregateTransactions(context, filters, REALIZED_STATUSES);
  const plannedExpenses = await aggregatePlannedExpenses(context, filters);
  const plannedInstallments = await aggregatePlannedInstallments(context, filters);
  const invoices = await aggregateInvoices(context, filters);
  const unmodeledInvoices = await aggregateInvoicesWithoutPaymentTransaction(context, filters);
  const balance = await aggregateBalance(
    context,
    filters.currency,
    filters.periodEndOn,
    dateOnly(now),
  );
  const assumptions = [
    "Totais realizados consideram somente lancamentos POSTED ou RECONCILED.",
    "Faturas abertas sem transacao de pagamento vinculada entram na projecao sem duplicar pagamentos ja materializados.",
    "Moedas sao analisadas separadamente e nao existe conversao automatica.",
  ];
  const limitations = ["Movimentacoes ainda nao registradas nao aparecem no resultado."];
  const sources = ["lancamentos"];

  if (intent === "balance_projection") {
    sources.push("contas", "faturas");
    return {
      currency: filters.currency,
      period: { startOn: filters.periodStartOn, endOn: filters.periodEndOn },
      filters: displayFilters(filters),
      metrics: [
        {
          key: "current_balance",
          label: "Saldo calculado ate hoje",
          amountMinor: balance.openingBalanceMinor + balance.realizedBalanceDeltaMinor,
        },
        {
          key: "planned_delta",
          label: "Efeito dos lancamentos planejados no horizonte",
          amountMinor: balance.plannedBalanceDeltaMinor,
        },
        {
          key: "open_invoices_without_payment",
          label: "Faturas abertas ainda sem transacao de pagamento",
          amountMinor: unmodeledInvoices.amountMinor,
          count: unmodeledInvoices.count,
        },
        {
          key: "projected_balance",
          label: "Saldo projetado no fim do periodo",
          amountMinor:
            balance.openingBalanceMinor +
            balance.realizedBalanceDeltaMinor +
            balance.plannedBalanceDeltaMinor -
            unmodeledInvoices.amountMinor,
        },
      ],
      assumptions,
      limitations,
      sources,
      confidence: balance.accountCount > 0 ? "high" : "low",
    };
  }

  if (intent === "category_spending") {
    return {
      currency: filters.currency,
      period: { startOn: filters.periodStartOn, endOn: filters.periodEndOn },
      filters: displayFilters(filters),
      metrics: [
        {
          key: "income",
          label: "Receitas realizadas",
          amountMinor: realized.income.amountMinor,
          count: realized.income.count,
        },
        {
          key: "expense",
          label: "Despesas realizadas",
          amountMinor: realized.expense.amountMinor,
          count: realized.expense.count,
        },
      ],
      assumptions,
      limitations,
      sources,
      confidence: realized.income.count + realized.expense.count > 0 ? "high" : ("low" as const),
    };
  }

  sources.push("faturas", "parcelas");
  return {
    currency: filters.currency,
    period: { startOn: filters.periodStartOn, endOn: filters.periodEndOn },
    filters: displayFilters(filters),
    metrics: [
      {
        key: "income",
        label: "Receitas realizadas",
        amountMinor: realized.income.amountMinor,
        count: realized.income.count,
      },
      {
        key: "expense",
        label: "Despesas realizadas",
        amountMinor: realized.expense.amountMinor,
        count: realized.expense.count,
      },
      {
        key: "planned_expense",
        label: "Despesas planejadas",
        amountMinor: plannedExpenses.amountMinor,
        count: plannedExpenses.count,
      },
      {
        key: "planned_installments",
        label: "Parcelas planejadas no periodo",
        amountMinor: plannedInstallments.amountMinor,
        count: plannedInstallments.count,
      },
      {
        key: "open_invoices",
        label: "Faturas em aberto com vencimento no periodo",
        amountMinor: invoices.amountMinor,
        count: invoices.count,
      },
      {
        key: "projected_balance",
        label: "Saldo projetado no fim do periodo",
        amountMinor:
          balance.openingBalanceMinor +
          balance.realizedBalanceDeltaMinor +
          balance.plannedBalanceDeltaMinor -
          unmodeledInvoices.amountMinor,
      },
    ],
    assumptions,
    limitations,
    sources,
    confidence:
      realized.income.count +
        realized.expense.count +
        plannedExpenses.count +
        plannedInstallments.count +
        invoices.count >
      0
        ? "high"
        : "low",
  };
}

async function buildSubscriptionsEvidence(
  context: TenantContext,
  filters: FinancialAssistantResolvedFilters,
  now: Date,
): Promise<FinancialAssistantEvidence | undefined> {
  const historyStartOn = shiftMonths(monthStart(now), -5);
  const historyRows = await query<TransactionRow>(
    `select "id", "kind", "status", "amountMinor", "currency", "occurredOn", "plannedOn", "description", "categoryId"
       from "Transaction"
      where "organizationId" = $1 and "financialProfileId" = $2
        and upper("currency") = $3
        and "status" in ('POSTED', 'RECONCILED')
        and "occurredOn" between $4::date and $5::date
      order by "occurredOn" asc, "id" asc`,
    [
      context.organizationId,
      context.financialProfileId,
      filters.currency,
      historyStartOn,
      dateOnly(now),
    ],
  );
  const current = monthBounds(now);
  const previous = monthBounds(addMonths(now, -1));
  const transactions: InsightTransaction[] = historyRows.map((row) => ({
    id: row.id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    kind: row.kind.toLowerCase() as InsightTransaction["kind"],
    status: row.status.toLowerCase() as InsightTransaction["status"],
    amountMinor: toNumber(row.amountMinor),
    currency: filters.currency,
    occurredOn: dateOnly(row.occurredOn),
    ...(row.categoryId === null ? {} : { categoryId: row.categoryId }),
    ...(row.description.trim().length === 0
      ? {}
      : { merchantKey: normalizeMerchant(row.description), description: row.description }),
  }));
  const probable = generateFinancialInsights({
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    currentPeriod: current,
    previousPeriod: previous,
    transactions,
    currency: filters.currency,
  }).filter((item) => item.kind === "probable_subscription");
  const [registered] = await query<RecurrenceAggregateRow>(
    `select count(*)::int as "count"
       from "Recurrence"
      where "organizationId" = $1 and "financialProfileId" = $2
        and upper("currency") = $3 and "status" = 'ACTIVE'`,
    [context.organizationId, context.financialProfileId, filters.currency],
  );
  const probableAverageMinor = probable.reduce(
    (sum, item) => sum + (item.evidence.currentAmountMinor ?? 0),
    0,
  );
  const confidence = probable.some((item) => item.confidence === "high")
    ? "high"
    : probable.length > 0
      ? "medium"
      : "low";

  return {
    currency: filters.currency,
    period: { startOn: historyStartOn, endOn: current.endOn },
    filters: displayFilters(filters),
    metrics: [
      {
        key: "registered_recurrences",
        label: "Recorrencias registradas ativas",
        count: toNumber(registered?.count),
      },
      {
        key: "probable_subscriptions",
        label: "Assinaturas provaveis",
        count: probable.length,
        amountMinor: probableAverageMinor,
      },
    ],
    assumptions: [
      "Assinaturas provaveis exigem ao menos tres meses consecutivos com valores semelhantes.",
      "Recorrencias registradas e assinaturas provaveis sao exibidas separadamente.",
    ],
    limitations: [
      "Uma repeticao de gasto nao confirma contratacao de assinatura; revise os lancamentos relacionados.",
    ],
    sources: ["lancamentos", "recorrencias", "financial-insights-v2"],
    confidence: confidence as FinancialAssistantConfidence,
  };
}

async function buildAvailability(
  context: TenantContext,
  filters: FinancialAssistantResolvedFilters,
  now: Date,
): Promise<AvailabilityCalculationResult | undefined> {
  const balance = await aggregateBalance(
    context,
    filters.currency,
    filters.periodEndOn,
    dateOnly(now),
  );
  if (balance.accountCount === 0) return undefined;
  const unmodeledInvoices = await aggregateInvoicesWithoutPaymentTransaction(context, filters);
  const [registeredRecurrences] = await query<RecurrenceAggregateRow>(
    `select count(*)::int as "count"
       from "Recurrence"
      where "organizationId" = $1 and "financialProfileId" = $2
        and upper("currency") = $3 and "status" = 'ACTIVE'
        and "startOn" <= $4::date and ("endOn" is null or "endOn" >= $5::date)`,
    [
      context.organizationId,
      context.financialProfileId,
      filters.currency,
      filters.periodEndOn,
      dateOnly(now),
    ],
  );
  const projected =
    balance.openingBalanceMinor +
    balance.realizedBalanceDeltaMinor +
    balance.plannedBalanceDeltaMinor -
    unmodeledInvoices.amountMinor;
  const recurrenceCount = toNumber(registeredRecurrences?.count);
  const limitations: string[] = [
    "Compras e compromissos ainda nao registrados podem alterar o valor.",
  ];
  if (recurrenceCount > 0) {
    limitations.push(
      "Recorrencias ativas so afetam o valor quando ja existem como lancamentos planejados no horizonte.",
    );
  }
  const confidence: FinancialAssistantConfidence =
    recurrenceCount === 0 && unmodeledInvoices.count === 0 ? "high" : "medium";

  return {
    availableTodayMinor: Math.max(0, projected),
    projectedBalanceMinor: projected,
    currency: filters.currency,
    horizonStartOn: dateOnly(now),
    horizonEndOn: filters.periodEndOn,
    confidence,
    components: [
      {
        label: "Saldo de abertura das contas",
        kind: "balance",
        amountMinor: balance.openingBalanceMinor,
        source: "contas",
      },
      {
        label: "Efeito de lancamentos realizados",
        kind: "balance",
        amountMinor: balance.realizedBalanceDeltaMinor,
        source: "lancamentos",
      },
      {
        label: "Efeito de lancamentos planejados",
        kind: "known_expense",
        amountMinor: balance.plannedBalanceDeltaMinor,
        source: "lancamentos previstos",
      },
      ...(unmodeledInvoices.amountMinor === 0
        ? []
        : [
            {
              label: "Faturas abertas ainda sem transacao de pagamento",
              kind: "card" as const,
              amountMinor: -unmodeledInvoices.amountMinor,
              source: "faturas",
            },
          ]),
    ],
    assumptions: [
      "Disponibilidade e uma estimativa do saldo projetado ate o fim do periodo, limitada a zero.",
      "Faturas com transacao de pagamento vinculada nao sao descontadas duas vezes.",
      "Nao ha conversao entre moedas.",
    ],
    limitations,
    calculatedAt: now.toISOString(),
  };
}

async function aggregateTransactions(
  context: TenantContext,
  filters: FinancialAssistantResolvedFilters,
  statuses: readonly string[],
): Promise<{
  income: { amountMinor: number; count: number };
  expense: { amountMinor: number; count: number };
}> {
  const params: unknown[] = [
    context.organizationId,
    context.financialProfileId,
    filters.currency,
    filters.periodStartOn,
    filters.periodEndOn,
    [...statuses],
  ];
  const categoryFilter = filters.categoryId
    ? ` and "categoryId" = $${params.push(filters.categoryId)}`
    : "";
  const rows = await query<{
    kind: string;
    amountMinor: number | string | null;
    count: number | string | null;
  }>(
    `select "kind", coalesce(sum("amountMinor"), 0)::bigint as "amountMinor", count(*)::int as "count"
       from "Transaction"
      where "organizationId" = $1 and "financialProfileId" = $2
        and upper("currency") = $3
        and "occurredOn" between $4::date and $5::date
        and "status" = any($6::text[])
        and "kind" in ('INCOME', 'EXPENSE')${categoryFilter}
      group by "kind"`,
    params,
  );
  const income = rows.find((row) => row.kind === "INCOME");
  const expense = rows.find((row) => row.kind === "EXPENSE");
  return {
    income: { amountMinor: toNumber(income?.amountMinor), count: toNumber(income?.count) },
    expense: { amountMinor: toNumber(expense?.amountMinor), count: toNumber(expense?.count) },
  };
}

async function aggregatePlannedExpenses(
  context: TenantContext,
  filters: FinancialAssistantResolvedFilters,
): Promise<{ amountMinor: number; count: number }> {
  const [row] = await query<AggregateRow>(
    `select coalesce(sum("amountMinor"), 0)::bigint as "amountMinor", count(*)::int as "count"
       from "Transaction"
      where "organizationId" = $1 and "financialProfileId" = $2
        and upper("currency") = $3 and "kind" = 'EXPENSE' and "status" = 'PLANNED'
        and "plannedOn" between $4::date and $5::date`,
    [
      context.organizationId,
      context.financialProfileId,
      filters.currency,
      filters.periodStartOn,
      filters.periodEndOn,
    ],
  );
  return { amountMinor: toNumber(row?.amountMinor), count: toNumber(row?.count) };
}

async function aggregatePlannedInstallments(
  context: TenantContext,
  filters: FinancialAssistantResolvedFilters,
): Promise<{ amountMinor: number; count: number }> {
  const [row] = await query<AggregateRow>(
    `select coalesce(sum("amountMinor"), 0)::bigint as "amountMinor", count(*)::int as "count"
       from "Transaction"
      where "organizationId" = $1 and "financialProfileId" = $2
        and upper("currency") = $3 and "status" = 'PLANNED' and "installmentId" is not null
        and "plannedOn" between $4::date and $5::date`,
    [
      context.organizationId,
      context.financialProfileId,
      filters.currency,
      filters.periodStartOn,
      filters.periodEndOn,
    ],
  );
  return { amountMinor: toNumber(row?.amountMinor), count: toNumber(row?.count) };
}

async function aggregateInvoices(
  context: TenantContext,
  filters: FinancialAssistantResolvedFilters,
): Promise<{ amountMinor: number; count: number }> {
  const [row] = await query<InvoiceAggregateRow>(
    `select coalesce(sum("totalAmountMinor"), 0)::bigint as "amountMinor", count(*)::int as "count"
       from "Invoice"
      where "organizationId" = $1 and "financialProfileId" = $2
        and upper("currency") = $3 and "status" in ('OPEN', 'CLOSED', 'OVERDUE')
        and "dueOn" between $4::date and $5::date`,
    [
      context.organizationId,
      context.financialProfileId,
      filters.currency,
      filters.periodStartOn,
      filters.periodEndOn,
    ],
  );
  return { amountMinor: toNumber(row?.amountMinor), count: toNumber(row?.count) };
}

async function aggregateInvoicesWithoutPaymentTransaction(
  context: TenantContext,
  filters: FinancialAssistantResolvedFilters,
): Promise<{ amountMinor: number; count: number }> {
  const [row] = await query<InvoiceAggregateRow>(
    `select coalesce(sum("totalAmountMinor"), 0)::bigint as "amountMinor", count(*)::int as "count"
       from "Invoice"
      where "organizationId" = $1 and "financialProfileId" = $2
        and upper("currency") = $3 and "status" in ('OPEN', 'CLOSED', 'OVERDUE')
        and "paymentTransactionId" is null
        and "dueOn" between $4::date and $5::date`,
    [
      context.organizationId,
      context.financialProfileId,
      filters.currency,
      filters.periodStartOn,
      filters.periodEndOn,
    ],
  );
  return { amountMinor: toNumber(row?.amountMinor), count: toNumber(row?.count) };
}

async function aggregateBalance(
  context: TenantContext,
  currency: string,
  projectionEndOn: string,
  currentOn: string,
): Promise<{
  accountCount: number;
  openingBalanceMinor: number;
  realizedBalanceDeltaMinor: number;
  plannedBalanceDeltaMinor: number;
}> {
  const [account] = await query<{
    amountMinor: number | string | null;
    count: number | string | null;
  }>(
    `select coalesce(sum("openingBalanceMinor"), 0)::bigint as "amountMinor", count(*)::int as "count"
       from "Account"
      where "organizationId" = $1 and "financialProfileId" = $2
        and upper("currency") = $3 and "status" = 'ACTIVE'`,
    [context.organizationId, context.financialProfileId, currency],
  );
  const [deltas] = await query<BalanceAggregateRow>(
    `select
       0::bigint as "openingBalanceMinor",
       coalesce(sum(case
         when "status" in ('POSTED', 'RECONCILED') and "occurredOn" <= $5::date and "kind" = 'INCOME' then "amountMinor"
         when "status" in ('POSTED', 'RECONCILED') and "occurredOn" <= $5::date and "kind" = 'EXPENSE' then -"amountMinor"
         else 0 end), 0)::bigint as "realizedBalanceDeltaMinor",
       coalesce(sum(case
         when "status" = 'PLANNED' and "plannedOn" <= $4::date and "kind" = 'INCOME' then "amountMinor"
         when "status" = 'PLANNED' and "plannedOn" <= $4::date and "kind" = 'EXPENSE' then -"amountMinor"
         else 0 end), 0)::bigint as "plannedBalanceDeltaMinor"
       from "Transaction"
      where "organizationId" = $1 and "financialProfileId" = $2 and upper("currency") = $3
        and "status" <> 'VOIDED' and "accountId" is not null`,
    [context.organizationId, context.financialProfileId, currency, projectionEndOn, currentOn],
  );
  return {
    accountCount: toNumber(account?.count),
    openingBalanceMinor: toNumber(account?.amountMinor),
    realizedBalanceDeltaMinor: toNumber(deltas?.realizedBalanceDeltaMinor),
    plannedBalanceDeltaMinor: toNumber(deltas?.plannedBalanceDeltaMinor),
  };
}

async function listCurrencies(context: TenantContext): Promise<string[]> {
  const rows = await query<CurrencyRow>(
    `select distinct upper("currency") as "currency" from (
       select "currency" from "Account" where "organizationId" = $1 and "financialProfileId" = $2 and "status" = 'ACTIVE'
       union all
       select "currency" from "Transaction" where "organizationId" = $1 and "financialProfileId" = $2 and "status" <> 'VOIDED'
       union all
       select "currency" from "Invoice" where "organizationId" = $1 and "financialProfileId" = $2 and "status" <> 'CANCELLED'
     ) as scoped
     where "currency" is not null
     order by upper("currency") asc`,
    [context.organizationId, context.financialProfileId],
  );
  return rows.map((row) => row.currency.trim().toUpperCase()).filter(Boolean);
}

async function resolveCategory(
  context: TenantContext,
  question: string,
): Promise<{ id: string; name: string } | undefined> {
  const rows = await query<CategoryRow>(
    `select "id", "name" from "Category"
      where "organizationId" = $1 and "financialProfileId" = $2 and "status" = 'ACTIVE'
      order by length("name") desc, "name" asc`,
    [context.organizationId, context.financialProfileId],
  );
  const normalizedQuestion = normalizeSearch(question);
  return rows.find((row) => normalizedQuestion.includes(normalizeSearch(row.name)));
}

function resolveCurrency(question: string, currencies: readonly string[]): string | undefined {
  if (currencies.length === 1) return currencies[0];
  const upper = question.toUpperCase();
  return currencies.find((currency) => new RegExp(`\\b${currency}\\b`).test(upper));
}

function resolvePeriod(
  question: string,
  intent: FinancialAssistantIntent,
  now: Date,
): { startOn: string; endOn: string } | undefined {
  if (intent === "subscriptions") {
    const current = monthBounds(now);
    return { startOn: shiftMonths(current.startOn, -5), endOn: current.endOn };
  }
  if (intent === "daily_availability") {
    return { startOn: dateOnly(now), endOn: monthBounds(now).endOn };
  }

  const normalized = normalizeSearch(question);
  const explicitMonth = normalized.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
  if (explicitMonth) {
    const date = new Date(Date.UTC(Number(explicitMonth[1]), Number(explicitMonth[2]) - 1, 1));
    return monthBounds(date);
  }
  if (/\bhoje\b/.test(normalized)) {
    const today = dateOnly(now);
    return { startOn: today, endOn: today };
  }
  if (/mes\s+passado|ultimo\s+mes/.test(normalized)) {
    return monthBounds(addMonths(now, -1));
  }
  if (/este\s+mes|mes\s+atual|do\s+mes/.test(normalized)) {
    return monthBounds(now);
  }
  if (/ultimos\s+30\s+dias/.test(normalized)) {
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - 29);
    return { startOn: dateOnly(start), endOn: dateOnly(now) };
  }
  return undefined;
}

function displayFilters(filters: FinancialAssistantResolvedFilters): string[] {
  return [
    `Moeda: ${filters.currency}`,
    ...(filters.categoryName ? [`Categoria: ${filters.categoryName}`] : []),
  ];
}

function normalizeMerchant(description: string): string {
  const normalized = normalizeSearch(description)
    .replace(/\b\d+\b/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.slice(0, 80) || "movimentacao recorrente";
}

function normalizeSearch(value: string): string {
  return value
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function monthBounds(date: Date): { startOn: string; endOn: string } {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return {
    startOn: dateOnly(new Date(Date.UTC(year, month, 1))),
    endOn: dateOnly(new Date(Date.UTC(year, month + 1, 0))),
  };
}

function monthStart(date: Date): string {
  return monthBounds(date).startOn;
}

function addMonths(date: Date, amount: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1));
}

function shiftMonths(dateOnlyValue: string, amount: number): string {
  const [year, month] = dateOnlyValue.split("-").map(Number);
  return dateOnly(new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1 + amount, 1)));
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
