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
  const marker = randomUUID();
  const transactionIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const existingInsightIds = await listAllInsightIds();

  try {
    await insertCategory(categoryId, marker);
    await insertExpense(transactionIds[0]!, categoryId, "2026-07-02", 5000, "BRL", "POSTED", marker);
    await insertExpense(transactionIds[1]!, categoryId, "2026-07-06", 5000, "BRL", "RECONCILED", marker);
    await insertExpense(transactionIds[2]!, categoryId, "2026-08-02", 9000, "BRL", "POSTED", marker);
    await insertExpense(transactionIds[3]!, categoryId, "2026-08-06", 7000, "BRL", "POSTED", marker);
    await insertExpense(transactionIds[4]!, categoryId, "2026-08-07", 50000, "BRL", "SUGGESTED", marker);
    await insertExpense(transactionIds[5]!, categoryId, "2026-08-08", 90000, "USD", "POSTED", marker);

    const first = await ensureFinancialInsightsForContext(context, NOW);
    assert.ok(first.createdSuggestions > 0);

    const firstSuggestion = await findCategoryIncrease(categoryId, "BRL");
    assert.ok(firstSuggestion);
    const firstPayload = requireInsightV2(firstSuggestion.payload);
    assert.equal(firstPayload.currency, "BRL");
    assert.equal(firstPayload.filters.categoryId, categoryId);
    assert.equal(readEvidence(firstPayload, "valor_atual"), 16000);
    assert.equal(readEvidence(firstPayload, "valor_anterior_ou_planejado"), 10000);
    assert.equal(readEvidence(firstPayload, "variacao_percentual"), 60);
    assert.ok(firstPayload.limitations.some((item) => item.includes("revisão") || item.includes("revisao")));

    const pendingAfterFirst = await countPendingInsights();
    const second = await ensureFinancialInsightsForContext(context, NOW);
    assert.equal(second.createdSuggestions, 0);
    assert.ok(second.reusedSuggestions > 0);
    assert.equal(await countPendingInsights(), pendingAfterFirst);

    await query(
      `update "Transaction" set "amountMinor" = 10000, "updatedAt" = now() where "id" = $1`,
      [transactionIds[2]],
    );
    const third = await ensureFinancialInsightsForContext(context, NOW);
    assert.ok(third.expiredSuggestions > 0);
    assert.ok(third.createdSuggestions > 0);
    assert.equal(await readSuggestionStatus(firstSuggestion.id), "EXPIRED");

    const replacement = await findCategoryIncrease(categoryId, "BRL");
    assert.ok(replacement);
    assert.notEqual(replacement.id, firstSuggestion.id);
    const replacementPayload = requireInsightV2(replacement.payload);
    assert.equal(readEvidence(replacementPayload, "valor_anterior_ou_planejado"), 10000);
    assert.equal(readEvidence(replacementPayload, "valor_atual"), 17000);
  } finally {
    await cleanup(transactionIds, categoryId, existingInsightIds);
  }
}

async function insertCategory(id: string, marker: string): Promise<void> {
  await query(
    `insert into "Category"
      ("id", "organizationId", "financialProfileId", "name", "kind", "status", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, 'EXPENSE', 'ACTIVE', now(), now())`,
    [id, ORGANIZATION_ID, PERSONAL_PROFILE_ID, `Insight ${marker}`],
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
      `Mercado Insight ${marker}`,
      USER_ID,
    ],
  );
}

async function findCategoryIncrease(
  categoryId: string,
  currency: string,
): Promise<{ id: string; payload: unknown } | undefined> {
  const rows = await query<{ id: string; payload: unknown }>(
    `select "id", "payload" from "AiSuggestion"
     where "organizationId" = $1 and "financialProfileId" = $2 and "kind" = 'INSIGHT'
       and "status" = 'PENDING_REVIEW'
       and "payload"->>'payloadVersion' = '2'
       and "payload"->>'insightKind' = 'category_spending_increase'
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
  if (read.state !== "current" || read.payload.suggestionKind !== "insight" || read.payload.payloadVersion !== 2) {
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

async function countPendingInsights(): Promise<number> {
  const rows = await query<{ count: string }>(
    `select count(*)::text as "count" from "AiSuggestion"
     where "organizationId" = $1 and "financialProfileId" = $2 and "kind" = 'INSIGHT' and "status" = 'PENDING_REVIEW'`,
    [ORGANIZATION_ID, PERSONAL_PROFILE_ID],
  );
  return Number(rows[0]?.count ?? 0);
}

async function readSuggestionStatus(id: string): Promise<string | undefined> {
  const rows = await query<{ status: string }>(`select "status" from "AiSuggestion" where "id" = $1`, [id]);
  return rows[0]?.status;
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
  categoryId: string,
  existingInsightIds: ReadonlySet<string>,
): Promise<void> {
  const rows = await query<{ id: string }>(
    `select "id" from "AiSuggestion" where "organizationId" = $1 and "financialProfileId" = $2 and "kind" = 'INSIGHT'`,
    [ORGANIZATION_ID, PERSONAL_PROFILE_ID],
  );
  const createdInsightIds = rows.map((row) => row.id).filter((id) => !existingInsightIds.has(id));
  if (createdInsightIds.length > 0) {
    await query(`delete from "AuditLogEntry" where "entityId" = any($1::uuid[])`, [createdInsightIds]);
    await query(`delete from "AiSuggestion" where "id" = any($1::uuid[])`, [createdInsightIds]);
  }
  await query(`delete from "Transaction" where "id" = any($1::uuid[])`, [transactionIds]);
  await query(`delete from "Category" where "id" = $1`, [categoryId]);
}
