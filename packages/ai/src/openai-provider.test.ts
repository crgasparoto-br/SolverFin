import {
  AiProviderConfigurationError,
  OpenAiProvider,
  createAiProviderFromEnvironment,
  inspectAiProviderConfiguration,
  loadOpenAiProviderConfig,
  type AiHttpClient,
  type AiHttpResponse,
  type OpenAiProviderConfig,
} from "./openai-provider.js";
import { AiProviderError } from "./provider-errors.js";
import {
  defaultAiUsagePolicy,
  runAiTask,
  type SafeAiProviderRequest,
} from "./index.js";

const config: OpenAiProviderConfig = {
  endpoint: "https://api.example.invalid/v1/chat/completions",
  apiKey: "test-key-that-is-long-enough",
  model: "test-model",
  maxOutputTokens: 400,
  maxRequestBytes: 16_384,
  requestTimeoutMs: 100,
};
const request: SafeAiProviderRequest = {
  task: "classification",
  purpose: "classify a fictitious transaction",
  prompt: "Classify this purchase.",
  fields: { merchant: "Demo Market", amountMinor: 1500 },
  correlationId: "corr-provider-test",
  timeoutMs: 50,
};

await testDisabledByDefault();
await testEnabledConfigurationIsValidatedWithoutSecretExposure();
await testHealthIsConfigurationOnly();
await testSuccessfulCallUsesOneOutboundRequest();
await testRateLimitRetriesThenSucceeds();
await testRateLimitAndUnavailableMapping();
await testTimeoutMapping();
await testInvalidCredentialIsPermanent();
await testInvalidEmptyAndPermanentResponses();
await testRequestByteLimitBlocksBeforeNetwork();

async function testDisabledByDefault(): Promise<void> {
  assertEqual(
    loadOpenAiProviderConfig({}),
    undefined,
    "provider defaults to disabled",
  );
  const selection = createAiProviderFromEnvironment({});
  assertEqual(selection.status, "disabled", "disabled selection");
}

async function testEnabledConfigurationIsValidatedWithoutSecretExposure(): Promise<void> {
  const secret = "real-looking-secret-value-not-for-logs";

  try {
    loadOpenAiProviderConfig({
      AI_PROVIDER: "openai",
      AI_OPENAI_API_KEY: secret,
    });
    throw new Error("Expected invalid provider configuration.");
  } catch (error) {
    if (!(error instanceof AiProviderConfigurationError)) {
      throw error;
    }

    assertEqual(
      error.message.includes(secret),
      false,
      "configuration error hides secret",
    );
    assertEqual(
      error.variableNames.includes("AI_OPENAI_MODEL"),
      true,
      "missing model is named",
    );
    assertEqual(
      error.variableNames.includes("AI_OPENAI_ENDPOINT"),
      true,
      "missing endpoint is named",
    );
  }
}

async function testHealthIsConfigurationOnly(): Promise<void> {
  const health = inspectAiProviderConfiguration(validEnvironment());
  assertEqual(health.status, "ready", "valid configuration is ready");

  if (health.status === "ready") {
    assertEqual(health.model, "test-model", "health exposes model");
    assertEqual("apiKey" in health, false, "health does not expose credential");
  }
}

async function testSuccessfulCallUsesOneOutboundRequest(): Promise<void> {
  let calls = 0;
  let capturedBody = "";
  let capturedAuthorization = "";
  const client: AiHttpClient = async (_url, init) => {
    calls += 1;
    capturedBody = init.body;
    capturedAuthorization = init.headers.authorization ?? "";

    return response(
      200,
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                text: "Category suggested",
                structured: { category: "groceries" },
                confidence: 0.92,
              }),
            },
          },
        ],
      }),
    );
  };
  const provider = new OpenAiProvider(config, client);
  const result = await provider.complete(request);

  assertEqual(calls, 1, "OUTBOUND-COUNT-001 success uses one request");
  assertEqual(result.text, "Category suggested", "response text parsed");
  assertEqual(result.confidence, 0.92, "confidence parsed");
  assertEqual(
    capturedAuthorization,
    `Bearer ${config.apiKey}`,
    "credential sent only in header",
  );
  assertEqual(capturedBody.includes(request.purpose), true, "purpose sent");
  assertEqual(
    capturedBody.includes("rawMessage"),
    false,
    "no undeclared field added",
  );
}

