import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { AiProviderError, type AiProvider, type AiProviderSelection } from "@solverfin/ai";

import { extractBankMessageForProduct } from "./bank-message-ai-inbox.js";
import { closePool, query } from "./db.js";
import {
  grantBankMessageAiConsentForContext,
  resolveBankMessageAiConsentForContext,
  revokeBankMessageAiConsentForContext,
} from "./repositories/ai-consent.js";

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
  const correlationId = `bank-message-consent-${randomUUID()}`;
  let calls = 0;
  let consentChecks = 0;

  try {
    await grantBankMessageAiConsentForContext(context, { correlationId });
    assert.equal(await resolveBankMessageAiConsentForContext(context), "granted");

    const provider: AiProvider = {
      id: "late-revocation-fixture",
      model: "fixture-v1",
      async complete() {
        calls += 1;
        await revokeBankMessageAiConsentForContext(context, { correlationId });
        throw new AiProviderError("timeout", "fixture timeout after revocation", {
          retryable: true,
        });
      },
    };

    const result = await extractBankMessageForProduct(
      {
        text: "Mensagem fictícia fora dos formatos determinísticos em 05/08/2026",
        context,
        consentAccepted: true,
      },
      {
        selectProvider: () => readySelection(provider),
        resolveConsent: async () => {
          consentChecks += 1;
          return resolveBankMessageAiConsentForContext(context);
        },
        policy: {
          consent: "granted",
          purpose: "bank_message_transaction_extraction",
          maxPromptChars: 4_000,
          maxRetries: 1,
          timeoutMs: 1_000,
          allowRawFinancialText: false,
          allowedFieldNames: ["message"],
        },
      },
    );

    assert.equal(calls, 1, "revocation before retry must block a second outbound call");
    assert.ok(consentChecks >= 3, "consent must be checked initially and before each attempt");
    assert.equal(result.parserResult.code, "BANK_MESSAGE_AI_BLOCKED");
    assert.equal(result.diagnostic.state, "incomplete");
    assert.equal(await resolveBankMessageAiConsentForContext(context), "revoked");
  } finally {
    await query(`delete from "SecurityAuditEvent" where "correlationId" = $1`, [correlationId]);
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
