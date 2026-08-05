import {
  AiProviderError,
  OpenAiProvider,
  defaultAiUsagePolicy,
  runAiTask,
  type AiHttpClient,
  type AiHttpResponse,
  type AiProvider,
  type AiProviderResult,
  type AiTaskKind,
  type SafeAiLogEvent,
  type SafeAiProviderRequest,
} from "./index.js";

const context = {
  organizationId: "org-provider-regression",
  financialProfileId: "profile-provider-regression",
  correlationId: "corr-provider-regression",
};

async function testLoggerFailureDoesNotAlterSuccessfulCall(): Promise<void> {
  for (const failingCode of ["AI_PROVIDER_CALL_STARTED", "AI_PROVIDER_CALL_COMPLETED"]) {
    const provider = new CountingProvider(() => ({ text: "ok" }));
    const result = await runAiTask({
      provider,
      task: "assistant",
      context,
      policy: policyFor("assistant"),
      payload: { prompt: "safe prompt", fields: { question: "safe question" } },
      resolveConsent: () => "granted",
      logger: throwingLogger(failingCode),
    });

    assertEqual(result.status, "completed", `${failingCode} preserves success`);
    assertEqual(provider.calls, 1, `${failingCode} preserves one outbound call`);

    if (result.status === "completed") {
      assertEqual(result.attempts, 1, `${failingCode} preserves one attempt`);
    }
  }
}

async function testLoggerFailureDoesNotRetryInvalidResponse(): Promise<void> {
  const provider = new CountingProvider(() => ({ text: "" }));
  const result = await runAiTask({
    provider,
    task: "assistant",
    context,
    policy: policyFor("assistant"),
    payload: { prompt: "safe prompt", fields: { question: "safe question" } },
    resolveConsent: () => "granted",
    logger: throwingLogger("AI_PROVIDER_INVALID_RESPONSE"),
  });

  assertEqual(result.status, "failed", "invalid response remains controlled");
  assertEqual(provider.calls, 1, "invalid response is not retried after logger failure");

  if (result.status === "failed") {
    assertEqual(result.code, "AI_PROVIDER_INVALID_RESPONSE", "invalid response code is preserved");
    assertEqual(result.attempts, 1, "invalid response attempt count is preserved");
  }
}

async function testLoggerFailureDoesNotEscapeProviderFailure(): Promise<void> {
  const provider = new CountingProvider(() => {
    throw new AiProviderError("permanent", "rejected", { retryable: false });
  });
  const result = await runAiTask({
    provider,
    task: "assistant",
    context,
    policy: policyFor("assistant"),
    payload: { prompt: "safe prompt", fields: { question: "safe question" } },
    resolveConsent: () => "granted",
    logger: throwingLogger("AI_PROVIDER_CALL_FAILED"),
  });

  assertEqual(result.status, "failed", "provider failure remains controlled");
  assertEqual(provider.calls, 1, "permanent provider failure is not retried");

  if (result.status === "failed") {
    assertEqual(result.code, "AI_PROVIDER_ERROR", "provider failure code is preserved");
    assertEqual(result.attempts, 1, "provider failure attempt count is preserved");
  }
}

async function testRejectedAsyncLoggerIsContained(): Promise<void> {
  const provider = new CountingProvider(() => ({ text: "ok" }));
  const result = await runAiTask({
    provider,
    task: "assistant",
    context,
    policy: policyFor("assistant"),
    payload: { prompt: "safe prompt", fields: { question: "safe question" } },
    resolveConsent: () => "granted",
    logger: async () => {
      throw new Error("async logger unavailable");
    },
  });

  assertEqual(result.status, "completed", "async logger rejection preserves success");
  assertEqual(provider.calls, 1, "async logger rejection preserves one outbound call");
  await Promise.resolve();
}

async function testTextTaskPromptsForbidStructuredOutput(): Promise<void> {
  for (const task of ["summary", "assistant"] as const) {
    let capturedBody = "";
    const client: AiHttpClient = async (_url, init) => {
      capturedBody = init.body;
      return response(200, JSON.stringify({ choices: [{ message: { content: "plain text" } }] }));
    };
    const provider = new OpenAiProvider(
      {
        endpoint: "https://api.example.invalid/v1/chat/completions",
        apiKey: "test-key-that-is-long-enough",
        model: "test-model",
        maxOutputTokens: 200,
        maxRequestBytes: 16_384,
        requestTimeoutMs: 100,
      },
      client,
    );

    await provider.complete(requestFor(task));
    const systemPrompt = readSystemPrompt(capturedBody);
    assertEqual(
      systemPrompt.includes("Structured output is invalid for this task."),
      true,
      `${task} prompt rejects structured output`,
    );
    assertEqual(
      systemPrompt.includes("optional structured output"),
      false,
      `${task} prompt does not advertise structured output`,
    );
  }
}

async function testTextTasksRejectStructuredProviderResults(): Promise<void> {
  for (const task of ["summary", "assistant"] as const) {
    const provider = new CountingProvider(() => ({
      text: "text result",
      structured: { unexpected: true },
    }));
    const result = await runAiTask({
      provider,
      task,
      context,
      policy: policyFor(task),
      payload: payloadFor(task),
      resolveConsent: () => "granted",
    });

    assertEqual(result.status, "failed", `${task} rejects structured output`);
    assertEqual(provider.calls, 1, `${task} invalid output is not retried`);

    if (result.status === "failed") {
      assertEqual(result.code, "AI_PROVIDER_INVALID_RESPONSE", `${task} uses controlled code`);
      assertEqual(result.attempts, 1, `${task} reports one attempt`);
    }
  }
}

function policyFor(task: "summary" | "assistant") {
  return {
    ...defaultAiUsagePolicy,
    consent: "granted" as const,
    purpose: `provider runtime regression for ${task}`,
    maxRetries: 1,
    timeoutMs: 100,
    allowedFieldNames: task === "summary" ? ["periodStart"] : ["question"],
  };
}

function payloadFor(task: "summary" | "assistant") {
  return task === "summary"
    ? { prompt: "summarize", fields: { periodStart: "2026-08-01" } }
    : { prompt: "answer", fields: { question: "safe question" } };
}

function requestFor(task: "summary" | "assistant"): SafeAiProviderRequest {
  return {
    task,
    purpose: `test ${task} output contract`,
    prompt: "safe prompt",
    fields: task === "summary" ? { periodStart: "2026-08-01" } : { question: "safe" },
    timeoutMs: 100,
  };
}

function throwingLogger(failingCode: string): (event: SafeAiLogEvent) => void {
  return (event) => {
    if (event.code === failingCode) {
      throw new Error(`logger failure at ${failingCode}`);
    }
  };
}

function readSystemPrompt(rawBody: string): string {
  const body: unknown = JSON.parse(rawBody);

  if (!isRecord(body) || !Array.isArray(body.messages)) {
    throw new Error("request body is missing messages");
  }

  const systemMessage = body.messages[0];

  if (!isRecord(systemMessage) || typeof systemMessage.content !== "string") {
    throw new Error("request body is missing the system prompt");
  }

  return systemMessage.content;
}

function response(status: number, body: string): AiHttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return body;
    },
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

async function runTests(): Promise<void> {
  await testLoggerFailureDoesNotAlterSuccessfulCall();
  await testLoggerFailureDoesNotRetryInvalidResponse();
  await testLoggerFailureDoesNotEscapeProviderFailure();
  await testRejectedAsyncLoggerIsContained();
  await testTextTaskPromptsForbidStructuredOutput();
  await testTextTasksRejectStructuredProviderResults();
}

await runTests();
