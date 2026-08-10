import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { TenantContext } from "@solverfin/domain";
import { buildAiSuggestionPayload } from "@solverfin/domain/ai-suggestion-payloads";

import { closePool, query } from "./db.js";
import { tryHandleGeneralizedDeterministicDecisionForContext } from "./generalized-deterministic-review-decision.js";
import { scanPendingDeterministicReviewSuggestionsForContext } from "./generalized-deterministic-review-scan.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";
const PERSONAL_PROFILE_ID = "33333333-3333-4333-8333-333333333331";
const MEI_PROFILE_ID = "33333333-3333-4333-8333-333333333332";
const CHECKING_ACCOUNT_ID = "44444444-4444-4444-8444-444444444441";
const SAVINGS_ACCOUNT_ID = "44444444-4444-4444-8444-444444444444";
const WALLET_ACCOUNT_ID = "44444444-4444-4444-8444-444444444445";

const context: TenantContext = {
  userId: USER_ID,
  organizationId: ORGANIZATION_ID,
  financialProfileId: PERSONAL_PROFILE_ID,
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
  const createdSuggestionIds: string[] = [];
  const createdTransactionIds: string[] = [];

  try {
    const targetId = await insertTransaction({
      marker,
      description: `Compra generalizada ${marker}`,
      amountMinor: 12990,
      occurredOn: "2026-08-07",
      accountId: CHECKING_ACCOUNT_ID,
    });
    createdTransactionIds.push(targetId);

    const origins = [
      ["csv", "solverfin-import-csv"],
      ["ofx", "solverfin-import-ofx"],
      ["bank", "solverfin-rule-bank-message-inbox"],
      ["ai", "fake-provider"],
    ] as const;
    const sourceIds = new Map<string, string>();
    for (const [origin, provider] of origins) {
      const sourceId = await insertExtraction({
        marker,
        provider,
        description: `Compra generalizada ${marker}`,
        amountMinor: 12990,
        occurredOn: "2026-08-07",
        accountId: CHECKING_ACCOUNT_ID,
        sourceHash: `${origin}-${marker}`,
      });
      sourceIds.set(origin, sourceId);
      createdSuggestionIds.push(sourceId);
    }

    await Promise.all([
      scanPendingDeterministicReviewSuggestionsForContext(context),
      scanPendingDeterministicReviewSuggestionsForContext(context),
    ]);
    await scanPendingDeterministicReviewSuggestionsForContext(context);
    for (const sourceId of sourceIds.values()) {
      assert.equal(await countPendingCandidates(sourceId), 2);
    }
    assert.equal(await countAllCandidates(sourceIds), 8);

    const foreignSourceId = await insertExtraction({
      marker,
      provider: "fake-provider",
      description: `Compra generalizada ${marker}`,
      amountMinor: 12990,
      occurredOn: "2026-08-07",
      accountId: "44444444-4444-4444-8444-444444444442",
      sourceHash: `foreign-${marker}`,
      profileId: MEI_PROFILE_ID,
    });
    createdSuggestionIds.push(foreignSourceId);
    await scanPendingDeterministicReviewSuggestionsForContext(context);
    assert.equal(await countPendingCandidates(foreignSourceId), 0);

    const csvSourceId = requireSource(sourceIds, "csv");
    await replaceExtractionPayload(csvSourceId, {
      marker,
      provider: "solverfin-import-csv",
      description: `Compra alterada ${marker}`,
      amountMinor: 7777,
      occurredOn: "2026-08-07",
      accountId: CHECKING_ACCOUNT_ID,
      sourceHash: `csv-${marker}`,
    });
    await scanPendingDeterministicReviewSuggestionsForContext(context);
    assert.equal(await countCandidatesByStatus(csvSourceId, "EXPIRED"), 2);
    assert.equal(await countPendingCandidates(csvSourceId), 0);

    const aiSourceId = requireSource(sourceIds, "ai");
    const aiDedup = await readPendingCandidate(aiSourceId, "DEDUPLICATION");
    const targetBeforeDedup = await readTransactionState(targetId);
    const dedupResult = await tryHandleGeneralizedDeterministicDecisionForContext(
      context,
      aiDedup.id,
      "approve",
      { expectedFingerprint: aiDedup.fingerprint, correlationId: `issue-566-dedup-${marker}` },
    );
    assert.equal(dedupResult?.suggestion.status, "approved");
    assert.equal((await readSuggestionStatus(aiSourceId)), "REJECTED");
    assert.deepEqual(await readTransactionState(targetId), targetBeforeDedup);
    const dedupReplay = await tryHandleGeneralizedDeterministicDecisionForContext(
      context,
      aiDedup.id,
      "approve",
      { expectedFingerprint: aiDedup.fingerprint, correlationId: `issue-566-dedup-replay-${marker}` },
    );
    assert.equal(dedupReplay?.idempotent, true);

    const ofxSourceId = requireSource(sourceIds, "ofx");
    const reconciliation = await readPendingCandidate(ofxSourceId, "RECONCILIATION");
    const reconciliationResult = await tryHandleGeneralizedDeterministicDecisionForContext(
      context,
      reconciliation.id,
      "approve",
      { expectedFingerprint: reconciliation.fingerprint, correlationId: `issue-566-recon-${marker}` },
    );
    assert.equal(reconciliationResult?.suggestion.status, "approved");
    assert.equal(await readSuggestionStatus(ofxSourceId), "APPROVED");
    assert.equal((await readTransactionState(targetId)).status, "RECONCILED");
    assert.equal(await countPendingCandidates(ofxSourceId), 0);

    const transferTargetId = await insertTransaction({
      marker,
      description: `Transferência ${marker}`,
      amountMinor: 25000,
      occurredOn: "2026-08-08",
      accountId: CHECKING_ACCOUNT_ID,
      destinationAccountId: SAVINGS_ACCOUNT_ID,
      kind: "TRANSFER",
    });
    createdTransactionIds.push(transferTargetId);
    const wrongTransferId = await insertExtraction({
      marker,
      provider: "fake-provider",
      description: `Transferência ${marker}`,
      amountMinor: 25000,
      occurredOn: "2026-08-08",
      accountId: CHECKING_ACCOUNT_ID,
      otherAccountId: WALLET_ACCOUNT_ID,
      kind: "transfer",
      sourceHash: `transfer-wrong-${marker}`,
    });
    const correctTransferId = await insertExtraction({
      marker,
      provider: "fake-provider",
      description: `Transferência ${marker}`,
      amountMinor: 25000,
      occurredOn: "2026-08-08",
      accountId: CHECKING_ACCOUNT_ID,
      otherAccountId: SAVINGS_ACCOUNT_ID,
      kind: "transfer",
      sourceHash: `transfer-right-${marker}`,
    });
    createdSuggestionIds.push(wrongTransferId, correctTransferId);
    await scanPendingDeterministicReviewSuggestionsForContext(context);
    assert.equal(await countPendingCandidates(wrongTransferId), 0);
    assert.equal(await countPendingCandidates(correctTransferId), 2);

    const staleSourceId = await insertExtraction({
      marker,
      provider: "fake-provider",
      description: `Alvo obsoleto ${marker}`,
      amountMinor: 34567,
      occurredOn: "2026-08-09",
      accountId: CHECKING_ACCOUNT_ID,
      sourceHash: `stale-${marker}`,
    });
    const staleTargetId = await insertTransaction({
      marker,
      description: `Alvo obsoleto ${marker}`,
      amountMinor: 34567,
      occurredOn: "2026-08-09",
      accountId: CHECKING_ACCOUNT_ID,
    });
    createdSuggestionIds.push(staleSourceId);
    createdTransactionIds.push(staleTargetId);
    await scanPendingDeterministicReviewSuggestionsForContext(context);
    const staleCandidate = await readPendingCandidate(staleSourceId, "RECONCILIATION");
    await query(`update "Transaction" set "description" = $2, "updatedAt" = now() where "id" = $1`, [
      staleTargetId,
      `Alvo mudou ${marker}`,
    ]);
    await assert.rejects(
      () =>
        tryHandleGeneralizedDeterministicDecisionForContext(
          context,
          staleCandidate.id,
          "approve",
          { expectedFingerprint: staleCandidate.fingerprint },
        ),
      (error: unknown) => readErrorCode(error) === "AI_SUGGESTION_PAYLOAD_OBSOLETE",
    );
    assert.equal(await readSuggestionStatus(staleSourceId), "PENDING_REVIEW");
    assert.equal((await readTransactionState(staleTargetId)).status, "POSTED");

    const rollbackSourceId = await insertExtraction({
      marker,
      provider: "fake-provider",
      description: `Rollback ${marker}`,
      amountMinor: 45678,
      occurredOn: "2026-08-10",
      accountId: CHECKING_ACCOUNT_ID,
      sourceHash: `rollback-${marker}`,
    });
    const rollbackTargetId = await insertTransaction({
      marker,
      description: `Rollback ${marker}`,
      amountMinor: 45678,
      occurredOn: "2026-08-10",
      accountId: CHECKING_ACCOUNT_ID,
    });
    createdSuggestionIds.push(rollbackSourceId);
    createdTransactionIds.push(rollbackTargetId);
    await scanPendingDeterministicReviewSuggestionsForContext(context);
    const rollbackCandidate = await readPendingCandidate(rollbackSourceId, "RECONCILIATION");
    await assert.rejects(() =>
      tryHandleGeneralizedDeterministicDecisionForContext(
        context,
        rollbackCandidate.id,
        "approve",
        {
          expectedFingerprint: rollbackCandidate.fingerprint,
          correlationId: "x".repeat(121),
        },
      ),
    );
    assert.equal(await readSuggestionStatus(rollbackSourceId), "PENDING_REVIEW");
    assert.equal(await readSuggestionStatus(rollbackCandidate.id), "PENDING_REVIEW");
    assert.equal((await readTransactionState(rollbackTargetId)).status, "POSTED");
  } finally {
    await cleanup(createdSuggestionIds, createdTransactionIds);
  }
}

