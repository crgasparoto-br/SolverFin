import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { TenantContext } from "@solverfin/domain";
import { readAiSuggestionPayload } from "@solverfin/domain/ai-suggestion-payloads";

import { closePool, query } from "./db.js";
import { ensureFinancialInsightsForContext } from "./financial-insight-scan.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";
const PERSONAL_PROFILE_ID = "33333333-3333-4333-8333-333333333331";
const CHECKING_ACCOUNT_ID = "44444444-4444-4444-8444-444444444441";
const NOW = new Date("2026-08-11T12:00:00.000Z");

const context: TenantContext = {
  userId: USER_ID,
  organizationId: ORGANIZATION_ID,
  financialProfileId: PERSONAL_PROFILE_ID,
  financialProfileKind: "personal",
};

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests.");
  const categoryId = randomUUID();
  const budgetId = randomUUID();
  const marker = randomUUID();
  const transactionIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const existingInsightIds = await listAllInsightIds();

  try {
    await insertCategory(categoryId, marker);
    await insertBudget(budgetId, categoryId);
    await insertExpense(
      transactionIds[0]!,
      categoryId,
      "2026-01-10",
      60000,
      "BRL",
      "POSTED",
      marker,
    );
    await insertExpense(
      transactionIds[1]!,
      categoryId,
      "2026-02-10",
      50000,
      "BRL",
      "RECONCILED",
      marker,
    );
    await insertExpense(
      transactionIds[2]!,
      categoryId,
      "2025-12-20",
      250000,
      "BRL",
      "POSTED",
      marker,
    );
    await insertExpense(
      transactionIds[3]!,
      categoryId,
      "2026-02-15",
      31000,
      "BRL",
      "SUGGESTED",
      marker,
    );
    await insertExpense(
      transactionIds[4]!,
      categoryId,
      "2026-02-20",
      400000,
      "USD",
      "POSTED",
      marker,
    );

    const result = await ensureFinancialInsightsForContext(context, NOW);
    assert.ok(result.createdSuggestions > 0);

    const suggestion = await findBudgetExceeded(categoryId, "BRL");
    assert.ok(suggestion);
    const payload = requireInsightV2(suggestion.payload);
    assert.equal(payload.periodStartOn, "2026-01-01");
    assert.equal(payload.periodEndOn, "2026-12-31");
    assert.equal(payload.filters.categoryId, categoryId);
    assert.equal(readEvidence(payload, "valor_atual"), 110000);
    assert.equal(readEvidence(payload, "valor_anterior_ou_planejado"), 100000);
    assert.equal(readEvidence(payload, "diferenca"), 10000);
    assert.equal(readEvidence(payload, "amostra"), 2);
  } finally {
    await cleanup(transactionIds, budgetId, categoryId, existingInsightIds);
  }
}

async function insertCategory(id: string, marker: string): Promise<void> {
  await query(
    `insert into "Category"
      ("id", "organizationId", "financialProfileId", "name", "kind", "status", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, 'EXPENSE', 'ACTIVE', now(), now())`,
    [id, ORGANIZATION_ID, PERSONAL_PROFILE_ID, `Budget history ${marker}`],
  );
}

async function insertBudget(id: string, categoryId: string): Promise<void> {
  await query(
    `insert into "Budget"
      ("id", "organizationId", "financialProfileId", "categoryId", "status", "periodStartOn", "periodEndOn",
       "plannedAmountMinor", "currency", "alertThresholdPercent", "createdAt", "updatedAt", "createdByUserId",
       "updatedByUserId")
     values ($1, $2, $3, $4, 'ACTIVE', '2026-01-01'::date, '2026-12-31'::date,
             100000, 'BRL', null, now(), now(), $5, $5)`,
    [id, ORGANIZATION_ID, PERSONAL_PROFILE_ID, categoryId, USER_ID],
  );
}

async function insertExpense(
  id: string,
  categoryId: string,
  occurredOn: string,
  amountMinor: number,
  currency: string,
  status: string,
  marker: string,
): Promise<void> {
  await query(
    `insert into "Transaction"
      ("id", "organizationId", "financialProfileId", "accountId", "categoryId", "kind", "status", "source",
       "amountMinor", "currency", "occurredOn", "plannedOn", "description", "createdByUserId", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, 'EXPENSE', $6, 'MANUAL', $7, $8, $9::date, $9::date, $10, $11, now(), now())`,
    [
      id,
      ORGANIZATION_ID,
      PERSONAL_PROFILE_ID,
      CHECKING_ACCOUNT_ID,
      categoryId,
      status,
      amountMinor,
      currency,
      occurredOn,
      `Budget history ${marker}`,
      USER_ID,
    ],
  );
}

async function findBudgetExceeded(
  categoryId: string,
  currency: string,
): Promise<{ id: string; payload: unknown } | undefined> {
  const rows = await query<{ id: string; payload: unknown }>(
    `select "id", "payload" from "AiSuggestion"
     where "organizationId" = $1 and "financialProfileId" = $2 and "kind" = 'INSIGHT'
       and "status" = 'PENDING_REVIEW'
       and "payload"->>'payloadVersion' = '2'
       and "payload"->>'insightKind' = 'budget_exceeded'
       and "payload"->'filters'->>'categoryId' = $3
       and "payload"->>'currency' = $4
     order by "createdAt" desc, "id" desc limit 1`,
    [ORGANIZATION_ID, PERSONAL_PROFILE_ID, categoryId, currency],
  );
  return rows[0];
}

function requireInsightV2(payload: unknown) {
  const read = readAiSuggestionPayload(payload, "insight");
  assert.equal(read.state, "current");
  if (
    read.state !== "current" ||
    read.payload.suggestionKind !== "insight" ||
    read.payload.payloadVersion !== 2
  ) {
    assert.fail("Expected insight payload V2.");
  }
  return read.payload;
}

function readEvidence(
  payload: ReturnType<typeof requireInsightV2>,
  label: string,
): number | undefined {
  return payload.evidence.find((item) => item.label === label)?.value;
}

async function listAllInsightIds(): Promise<Set<string>> {
  const rows = await query<{ id: string }>(
    `select "id" from "AiSuggestion" where "organizationId" = $1 and "financialProfileId" = $2 and "kind" = 'INSIGHT'`,
    [ORGANIZATION_ID, PERSONAL_PROFILE_ID],
  );
  return new Set(rows.map((row) => row.id));
}

async function cleanup(
  transactionIds: readonly string[],
  budgetId: string,
  categoryId: string,
  existingInsightIds: ReadonlySet<string>,
): Promise<void> {
  const rows = await query<{ id: string }>(
    `select "id" from "AiSuggestion" where "organizationId" = $1 and "financialProfileId" = $2 and "kind" = 'INSIGHT'`,
    [ORGANIZATION_ID, PERSONAL_PROFILE_ID],
  );
  const createdInsightIds = rows.map((row) => row.id).filter((id) => !existingInsightIds.has(id));
  if (createdInsightIds.length > 0) {
    await query(`delete from "AuditLogEntry" where "entityId" = any($1::uuid[])`, [
      createdInsightIds,
    ]);
    await query(`delete from "AiSuggestion" where "id" = any($1::uuid[])`, [createdInsightIds]);
  }
  await query(`delete from "Transaction" where "id" = any($1::uuid[])`, [transactionIds]);
  await query(`delete from "Budget" where "id" = $1`, [budgetId]);
  await query(`delete from "Category" where "id" = $1`, [categoryId]);
}
