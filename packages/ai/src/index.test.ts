import {
  defaultAiUsagePolicy,
  FakeAiProvider,
  maskSensitiveText,
  runAiTask,
  sanitizeAiPayload,
  type AiProvider,
  type AiProviderResult,
  type AiUsageContext,
  type SafeAiLogEvent,
  type SafeAiProviderRequest,
} from "./index.js";

const context: AiUsageContext = {
  organizationId: "org-ai-a",
  financialProfileId: "profile-ai-a",
  userId: "user-ai-a",
  correlationId: "corr-ai-1",
};

const grantedPolicy = {
  ...defaultAiUsagePolicy,
  consent: "granted" as const,
  purpose: "transaction extraction review",
  maxPromptChars: 240,
  maxRetries: 1,
  timeoutMs: 1000,
  allowRawFinancialText: false,
  allowedFieldNames: ["merchant", "amountMinor", "currency", "occurredOn"],
};

await testConsentBlocksProviderCall();
await testSanitizationAndAllowedFields();
await testProviderCanBeFaked();
await testRetryAndSafeLogs();
await testInvalidProviderResponse();

testMaskSensitiveText();

async function testConsentBlocksProviderCall(): Promise<void> {
  const events: SafeAiLogEvent[] = [];
  const provider = new FakeAiProvider([{ text: "never used" }]);
  const result = await runAiTask({
    provider,
    task: "extraction",
    context,
    policy: { ...grantedPolicy, consent: "revoked" },
    payload: { prompt: "Compra demo de 1234 reais" },
    logger: (event) => events.push(event),
  });

  assertEqual(result.status, "blocked", "revoked consent blocks request");
  assertEqual(result.code, "AI_CONSENT_REQUIRED", "revoked consent code");
  assertEqual(events[0]?.code, "AI_CONSENT_REQUIRED", "safe consent log code");
  assertEqual(events[0]?.correlationId, context.correlationId, "safe consent correlation id");
}

async function testSanitizationAndAllowedFields(): Promise<void> {
  const sanitized = sanitizeAiPayload(
    {
      prompt: "Cartao 4111111111111111 conta 123456789 documento 123.456.789-09",
      fields: {
        merchant: "Loja Demo 987654321",
        amountMinor: 2590,
        currency: "BRL",
        rawMessage: "nao deve ir ao provider",
      },
    },
    grantedPolicy,
  );

  assertEqual(sanitized.prompt.includes("4111111111111111"), false, "card masked in prompt");
  assertEqual(sanitized.prompt.includes("123.456.789-09"), false, "document masked in prompt");
  assertEqual(sanitized.fields.merchant, "Loja Demo *****4321", "merchant digits masked");
  assertEqual(sanitized.omittedFieldNames[0], "rawMessage", "raw message omitted");
  assertEqual(Object.hasOwn(sanitized.fields, "amountMinor"), true, "amount kept");
}

async function testProviderCanBeFaked(): Promise<void> {
  const provider = new FakeAiProvider([{ text: "Sugestao criada", confidence: 0.91 }]);
  const result = await runAiTask({
    provider,
    task: "classification",
    context,
    policy: grantedPolicy,
    payload: {
      prompt: "Classifique a compra ficticia.",
      fields: { merchant: "Mercado Demo", amountMinor: 1500, currency: "BRL" },
    },
  });

  assertEqual(result.status, "completed", "fake provider completes");

  if (result.status === "completed") {
    assertEqual(result.providerId, "fake", "fake provider id");
    assertEqual(result.result.confidence, 0.91, "fake provider confidence");
    assertEqual(result.attempts, 1, "fake provider attempts");
  }
}

async function testRetryAndSafeLogs(): Promise<void> {
  const events: SafeAiLogEvent[] = [];
  const provider = new FlakyAiProvider([{ text: "ok depois de retry" }]);
  const result = await runAiTask({
    provider,
    task: "assistant",
    context,
    policy: grantedPolicy,
    payload: { prompt: "Resumo financeiro ficticio" },
    logger: (event) => events.push(event),
  });

  assertEqual(result.status, "completed", "retry completes");

  if (result.status === "completed") {
    assertEqual(result.attempts, 2, "second attempt succeeds");
  }

  assertEqual(
    events.some((event) => event.code === "AI_PROVIDER_CALL_FAILED"),
    true,
    "failure logged",
  );
  assertEqual(
    events.some((event) => event.code === "AI_PROVIDER_CALL_COMPLETED"),
    true,
    "completion logged",
  );
  assertEqual(
    events.some((event) => "prompt" in event),
    false,
    "logs do not include prompt",
  );
}

async function testInvalidProviderResponse(): Promise<void> {
  const provider = new FakeAiProvider([{ text: "   " }]);
  const result = await runAiTask({
    provider,
    task: "summary",
    context,
    policy: grantedPolicy,
    payload: { prompt: "Resuma dados ficticios" },
  });

  assertEqual(result.status, "failed", "blank provider response fails");
  assertEqual(result.code, "AI_PROVIDER_INVALID_RESPONSE", "invalid response code");
}

function testMaskSensitiveText(): void {
  assertEqual(maskSensitiveText("Conta 123456789"), "Conta *****6789", "long number mask");
  assertEqual(maskSensitiveText("CPF 12345678909"), "CPF ***documento***", "document mask");
  assertEqual(
    maskSensitiveText("Cartao 4111 1111 1111 1111"),
    "Cartao **** **** **** ****",
    "card mask",
  );
}

class FlakyAiProvider implements AiProvider {
  readonly id = "flaky";
  readonly model = "flaky-model";

  private calls = 0;
  private readonly responses: AiProviderResult[];

  constructor(responses: readonly AiProviderResult[]) {
    this.responses = [...responses];
  }

  async complete(_request: SafeAiProviderRequest): Promise<AiProviderResult> {
    this.calls += 1;

    if (this.calls === 1) {
      throw new Error("temporary provider error");
    }

    const response = this.responses.shift();

    if (!response) {
      throw new Error("missing fake response");
    }

    return response;
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
