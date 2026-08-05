import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { readAiSuggestionPayload } from "@solverfin/domain/ai-suggestion-payloads";

import { closePool, query } from "./db.js";
import {
  createBankMessageInboxForContext,
  listBankMessageInboxForContext,
} from "./repositories/bank-message-inbox.js";

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

  const accountRows = await query<{ id: string }>(
    `select "id" from "Account"
      where "organizationId" = $1 and "financialProfileId" = $2 and "status" = 'ACTIVE'
      order by "createdAt" asc limit 1`,
    [organizationId, PERSONAL_PROFILE_ID],
  );
  const accountId = accountRows[0]?.id;
  assert.ok(accountId, "An active account seed is required.");

  const context = {
    organizationId,
    financialProfileId: PERSONAL_PROFILE_ID,
    financialProfileKind: "personal" as const,
    userId: USER_ID,
  };
  const importBatchIds: string[] = [];

  try {
    const created = await createBankMessageInboxForContext(context, {
      origin: "pasted",
      text: `Compra ficticia ${randomUUID()} de R$ 12,34 em 04/08/2026`,
      consentAccepted: true,
      accountId,
    });
    importBatchIds.push(created.importBatch.id);
    assert.ok(created.suggestion);

    const listedItems = await listBankMessageInboxForContext(context, {
      status: "all",
    });
    const listed = listedItems.find((item) => item.id === created.id);
    assert.ok(listed?.suggestion, "Created inbox suggestion must survive the list round-trip.");

    const read = readAiSuggestionPayload(listed.suggestion.payload, "transaction_extraction");
    assert.equal(read.state, "current");
    if (
      read.state !== "current" ||
      read.payload.suggestionKind !== "transaction_extraction"
    ) {
      throw new Error("Expected the canonical transaction extraction payload after listing Inbox.");
    }
    assert.equal(read.payload.amountMinor, 1234);
    assert.equal(read.payload.accountId, accountId);
  } finally {
    if (importBatchIds.length > 0) {
      await query(
        `delete from "AiSuggestion" where "sourceEntityId" = any($1::uuid[])`,
        [importBatchIds],
      );
      await query(`delete from "ImportBatch" where "id" = any($1::uuid[])`, [importBatchIds]);
    }
  }
}
