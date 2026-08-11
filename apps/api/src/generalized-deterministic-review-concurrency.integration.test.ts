import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { TenantContext } from "@solverfin/domain";
import { buildAiSuggestionPayload } from "@solverfin/domain/ai-suggestion-payloads";

import { closePool, getPool, query } from "./db.js";
import {
  tryHandleGeneralizedDeterministicDecisionForContext,
} from "./generalized-deterministic-review-decision.js";
import {
  scanPendingDeterministicReviewSuggestionsForContext,
} from "./generalized-deterministic-review-scan.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";
const PERSONAL_PROFILE_ID = "33333333-3333-4333-8333-333333333331";
const CHECKING_ACCOUNT_ID = "44444444-4444-4444-8444-444444444441";
const LOCK_SOURCE_SQL = `select "id" from "AiSuggestion" where "id" = $1 for update`;

type DecisionPromise = ReturnType<typeof tryHandleGeneralizedDeterministicDecisionForContext>;

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
  const transactionIds: string[] = [];
  let sourceId: string | undefined;

  try {
    const description = `Concorrência irmãs ${marker}`;
    const firstTargetId = await insertTransaction({
      description,
      amountMinor: 49001,
      occurredOn: "2026-08-10",
    });
    const secondTargetId = await insertTransaction({
      description,
      amountMinor: 49001,
      occurredOn: "2026-08-10",
    });
    transactionIds.push(firstTargetId, secondTargetId);

    sourceId = await insertExtraction({
      marker,
      description,
      amountMinor: 49001,
      occurredOn: "2026-08-10",
    });

    await scanPendingDeterministicReviewSuggestionsForContext(context);
    const firstCandidate = await readPendingCandidate(sourceId, firstTargetId);
    const secondCandidate = await readPendingCandidate(sourceId, secondTargetId);
    const firstBefore = await readTransactionState(firstTargetId);
    const secondBefore = await readTransactionState(secondTargetId);

    const blocker = await getPool().connect();
    let blockerOpen = false;
    let decisionPromises: DecisionPromise[] = [];
    try {
      await blocker.query("BEGIN");
      blockerOpen = true;
      await blocker.query(LOCK_SOURCE_SQL, [sourceId]);

      decisionPromises = [
        tryHandleGeneralizedDeterministicDecisionForContext(
          context,
          firstCandidate.id,
          "approve",
          { expectedFingerprint: firstCandidate.fingerprint },
        ),
        tryHandleGeneralizedDeterministicDecisionForContext(
          context,
          secondCandidate.id,
          "approve",
          { expectedFingerprint: secondCandidate.fingerprint },
        ),
      ];

      await waitUntilTwoDecisionsWaitForSource();
      await blocker.query("ROLLBACK");
      blockerOpen = false;

      const results = await Promise.allSettled(decisionPromises);
      let approvedCount = 0;
      let rejectedCount = 0;
      let rejectedCode: string | undefined;
      for (const result of results) {
        if (result.status === "fulfilled") {
          approvedCount += 1;
          assert.equal(result.value?.suggestion.status, "approved");
          assert.equal(result.value?.idempotent, false);
        } else {
          rejectedCount += 1;
          rejectedCode = readErrorCode(result.reason);
        }
      }

      assert.equal(approvedCount, 1);
      assert.equal(rejectedCount, 1);
      assert.equal(rejectedCode, "AI_REVIEW_INVALID_TRANSITION");
      assert.equal(await readSuggestionStatus(sourceId), "REJECTED");
      assert.equal(await countCandidates(sourceId, "APPROVED"), 1);
      assert.equal(await countCandidates(sourceId, "PENDING_REVIEW"), 0);
      assert.ok((await countCandidates(sourceId, "EXPIRED")) >= 1);
      assert.deepEqual(await readTransactionState(firstTargetId), firstBefore);
      assert.deepEqual(await readTransactionState(secondTargetId), secondBefore);
    } finally {
      if (blockerOpen) await blocker.query("ROLLBACK");
      if (decisionPromises.length > 0) await Promise.allSettled(decisionPromises);
      blocker.release();
    }
  } finally {
    await cleanup(sourceId, transactionIds);
  }
}

async function waitUntilTwoDecisionsWaitForSource(): Promise<void> {
  const observer = await getPool().connect();
  try {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const result = await observer.query<{ count: string }>(
        `select count(*)::text as "count"
           from pg_stat_activity
          where datname = current_database()
            and pid <> pg_backend_pid()
            and state = 'active'
            and wait_event_type = 'Lock'
            and query like '%from "AiSuggestion"%'
            and query like '%TRANSACTION_EXTRACTION%'
            and query like '%for update%'`,
      );
      if (Number(result.rows[0]?.count ?? 0) >= 2) return;
      await delay(10);
    }
  } finally {
    observer.release();
  }
  assert.fail("Both sibling decisions should be waiting on the locked source row.");
}

