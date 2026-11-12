import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import type { TenantContext } from "@solverfin/domain";
import { buildAiSuggestionPayload } from "@solverfin/domain/ai-suggestion-payloads";

import { closePool, query } from "./db.js";
import {
  listFinancialInsightQueueForContext,
  resolveFinancialInsightForContext,
  snoozeFinancialInsightForContext,
  type FinancialInsightQueueItem,
  type FinancialInsightQueuePage,
} from "./financial-insight-queue.js";
import { handleFinancialInsightQueueApiRequest } from "./financial-insight-queue-router.js";
import { ensureFinancialInsightsForContext } from "./financial-insight-scan.js";
import { handleMvpApiRequest } from "./mvp.js";
import { createAccountForContext } from "./repositories/accounts.js";
import { listAiReviewQueueForContext } from "./repositories/ai-review-queue.js";
import { buildCashFlowProjectionForContext } from "./repositories/cash-flow-projection.js";
import { createTransactionForContext } from "./repositories/transactions.js";
import type { ApiRequest, ApiResponse } from "./router.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SEEDED_PROFILE_ID = "33333333-3333-4333-8333-333333333331";
const FIXTURE_PROVIDER = "fixture-issue-621";
const NOW = new Date("2037-11-10T12:00:00.000Z");
const DAY_MS = 86_400_000;

const createdProfiles: Array<{ organizationId: string; profileId: string }> = [];

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const profile of createdProfiles) await cleanupProfile(profile);
    await closePool();
  });

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests.");
  const organizationId = await readSeededOrganizationId();
  const token = await loginAndReadToken();

  await priorityDashboardLimitAndDeduplicationAreCanonical(organizationId, token);
  await resolutionAndSnoozeAreBoundToTheSnapshotFingerprint(organizationId);
  await negativeBalanceRiskReusesCanonicalCashFlowProjection(organizationId);
  await publicBoundaryValidatesDecisionsAndIsolatesProfiles(organizationId, token);
}

/**
 * Five active insights persisted in inverse priority order: the Dashboard slice
 * (`limit=3`) returns the three canonical first items and the full queue keeps all of them.
 */
async function priorityDashboardLimitAndDeduplicationAreCanonical(
  organizationId: string,
  token: string,
): Promise<void> {
  const context = await createProfile(organizationId, "priority");
  const persistedInReverse = [
    fixture("monthly_summary", "info", 0.99, { insightKey: "monthly_summary:BRL:-:-" }),
    fixture("probable_subscription", "info", 0.99, {
      insightKey: "probable_subscription:USD:-:streaming",
      currency: "USD",
    }),
    fixture("category_spending_increase", "warning", 0.99, {
      insightKey: "category_spending_increase:BRL:market:-",
      categoryId: "market",
    }),
    fixture("budget_exceeded", "warning", 0.5, {
      insightKey: "budget_exceeded:BRL:market:-",
      categoryId: "market",
    }),
    fixture("negative_balance_risk", "critical", 0.1, {
      insightKey: "negative_balance_risk:USD:-:-",
      currency: "USD",
    }),
  ];
  const ids: string[] = [];
  for (const [index, item] of persistedInReverse.entries()) {
    ids.push(await insertFixtureInsight(context, item, new Date(NOW.getTime() + index * 1000)));
  }
  // Equivalent copy (same kind, key, calculation version and data fingerprint).
  const duplicateOfBudget = await insertFixtureInsight(
    context,
    persistedInReverse[3]!,
    new Date(NOW.getTime() + 10_000),
  );

  const dashboard = await getQueue(token, context, "state=active&limit=3");
  assert.equal(dashboard.priorityPolicyVersion, "financial-insight-priority-v1");
  assert.equal(dashboard.total, 5, "Equivalent snapshots must not be counted twice.");
  assert.deepEqual(
    dashboard.items.map((item) => item.proposal.insightKind),
    ["negative_balance_risk", "budget_exceeded", "category_spending_increase"],
  );
  assert.equal(dashboard.items[0]?.severity, "critical");
  assert.equal(dashboard.nextOffset, 3);
  assert.deepEqual(
    dashboard.items.map((item) => item.proposal.currency),
    ["USD", "BRL", "BRL"],
    "The limit is global to the profile and currency stays explicit per item.",
  );

  const inbox = await getQueue(token, context, "state=active&limit=20");
  assert.deepEqual(
    inbox.items.map((item) => item.proposal.insightKind),
    [
      "negative_balance_risk",
      "budget_exceeded",
      "category_spending_increase",
      "probable_subscription",
      "monthly_summary",
    ],
  );
  const budgetIds = inbox.items
    .filter((item) => item.proposal.insightKind === "budget_exceeded")
    .map((item) => item.id);
  assert.equal(budgetIds.length, 1);
  assert.ok([ids[3], duplicateOfBudget].includes(budgetIds[0]));
  // Cross-type coexistence: same category, currency and period, different facts.
  assert.ok(inbox.items.some((item) => item.proposal.insightKind === "category_spending_increase"));

  const secondPage = await getQueue(token, context, "state=active&limit=3&offset=3");
  assert.deepEqual(
    secondPage.items.map((item) => item.proposal.insightKind),
    ["probable_subscription", "monthly_summary"],
  );
  assert.equal(secondPage.nextOffset, undefined);
  for (const item of inbox.items) {
    const serialized = JSON.stringify(item);
    assert.doesNotMatch(serialized, /dataFingerprint|insightKey|fixture-issue-621/);
  }
}

