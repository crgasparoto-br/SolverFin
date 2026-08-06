import { AiProviderError, type AiProvider, type AiProviderSelection } from "@solverfin/ai";
import type { TenantContext } from "@solverfin/domain";

import { extractBankMessageForProduct } from "./bank-message-ai-inbox.js";
import { buildAuthoritativeConsentResolver } from "./bank-message-inbox-router.js";
import type { ApiRequest } from "./router.js";

const context: TenantContext = {
  userId: "00000000-0000-4000-8000-000000000001",
  organizationId: "00000000-0000-4000-8000-000000000002",
  financialProfileId: "00000000-0000-4000-8000-000000000003",
  financialProfileKind: "personal",
};

let providerCalls = 0;
let authenticationCalls = 0;
let contextCalls = 0;
let consentCalls = 0;
const consentStates = ["granted", "granted", "revoked"] as const;
const provider: AiProvider = {
  id: "late-revocation-route-fixture",
  model: "fixture-v1",
  async complete() {
    providerCalls += 1;
    throw new AiProviderError("timeout", "fixture timeout", { retryable: true });
  },
};
const request: ApiRequest = {
  pathname: "/api/bank-message-inbox",
  method: "POST",
  query: new URLSearchParams({ profileId: context.financialProfileId }),
  headers: { cookie: "solverfin_session=fixture" },
  body: {},
};
const resolveConsent = buildAuthoritativeConsentResolver(request, context, {
  authenticate: async () => {
    authenticationCalls += 1;
    return {
      id: context.userId,
      email: "fixture@solverfin.example.invalid",
      displayName: "Fixture",
      status: "active",
    };
  },
  resolveContext: async () => {
    contextCalls += 1;
    return context;
  },
  resolveConsent: async () => {
    const state = consentStates[consentCalls] ?? "revoked";
    consentCalls += 1;
    return state;
  },
});

const result = await extractBankMessageForProduct(
  {
    text: "Mensagem fictícia fora dos formatos determinísticos em 05/08/2026",
    context,
    consentAccepted: true,
  },
  {
    selectProvider: () => readySelection(provider),
    resolveConsent,
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

assertEqual(providerCalls, 1, "revocation blocks second provider attempt");
assertEqual(authenticationCalls, 3, "authentication is revalidated for every consent check");
assertEqual(contextCalls, 3, "tenant context is revalidated for every consent check");
assertEqual(consentCalls, 3, "persisted consent is resolved for every consent check");
assertEqual(result.parserResult.code, "BANK_MESSAGE_AI_BLOCKED", "late revocation code");
assertEqual(result.diagnostic.state, "incomplete", "late revocation state");

function readySelection(candidate: AiProvider): AiProviderSelection {
  return {
    status: "ready",
    provider: candidate as never,
    health: {
      status: "ready",
      providerId: "openai",
      model: candidate.model,
      endpointOrigin: "https://example.invalid",
      issues: [],
    },
  };
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}