async function insertExtraction(input: {
  marker: string;
  provider: string;
  description: string;
  amountMinor: number;
  occurredOn: string;
  accountId: string;
  sourceHash: string;
  profileId?: string;
  otherAccountId?: string;
  kind?: "expense" | "transfer";
}): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const kind = input.kind ?? "expense";
  const payload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "transaction_extraction",
      payloadVersion: 2,
      origin: { kind: "provider", provider: input.provider },
      target: { entityKind: "transaction" },
      confidence: 0.96,
      reasons: ["Fixture estruturada da issue 566."],
      audit: { createdAt: now },
      sourceRowNumber: 1,
      sourceHash: input.sourceHash,
      occurredOn: input.occurredOn,
      kind,
      direction: "outflow",
      amountMinor: input.amountMinor,
      currency: "BRL",
      description: input.description,
      accountId: input.accountId,
      ...(input.otherAccountId === undefined ? {} : { otherAccountId: input.otherAccountId }),
    },
  });
  await query(
    `insert into "AiSuggestion"
      ("id", "organizationId", "financialProfileId", "kind", "status", "sourceEntityId", "targetEntityId",
       "confidence", "explanation", "payload", "payloadFingerprint", "provider", "model",
       "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt")
     values ($1, $2, $3, 'TRANSACTION_EXTRACTION', 'PENDING_REVIEW', null, null, 0.96,
             'Fixture estruturada da issue 566.', $4::jsonb, $5, $6, 'issue-566-fixture', null, null, $7, $7)`,
    [id, ORGANIZATION_ID, input.profileId ?? PERSONAL_PROFILE_ID, JSON.stringify(payload), payload.fingerprint, input.provider, now],
  );
  return id;
}