/**
 * `RESOLVED` and snooze are bound to one snapshot (`dataFingerprint`). A new fingerprint
 * reappears immediately; the resolved snapshot stays in history; no financial row changes.
 */
async function resolutionAndSnoozeAreBoundToTheSnapshotFingerprint(
  organizationId: string,
): Promise<void> {
  const context = await createProfile(organizationId, "lifecycle");
  const account = await createAccountForContext(context, {
    name: `Issue 621 lifecycle ${context.financialProfileId}`,
    kind: "checking",
    currency: "BRL",
    openingBalanceMinor: 1_000_000,
  });
  const categoryId = randomUUID();
  await query(
    `insert into "Category"
      ("id", "organizationId", "financialProfileId", "name", "kind", "status", "createdAt", "updatedAt")
     values ($1, $2, $3, 'Mercado 621', 'EXPENSE', 'ACTIVE', now(), now())`,
    [categoryId, context.organizationId, context.financialProfileId],
  );
  await query(
    `insert into "Budget"
      ("id", "organizationId", "financialProfileId", "categoryId", "status", "periodStartOn", "periodEndOn",
       "plannedAmountMinor", "currency", "alertThresholdPercent", "createdAt", "updatedAt", "createdByUserId",
       "updatedByUserId")
     values ($1, $2, $3, $4, 'ACTIVE', '2037-11-01'::date, '2037-11-30'::date,
             10000, 'BRL', null, now(), now(), $5, $5)`,
    [randomUUID(), context.organizationId, context.financialProfileId, categoryId, USER_ID],
  );
  const expenseA = await insertPostedExpense(context, account.id, categoryId, "2037-11-02", 8000);
  await insertPostedExpense(context, account.id, categoryId, "2037-11-05", 7000);

  await ensureFinancialInsightsForContext(context, NOW);
  const snapshotA = await requireActive(context, "budget_exceeded", NOW);
  const financialDigestBefore = await financialDigest(context);

  const resolved = await resolveFinancialInsightForContext(
    context,
    snapshotA.id,
    { expectedFingerprint: snapshotA.fingerprint },
    NOW,
  );
  assert.equal(resolved.state, "resolved");
  assert.equal(resolved.resolvedAt, NOW.toISOString());
  assert.equal(await readStatus(snapshotA.id), "RESOLVED");
  assert.equal(await financialDigest(context), financialDigestBefore);
  const actor = await query<{ reviewedByUserId: string; auditActor: string }>(
    `select s."reviewedByUserId", a."actorId" as "auditActor"
       from "AiSuggestion" s
       join "AuditLogEntry" a on a."entityId" = s."id" and a."actorKind" = 'USER'
      where s."id" = $1`,
    [snapshotA.id],
  );
  assert.equal(actor[0]?.reviewedByUserId, USER_ID);
  assert.equal(actor[0]?.auditActor, USER_ID);

  // Idempotent explicit decision on the same snapshot.
  const repeated = await resolveFinancialInsightForContext(
    context,
    snapshotA.id,
    { expectedFingerprint: snapshotA.fingerprint },
    NOW,
  );
  assert.equal(repeated.id, snapshotA.id);

  // Same data: fingerprint A is not recreated and stays out of the active surfaces.
  await ensureFinancialInsightsForContext(context, NOW);
  assert.equal(await findActive(context, "budget_exceeded", NOW), undefined);
  const history = await listFinancialInsightQueueForContext(context, { state: "resolved" }, NOW);
  assert.deepEqual(
    history.items.map((item) => item.id),
    [snapshotA.id],
  );

  // New evidence -> fingerprint B reappears immediately despite A being RESOLVED.
  await query(
    `update "Transaction" set "amountMinor" = 9000, "updatedAt" = now() where "id" = $1`,
    [expenseA],
  );
  await ensureFinancialInsightsForContext(context, NOW);
  const snapshotB = await requireActive(context, "budget_exceeded", NOW);
  assert.notEqual(snapshotB.id, snapshotA.id);
  assert.equal(await readStatus(snapshotA.id), "RESOLVED");

  // Snooze B for 7 days: hidden from the default active view and from the review queue.
  const snoozed = await snoozeFinancialInsightForContext(
    context,
    snapshotB.id,
    { expectedFingerprint: snapshotB.fingerprint, durationDays: 7 },
    NOW,
  );
  assert.equal(snoozed.snoozedUntil, new Date(NOW.getTime() + 7 * DAY_MS).toISOString());
  assert.equal(await findActive(context, "budget_exceeded", NOW), undefined);
  const snoozedView = await listFinancialInsightQueueForContext(context, { state: "snoozed" }, NOW);
  assert.deepEqual(
    snoozedView.items.map((item) => item.id),
    [snapshotB.id],
  );
  const pendingReview = await listAiReviewQueueForContext(
    context,
    { status: "pending_review", includeLowConfidence: true },
    NOW,
  );
  assert.equal(
    pendingReview.some((item) => item.id === snapshotB.id),
    false,
  );
  const inTwoDays = new Date(NOW.getTime() + 2 * DAY_MS);
  assert.equal(await findActive(context, "budget_exceeded", inTwoDays), undefined);
  const afterSnooze = new Date(NOW.getTime() + 8 * DAY_MS);
  assert.equal((await findActive(context, "budget_exceeded", afterSnooze))?.id, snapshotB.id);

  // Evidence changes before the snooze ends: C does not inherit the snooze of B.
  await query(
    `update "Transaction" set "amountMinor" = 9500, "updatedAt" = now() where "id" = $1`,
    [expenseA],
  );
  await ensureFinancialInsightsForContext(context, NOW);
  const snapshotC = await requireActive(context, "budget_exceeded", NOW);
  assert.notEqual(snapshotC.id, snapshotB.id);
  assert.equal(await readStatus(snapshotB.id), "EXPIRED");
}

