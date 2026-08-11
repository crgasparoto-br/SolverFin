import { createHash, randomUUID } from "node:crypto";

import {
  FINANCIAL_INSIGHT_CALCULATION_VERSION,
  generateFinancialInsights,
  type FinancialInsight,
  type InsightBudget,
  type InsightTransaction,
} from "@solverfin/ai";
import type { TenantContext } from "@solverfin/domain";
import {
  buildAiSuggestionPayload,
  readAiSuggestionPayload,
  type InsightNumericEvidenceV2,
  type InsightSuggestionPayloadV2,
} from "@solverfin/domain/ai-suggestion-payloads";

import { withSharedTransaction, type QueryExecutor } from "./db.js";
import { insertAuditLogEntry } from "./repositories/audit.js";

const INSIGHT_PROVIDER = "solverfin-rule";
const HISTORY_MONTHS = 6;

interface InsightTransactionRow {
  id: string;
  kind: string;
  status: string;
  amountMinor: number;
  currency: string;
  occurredOn: Date;
  plannedOn: Date;
  description: string;
  categoryId: string | null;
  updatedAt: Date;
}

interface InsightBudgetRow {
  id: string;
  categoryId: string;
  plannedAmountMinor: number;
  currency: string;
  periodStartOn: Date;
  periodEndOn: Date;
  updatedAt: Date;
}

interface InsightAccountRow {
  id: string;
  currency: string;
  openingBalanceMinor: number;
  updatedAt: Date;
}

interface CategoryRow {
  id: string;
  name: string;
}

interface ExistingInsightRow {
  id: string;
  status: string;
  payload: unknown;
  payloadFingerprint: string | null;
}

type ActionableFinancialInsight = FinancialInsight & {
  kind: Exclude<FinancialInsight["kind"], "insufficient_data">;
};

interface DesiredInsight {
  insightKey: string;
  dataFingerprint: string;
  confidence: number;
  explanation: string;
  payload: InsightSuggestionPayloadV2;
}

export interface FinancialInsightScanResult {
  currencies: number;
  calculatedInsights: number;
  createdSuggestions: number;
  reusedSuggestions: number;
  expiredSuggestions: number;
}

export async function ensureFinancialInsightsForContext(
  context: TenantContext,
  now = new Date(),
): Promise<FinancialInsightScanResult> {
  return withSharedTransaction(async (executeQuery) => {
    await lockInsightScan(context, executeQuery);
    const snapshot = await loadSnapshot(context, executeQuery);
    const desired = buildDesiredInsights(context, snapshot, now);
    const existing = await listExistingInsights(context, executeQuery);
    const desiredByKey = new Map(desired.map((item) => [item.insightKey, item]));
    const seenFingerprints = new Set<string>();
    let reusedSuggestions = 0;
    let expiredSuggestions = 0;

    for (const row of existing) {
      const payload = readV2Insight(row.payload);
      if (payload !== undefined) seenFingerprints.add(payload.dataFingerprint);
      if (row.status !== "PENDING_REVIEW") continue;

      const current = payload === undefined ? undefined : desiredByKey.get(payload.insightKey);
      if (
        payload !== undefined &&
        current !== undefined &&
        payload.calculationVersion === FINANCIAL_INSIGHT_CALCULATION_VERSION &&
        payload.dataFingerprint === current.dataFingerprint
      ) {
        reusedSuggestions += 1;
        continue;
      }

      expiredSuggestions += await expireInsight(
        context,
        row.id,
        "Insight pendente expirou porque o cálculo, o período ou os dados autorizados mudaram.",
        executeQuery,
      );
    }

    let createdSuggestions = 0;
    for (const item of desired) {
      if (seenFingerprints.has(item.dataFingerprint)) continue;
      createdSuggestions += await insertInsight(context, item, executeQuery);
      seenFingerprints.add(item.dataFingerprint);
    }

    return {
      currencies: snapshot.currencies.length,
      calculatedInsights: desired.length,
      createdSuggestions,
      reusedSuggestions,
      expiredSuggestions,
    };
  });
}

interface InsightSnapshot {
  transactions: InsightTransactionRow[];
  budgets: InsightBudgetRow[];
  accounts: InsightAccountRow[];
  categories: Map<string, string>;
  currencies: string[];
}

