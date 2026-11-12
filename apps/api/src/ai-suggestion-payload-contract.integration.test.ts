import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { buildAiSuggestionPayload } from "@solverfin/domain/ai-suggestion-payloads";

import { closePool, getPool, query } from "./db.js";
import {
  AiSuggestionPayloadRepositoryError,
  getAiSuggestionPayloadForContext,
} from "./repositories/ai-suggestion-payloads.js";

const PERSONAL_PROFILE_ID = "33333333-3333-4333-8333-333333333331";
const MEI_PROFILE_ID = "33333333-3333-4333-8333-333333333332";
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
    await assertLegacyInsertBecomesCanonical(organizationId, createdIds);
    await assertPayloadEndpointIsTenantScoped(organizationId, createdIds);
    await assertResolvedPayloadIsImmutable(organizationId, createdIds);
    await assertPayloadlessLegacyCanOnlyCloseSafely(organizationId, createdIds);
    await assertConcurrentReviewFailsClosed(organizationId, createdIds);
    await assertInvalidPayloadErrorIsControlled(organizationId);
  } finally {
    if (createdIds.length > 0) {
      await query(`delete from "AiSuggestion" where "id" = any($1::uuid[])`, [createdIds]);
    }
  }
}

async function assertLegacyInsertBecomesCanonical(
  organizationId: string,
  createdIds: string[],
): Promise<void> {
  const id = randomUUID();
  createdIds.push(id);
  const legacyPayload = {
    payloadVersion: 2,
    sourceRowNumber: 2,
    sourceHash: "integration-source-hash",
    occurredOn: "2026-08-04",
    kind: "expense",
    direction: "outflow",
    amountMinor: 1299,
    currency: "BRL",
    description: "Compra ficticia de integracao",
  };
  await insertSuggestion({
    id,
    organizationId,
    profileId: PERSONAL_PROFILE_ID,
    kind: "TRANSACTION_EXTRACTION",
    status: "PENDING_REVIEW",
    payload: legacyPayload,
    provider: "solverfin-import-csv",
  });

  const rows = await query<{ payload: Record<string, unknown> }>(
    `select "payload" from "AiSuggestion" where "id" = $1`,
    [id],
  );
  assert.equal(rows[0]?.payload.contractVersion, 1);
  assert.equal(rows[0]?.payload.suggestionKind, "transaction_extraction");
  assert.match(String(rows[0]?.payload.fingerprint), /^db-fp-v1-[a-f0-9]{64}$/);
}

async function assertPayloadEndpointIsTenantScoped(
  organizationId: string,
  createdIds: string[],
): Promise<void> {
  const id = randomUUID();
  createdIds.push(id);
  const payload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "insight",
      payloadVersion: 1,
      origin: { kind: "system", component: "integration-test" },
      target: { entityKind: "financial_profile", entityId: PERSONAL_PROFILE_ID },
      confidence: 0.8,
      reasons: ["Dados ficticios agregados."],
      audit: { createdAt: new Date().toISOString() },
      insightType: "summary",
      title: "Resumo ficticio",
      summary: "Resumo de integracao sem dados pessoais.",
      periodStartOn: "2026-07-01",
      periodEndOn: "2026-07-31",
    },
  });
  await insertSuggestion({
    id,
    organizationId,
    profileId: PERSONAL_PROFILE_ID,
    kind: "INSIGHT",
    status: "PENDING_REVIEW",
    payload,
    provider: "solverfin-rule",
    targetEntityId: null,
  });

  const personal = await getAiSuggestionPayloadForContext(
    {
      organizationId,
      financialProfileId: PERSONAL_PROFILE_ID,
      financialProfileKind: "personal",
      userId: USER_ID,
    },
    id,
  );
  assert.equal(personal.payload.suggestionKind, "insight");
  assert.doesNotMatch(JSON.stringify(personal), new RegExp(PERSONAL_PROFILE_ID));

  await assert.rejects(
    () =>
      getAiSuggestionPayloadForContext(
        {
          organizationId,
          financialProfileId: MEI_PROFILE_ID,
          financialProfileKind: "mei",
          userId: USER_ID,
        },
        id,
      ),
    (error: unknown) =>
      error instanceof AiSuggestionPayloadRepositoryError &&
      error.code === "AI_SUGGESTION_PAYLOAD_NOT_FOUND",
  );
}

async function assertResolvedPayloadIsImmutable(
  organizationId: string,
  createdIds: string[],
): Promise<void> {
  const id = randomUUID();
  const sourceSuggestionId = randomUUID();
  createdIds.push(id);
  const payload = buildCategorizationPayload("category-one", sourceSuggestionId);
  await insertSuggestion({
    id,
    organizationId,
    profileId: PERSONAL_PROFILE_ID,
    kind: "CATEGORIZATION",
    status: "PENDING_REVIEW",
    payload,
    provider: "solverfin-automation",
    targetEntityId: null,
  });
  await query(`update "AiSuggestion" set "status" = 'APPROVED' where "id" = $1`, [id]);

  const changed = buildCategorizationPayload("category-two", sourceSuggestionId);
  await assert.rejects(
    () =>
      query(`update "AiSuggestion" set "payload" = $2::jsonb where "id" = $1`, [
        id,
        JSON.stringify(changed),
      ]),
    hasDatabaseMessage("AI_SUGGESTION_PAYLOAD_IMMUTABLE"),
  );
}