async function testRateLimitRetriesThenSucceeds(): Promise<void> {
  let calls = 0;
  const client: AiHttpClient = async () => {
    calls += 1;

    if (calls === 1) {
      return response(429, "{}");
    }

    return response(
      200,
      JSON.stringify({ choices: [{ message: { content: "recovered" } }] }),
    );
  };
  const provider = new OpenAiProvider(config, client);
  const result = await runAiTask({
    provider,
    task: "classification",
    context: {
      organizationId: "org-test",
      financialProfileId: "profile-test",
    },
    policy: {
      ...defaultAiUsagePolicy,
      consent: "granted",
      purpose: "retry rate limited request",
      maxRetries: 1,
      timeoutMs: 100,
      allowedFieldNames: ["merchant"],
    },
    payload: { prompt: "Classify.", fields: { merchant: "Demo Market" } },
  });

  assertEqual(result.status, "completed", "rate limit retry can recover");
  assertEqual(
    calls,
    2,
    "OUTBOUND-COUNT-001 retry uses one request per attempt",
  );

  if (result.status === "completed") {
    assertEqual(result.attempts, 2, "rate limit recovery reports two attempts");
  }
}

async function testRateLimitAndUnavailableMapping(): Promise<void> {
  await assertProviderError(429, "rate_limited", true);
  await assertProviderError(503, "unavailable", true);
}

async function testTimeoutMapping(): Promise<void> {
  let calls = 0;
  const client: AiHttpClient = async (_url, init) => {
    calls += 1;

    return await new Promise<AiHttpResponse>((_resolve, reject) => {
      init.signal.addEventListener(
        "abort",
        () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        { once: true },
      );
    });
  };
  const provider = new OpenAiProvider(
    { ...config, requestTimeoutMs: 5 },
    client,
  );

  try {
    await provider.complete({ ...request, timeoutMs: 5 });
    throw new Error("Expected timeout.");
  } catch (error) {
    assertAiProviderError(error, "timeout", true);
  }

  assertEqual(calls, 1, "OUTBOUND-COUNT-001 timeout uses one request");
}

async function testInvalidCredentialIsPermanent(): Promise<void> {
  await assertProviderError(401, "permanent", false);
}

async function testInvalidEmptyAndPermanentResponses(): Promise<void> {
  let invalidJsonCalls = 0;
  const invalidProvider = new OpenAiProvider(config, async () => {
    invalidJsonCalls += 1;
    return response(200, "not-json");
  });

  try {
    await invalidProvider.complete(request);
    throw new Error("Expected invalid response.");
  } catch (error) {
    assertAiProviderError(error, "invalid_response", false);
  }

  assertEqual(
    invalidJsonCalls,
    1,
    "OUTBOUND-COUNT-001 invalid JSON uses one request",
  );

  let emptyCalls = 0;
  const emptyProvider = new OpenAiProvider(config, async () => {
    emptyCalls += 1;
    return response(
      200,
      JSON.stringify({ choices: [{ message: { content: "" } }] }),
    );
  });

  try {
    await emptyProvider.complete(request);
    throw new Error("Expected empty response rejection.");
  } catch (error) {
    assertAiProviderError(error, "invalid_response", false);
  }

  assertEqual(
    emptyCalls,
    1,
    "OUTBOUND-COUNT-001 empty response uses one request",
  );
  await assertProviderError(400, "permanent", false);
}

async function testRequestByteLimitBlocksBeforeNetwork(): Promise<void> {
  let calls = 0;
  const provider = new OpenAiProvider(
    { ...config, maxRequestBytes: 10 },
    async () => {
      calls += 1;
      return response(200, "{}");
    },
  );

  try {
    await provider.complete(request);
    throw new Error("Expected request size rejection.");
  } catch (error) {
    assertAiProviderError(error, "permanent", false);
  }

  assertEqual(calls, 0, "oversized request is rejected before network");
}

async function assertProviderError(
  status: number,
  kind: AiProviderError["kind"],
  retryable: boolean,
): Promise<void> {
  let calls = 0;
  const provider = new OpenAiProvider(config, async () => {
    calls += 1;
    return response(status, "{}");
  });

  try {
    await provider.complete(request);
    throw new Error(`Expected provider error ${kind}.`);
  } catch (error) {
    assertAiProviderError(error, kind, retryable);
  }

  assertEqual(calls, 1, `OUTBOUND-COUNT-001 ${kind} uses one request`);
}

function assertAiProviderError(
  error: unknown,
  kind: AiProviderError["kind"],
  retryable: boolean,
): void {
  if (!(error instanceof AiProviderError)) {
    throw error;
  }

  assertEqual(error.kind, kind, `${kind} kind`);
  assertEqual(error.retryable, retryable, `${kind} retryable`);
}

function validEnvironment(): Record<string, string> {
  return {
    AI_PROVIDER: "openai",
    AI_OPENAI_ENDPOINT: config.endpoint,
    AI_OPENAI_API_KEY: config.apiKey,
    AI_OPENAI_MODEL: config.model,
    AI_OPENAI_MAX_OUTPUT_TOKENS: String(config.maxOutputTokens),
    AI_OPENAI_MAX_REQUEST_BYTES: String(config.maxRequestBytes),
    AI_OPENAI_REQUEST_TIMEOUT_MS: String(config.requestTimeoutMs),
  };
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

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}
