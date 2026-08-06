import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  AiProviderError,
  FakeAiProvider,
  type AiProvider,
  type AiProviderSelection,
} from "@solverfin/ai";
import { buildBankMessageSourceHash } from "@solverfin/domain";

import {
  createBankMessageInboxWithAiForContext,
  listBankMessageInboxWithAiForContext,
} from "./bank-message-ai-inbox.js";
import { closePool, query } from "./db.js";
import { BankMessageInboxRepositoryError } from "./repositories/bank-message-inbox.js";

const PERSONAL_PROFILE_ID = "33333333-3333-4333-8333-333333333331";
const MEI_ACCOUNT_ID = "44444444-4444-4444-8444-444444444442";
const MEI_CATEGORY_ID = "66666666-6666-4666-8666-666666666621";
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
  const accountRows = await query<{ id: string }>(
    `select "id" from "Account"
      where "organizationId" = $1 and "financialProfileId" = $2 and "status" = 'ACTIVE'
      order by "createdAt" asc limit 1`,
    [organizationId, PERSONAL_PROFILE_ID],
  );
  const accountId = accountRows[0]?.id;
  assert.ok(accountId, "An active account seed is required.");
  const categoryRows = await query<{ id: string }>(
    `select "id" from "Category"
      where "organizationId" = $1 and "financialProfileId" = $2 and "status" = 'ACTIVE'
      order by "createdAt" asc limit 1`,
    [organizationId, PERSONAL_PROFILE_ID],
  );
  const categoryId = categoryRows[0]?.id;
  assert.ok(categoryId, "An active category seed is required.");

  const context = {
    organizationId,
    financialProfileId: PERSONAL_PROFILE_ID,
    financialProfileKind: "personal" as const,
    userId: USER_ID,
  };
  const createdSourceHashes: string[] = [];

  try {
    const concurrentToken = randomUUID();
    const concurrentText =
      `${concurrentToken} Compra no cartao final 1234 em Mercado Demo ` + "R$ 42,50 em 05/08/2026";
    const concurrentSourceHash = buildBankMessageSourceHash(context, concurrentText);
    createdSourceHashes.push(concurrentSourceHash);
    await Promise.all([
      createBankMessageInboxWithAiForContext(context, {
        origin: "pasted",
        text: concurrentText,
        consentAccepted: true,
        accountId,
        categoryId,
      }),
      createBankMessageInboxWithAiForContext(context, {
        origin: "pasted",
        text: concurrentText,
        consentAccepted: true,
        accountId,
        categoryId,
      }),
    ]);

    const concurrentRows = await query<{
      batches: number;
      suggestions: number;
    }>(
      `select
         count(distinct batch."id")::int as batches,
         count(distinct suggestion."id")::int as suggestions
       from "ImportBatch" batch
       left join "AiSuggestion" suggestion on suggestion."sourceEntityId" = batch."id"
       where batch."organizationId" = $1 and batch."financialProfileId" = $2
         and batch."sourceHash" = $3`,
      [organizationId, PERSONAL_PROFILE_ID, concurrentSourceHash],
    );
    assert.equal(concurrentRows[0]?.batches, 1);
    assert.equal(concurrentRows[0]?.suggestions, 1);

    const storedRaw = await query<{ exposed: boolean }>(
      `select exists (
         select 1 from "ImportBatch" batch
         left join "AiSuggestion" suggestion on suggestion."sourceEntityId" = batch."id"
         where batch."organizationId" = $1 and batch."financialProfileId" = $2
           and (batch."problems"::text like '%' || $3 || '%'
             or coalesce(suggestion."explanation", '') like '%' || $3 || '%'
             or coalesce(suggestion."payload"::text, '') like '%' || $3 || '%')
       ) as exposed`,
      [organizationId, PERSONAL_PROFILE_ID, concurrentText],
    );
    assert.equal(storedRaw[0]?.exposed, false, "raw message must not be persisted");

    let providerSelections = 0;
    const selectionGuard = {
      selectProvider: () => {
        providerSelections += 1;
        return disabledSelection();
      },
    };
    await assertRejectsWithCode(
      () =>
        createBankMessageInboxWithAiForContext(
          context,
          {
            origin: "pasted",
            text: `${randomUUID()} Compra R$ 10,00 em 05/08/2026`,
            consentAccepted: true,
            accountId: "not-a-uuid",
          },
          selectionGuard,
        ),
      "BANK_MESSAGE_ACCOUNT_INVALID",
    );
    await assertRejectsWithCode(
      () =>
        createBankMessageInboxWithAiForContext(
          context,
          {
            origin: "pasted",
            text: `${randomUUID()} Compra R$ 10,00 em 05/08/2026`,
            consentAccepted: true,
            accountId: MEI_ACCOUNT_ID,
          },
          selectionGuard,
        ),
      "BANK_MESSAGE_ACCOUNT_INVALID",
    );
    await assertRejectsWithCode(
      () =>
        createBankMessageInboxWithAiForContext(
          context,
          {
            origin: "pasted",
            text: `${randomUUID()} Compra R$ 10,00 em 05/08/2026`,
            consentAccepted: true,
            categoryId: MEI_CATEGORY_ID,
          },
          selectionGuard,
        ),
      "BANK_MESSAGE_CATEGORY_INVALID",
    );
    assert.equal(providerSelections, 0, "tenant validation must happen before provider selection");

    const retryToken = randomUUID();
    const retryText =
      `${retryToken} aviso bancario fora dos formatos conhecidos ` + "em 05/08/2026";
    const retrySourceHash = buildBankMessageSourceHash(context, retryText);
    createdSourceHashes.push(retrySourceHash);
    const timeoutProvider: AiProvider = {
      id: "timeout-fixture",
      model: "fixture-v1",
      async complete() {
        throw new AiProviderError("timeout", "fixture timeout", {
          retryable: true,
        });
      },
    };
    const failed = await createBankMessageInboxWithAiForContext(
      context,
      { origin: "shared", text: retryText, consentAccepted: true },
      {
        selectProvider: () => readySelection(timeoutProvider),
        resolveConsent: () => "granted",
        policy: noRetryPolicy(),
      },
    );
    assert.equal(failed.status, "error");
    assert.equal(failed.retryable, true);

    const successfulProvider = new FakeAiProvider([
      {
        text: "structured",
        structured: {
          amountMinor: 1990,
          currency: "BRL",
          occurredOn: "2026-08-05",
          type: "expense",
          merchant: "Loja Demo",
          confidence: 0.86,
          source: "bank_message",
          reasons: ["Fixture fictícia reconhecida."],
        },
      },
    ]);
    const retried = await createBankMessageInboxWithAiForContext(
      context,
      { origin: "shared", text: retryText, consentAccepted: true },
      {
        selectProvider: () => readySelection(successfulProvider),
        resolveConsent: () => "granted",
        policy: noRetryPolicy(),
      },
    );
    assert.equal(retried.id, failed.id, "retry must reuse the same batch");
    assert.ok(retried.suggestion, "retry must create a reviewable suggestion");

    const listed = await listBankMessageInboxWithAiForContext(context, {
      status: "all",
    });
    const listedRetry = listed.find((item) => item.id === retried.id);
    assert.equal(listedRetry?.extractionSource, "ai");
    assert.equal(listedRetry?.extractionState, "ready_for_review");
  } finally {
    if (createdSourceHashes.length > 0) {
      await query(
        `delete from "AiSuggestion" where "sourceEntityId" in (
           select "id" from "ImportBatch"
           where "organizationId" = $1 and "financialProfileId" = $2
             and "sourceHash" = any($3::text[])
         )`,
        [organizationId, PERSONAL_PROFILE_ID, createdSourceHashes],
      );
      await query(
        `delete from "ImportBatch"
         where "organizationId" = $1 and "financialProfileId" = $2
           and "sourceHash" = any($3::text[])`,
        [organizationId, PERSONAL_PROFILE_ID, createdSourceHashes],
      );
    }
  }
}

function readySelection(provider: AiProvider): AiProviderSelection {
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

function disabledSelection(): AiProviderSelection {
  return {
    status: "disabled",
    provider: undefined,
    health: { status: "disabled", providerId: "disabled", issues: [] },
  };
}

function noRetryPolicy() {
  return {
    consent: "granted" as const,
    purpose: "bank_message_transaction_extraction",
    maxPromptChars: 4_000,
    maxRetries: 0,
    timeoutMs: 1_000,
    allowRawFinancialText: false,
    allowedFieldNames: ["message"],
  };
}

async function assertRejectsWithCode(action: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    return error instanceof BankMessageInboxRepositoryError && error.code === code;
  });
}
