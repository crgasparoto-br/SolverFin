import {
  AiProviderError,
  FakeAiProvider,
  type AiProvider,
  type AiProviderSelection,
} from "@solverfin/ai";
import type { TenantContext } from "@solverfin/domain";

import { extractBankMessageForProduct } from "./bank-message-ai-inbox.js";

const context: TenantContext = {
  userId: "00000000-0000-4000-8000-000000000001",
  organizationId: "00000000-0000-4000-8000-000000000002",
  financialProfileId: "00000000-0000-4000-8000-000000000003",
  financialProfileKind: "personal",
};

await deterministicRuleDoesNotSelectProvider();
await providerProducesStructuredSuggestion();
await missingConsentResolverBlocksOutbound();
await revokedConsentBlocksOutbound();
await temporaryFailureIsRetryable();
await invalidOutputStaysUnderReview();

async function deterministicRuleDoesNotSelectProvider(): Promise<void> {
  let selections = 0;
  const result = await extractBankMessageForProduct(
    {
      text: "Compra no cartao final 1234 em Mercado Demo R$ 42,50 em 05/08/2026",
      context,
      consentAccepted: true,
    },
    {
      selectProvider: () => {
        selections += 1;
        return disabledSelection();
      },
    },
  );

  assertEqual(selections, 0, "deterministic provider selections");
  assertEqual(result.diagnostic.source, "deterministic", "deterministic source");
  assertEqual(
    result.parserResult.suggestion?.amountMinor,
    4250,
    "deterministic amount",
  );
}

async function providerProducesStructuredSuggestion(): Promise<void> {
  const provider = new FakeAiProvider([
    {
      text: "structured",
      structured: {
        amountMinor: 7710,
        currency: "BRL",
        occurredOn: "2026-08-05",
        type: "expense",
        merchant: "Farmacia Demo",
        confidence: 0.88,
        source: "bank_message",
        reasons: ["Fixture ficticia reconhecida."],
      },
    },
  ]);
  const result = await extractBankMessageForProduct(
    {
      text: "Pagamento em Farmacia Demo no dia 05/08/2026, setenta e sete reais",
      context,
      consentAccepted: true,
    },
    {
      selectProvider: () => readySelection(provider),
      resolveConsent: () => "granted",
      policy: policyWithNoRetry(),
    },
  );

  assertEqual(result.diagnostic.source, "ai", "AI source");
  assertEqual(result.diagnostic.state, "ready_for_review", "AI state");
  assertEqual(result.parserResult.suggestion?.amountMinor, 7710, "AI amount");
}

async function missingConsentResolverBlocksOutbound(): Promise<void> {
  let calls = 0;
  const provider: AiProvider = {
    id: "counting",
    model: "fixture",
    async complete() {
      calls += 1;
      return { text: "must not run" };
    },
  };
  const result = await extractBankMessageForProduct(
    {
      text: "Mensagem fora dos formatos determinísticos",
      context,
      consentAccepted: true,
    },
    {
      selectProvider: () => readySelection(provider),
      policy: policyWithNoRetry(),
    },
  );

  assertEqual(calls, 0, "missing consent resolver outbound calls");
  assertEqual(
    result.diagnostic.code,
    "BANK_MESSAGE_CONSENT_CHECK_REQUIRED",
    "missing resolver code",
  );
  assertEqual(result.diagnostic.state, "incomplete", "missing resolver state");
}

async function revokedConsentBlocksOutbound(): Promise<void> {
  let calls = 0;
  const provider: AiProvider = {
    id: "counting",
    model: "fixture",
    async complete() {
      calls += 1;
      return { text: "must not run" };
    },
  };
  const states = ["granted", "revoked"] as const;
  let index = 0;
  const result = await extractBankMessageForProduct(
    {
      text: "Mensagem fora dos formatos determinísticos",
      context,
      consentAccepted: true,
    },
    {
      selectProvider: () => readySelection(provider),
      resolveConsent: () => states[index++] ?? "revoked",
      policy: policyWithNoRetry(),
    },
  );

  assertEqual(calls, 0, "revoked consent outbound calls");
  assertEqual(result.parserResult.code, "BANK_MESSAGE_AI_BLOCKED", "revoked code");
}

async function temporaryFailureIsRetryable(): Promise<void> {
  let calls = 0;
  const provider: AiProvider = {
    id: "timeout",
    model: "fixture",
    async complete() {
      calls += 1;
      throw new AiProviderError("timeout", "fixture timeout", { retryable: true });
    },
  };
  const result = await extractBankMessageForProduct(
    {
      text: "Mensagem fora dos formatos determinísticos",
      context,
      consentAccepted: true,
    },
    {
      selectProvider: () => readySelection(provider),
      resolveConsent: () => "granted",
      policy: policyWithNoRetry(),
    },
  );

  assertEqual(calls, 1, "one outbound call for one attempt");
  assertEqual(result.diagnostic.retryable, true, "timeout retryable");
  assertEqual(
    result.diagnostic.state,
    "temporarily_unavailable",
    "timeout state",
  );
}

async function invalidOutputStaysUnderReview(): Promise<void> {
  const result = await extractBankMessageForProduct(
    {
      text: "Mensagem fora dos formatos determinísticos",
      context,
      consentAccepted: true,
    },
    {
      selectProvider: () =>
        readySelection(new FakeAiProvider([{ text: "invalid" }])),
      resolveConsent: () => "granted",
      policy: policyWithNoRetry(),
    },
  );

  assertEqual(
    result.parserResult.suggestion,
    undefined,
    "invalid suggestion absent",
  );
  assertEqual(result.diagnostic.state, "incomplete", "invalid output state");
  assertEqual(result.diagnostic.retryable, false, "invalid output not retried");
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

function policyWithNoRetry() {
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

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}
