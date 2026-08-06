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
  const text = `${randomUUID()} transferência enviada entre contas em 05/08/2026`;
  let importBatchId: string | undefined;

  try {
    const provider = new FakeAiProvider([
      {
        text: "structured",
        structured: {
          amountMinor: 4200,
          currency: "BRL",
          occurredOn: "2026-08-05",
          type: "transfer",
          direction: "outflow",
          merchant: "Transferência entre contas",
          confidence: 0.91,
          source: "bank_message",
          reasons: ["Fixture informa transferência enviada."],
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
    assert.ok(created.suggestion, "directed transfer must create a reviewable suggestion");
    const payload = created.suggestion.payload;
    assert.ok(payload && "kind" in payload && "direction" in payload);
    assert.equal(payload.kind, "transfer");
    assert.equal(payload.direction, "outflow");

    const stored = await query<{ kind: string; direction: string }>(
      `select payload->>'kind' as kind, payload->>'direction' as direction
       from "AiSuggestion"
       where "organizationId" = $1 and "financialProfileId" = $2 and "sourceEntityId" = $3`,
      [organizationId, PERSONAL_PROFILE_ID, created.id],
    );
    assert.deepEqual(stored, [{ kind: "transfer", direction: "outflow" }]);
  } finally {
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
