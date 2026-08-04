import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { buildAiSuggestionPayload } from "@solverfin/domain/ai-suggestion-payloads";

import { closePool, query } from "./db.js";
import {
  approveAiReviewSuggestionForContext,
  editAiReviewSuggestionForContext,
} from "./repositories/ai-review-queue.js";

const PERSONAL_PROFILE_ID = "33333333-3333-4333-8333-333333333331";
const USER_ID = "22222222-2222-4222-8222-222222222222";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests.");
  const profileRows = await query<{ organizationId: string }>(
    `select "organizationId" from "FinancialProfile" where "id" = $1`,
    [PERSONAL_PROFILE_ID],
  );
  const organizationId = profileRows[0]?.organizationId;
  assert.ok(organizationId, "Personal financial profile seed is required.");

  const createdIds: string[] = [];
  try {
    await assertLegacyProjectionCanApproveCanonicalSuggestion(organizationId, createdIds);
    await assertCanonicalDependencyIsMaterialized(organizationId, createdIds);
    await assertMalformedDependencyFailsClosed(organizationId);
    await assertRemovedTargetFailsClosed(organizationId, createdIds);
    await assertApprovalOverridePersistsCanonicalPayload(organizationId, createdIds);
    await assertEditPersistsCanonicalPayload(organizationId, createdIds);
  } finally {
    if (createdIds.length > 0) {
      await query(`delete from "Transaction" where "aiSuggestionId" = any($1::uuid[])`, [
        createdIds,
      ]);
      await query(`delete from "AiSuggestion" where "id" = any($1::uuid[])`, [createdIds]);
    }
  }
}

async function assertLegacyProjectionCanApproveCanonicalSuggestion(
  organizationId: string,
  createdIds: string[],
): Promise<void> {
  const id = randomUUID();
  const targetEntityId = randomUUID();
  createdIds.push(id);
  const now = new Date().toISOString();
  const legacyPayload = {
    payloadVersion: 2,
    sourceRowNumber: 7,
    sourceHash: `source-${id}`,
    occurredOn: "2026-08-04",
    kind: "expense",
    direction: "outflow",
    amountMinor: 4590,
    currency: "BRL",
    description: "Compra fictícia para regressão de aprovação",
  };

  await query(
    `insert into "AiSuggestion"
      ("id", "organizationId", "financialProfileId", "kind", "status", "confidence", "explanation",
       "payload", "payloadFingerprint", "provider", "model", "createdAt", "updatedAt")
     values ($1, $2, $3, 'TRANSACTION_EXTRACTION', 'PENDING_REVIEW', 0.91,
             'Explicação sem autoridade financeira.', $4::jsonb, $5,
             'solverfin-import-csv', 'csv-parser-v3', $6, $6)`,
    [
      id,
      organizationId,
      PERSONAL_PROFILE_ID,
      JSON.stringify(legacyPayload),
      `legacy-${id}`,
      now,
    ],
  );

  const beforeRows = await query<{ payload: Record<string, unknown> }>(
    `select "payload" from "AiSuggestion" where "id" = $1`,
    [id],
  );
  const beforeFingerprint = String(beforeRows[0]?.payload.fingerprint);
  assert.match(beforeFingerprint, /^db-fp-v1-[a-f0-9]{64}$/);

  await query(
    `update "AiSuggestion"
        set "status" = 'APPROVED', "targetEntityId" = $2, "payload" = $3::jsonb,
            "reviewedAt" = $4, "updatedAt" = $4
      where "id" = $1`,
    [id, targetEntityId, JSON.stringify(legacyPayload), new Date().toISOString()],
  );

  const afterRows = await query<{
    status: string;
    targetEntityId: string | null;
    payload: Record<string, unknown>;
  }>(
    `select "status", "targetEntityId", "payload" from "AiSuggestion" where "id" = $1`,
    [id],
  );
  assert.equal(afterRows[0]?.status, "APPROVED");
  assert.equal(afterRows[0]?.targetEntityId, targetEntityId);
  assert.equal(afterRows[0]?.payload.contractVersion, 1);
  assert.equal(afterRows[0]?.payload.fingerprint, beforeFingerprint);
}