/**
 * The canonical #617 series includes a planned cross-currency transfer that a projection
 * restricted to opening balances + planned income/expense would ignore.
 */
async function negativeBalanceRiskReusesCanonicalCashFlowProjection(
  organizationId: string,
): Promise<void> {
  const context = await createProfile(organizationId, "projection");
  const brl = await createAccountForContext(context, {
    name: `Issue 621 BRL ${context.financialProfileId}`,
    kind: "checking",
    currency: "BRL",
    openingBalanceMinor: 10_000,
  });
  const usd = await createAccountForContext(context, {
    name: `Issue 621 USD ${context.financialProfileId}`,
    kind: "checking",
    currency: "USD",
    openingBalanceMinor: 20_000,
  });
  await createTransactionForContext(context, {
    accountId: brl.id,
    destinationAccountId: usd.id,
    kind: "transfer",
    status: "planned",
    amountMinor: 53_832,
    destinationAmountMinor: 10_000,
    currency: "BRL",
    occurredOn: "2037-11-12",
    plannedOn: "2037-11-12",
    description: "Transferencia planejada 621",
  });

  await ensureFinancialInsightsForContext(context, NOW);
  const projection = await buildCashFlowProjectionForContext(context, {
    referenceDate: "2037-11-10",
    horizonDays: 30,
  });
  const canonicalBrl =
    "freeToSpend" in projection
      ? projection.freeToSpend.currencyBlocks.find((block) => block.currency === "BRL")
      : undefined;
  assert.ok(canonicalBrl && canonicalBrl.status === "available");
  assert.equal(canonicalBrl.minimumProjectedBalanceMinor, 10_000 - 53_832);

  const active = await listFinancialInsightQueueForContext(context, { state: "active" }, NOW);
  const risks = active.items.filter(
    (item) => item.proposal.insightKind === "negative_balance_risk",
  );
  assert.deepEqual(
    risks.map((item) => item.proposal.currency),
    ["BRL"],
    "USD receives the destination effect only through its own series and has no risk.",
  );
  const risk = risks[0]!;
  assert.equal(risk.severity, "critical");
  assert.equal(active.items[0]?.id, risk.id, "critical risk leads the queue");
  const evidence = new Map(risk.proposal.evidence.map((item) => [item.label, item]));
  assert.equal(
    evidence.get("menor_saldo_projetado")?.value,
    canonicalBrl.minimumProjectedBalanceMinor,
  );
  assert.equal(evidence.get("deficit_projetado")?.value, canonicalBrl.projectedDeficitMinor);
  assert.equal(evidence.get("menor_saldo_projetado")?.currency, "BRL");
  assert.deepEqual(risk.proposal.navigation, {
    view: "cash_flow",
    referenceDate: "2037-11-10",
    horizonDays: 30,
  });
}