async function insertTransaction(input: {
  description: string;
  amountMinor: number;
  occurredOn: string;
}): Promise<string> {
  const id = randomUUID();
  await query(
    `insert into "Transaction"
      ("id", "organizationId", "financialProfileId", "accountId", "kind", "status", "source",
       "amountMinor", "currency", "occurredOn", "plannedOn", "description", "createdByUserId", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, 'EXPENSE', 'POSTED', 'MANUAL', $5, 'BRL', $6::date, $6::date, $7, $8, now(), now())`,
    [
      id,
      ORGANIZATION_ID,
      PERSONAL_PROFILE_ID,
      CHECKING_ACCOUNT_ID,
      input.amountMinor,
      input.occurredOn,
      input.description,
      USER_ID,
    ],
  );
  return id;
}

async function insertExtraction(input: {
  marker: string;
  description: string;
  amountMinor: number;
  occurredOn: string;
}): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const payload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "transaction_extraction",
      payloadVersion: 2,
      origin: { kind: "provider", provider: "fake-provider" },
      target: { entityKind: "transaction" },
      confidence: 0.96,
      reasons: ["Fixture concorrente da issue 566."],
      audit: { createdAt: now },
      sourceRowNumber: 1,
      sourceHash: `concurrent-siblings-${input.marker}`,
      occurredOn: input.occurredOn,
      kind: "expense",
      direction: "outflow",
      amountMinor: input.amountMinor,
      currency: "BRL",
      description: input.description,
      accountId: CHECKING_ACCOUNT_ID,
    },
  });
  const parameters = [
    id,
    ORGANIZATION_ID,
    PERSONAL_PROFILE_ID,
    JSON.stringify(payload),
    payload.fingerprint,
    now,
  ];
  await query(
    `insert into "AiSuggestion"
      ("id", "organizationId", "financialProfileId", "kind", "status", "sourceEntityId", "targetEntityId",
       "confidence", "explanation", "payload", "payloadFingerprint", "provider", "model",
       "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt")
     values ($1, $2, $3, 'TRANSACTION_EXTRACTION', 'PENDING_REVIEW', null, null, 0.96,
             'Fixture concorrente da issue 566.', $4::jsonb, $5, 'fake-provider',
             'issue-566-concurrency', null, null, $6, $6)`,
    parameters,
  );
  return id;
}

async function readPendingCandidate(
  sourceId: string,
  targetId: string,
): Promise<{ id: string; fingerprint: string }> {
  const rows = await query<{ id: string; fingerprint: string }>(
    `select "id", "payload"->>'fingerprint' as "fingerprint"
       from "AiSuggestion"
      where "sourceSuggestionId" = $1 and "targetEntityId" = $2
        and "kind" = 'DEDUPLICATION' and "status" = 'PENDING_REVIEW'
      order by "createdAt" desc limit 1`,
    [sourceId, targetId],
  );
  assert.ok(rows[0], "Pending deduplication candidate is required for each sibling target.");
  return rows[0];
}

async function readSuggestionStatus(id: string): Promise<string | undefined> {
  const rows = await query<{ status: string }>(
    `select "status" from "AiSuggestion" where "id" = $1`,
    [id],
  );
  return rows[0]?.status;
}

async function countCandidates(sourceId: string, status: string): Promise<number> {
  const rows = await query<{ count: string }>(
    `select count(*)::text as "count" from "AiSuggestion"
      where "sourceSuggestionId" = $1 and "kind" in ('DEDUPLICATION', 'RECONCILIATION')
        and "status" = $2`,
    [sourceId, status],
  );
  return Number(rows[0]?.count ?? 0);
}

async function readTransactionState(
  id: string,
): Promise<{ status: string; updatedAt: string; reconciledAt: string | null }> {
  const rows = await query<{ status: string; updatedAt: Date; reconciledAt: Date | null }>(
    `select "status", "updatedAt", "reconciledAt" from "Transaction" where "id" = $1`,
    [id],
  );
  assert.ok(rows[0]);
  return {
    status: rows[0].status,
    updatedAt: rows[0].updatedAt.toISOString(),
    reconciledAt: rows[0].reconciledAt?.toISOString() ?? null,
  };
}

function readErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function cleanup(sourceId: string | undefined, transactionIds: string[]): Promise<void> {
  const suggestionRows =
    sourceId === undefined
      ? []
      : await query<{ id: string }>(
          `select "id" from "AiSuggestion" where "id" = $1 or "sourceSuggestionId" = $1`,
          [sourceId],
        );
  const suggestionIds = suggestionRows.map((row) => row.id);
  const entityIds = [...suggestionIds, ...transactionIds];
  if (entityIds.length > 0) {
    await query(`delete from "AuditLogEntry" where "entityId" = any($1::uuid[])`, [entityIds]);
  }
  if (suggestionIds.length > 0) {
    await query(`delete from "AiSuggestion" where "id" = any($1::uuid[])`, [suggestionIds]);
  }
  if (transactionIds.length > 0) {
    await query(`delete from "Transaction" where "id" = any($1::uuid[])`, [transactionIds]);
  }
}