async function assertCanonicalDependencyIsMaterialized(
  organizationId: string,
  createdIds: string[],
): Promise<void> {
  const sourceSuggestionId = randomUUID();
  const dependentSuggestionId = randomUUID();
  createdIds.push(dependentSuggestionId);
  const now = new Date().toISOString();
  const payload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "categorization",
      payloadVersion: 1,
      origin: { kind: "automation", ruleId: randomUUID() },
      target: { entityKind: "import_suggestion", entityId: sourceSuggestionId },
      confidence: 0.9,
      reasons: ["Regra fictícia aplicada."],
      audit: { createdAt: now, sourceFingerprint: `sha256-${"a".repeat(64)}` },
      targetEntityId: sourceSuggestionId,
      sourceSuggestionId,
      proposedStatus: "posted",
    },
  });

  await query(
    `insert into "AiSuggestion"
      ("id", "organizationId", "financialProfileId", "kind", "status", "sourceEntityId",
       "targetEntityId", "confidence", "explanation", "payload", "provider", "model",
       "createdAt", "updatedAt")
     values ($1, $2, $3, 'CATEGORIZATION', 'PENDING_REVIEW', $4, $4, 0.9,
             'Explicação sem autoridade financeira.', $5::jsonb,
             'solverfin-automation', 'automation-rules-v1', $6, $6)`,
    [
      dependentSuggestionId,
      organizationId,
      PERSONAL_PROFILE_ID,
      sourceSuggestionId,
      JSON.stringify(payload),
      now,
    ],
  );

  const relationRows = await query<{ sourceSuggestionId: string | null }>(
    `select "sourceSuggestionId" from "AiSuggestion" where "id" = $1`,
    [dependentSuggestionId],
  );
  assert.equal(relationRows[0]?.sourceSuggestionId, sourceSuggestionId);

  const expiredRows = await query<{ id: string }>(
    `update "AiSuggestion" set "status" = 'EXPIRED', "updatedAt" = $2
      where "sourceSuggestionId" = $1 and "status" = 'PENDING_REVIEW'
      returning "id"`,
    [sourceSuggestionId, new Date().toISOString()],
  );
  assert.deepEqual(
    expiredRows.map((row) => row.id),
    [dependentSuggestionId],
  );
}

async function assertMalformedDependencyFailsClosed(organizationId: string): Promise<void> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const payload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "categorization",
      payloadVersion: 1,
      origin: { kind: "automation" },
      target: { entityKind: "import_suggestion" },
      reasons: ["Dependência fictícia inválida."],
      audit: { createdAt: now },
      targetEntityId: "not-a-uuid",
      sourceSuggestionId: "not-a-uuid",
      proposedStatus: "posted",
    },
  });

  await assert.rejects(
    () =>
      query(
        `insert into "AiSuggestion"
          ("id", "organizationId", "financialProfileId", "kind", "status", "confidence",
           "explanation", "payload", "provider", "model", "createdAt", "updatedAt")
         values ($1, $2, $3, 'CATEGORIZATION', 'PENDING_REVIEW', 0.9,
                 'Explicação sem autoridade financeira.', $4::jsonb,
                 'solverfin-automation', 'automation-rules-v1', $5, $5)`,
        [id, organizationId, PERSONAL_PROFILE_ID, JSON.stringify(payload), now],
      ),
    (error: unknown) => {
      const record = error as { code?: string; message?: string };
      return record.code === "P0001" && record.message === "AI_SUGGESTION_PAYLOAD_INVALID";
    },
  );
}

async function assertRemovedTargetFailsClosed(
  organizationId: string,
  createdIds: string[],
): Promise<void> {
  const suggestionId = randomUUID();
  const removedAccountId = randomUUID();
  const now = new Date().toISOString();
  createdIds.push(suggestionId);
  const payload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "transaction_extraction",
      payloadVersion: 2,
      origin: { kind: "provider", provider: "integration-test" },
      target: { entityKind: "transaction" },
      confidence: 0.92,
      reasons: ["Alvo fictício removido antes da aprovação."],
      audit: { createdAt: now },
      sourceRowNumber: 1,
      sourceHash: `removed-target-${suggestionId}`,
      occurredOn: "2026-08-04",
      kind: "expense",
      direction: "outflow",
      amountMinor: 1890,
      currency: "BRL",
      description: "Compra fictícia com conta removida",
      accountId: removedAccountId,
    },
  });

  await query(
    `insert into "AiSuggestion"
      ("id", "organizationId", "financialProfileId", "kind", "status", "confidence",
       "explanation", "payload", "provider", "model", "createdAt", "updatedAt")
     values ($1, $2, $3, 'TRANSACTION_EXTRACTION', 'PENDING_REVIEW', 0.92,
             'Explicação sem autoridade financeira.', $4::jsonb,
             'integration-test', 'removed-target-v1', $5, $5)`,
    [suggestionId, organizationId, PERSONAL_PROFILE_ID, JSON.stringify(payload), now],
  );

  await assert.rejects(
    () =>
      approveAiReviewSuggestionForContext(
        {
          organizationId,
          financialProfileId: PERSONAL_PROFILE_ID,
          financialProfileKind: "personal",
          userId: USER_ID,
        },
        suggestionId,
      ),
    (error: unknown) => {
      const record = error as { code?: string; statusCode?: number };
      return record.code === "TENANT_RESOURCE_NOT_FOUND" && record.statusCode === 404;
    },
  );

  const suggestionRows = await query<{ status: string; reviewedAt: Date | null }>(
    `select "status", "reviewedAt" from "AiSuggestion" where "id" = $1`,
    [suggestionId],
  );
  assert.equal(suggestionRows[0]?.status, "PENDING_REVIEW");
  assert.equal(suggestionRows[0]?.reviewedAt, null);

  const transactionRows = await query<{ total: number }>(
    `select count(*)::int as total from "Transaction" where "aiSuggestionId" = $1`,
    [suggestionId],
  );
  assert.equal(transactionRows[0]?.total, 0);
}