async function replaceExtractionPayload(
  suggestionId: string,
  input: Parameters<typeof insertExtraction>[0],
): Promise<void> {
  const now = new Date().toISOString();
  const payload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "transaction_extraction",
      payloadVersion: 2,
      origin: { kind: "provider", provider: input.provider },
      target: { entityKind: "transaction" },
      confidence: 0.96,
      reasons: ["Fixture estruturada alterada da issue 566."],
      audit: { createdAt: now },
      sourceRowNumber: 1,
      sourceHash: input.sourceHash,
      occurredOn: input.occurredOn,
      kind: input.kind ?? "expense",
      direction: "outflow",
      amountMinor: input.amountMinor,
      currency: "BRL",
      description: input.description,
      accountId: input.accountId,
      ...(input.otherAccountId === undefined ? {} : { otherAccountId: input.otherAccountId }),
    },
  });
  await query(
    `update "AiSuggestion" set "payload" = $2::jsonb, "payloadFingerprint" = $3, "updatedAt" = $4
     where "id" = $1`,
    [suggestionId, JSON.stringify(payload), payload.fingerprint, now],
  );
}

async function insertTransaction(input: {
  marker: string;
  description: string;
  amountMinor: number;
  occurredOn: string;
  accountId: string;
  destinationAccountId?: string;
  kind?: "EXPENSE" | "TRANSFER";
}): Promise<string> {
  const id = randomUUID();
  await query(
    `insert into "Transaction"
      ("id", "organizationId", "financialProfileId", "accountId", "destinationAccountId", "kind", "status", "source",
       "amountMinor", "currency", "occurredOn", "plannedOn", "description", "createdByUserId", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, 'POSTED', 'MANUAL', $7, 'BRL', $8::date, $8::date, $9, $10, now(), now())`,
    [
      id,
      ORGANIZATION_ID,
      PERSONAL_PROFILE_ID,
      input.accountId,
      input.destinationAccountId ?? null,
      input.kind ?? "EXPENSE",
      input.amountMinor,
      input.occurredOn,
      input.description,
      USER_ID,
    ],
  );
  return id;
}