async function publicBoundaryValidatesDecisionsAndIsolatesProfiles(
  organizationId: string,
  token: string,
): Promise<void> {
  const context = await createProfile(organizationId, "boundary");
  const other = await createProfile(organizationId, "boundary-other");
  const id = await insertFixtureInsight(
    context,
    fixture("budget_exceeded", "warning", 0.8, { insightKey: "budget_exceeded:BRL:x:-" }),
    NOW,
  );
  const page = await getQueue(token, context, "state=active");
  const item = page.items.find((candidate) => candidate.id === id);
  assert.ok(item);

  const missingFingerprint = await post(token, context, `${id}/resolve`, {});
  assert.equal(missingFingerprint.statusCode, 428);
  const invalidDuration = await post(token, context, `${id}/snooze`, {
    expectedFingerprint: item.fingerprint,
    durationDays: 3,
  });
  assert.equal(invalidDuration.statusCode, 400);
  const staleFingerprint = await post(token, context, `${id}/resolve`, {
    expectedFingerprint: "sha256-" + "0".repeat(64),
  });
  assert.equal(staleFingerprint.statusCode, 409);
  const crossProfile = await post(token, other, `${id}/resolve`, {
    expectedFingerprint: item.fingerprint,
  });
  assert.equal(crossProfile.statusCode, 404);
  assert.equal(await readStatus(id), "PENDING_REVIEW");

  const snooze = await post(token, context, `${id}/snooze`, {
    expectedFingerprint: item.fingerprint,
    durationDays: 1,
  });
  assert.equal(snooze.statusCode, 200);
  const resolve = await post(token, context, `${id}/resolve`, {
    expectedFingerprint: item.fingerprint,
  });
  assert.equal(resolve.statusCode, 200);
  const snoozeResolved = await post(token, context, `${id}/snooze`, {
    expectedFingerprint: item.fingerprint,
    durationDays: 1,
  });
  assert.equal(snoozeResolved.statusCode, 409);
  const invalidState = await rawGet(token, context, "state=approved");
  assert.equal(invalidState.statusCode, 400);
}