async function loadSnapshot(
  context: TenantContext,
  executeQuery: QueryExecutor,
): Promise<InsightSnapshot> {
  const transactions = await executeQuery<InsightTransactionRow>(
    `select "id", "kind", "status", "amountMinor", "currency", "occurredOn", "plannedOn",
            "description", "categoryId", "updatedAt"
       from "Transaction"
      where "organizationId" = $1 and "financialProfileId" = $2 and "status" <> 'VOIDED'
      order by "occurredOn" asc, "id" asc`,
    [context.organizationId, context.financialProfileId],
  );
  const budgets = await executeQuery<InsightBudgetRow>(
    `select "id", "categoryId", "plannedAmountMinor", "currency", "periodStartOn", "periodEndOn", "updatedAt"
       from "Budget"
      where "organizationId" = $1 and "financialProfileId" = $2 and "status" = 'ACTIVE'
      order by "periodStartOn" asc, "id" asc`,
    [context.organizationId, context.financialProfileId],
  );
  const accounts = await executeQuery<InsightAccountRow>(
    `select "id", "currency", "openingBalanceMinor", "updatedAt"
       from "Account"
      where "organizationId" = $1 and "financialProfileId" = $2
      order by "id" asc`,
    [context.organizationId, context.financialProfileId],
  );
  const categoryRows = await executeQuery<CategoryRow>(
    `select "id", "name" from "Category"
      where "organizationId" = $1 and "financialProfileId" = $2`,
    [context.organizationId, context.financialProfileId],
  );
  const currencySet = new Set<string>();
  for (const row of transactions) currencySet.add(normalizeCurrency(row.currency));
  for (const row of budgets) currencySet.add(normalizeCurrency(row.currency));
  for (const row of accounts) currencySet.add(normalizeCurrency(row.currency));

  return {
    transactions,
    budgets,
    accounts,
    categories: new Map(categoryRows.map((row) => [row.id, row.name])),
    currencies: [...currencySet].sort(),
  };
}

function buildDesiredInsights(
  context: TenantContext,
  snapshot: InsightSnapshot,
  now: Date,
): DesiredInsight[] {
  const periods = resolvePeriods(now);
  const desired: DesiredInsight[] = [];

  for (const currency of snapshot.currencies) {
    const transactions = mapInsightTransactions(
      context,
      snapshot.transactions,
      currency,
      periods.historyStartOn,
    );
    const budgets = mapInsightBudgets(context, snapshot.budgets, currency);
    const projectedBalance = calculateProjectedBalance(
      snapshot.accounts,
      snapshot.transactions,
      currency,
      periods.projectionEndOn,
    );
    const insights = generateFinancialInsights({
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      currentPeriod: periods.current,
      previousPeriod: periods.previous,
      transactions,
      budgets,
      ...(projectedBalance === undefined
        ? {}
        : {
            projectedBalanceMinor: projectedBalance.amountMinor,
            projectedBalanceSourceFingerprint: projectedBalance.sourceFingerprint,
            projectionPeriodEndOn: periods.projectionEndOn,
          }),
      currency,
    });

    for (const generated of insights) {
      if (!isActionableInsight(generated)) continue;
      const insight = decorateCategoryLabels(generated, snapshot.categories);
      desired.push(buildDesiredInsight(context, insight));
    }
  }

  return desired;
}

function mapInsightTransactions(
  context: TenantContext,
  rows: readonly InsightTransactionRow[],
  currency: string,
  historyStartOn: string,
): InsightTransaction[] {
  return rows
    .filter(
      (row) =>
        normalizeCurrency(row.currency) === currency &&
        toDateOnly(row.occurredOn) >= historyStartOn,
    )
    .map((row) => ({
      id: row.id,
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      kind: row.kind.toLowerCase() as InsightTransaction["kind"],
      status: row.status.toLowerCase() as InsightTransaction["status"],
      amountMinor: row.amountMinor,
      currency,
      occurredOn: toDateOnly(row.occurredOn),
      ...(row.categoryId === null ? {} : { categoryId: row.categoryId }),
      ...resolveMerchantKey(row.description),
      description: row.description,
    }));
}