async function readPendingCandidate(sourceId: string, kind: string): Promise<{ id: string; fingerprint: string }> {
  const rows = await query<{ id: string; fingerprint: string }>(
    `select "id", "payload"->>'fingerprint' as "fingerprint" from "AiSuggestion"
     where "sourceSuggestionId" = $1 and "kind" = $2 and "status" = 'PENDING_REVIEW'
     order by "createdAt" desc limit 1`,
    [sourceId, kind],
  );
  assert.ok(rows[0], `Pending ${kind} candidate is required.`);
  return rows[0];
}

async function countPendingCandidates(sourceId: string): Promise<number> {
  return countCandidates(sourceId, "PENDING_REVIEW");
}

async function countCandidatesByStatus(sourceId: string, status: string): Promise<number> {
  return countCandidates(sourceId, status);
}

async function countCandidates(sourceId: string, status: string): Promise<number> {
  const rows = await query<{ count: string }>(
    `select count(*)::text as "count" from "AiSuggestion"
     where "sourceSuggestionId" = $1 and "kind" in ('DEDUPLICATION', 'RECONCILIATION') and "status" = $2`,
    [sourceId, status],
  );
  return Number(rows[0]?.count ?? 0);
}

async function countAllCandidates(sourceIds: Map<string, string>): Promise<number> {
  const ids = [...sourceIds.values()];
  const rows = await query<{ count: string }>(
    `select count(*)::text as "count" from "AiSuggestion"
     where "sourceSuggestionId" = any($1::uuid[]) and "kind" in ('DEDUPLICATION', 'RECONCILIATION')`,
    [ids],
  );
  return Number(rows[0]?.count ?? 0);
}

async function readSuggestionStatus(id: string): Promise<string | undefined> {
  const rows = await query<{ status: string }>(`select "status" from "AiSuggestion" where "id" = $1`, [id]);
  return rows[0]?.status;
}

async function readTransactionState(id: string): Promise<{ status: string; description: string; updatedAt: string }> {
  const rows = await query<{ status: string; description: string; updatedAt: Date }>(
    `select "status", "description", "updatedAt" from "Transaction" where "id" = $1`,
    [id],
  );
  assert.ok(rows[0]);
  return { status: rows[0].status, description: rows[0].description, updatedAt: rows[0].updatedAt.toISOString() };
}

function requireSource(sourceIds: Map<string, string>, key: string): string {
  const id = sourceIds.get(key);
  assert.ok(id);
  return id;
}

function readErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

async function cleanup(suggestionIds: string[], transactionIds: string[]): Promise<void> {
  const allSuggestionRows = await query<{ id: string }>(
    `select "id" from "AiSuggestion" where "id" = any($1::uuid[]) or "sourceSuggestionId" = any($1::uuid[])`,
    [suggestionIds],
  );
  const allSuggestionIds = allSuggestionRows.map((row) => row.id);
  const entityIds = [...allSuggestionIds, ...transactionIds];
  if (entityIds.length > 0) {
    await query(`delete from "AuditLogEntry" where "entityId" = any($1::uuid[])`, [entityIds]);
  }
  if (allSuggestionIds.length > 0) {
    await query(`delete from "AiSuggestion" where "id" = any($1::uuid[])`, [allSuggestionIds]);
  }
  if (transactionIds.length > 0) {
    await query(`delete from "Transaction" where "id" = any($1::uuid[])`, [transactionIds]);
  }
}
