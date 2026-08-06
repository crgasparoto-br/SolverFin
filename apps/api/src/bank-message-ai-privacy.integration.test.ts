import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { FakeAiProvider, type AiProviderSelection } from "@solverfin/ai";

import { createBankMessageInboxWithAiForContext } from "./bank-message-ai-inbox.js";
import { closePool, query } from "./db.js";

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

  const profiles = await query<{ organizationId: string }>(
    `select "organizationId" from "FinancialProfile" where "id" = $1`,
    [PERSONAL_PROFILE_ID],
  );
  const organizationId = profiles[0]?.organizationId;
  assert.ok(organizationId, "Personal financial profile seed is required.");

  const context = {
    organizationId,
    financialProfileId: PERSONAL_PROFILE_ID,
    financialProfileKind: "personal" as const,
    userId: USER_ID,
  };
  const marker = randomUUID()
    .replace(/[^a-f]/gi, "")
    .padEnd(12, "a")
    .slice(0, 12);
  const sensitiveName = `Maria Silva ${marker}`;
  const sensitivePurpose = `almoco privado ${marker}`;
  const text =
    `Pagamento de ${sensitivePurpose} para ${sensitiveName} ` +
    "no valor de R$ 42,50 em 05/08/2026";
  let importBatchId: string | undefined;
  let suggestionId: string | undefined;

  try {
    const provider = new FakeAiProvider([
      {
        text,
        structured: {
          amountMinor: 4250,
          currency: "BRL",
          occurredOn: "2026-08-05",
          type: "expense",
          confidence: 0.91,
          source: "bank_message",
          reasons: [text, sensitiveName, sensitivePurpose],
        },
      },
    ]);

    const created = await createBankMessageInboxWithAiForContext(
      context,
      { origin: "shared", text, consentAccepted: true },
      {
        selectProvider: () => readySelection(provider),
        resolveConsent: () => "granted",
        policy: {
          consent: "granted",
          purpose: "bank_message_transaction_extraction",
          maxPromptChars: 4_000,
          maxRetries: 0,
          timeoutMs: 1_000,
          allowRawFinancialText: false,
          allowedFieldNames: ["message"],
        },
      },
    );
    importBatchId = created.id;

    assert.equal(created.extractionState, "ready_for_review");
    assert.ok(created.suggestion, "valid provider output must create a reviewable suggestion");
    suggestionId = created.suggestion.id;

    const suggestions = await query<{
      id: string;
      payload: unknown;
      explanation: string;
    }>(
      `select "id", "payload", "explanation" from "AiSuggestion"
       where "organizationId" = $1 and "financialProfileId" = $2 and "sourceEntityId" = $3`,
      [organizationId, PERSONAL_PROFILE_ID, created.id],
    );
    assert.equal(suggestions.length, 1);
    const storedSuggestion = suggestions[0];
    assert.ok(storedSuggestion);
    const payload = storedSuggestion.payload as {
      description?: unknown;
      reasons?: unknown;
    };
    assert.equal(
      payload.description,
      "Mensagem bancária mascarada",
      "missing merchant must use a generic description instead of message-derived text",
    );
    assert.deepEqual(
      payload.reasons,
      ["Sugestao estruturada produzida pelo provider para revisao."],
      "provider-authored reasons must be replaced by a controlled persistent reason",
    );

    const batches = await query<{ problems: unknown }>(
      `select "problems" from "ImportBatch"
       where "organizationId" = $1 and "financialProfileId" = $2 and "id" = $3`,
      [organizationId, PERSONAL_PROFILE_ID, created.id],
    );
    const auditRows = await query<{ reason: string | null; redactedChanges: unknown }>(
      `select "reason", "redactedChanges" from "AuditLogEntry"
       where "organizationId" = $1 and "financialProfileId" = $2
         and "entityId" = any($3::uuid[])`,
      [organizationId, PERSONAL_PROFILE_ID, [created.id, storedSuggestion.id]],
    );
    const persisted = JSON.stringify({
      payload: storedSuggestion.payload,
      explanation: storedSuggestion.explanation,
      problems: batches[0]?.problems,
      audit: auditRows,
    });

    for (const forbidden of [text, sensitiveName, sensitivePurpose, marker]) {
      assert.equal(
        persisted.includes(forbidden),
        false,
        `persisted extraction artifacts must not retain sensitive fragment: ${forbidden}`,
      );
    }
  } finally {
    const entityIds = [importBatchId, suggestionId].filter(
      (value): value is string => value !== undefined,
    );
    if (entityIds.length > 0) {
      await query(`delete from "AuditLogEntry" where "entityId" = any($1::uuid[])`, [entityIds]);
    }
    if (importBatchId !== undefined) {
      await query(`delete from "AiSuggestion" where "sourceEntityId" = $1`, [importBatchId]);
      await query(`delete from "ImportBatch" where "id" = $1`, [importBatchId]);
    }
  }
}

function readySelection(provider: FakeAiProvider): AiProviderSelection {
  return {
    status: "ready",
    provider: provider as never,
    health: {
      status: "ready",
      providerId: "openai",
      model: provider.model,
      endpointOrigin: "https://example.invalid",
      issues: [],
    },
  };
}