function mapInsightBudgets(
  context: TenantContext,
  rows: readonly InsightBudgetRow[],
  currency: string,
): InsightBudget[] {
  return rows
    .filter((row) => normalizeCurrency(row.currency) === currency)
    .map((row) => ({
      id: row.id,
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      categoryId: row.categoryId,
      plannedAmountMinor: row.plannedAmountMinor,
      currency,
      periodStartOn: toDateOnly(row.periodStartOn),
      periodEndOn: toDateOnly(row.periodEndOn),
    }));
}

function calculateProjectedBalance(
  accounts: readonly InsightAccountRow[],
  transactions: readonly InsightTransactionRow[],
  currency: string,
  projectionEndOn: string,
): { amountMinor: number; sourceFingerprint: string } | undefined {
  const scopedAccounts = accounts.filter((row) => normalizeCurrency(row.currency) === currency);
  if (scopedAccounts.length === 0) return undefined;

  let amountMinor = scopedAccounts.reduce((sum, row) => sum + row.openingBalanceMinor, 0);
  const sources: string[] = scopedAccounts.map(
    (row) => `account:${row.id}:${row.openingBalanceMinor}:${row.updatedAt.toISOString()}`,
  );

  for (const row of transactions) {
    if (normalizeCurrency(row.currency) !== currency) continue;
    const status = row.status.toLowerCase();
    const realized = status === "posted" || status === "reconciled";
    const planned = status === "planned";
    const effectiveOn = planned ? toDateOnly(row.plannedOn) : toDateOnly(row.occurredOn);
    if ((!realized && !planned) || effectiveOn > projectionEndOn) continue;

    const kind = row.kind.toLowerCase();
    if (kind === "income") amountMinor += row.amountMinor;
    if (kind === "expense") amountMinor -= row.amountMinor;
    sources.push(
      `transaction:${row.id}:${kind}:${status}:${row.amountMinor}:${effectiveOn}:${row.updatedAt.toISOString()}`,
    );
  }

  return {
    amountMinor,
    sourceFingerprint: fingerprint(sources.sort()),
  };
}

function buildDesiredInsight(
  context: TenantContext,
  insight: ActionableFinancialInsight,
): DesiredInsight {
  const dataFingerprint = fingerprint({
    calculationVersion: FINANCIAL_INSIGHT_CALCULATION_VERSION,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    kind: insight.kind,
    currency: insight.currency,
    filters: insight.filters,
    evidence: insight.evidence,
    comparison: insight.comparison,
    limitations: insight.limitations,
    sources: [...insight.sources].sort(),
  });
  const insightKey = buildInsightKey(insight);
  const evidence = buildNumericEvidence(insight);
  const comparison = buildComparison(insight);
  const relatedEntityIds = insight.sources.filter(isUuid).slice(0, 100);
  const confidence = confidenceNumber(insight.confidence);
  const payload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "insight",
      payloadVersion: 2,
      origin: { kind: "rule", ruleId: FINANCIAL_INSIGHT_CALCULATION_VERSION },
      target: { entityKind: "financial_profile", entityId: context.financialProfileId },
      confidence,
      reasons: ["Valores calculados deterministicamente antes de qualquer narrativa opcional."],
      audit: {
        createdAt: new Date().toISOString(),
        sourceFingerprint: dataFingerprint,
      },
      insightType: insightType(insight.kind),
      insightKind: insight.kind,
      insightKey,
      title: insight.title,
      summary: insight.explanation,
      periodStartOn: insight.evidence.periodStartOn,
      periodEndOn: insight.evidence.periodEndOn,
      currency: insight.currency,
      filters: insight.filters,
      evidence,
      ...(comparison === undefined ? {} : { comparison }),
      limitations: insight.limitations,
      calculationVersion: FINANCIAL_INSIGHT_CALCULATION_VERSION,
      dataFingerprint,
      ...(relatedEntityIds.length === 0 ? {} : { relatedEntityIds }),
      ...(insight.navigation === undefined ? {} : { navigation: insight.navigation }),
    },
  });

  return {
    insightKey,
    dataFingerprint,
    confidence,
    explanation: insight.explanation,
    payload,
  };
}