interface FixtureInsight {
  insightKind:
    | "negative_balance_risk"
    | "budget_exceeded"
    | "category_spending_increase"
    | "merchant_spending_increase"
    | "probable_subscription"
    | "monthly_summary";
  severity: "info" | "warning" | "critical";
  confidence: number;
  insightKey: string;
  currency: string;
  categoryId?: string;
}

function fixture(
  insightKind: FixtureInsight["insightKind"],
  severity: FixtureInsight["severity"],
  confidence: number,
  overrides: Partial<FixtureInsight> & { insightKey: string },
): FixtureInsight {
  return { insightKind, severity, confidence, currency: "BRL", ...overrides };
}

async function insertFixtureInsight(
  context: TenantContext,
  item: FixtureInsight,
  createdAt: Date,
): Promise<string> {
  const id = randomUUID();
  const dataFingerprint = `sha256-${createHash("sha256").update(item.insightKey).digest("hex")}`;
  const payload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "insight",
      payloadVersion: 2,
      origin: { kind: "rule", ruleId: "fixture-issue-621" },
      target: { entityKind: "financial_profile", entityId: context.financialProfileId },
      confidence: item.confidence,
      reasons: ["Fixture deterministica da issue 621."],
      audit: { createdAt: "2037-11-10T00:00:00.000Z", sourceFingerprint: dataFingerprint },
      insightType: "anomaly",
      insightKind: item.insightKind,
      insightKey: item.insightKey,
      severity: item.severity,
      title: `Fixture ${item.insightKind}`,
      summary: "Resumo deterministico de fixture.",
      periodStartOn: "2037-11-01",
      periodEndOn: "2037-11-10",
      currency: item.currency,
      filters: {
        currency: item.currency,
        ...(item.categoryId === undefined ? {} : { categoryId: item.categoryId }),
      },
      evidence: [
        { label: "valor_atual", value: 1000, unit: "minor_currency", currency: item.currency },
      ],
      limitations: [],
      calculationVersion: "financial-insights-v3",
      dataFingerprint,
    },
  });
  await query(
    `insert into "AiSuggestion"
      ("id", "organizationId", "financialProfileId", "kind", "status", "sourceEntityId",
       "targetEntityId", "confidence", "explanation", "payload", "provider", "model",
       "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt")
     values ($1, $2, $3, 'INSIGHT', 'PENDING_REVIEW', null, $3, $4, 'Fixture 621', $5::jsonb,
             $6, 'fixture', null, null, $7, $7)`,
    [
      id,
      context.organizationId,
      context.financialProfileId,
      item.confidence,
      JSON.stringify(payload),
      FIXTURE_PROVIDER,
      createdAt.toISOString(),
    ],
  );
  return id;
}

async function insertPostedExpense(
  context: TenantContext,
  accountId: string,
  categoryId: string,
  occurredOn: string,
  amountMinor: number,
): Promise<string> {
  const id = randomUUID();
  await query(
    `insert into "Transaction"
      ("id", "organizationId", "financialProfileId", "accountId", "categoryId", "kind", "status", "source",
       "amountMinor", "currency", "occurredOn", "plannedOn", "effectiveOn", "description", "createdByUserId",
       "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, 'EXPENSE', 'POSTED', 'MANUAL', $6, 'BRL', $7::date, $7::date, $7::date,
             'Mercado 621', $8, now(), now())`,
    [
      id,
      context.organizationId,
      context.financialProfileId,
      accountId,
      categoryId,
      amountMinor,
      occurredOn,
      USER_ID,
    ],
  );
  return id;
}

async function findActive(
  context: TenantContext,
  kind: FixtureInsight["insightKind"],
  now: Date,
): Promise<FinancialInsightQueueItem | undefined> {
  const page = await listFinancialInsightQueueForContext(context, { state: "active" }, now);
  return page.items.find((item) => item.proposal.insightKind === kind);
}

async function requireActive(
  context: TenantContext,
  kind: FixtureInsight["insightKind"],
  now: Date,
): Promise<FinancialInsightQueueItem> {
  const item = await findActive(context, kind, now);
  assert.ok(item, `Expected an active ${kind} insight.`);
  return item;
}

