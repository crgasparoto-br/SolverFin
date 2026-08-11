import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { TenantContext } from "@solverfin/domain";
import { buildAiSuggestionPayload } from "@solverfin/domain/ai-suggestion-payloads";

import { closePool, query } from "./db.js";
import {
  scanPendingDeterministicReviewSuggestionsForContext,
} from "./generalized-deterministic-review-scan.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";
const PERSONAL_PROFILE_ID = "33333333-3333-4333-8333-333333333331";
const CHECKING_ACCOUNT_ID = "44444444-4444-4444-8444-444444444441";

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
  const marker = randomUUID();
  const sourceId = randomUUID();
  const targetId = randomUUID();
  const now = new Date().toISOString();
  const description = `Moeda divergente ${marker}`;

  try {
    await insertTarget(targetId, description);
    await insertSource(sourceId, description, now, marker);

    await scanPendingDeterministicReviewSuggestionsForContext(context);

    assert.equal(
      await countDeterministicCandidates(sourceId),
      0,
      "o scanner nao deve criar candidaturas quando a moeda da origem diverge da moeda do alvo",
    );
    assert.equal(await readSuggestionStatus(sourceId), "PENDING_REVIEW");
    assert.equal(await readTransactionStatus(targetId), "POSTED");
  } finally {
    await cleanup(sourceId, targetId);
  }
}

async function insertTarget(id: string, description: string): Promise<void> {
  await query(
    `insert into "Transaction"
      ("id", "organizationId", "financialProfileId", "accountId", "kind", "status", "source",
       "amountMinor", "currency", "occurredOn", "plannedOn", "description", "createdByUserId", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, 'EXPENSE', 'POSTED', 'MANUAL', 10000, 'USD', '2026-08-11'::date,
             '2026-08-11'::date, $5, $6, now(), now())`,
    [id, ORGANIZATION_ID, PERSONAL_PROFILE_ID, CHECKING_ACCOUNT_ID, description, USER_ID],
  );
}

async function insertSource(
  id: string,
  description: string,
  now: string,
  marker: string,
): Promise<void> {
  const payload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "transaction_extraction",
      payloadVersion: 2,
      origin: { kind: "provider", provider: "fake-provider" },
      target: { entityKind: "transaction" },
      confidence: 0.96,
      reasons: ["Controle negativo de moeda da issue 566."],
      audit: { createdAt: now },
      sourceRowNumber: 1,
      sourceHash: `currency-${marker}`,
      occurredOn: "2026-08-11",
      kind: "expense",
      direction: "outflow",
      amountMinor: 10000,
      currency: "BRL",
      description,
      accountId: CHECKING_ACCOUNT_ID,
    },
  });

  await query(
    `insert into "AiSuggestion"
      ("id", "organizationId", "financialProfileId", "kind", "status", "sourceEntityId", "targetEntityId",
       "confidence", "explanation", "payload", "payloadFingerprint", "provider", "model",
       "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt")
     values ($1, $2, $3, 'TRANSACTION_EXTRACTION', 'PENDING_REVIEW', null, null, 0.96,
             'Controle negativo de moeda da issue 566.', $4::jsonb, $5, 'fake-provider',
             'issue-566-currency', null, null, $6, $6)`,
    [id, ORGANIZATION_ID, PERSONAL_PROFILE_ID, JSON.stringify(payload), payload.fingerprint, now],
  );
}

async function countDeterministicCandidates(sourceId: string): Promise<number> {
  const rows = await query<{ count: string }>(
    `select count(*)::text as "count" from "AiSuggestion"
     where "sourceSuggestionId" = $1 and "kind" in ('DEDUPLICATION', 'RECONCILIATION')`,
    [sourceId],
  );
  return Number(rows[0]?.count ?? 0);
}

async function readSuggestionStatus(id: string): Promise<string | undefined> {
  const rows = await query<{ status: string }>(
    `select "status" from "AiSuggestion" where "id" = $1`,
    [id],
  );
  return rows[0]?.status;
}

async function readTransactionStatus(id: string): Promise<string | undefined> {
  const rows = await query<{ status: string }>(
    `select "status" from "Transaction" where "id" = $1`,
    [id],
  );
  return rows[0]?.status;
}

async function cleanup(sourceId: string, targetId: string): Promise<void> {
  const candidateRows = await query<{ id: string }>(
    `select "id" from "AiSuggestion" where "sourceSuggestionId" = $1`,
    [sourceId],
  );
  const suggestionIds = [sourceId, ...candidateRows.map((row) => row.id)];
  const entityIds = [...suggestionIds, targetId];

  await query(`delete from "AuditLogEntry" where "entityId" = any($1::uuid[])`, [entityIds]);
  await query(`delete from "AiSuggestion" where "id" = any($1::uuid[])`, [suggestionIds]);
  await query(`delete from "Transaction" where "id" = $1`, [targetId]);
}