async function assertPayloadlessLegacyCanOnlyCloseSafely(
  organizationId: string,
  createdIds: string[],
): Promise<void> {
  const id = randomUUID();
  createdIds.push(id);
  const now = new Date().toISOString();
  await query(`alter table "AiSuggestion" disable trigger "AiSuggestionPayloadContractInsert"`);
  try {
    await query(
      `insert into "AiSuggestion"
        ("id", "organizationId", "financialProfileId", "kind", "status", "confidence", "explanation",
         "payload", "provider", "model", "createdAt", "updatedAt")
       values ($1, $2, $3, 'TRANSACTION_EXTRACTION', 'PENDING_REVIEW', 0.4,
               'Registro historico ficticio sem payload.', null, 'legacy-provider', 'legacy-model', $4, $4)`,
      [id, organizationId, PERSONAL_PROFILE_ID, now],
    );
  } finally {
    await query(`alter table "AiSuggestion" enable trigger "AiSuggestionPayloadContractInsert"`);
  }

  await query(`update "AiSuggestion" set "status" = 'EXPIRED', "updatedAt" = $2 where "id" = $1`, [
    id,
    new Date().toISOString(),
  ]);
  const rows = await query<{ status: string; payload: unknown }>(
    `select "status", "payload" from "AiSuggestion" where "id" = $1`,
    [id],
  );
  assert.equal(rows[0]?.status, "EXPIRED");
  assert.equal(rows[0]?.payload, null);
}

async function assertConcurrentReviewFailsClosed(
  organizationId: string,
  createdIds: string[],
): Promise<void> {
  const id = randomUUID();
  createdIds.push(id);
  await insertSuggestion({
    id,
    organizationId,
    profileId: PERSONAL_PROFILE_ID,
    kind: "CATEGORIZATION",
    status: "PENDING_REVIEW",
    payload: buildCategorizationPayload("category-one", randomUUID()),
    provider: "solverfin-automation",
    targetEntityId: null,
  });

  const first = await getPool().connect();
  const second = await getPool().connect();
  try {
    await second.query("BEGIN");
    const preflight = await second.query<{ status: string }>(
      `select "status" from "AiSuggestion" where "id" = $1`,
      [id],
    );
    assert.equal(preflight.rows[0]?.status, "PENDING_REVIEW");

    await first.query("BEGIN");
    await first.query(`update "AiSuggestion" set "status" = 'APPROVED' where "id" = $1`, [id]);
    await first.query("COMMIT");

    await assert.rejects(
      () => second.query(`update "AiSuggestion" set "status" = 'REJECTED' where "id" = $1`, [id]),
      hasDatabaseMessage("AI_SUGGESTION_PAYLOAD_CONFLICT"),
    );
    await second.query("ROLLBACK");

    const rows = await query<{ status: string }>(
      `select "status" from "AiSuggestion" where "id" = $1`,
      [id],
    );
    assert.equal(rows[0]?.status, "APPROVED");
  } finally {
    first.release();
    second.release();
  }
}

async function assertInvalidPayloadErrorIsControlled(organizationId: string): Promise<void> {
  const secret = "fingerprint=secret idempotencyKey=secret amountMinor=999999";
  await assert.rejects(
    () =>
      insertSuggestion({
        id: randomUUID(),
        organizationId,
        profileId: PERSONAL_PROFILE_ID,
        kind: "INSIGHT",
        status: "PENDING_REVIEW",
        payload: { rawPrompt: secret },
        provider: "solverfin-rule",
        targetEntityId: null,
      }),
    (error: unknown) => {
      const record = error as { code?: string; message?: string };
      assert.equal(record.code, "P0001");
      assert.equal(record.message, "AI_SUGGESTION_PAYLOAD_VERSION_UNSUPPORTED");
      assert.doesNotMatch(record.message ?? "", /secret|999999|idempotencyKey/);
      return true;
    },
  );
}

function buildCategorizationPayload(categoryId: string, sourceSuggestionId: string) {
  return buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "categorization",
      payloadVersion: 1,
      origin: { kind: "automation", ruleId: "integration-rule" },
      target: { entityKind: "import_suggestion" },
      confidence: 0.9,
      reasons: ["Regra ficticia."],
      audit: { createdAt: new Date().toISOString() },
      targetEntityId: sourceSuggestionId,
      proposedCategoryId: categoryId,
      sourceSuggestionId,
    },
  });
}

async function insertSuggestion(input: {
  id: string;
  organizationId: string;
  profileId: string;
  kind: string;
  status: string;
  payload: unknown;
  provider: string;
  targetEntityId?: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  await query(
    `insert into "AiSuggestion"
      ("id", "organizationId", "financialProfileId", "kind", "status", "targetEntityId",
       "confidence", "explanation", "payload", "provider", "model", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, 0.9, 'Explicacao nao autoritativa.', $7::jsonb, $8,
             'integration-test', $9, $9)`,
    [
      input.id,
      input.organizationId,
      input.profileId,
      input.kind,
      input.status,
      input.targetEntityId ?? null,
      JSON.stringify(input.payload),
      input.provider,
      now,
    ],
  );
}

function hasDatabaseMessage(message: string): (error: unknown) => boolean {
  return (error: unknown) => {
    const record = error as { code?: string; message?: string };
    return record.code === "P0001" && record.message === message;
  };
}