function buildNumericEvidence(insight: ActionableFinancialInsight): InsightNumericEvidenceV2[] {
  const result: InsightNumericEvidenceV2[] = [];
  const addMoney = (label: string, value: number | undefined) => {
    if (value === undefined) return;
    result.push({ label, value, unit: "minor_currency", currency: insight.currency });
  };

  if (insight.evidence.items !== undefined && insight.evidence.items.length > 0) {
    for (const item of insight.evidence.items) {
      result.push({
        label: item.label,
        value: item.value,
        unit: item.unit,
        ...(item.unit === "minor_currency" ? { currency: insight.currency } : {}),
      });
    }
    if (insight.evidence.count !== undefined) {
      result.push({ label: "amostra", value: insight.evidence.count, unit: "count" });
    }
    return result;
  }

  addMoney("valor_atual", insight.evidence.currentAmountMinor);
  addMoney("valor_anterior_ou_planejado", insight.evidence.previousAmountMinor);
  addMoney("diferenca", insight.evidence.deltaAmountMinor);
  if (insight.evidence.percentChange !== undefined) {
    result.push({
      label: "variacao_percentual",
      value: insight.evidence.percentChange,
      unit: "percentage",
    });
  }
  if (insight.evidence.count !== undefined) {
    result.push({ label: "amostra", value: insight.evidence.count, unit: "count" });
  }
  return result.length === 0 ? [{ label: "amostra", value: 0, unit: "count" }] : result;
}

function buildComparison(
  insight: ActionableFinancialInsight,
): InsightSuggestionPayloadV2["comparison"] {
  if (
    insight.comparison === undefined ||
    insight.evidence.currentAmountMinor === undefined ||
    insight.evidence.previousAmountMinor === undefined
  ) {
    return undefined;
  }
  return {
    kind: insight.comparison.kind,
    currentValue: insight.evidence.currentAmountMinor,
    previousValue: insight.evidence.previousAmountMinor,
    unit: "minor_currency",
    ...(insight.evidence.percentChange === undefined
      ? {}
      : { percentChange: insight.evidence.percentChange }),
    ...(insight.comparison.periodStartOn === undefined
      ? {}
      : {
          previousPeriodStartOn: insight.comparison.periodStartOn,
          previousPeriodEndOn: insight.comparison.periodEndOn as string,
        }),
  };
}

function buildInsightKey(insight: ActionableFinancialInsight): string {
  return [
    insight.kind,
    insight.currency,
    insight.filters.categoryId ?? "-",
    insight.filters.merchantKey ?? "-",
  ].join(":");
}

function decorateCategoryLabels(
  insight: ActionableFinancialInsight,
  categories: ReadonlyMap<string, string>,
): ActionableFinancialInsight {
  const items = insight.evidence.items?.map((item) => {
    const prefix = "variacao_categoria:";
    if (!item.label.startsWith(prefix)) return item;
    const categoryId = item.label.slice(prefix.length);
    const categoryName =
      categoryId === "sem_categoria"
        ? "Sem categoria"
        : (categories.get(categoryId) ?? "Categoria");
    return { ...item, label: `${prefix}${categoryName}` };
  });
  const evidence = items === undefined ? insight.evidence : { ...insight.evidence, items };
  const categoryId = insight.filters.categoryId;
  if (categoryId === undefined) {
    return evidence === insight.evidence ? insight : { ...insight, evidence };
  }
  const categoryName = categories.get(categoryId);
  if (categoryName === undefined) {
    return evidence === insight.evidence ? insight : { ...insight, evidence };
  }
  const title =
    insight.kind === "category_spending_increase"
      ? `Gasto maior na categoria ${categoryName}`
      : insight.kind === "budget_exceeded"
        ? `Orcamento excedido em ${categoryName}`
        : insight.title;
  return {
    ...insight,
    title,
    evidence: { ...evidence, label: categoryName },
  };
}

async function listExistingInsights(
  context: TenantContext,
  executeQuery: QueryExecutor,
): Promise<ExistingInsightRow[]> {
  return executeQuery<ExistingInsightRow>(
    `select "id", "status", "payload", "payloadFingerprint"
       from "AiSuggestion"
      where "organizationId" = $1 and "financialProfileId" = $2 and "kind" = 'INSIGHT'
      order by "createdAt" asc, "id" asc`,
    [context.organizationId, context.financialProfileId],
  );
}

