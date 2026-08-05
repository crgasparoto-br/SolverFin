import {
  AiProviderError,
  MAX_AI_PROVIDER_RETRIES,
  defaultAiUsagePolicy,
  runAiTask,
  type AiConsentState,
  type AiProvider,
  type AiProviderResult,
  type SafeAiLogEvent,
  type SafeAiProviderRequest,
} from "./index.js";

const context = {
  organizationId: "org-test",
  financialProfileId: "profile-test",
  correlationId: "corr-test",
};
const policy = {
  ...defaultAiUsagePolicy,
  consent: "granted" as const,
  purpose: "safe provider test",
  maxRetries: 2,
  timeoutMs: 100,
  allowedFieldNames: ["merchant"],
};

async function testConsentRecheckedImmediatelyBeforeCall(): Promise<void> {
  const provider = new CountingProvider(() => ({ text: "not called" }));
  const states: AiConsentState[] = ["granted", "revoked"];
  const result = await runAiTask({
    provider,
    task: "assistant",
    context,
    policy,
    payload: { prompt: "safe prompt" },
    resolveConsent: () => states.shift() ?? "revoked",
  });

  assertEqual(result.status, "blocked", "revoked consent blocks immediately before call");
  assertEqual(provider.calls, 0, "provider is not called after consent revocation");
}

async function testMissingConsentResolverBlocksBeforeCall(): Promise<void> {
  const provider = new CountingProvider(() => ({ text: "not called" }));
  const result = await runAiTask({
    provider,
    task: "assistant",
    context,
    policy,
    payload: { prompt: "safe prompt" },
  });

  assertEqual(result.status, "blocked", "missing resolver blocks the executor");

  if (result.status === "blocked") {
    assertEqual(result.code, "AI_CONSENT_REQUIRED", "missing resolver has controlled code");
  }

  assertEqual(provider.calls, 0, "missing resolver produces zero provider calls");
}

async function testSanitizedEmptyPayloadBlocksBeforeCall(): Promise<void> {
  const provider = new CountingProvider(() => ({ text: "not called" }));
  const result = await runAiTask({
    provider,
    task: "extraction",
    context,
    policy,
    payload: { prompt: "", fields: { rawMessage: "must be omitted" } },
    resolveConsent: () => "granted",
  });

  assertEqual(result.status, "blocked", "empty sanitized payload is blocked");

  if (result.status === "blocked") {
    assertEqual(result.code, "AI_PAYLOAD_EMPTY", "empty payload has controlled code");
  }

  assertEqual(provider.calls, 0, "empty payload does not call provider");
}

async function testInvalidRetryPolicyBlocksBeforeCall(): Promise<void> {
  for (const maxRetries of [-1, MAX_AI_PROVIDER_RETRIES + 1, 1.5]) {
    const provider = new CountingProvider(() => ({ text: "not called" }));
    const result = await runAiTask({
      provider,
      task: "assistant",
      context,
      policy: { ...policy, maxRetries },
      payload: { prompt: "safe prompt" },
      resolveConsent: () => "granted",
    });

    assertEqual(result.status, "blocked", `invalid maxRetries ${maxRetries} is blocked`);

    if (result.status === "blocked") {
      assertEqual(result.code, "AI_POLICY_INVALID", "invalid retry policy has controlled code");
    }

    assertEqual(provider.calls, 0, "invalid retry policy does not call provider");
  }
}

async function testTypedTimeoutRetriesAndMapsResult(): Promise<void> {
  const provider = new CountingProvider(() => {
    throw new AiProviderError("timeout", "timeout", { retryable: true });
  });
  const result = await runAiTask({
    provider,
    task: "summary",
    context,
    policy: { ...policy, maxRetries: 1 },
    payload: { prompt: "safe prompt" },
    resolveConsent: () => "granted",
  });

  assertEqual(result.status, "failed", "timeout fails after retries");

  if (result.status === "failed") {
    assertEqual(result.code, "AI_PROVIDER_TIMEOUT", "timeout maps to controlled code");
    assertEqual(result.attempts, 2, "timeout respects maxRetries");
  }

  assertEqual(provider.calls, 2, "one provider call per attempt");
}

async function testTypedTimeoutRetriesThenSucceeds(): Promise<void> {
  let attempts = 0;
  const provider = new CountingProvider(() => {
    attempts += 1;

    if (attempts === 1) {
      throw new AiProviderError("timeout", "timeout", { retryable: true });
    }

    return { text: "recovered" };
  });
  const result = await runAiTask({
    provider,
    task: "assistant",
    context,
    policy: { ...policy, maxRetries: 1 },
    payload: { prompt: "safe prompt" },
    resolveConsent: () => "granted",
  });

  assertEqual(result.status, "completed", "retry can recover from timeout");

  if (result.status === "completed") {
    assertEqual(result.attempts, 2, "success reports both attempts");
    assertEqual(result.result.text, "recovered", "retry returns recovered result");
  }

  assertEqual(provider.calls, 2, "recovery performs one call per attempt");
}