async function assertApprovalOverridePersistsCanonicalPayload(
  organizationId: string,
  createdIds: string[],
): Promise<void> {
  const accountId = await readActiveAccountId(organizationId);
  const suggestionId = randomUUID();
  createdIds.push(suggestionId);
  const before = await insertReviewSuggestion({
    id: suggestionId,
    organizationId,
    accountId,
    amountMinor: 1000,
    description: "Compra fictícia antes da revisão",
  });

  const result = await approveAiReviewSuggestionForContext(
    buildContext(organizationId),
    suggestionId,
    {
      amountMinor: 2450,
      description: "Compra fictícia revisada",
    },
  );
  assert.equal(result.transaction?.amountMinor, 2450);
  assert.equal(result.transaction?.description, "Compra fictícia revisada");

  const rows = await query<{
    status: string;
    targetEntityId: string | null;
    payload: Record<string, unknown>;
  }>(
    `select "status", "targetEntityId", "payload" from "AiSuggestion" where "id" = $1`,
    [suggestionId],
  );
  const row = rows[0];
  assert.equal(row?.status, "APPROVED");
  assert.equal(row?.targetEntityId, result.transaction?.id);
  assert.equal(row?.payload.amountMinor, 2450);
  assert.equal(row?.payload.description, "Compra fictícia revisada");
  assert.notEqual(row?.payload.fingerprint, before.fingerprint);
}

async function assertEditPersistsCanonicalPayload(
  organizationId: string,
  createdIds: string[],
): Promise<void> {
  const accountId = await readActiveAccountId(organizationId);
  const suggestionId = randomUUID();
  createdIds.push(suggestionId);
  const before = await insertReviewSuggestion({
    id: suggestionId,
    organizationId,
    accountId,
    amountMinor: 3100,
    description: "Compra fictícia editável",
  });

  await editAiReviewSuggestionForContext(buildContext(organizationId), suggestionId, {
    amountMinor: 3750,
    description: "Compra fictícia editada",
  });

  const rows = await query<{
    status: string;
    payload: Record<string, unknown>;
  }>(`select "status", "payload" from "AiSuggestion" where "id" = $1`, [suggestionId]);
  const row = rows[0];
  assert.equal(row?.status, "EDITED");
  assert.equal(row?.payload.amountMinor, 3750);
  assert.equal(row?.payload.description, "Compra fictícia editada");
  assert.notEqual(row?.payload.fingerprint, before.fingerprint);

  const transactionRows = await query<{ total: number }>(
    `select count(*)::int as total from "Transaction" where "aiSuggestionId" = $1`,
    [suggestionId],
  );
  assert.equal(transactionRows[0]?.total, 0);
}

async function insertReviewSuggestion(input: {
  id: string;
  organizationId: string;
  accountId: string;
  amountMinor: number;
  description: string;
}): Promise<Record<string, unknown>> {
  const now = new Date().toISOString();
  const payload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "transaction_extraction",
      payloadVersion: 2,
      origin: { kind: "provider", provider: "integration-test" },
      target: { entityKind: "transaction" },
      confidence: 0.93,
      reasons: ["Proposta fictícia para revisão."],
      audit: { createdAt: now },
      sourceRowNumber: 1,
      sourceHash: `review-${input.id}`,
      occurredOn: "2026-08-04",
      kind: "expense",
      direction: "outflow",
      amountMinor: input.amountMinor,
      currency: "BRL",
      description: input.description,
      accountId: input.accountId,
    },
  });
  await query(
    `insert into "AiSuggestion"
      ("id", "organizationId", "financialProfileId", "kind", "status", "confidence",
       "explanation", "payload", "provider", "model", "createdAt", "updatedAt")
     values ($1, $2, $3, 'TRANSACTION_EXTRACTION', 'PENDING_REVIEW', 0.93,
             'Explicação sem autoridade financeira.', $4::jsonb,
             'integration-test', 'review-v1', $5, $5)`,
    [input.id, input.organizationId, PERSONAL_PROFILE_ID, JSON.stringify(payload), now],
  );
  return payload as unknown as Record<string, unknown>;
}

async function readActiveAccountId(organizationId: string): Promise<string> {
  const rows = await query<{ id: string }>(
    `select "id" from "Account"
      where "organizationId" = $1 and "financialProfileId" = $2 and "status" = 'ACTIVE'
      order by "createdAt" asc limit 1`,
    [organizationId, PERSONAL_PROFILE_ID],
  );
  const accountId = rows[0]?.id;
  assert.ok(accountId, "An active account seed is required.");
  return accountId;
}

function buildContext(organizationId: string) {
  return {
    organizationId,
    financialProfileId: PERSONAL_PROFILE_ID,
    financialProfileKind: "personal" as const,
    userId: USER_ID,
  };
}
