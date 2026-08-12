import {
  generateFinancialInsights,
  type FinancialAssistantEvidence,
  type InsightTransaction,
} from "@solverfin/ai";
import type { TenantContext } from "@solverfin/domain";

import { query } from "./db.js";
import type {
  FinancialAssistantDataResolution,
  FinancialAssistantResolvedFilters,
} from "./financial-assistant-data.js";

interface CurrencyRow {
  currency: string;
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

interface RecurrenceAggregateRow {
  count: number | string | null;
}

export async function resolveFinancialAssistantSubscriptions(
  context: TenantContext,
  question: string,
  now = new Date(),
): Promise<FinancialAssistantDataResolution> {
  const currencies = await listCurrencies(context);
  if (currencies.length === 0) {
    return {
      kind: "clarification",
      intent: "subscriptions",
      message:
        "Ainda nao ha dados financeiros suficientes neste perfil para responder. Registre ou importe movimentacoes e tente novamente.",
      filters: {},
    };
  }

  const currency = resolveCurrency(question, currencies);
  if (currency === undefined) {
    return {
      kind: "clarification",
      intent: "subscriptions",
      message: `Este perfil usa mais de uma moeda (${currencies.join(", ")}). Informe qual moeda devo analisar; nao faco conversao cambial automatica.`,
      filters: {},
    };
  }

  const period = resolveRequestedPeriod(question, now);
  if (period === undefined) {
    return {
      kind: "clarification",
      intent: "subscriptions",
      message:
        "Informe o periodo que deseja analisar, por exemplo: hoje, este mes, mes passado ou 2026-08.",
      filters: { currency },
    };
  }

  const filters: FinancialAssistantResolvedFilters = {
    currency,
    periodStartOn: period.startOn,
    periodEndOn: period.endOn,
  };

  return {
    kind: "evidence",
    intent: "subscriptions",
    filters,
    evidence: await buildSubscriptionsEvidence(context, filters),
  };
}

async function buildSubscriptionsEvidence(
  context: TenantContext,
  filters: FinancialAssistantResolvedFilters,
): Promise<FinancialAssistantEvidence> {
  const anchor = new Date(`${filters.periodEndOn}T00:00:00.000Z`);
  const current = monthBounds(anchor);
  const previous = monthBounds(addMonths(anchor, -1));
  const historyStartOn = shiftMonths(current.startOn, -5);
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
      filters.periodEndOn,
    ],
  );
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
        and upper("currency") = $3 and "status" = 'ACTIVE'
        and "startOn" <= $4::date
        and ("endOn" is null or "endOn" >= $5::date)`,
    [
      context.organizationId,
      context.financialProfileId,
      filters.currency,
      filters.periodEndOn,
      filters.periodStartOn,
    ],
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
    period: { startOn: filters.periodStartOn, endOn: filters.periodEndOn },
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
      "Recorrencias registradas e assinaturas provaveis sao exibidas separadamente.",
      "Assinatura provavel usa padrao deterministico de recorrencia historica; nao confirma contrato ativo.",
      "A deteccao de assinaturas provaveis pode usar ate seis meses de historico encerrados no periodo solicitado, sem alterar o periodo informado na resposta.",
    ],
    limitations: ["Mudancas de merchant, pausas e pagamentos irregulares podem reduzir a confianca."],
    sources: ["recorrencias", "lancamentos"],
    confidence,
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

function resolveCurrency(question: string, currencies: readonly string[]): string | undefined {
  if (currencies.length === 1) return currencies[0];
  const upper = question.toUpperCase();
  return currencies.find((currency) => new RegExp(`\\b${currency}\\b`).test(upper));
}

function resolveRequestedPeriod(
  question: string,
  now: Date,
): { startOn: string; endOn: string } | undefined {
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
  return [`Moeda: ${filters.currency}`];
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