async function testPermanentFailureDoesNotRetry(): Promise<void> {
  const provider = new CountingProvider(() => {
    throw new AiProviderError("permanent", "rejected", { retryable: false });
  });
  const result = await runAiTask({
    provider,
    task: "classification",
    context,
    policy,
    payload: { prompt: "safe prompt" },
    resolveConsent: () => "granted",
  });

  assertEqual(result.status, "failed", "permanent failure is controlled");

  if (result.status === "failed") {
    assertEqual(result.code, "AI_PROVIDER_ERROR", "permanent failure mapping");
    assertEqual(result.attempts, 1, "permanent failure is not retried");
  }

  assertEqual(provider.calls, 1, "permanent failure performs one outbound attempt");
}

async function testStructuredTasksFailClosed(): Promise<void> {
  const textOnlyExtraction = new CountingProvider(() => ({ text: "plain extraction" }));
  const extractionResult = await runAiTask({
    provider: textOnlyExtraction,
    task: "extraction",
    context,
    policy,
    payload: { prompt: "extract" },
    resolveConsent: () => "granted",
  });
  assertFailedInvalidResponse(extractionResult, "text-only extraction is rejected");

  const unvalidatedClassification = new CountingProvider(() => ({
    text: "category",
    structured: { categoryId: "category-demo" },
  }));
  const classificationResult = await runAiTask({
    provider: unvalidatedClassification,
    task: "classification",
    context,
    policy,
    payload: { prompt: "classify" },
    resolveConsent: () => "granted",
  });
  assertFailedInvalidResponse(
    classificationResult,
    "classification without a task validator is rejected",
  );
}

async function testStructuredTasksAcceptValidatedContracts(): Promise<void> {
  const extractionProvider = new CountingProvider(() => ({
    text: "extracted",
    structured: {
      amountMinor: 1500,
      currency: "BRL",
      occurredOn: "2026-08-05",
      type: "expense",
      merchant: "Demo Market",
      confidence: 0.9,
      source: "manual_note",
      reasons: ["fictitious fixture"],
    },
    confidence: 0.9,
  }));
  const extractionResult = await runAiTask({
    provider: extractionProvider,
    task: "extraction",
    context,
    policy,
    payload: { prompt: "extract" },
    resolveConsent: () => "granted",
  });
  assertEqual(extractionResult.status, "completed", "valid extraction schema is accepted");

  const classificationProvider = new CountingProvider(() => ({
    text: "classified",
    structured: { categoryId: "category-demo" },
    confidence: 0.88,
  }));
  const classificationResult = await runAiTask({
    provider: classificationProvider,
    task: "classification",
    context,
    policy,
    payload: { prompt: "classify" },
    resolveConsent: () => "granted",
    validateStructuredResult: (value) =>
      isRecord(value) && typeof value.categoryId === "string" && value.categoryId.length > 0,
  });
  assertEqual(
    classificationResult.status,
    "completed",
    "classification with a task validator is accepted",
  );
}

async function testSafeLogsOnlyExposeSafeMetadata(): Promise<void> {
  const events: SafeAiLogEvent[] = [];
  const provider = new CountingProvider(() => ({ text: "ok" }));
  const result = await runAiTask({
    provider,
    task: "assistant",
    context,
    policy,
    payload: { prompt: "card [masked-fixture]", fields: { merchant: "Demo" } },
    logger: (event) => events.push(event),
    resolveConsent: () => "granted",
  });

  assertEqual(result.status, "completed", "safe task completes");
  const completed = events.find((event) => event.code === "AI_PROVIDER_CALL_COMPLETED");
  assertEqual(typeof completed?.durationMs, "number", "duration is logged");
  assertEqual(completed?.result, "completed", "safe result is logged");
  assertEqual(
    events.some((event) => "prompt" in event),
    false,
    "prompt is absent from logs",
  );
  assertEqual(
    events.some((event) => "fields" in event),
    false,
    "fields are absent from logs",
  );
  assertEqual(
    events.some((event) => "organizationId" in event || "financialProfileId" in event),
    false,
    "tenant identifiers are absent from provider logs",
  );
}

class CountingProvider implements AiProvider {
  readonly id = "counting";
  readonly model = "counting-model";
  calls = 0;

  constructor(private readonly action: () => AiProviderResult) {}

  async complete(_request: SafeAiProviderRequest): Promise<AiProviderResult> {
    this.calls += 1;
    return this.action();
  }
}

function assertFailedInvalidResponse(
  result: Awaited<ReturnType<typeof runAiTask>>,
  label: string,
): void {
  assertEqual(result.status, "failed", label);

  if (result.status === "failed") {
    assertEqual(result.code, "AI_PROVIDER_INVALID_RESPONSE", `${label} code`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

async function runTests(): Promise<void> {
  await testConsentRecheckedImmediatelyBeforeCall();
  await testMissingConsentResolverBlocksBeforeCall();
  await testSanitizedEmptyPayloadBlocksBeforeCall();
  await testInvalidRetryPolicyBlocksBeforeCall();
  await testTypedTimeoutRetriesAndMapsResult();
  await testTypedTimeoutRetriesThenSucceeds();
  await testPermanentFailureDoesNotRetry();
  await testStructuredTasksFailClosed();
  await testStructuredTasksAcceptValidatedContracts();
  await testSafeLogsOnlyExposeSafeMetadata();
}

void runTests().catch((error: unknown) => {
  throw error;
});