async function financialDigest(context: TenantContext): Promise<string> {
  const rows = await query<{ digest: string }>(
    `select coalesce(string_agg(t."id"::text || ':' || t."status" || ':' || t."amountMinor" || ':' ||
             coalesce(t."categoryId"::text, '-'), ',' order by t."id"), '') as "digest"
       from "Transaction" t
      where t."organizationId" = $1 and t."financialProfileId" = $2`,
    [context.organizationId, context.financialProfileId],
  );
  return rows[0]?.digest ?? "";
}

async function readStatus(id: string): Promise<string | undefined> {
  const rows = await query<{ status: string }>(
    `select "status" from "AiSuggestion" where "id" = $1`,
    [id],
  );
  return rows[0]?.status;
}

async function createProfile(organizationId: string, label: string): Promise<TenantContext> {
  const profileId = randomUUID();
  await query(
    `insert into "FinancialProfile"
      ("id", "organizationId", "ownerUserId", "name", "kind", "status", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, 'PERSONAL', 'ACTIVE', now(), now())`,
    [profileId, organizationId, USER_ID, `Issue 621 ${label} ${profileId}`],
  );
  createdProfiles.push({ organizationId, profileId });
  return {
    userId: USER_ID,
    organizationId,
    financialProfileId: profileId,
    financialProfileKind: "personal",
  };
}

async function cleanupProfile(profile: { organizationId: string; profileId: string }) {
  const params = [profile.organizationId, profile.profileId];
  const scoped = `where "organizationId" = $1 and "financialProfileId" = $2`;
  await query(`delete from "AuditLogEntry" ${scoped}`, params);
  await query(`delete from "AiSuggestion" ${scoped}`, params);
  await query(`delete from "Transaction" ${scoped}`, params);
  await query(`delete from "Budget" ${scoped}`, params);
  await query(`delete from "Category" ${scoped}`, params);
  await query(`delete from "Account" ${scoped}`, params);
  await query(`delete from "FinancialProfile" where "organizationId" = $1 and "id" = $2`, params);
}

async function readSeededOrganizationId(): Promise<string> {
  const rows = await query<{ organizationId: string }>(
    `select "organizationId" from "FinancialProfile" where "id" = $1`,
    [SEEDED_PROFILE_ID],
  );
  const organizationId = rows[0]?.organizationId;
  assert.ok(organizationId, "Seeded financial profile is required.");
  return organizationId;
}

async function getQueue(
  token: string,
  context: TenantContext,
  search: string,
): Promise<FinancialInsightQueuePage> {
  const response = await rawGet(token, context, search);
  assert.equal(response.statusCode, 200, JSON.stringify(response.body));
  return response.body as FinancialInsightQueuePage;
}

async function rawGet(token: string, context: TenantContext, search: string): Promise<ApiResponse> {
  return dispatch({
    method: "GET",
    path: `/api/financial-insights?profileId=${context.financialProfileId}&${search}`,
    token,
  });
}

async function post(
  token: string,
  context: TenantContext,
  suffix: string,
  body: Record<string, unknown>,
): Promise<ApiResponse> {
  return dispatch({
    method: "POST",
    path: `/api/financial-insights/${suffix}?profileId=${context.financialProfileId}`,
    token,
    body,
  });
}

async function dispatch(input: {
  method: string;
  path: string;
  token: string;
  body?: unknown;
}): Promise<ApiResponse> {
  const url = new URL(input.path, "http://solverfin.integration.test");
  const request: ApiRequest = {
    method: input.method,
    pathname: url.pathname,
    query: url.searchParams,
    headers: { authorization: `Bearer ${input.token}` },
    body: input.body,
  };
  const response = await handleFinancialInsightQueueApiRequest(request);
  assert.ok(response, `${input.path} should be handled by the financial insight router`);
  return response;
}

async function loginAndReadToken(): Promise<string> {
  const response = await handleMvpApiRequest({
    method: "POST",
    path: "/api/session",
    body: {
      email: "demo@solverfin.example.invalid",
      password: "SolverFinDemo!2026",
    },
  });
  assert.equal(response.statusCode, 201);
  return (response.body as { session: { token: string } }).session.token;
}