async function insertInsight(
  context: TenantContext,
  desired: DesiredInsight,
  executeQuery: QueryExecutor,
): Promise<number> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const rows = await executeQuery<{ id: string }>(
    `insert into "AiSuggestion"
      ("id", "organizationId", "financialProfileId", "kind", "status", "sourceEntityId", "targetEntityId",
       "confidence", "explanation", "payload", "sourceSuggestionId", "payloadFingerprint", "provider", "model",
       "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt")
     values ($1, $2, $3, 'INSIGHT', 'PENDING_REVIEW', null, $4, $5, $6, $7::jsonb, null, $8,
             $9, $10, null, null, $11, $11)
     returning "id"`,
    [
      id,
      context.organizationId,
      context.financialProfileId,
      context.financialProfileId,
      desired.confidence,
      desired.explanation.slice(0, 500),
      JSON.stringify(desired.payload),
      desired.dataFingerprint,
      INSIGHT_PROVIDER,
      FINANCIAL_INSIGHT_CALCULATION_VERSION,
      now,
    ],
  );
  if (rows[0] === undefined) return 0;
  await insertAuditLogEntry(executeQuery, {
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    occurredAt: now,
    actorKind: "system",
    action: "create",
    entityKind: "ai_suggestion",
    entityId: id,
    reason: "Insight financeiro deterministico criado para revisao.",
    redactedChanges: { status: "added", payload: "added" },
  });
  return 1;
}

async function expireInsight(
  context: TenantContext,
  suggestionId: string,
  reason: string,
  executeQuery: QueryExecutor,
): Promise<number> {
  const now = new Date().toISOString();
  const rows = await executeQuery<{ id: string }>(
    `update "AiSuggestion" set "status" = 'EXPIRED', "reviewedAt" = $4, "updatedAt" = $4
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
        and "kind" = 'INSIGHT' and "status" = 'PENDING_REVIEW'
      returning "id"`,
    [suggestionId, context.organizationId, context.financialProfileId, now],
  );
  if (rows[0] === undefined) return 0;
  await insertAuditLogEntry(executeQuery, {
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    occurredAt: now,
    actorKind: "system",
    action: "update",
    entityKind: "ai_suggestion",
    entityId: suggestionId,
    reason,
    redactedChanges: { status: "changed" },
  });
  return 1;
}

async function lockInsightScan(context: TenantContext, executeQuery: QueryExecutor): Promise<void> {
  const identity = `financial-insights:${context.organizationId}:${context.financialProfileId}`;
  await executeQuery(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [identity]);
}

function readV2Insight(value: unknown): InsightSuggestionPayloadV2 | undefined {
  const read = readAiSuggestionPayload(value, "insight");
  if (read.state !== "current" || read.payload.suggestionKind !== "insight") return undefined;
  return read.payload.payloadVersion === 2 ? read.payload : undefined;
}

function resolvePeriods(now: Date) {
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const currentStart = new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(), 1));
  const previousStart = new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth() - 1, 1));
  const previousMonthEnd = new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(), 0));
  const comparableDay = Math.min(utc.getUTCDate(), previousMonthEnd.getUTCDate());
  const previousEnd = new Date(
    Date.UTC(previousStart.getUTCFullYear(), previousStart.getUTCMonth(), comparableDay),
  );
  const projectionEnd = new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth() + 1, 0));
  const historyStart = new Date(
    Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth() - (HISTORY_MONTHS - 1), 1),
  );
  return {
    current: { startOn: toDateOnly(currentStart), endOn: toDateOnly(utc) },
    previous: { startOn: toDateOnly(previousStart), endOn: toDateOnly(previousEnd) },
    historyStartOn: toDateOnly(historyStart),
    projectionEndOn: toDateOnly(projectionEnd),
  };
}

function resolveMerchantKey(description: string): { merchantKey?: string } {
  const merchantKey = description
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\d+/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return merchantKey.length < 3 ? {} : { merchantKey };
}

function isActionableInsight(insight: FinancialInsight): insight is ActionableFinancialInsight {
  return insight.kind !== "insufficient_data";
}

function insightType(
  kind: ActionableFinancialInsight["kind"],
): InsightSuggestionPayloadV2["insightType"] {
  if (kind === "monthly_summary") return "summary";
  if (kind === "probable_subscription") return "trend";
  if (kind === "category_spending_increase" || kind === "merchant_spending_increase") {
    return "trend";
  }
  return "anomaly";
}

function confidenceNumber(confidence: ActionableFinancialInsight["confidence"]): number {
  return confidence === "high" ? 0.95 : confidence === "medium" ? 0.75 : 0.5;
}

function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase();
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function fingerprint(value: unknown): string {
  return `sha256-${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
