import {
  AiProviderError,
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

async function testSanitizedEmptyPayloadBlocksBeforeCall(): Promise<void> {
  const provider = new CountingProvider(() => ({ text: "not called" }));
  const result = await runAiTask({
    provider,
    task: "extraction",
    context,
    policy,
    payload: { prompt: "", fields: { rawMessage: "must be omitted" } },
  });

  assertEqual(result.status, "blocked", "empty sanitized payload is blocked");

  if (result.status === "blocked") {
    assertEqual(result.code, "AI_PAYLOAD_EMPTY", "empty payload has controlled code");
  }

  assertEqual(provider.calls, 0, "empty payload does not call provider");
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
  });

  assertEqual(result.status, "failed", "permanent failure is controlled");

  if (result.status === "failed") {
    assertEqual(result.code, "AI_PROVIDER_ERROR", "permanent failure mapping");
    assertEqual(result.attempts, 1, "permanent failure is not retried");
  }

  assertEqual(provider.calls, 1, "permanent failure performs one outbound attempt");
}

async function testSafeLogsOnlyExposeSafeMetadata(): Promise<void> {
  const events: SafeAiLogEvent[] = [];
  const provider = new CountingProvider(() => ({ text: "ok" }));
  const result = await runAiTask({
    provider,
    task: "extraction",
    context,
    policy,
    payload: { prompt: "card 4111111111111111", fields: { merchant: "Demo" } },
    logger: (event) => events.push(event),
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

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

await testConsentRecheckedImmediatelyBeforeCall();
await testSanitizedEmptyPayloadBlocksBeforeCall();
await testTypedTimeoutRetriesAndMapsResult();
await testTypedTimeoutRetriesThenSucceeds();
await testPermanentFailureDoesNotRetry();
await testSafeLogsOnlyExposeSafeMetadata();
