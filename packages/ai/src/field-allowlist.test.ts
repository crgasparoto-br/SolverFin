import {
  AI_TASK_ALLOWED_FIELD_NAMES,
  defaultAiUsagePolicy,
  runAiTask,
  type AiProvider,
  type AiProviderResult,
  type AiTaskKind,
  type AiUsagePolicy,
  type SafeAiProviderRequest,
} from "./index.js";

const context = {
  organizationId: "org-allowlist-test",
  financialProfileId: "profile-allowlist-test",
  correlationId: "corr-allowlist-test",
};

async function blocksInvalidAllowlists(): Promise<void> {
  const missing = validPolicy() as Partial<AiUsagePolicy>;
  delete missing.allowedFieldNames;

  await expectBlocked(missing as AiUsagePolicy);
  await expectBlocked(validPolicy([]));
}

async function blocksUnknownTask(): Promise<void> {
  const provider = new RecordingProvider(() => ({ text: "unused" }));
  const result = await runAiTask({
    provider,
    task: "unsupported" as AiTaskKind,
    context,
    policy: validPolicy(),
    payload: {
      prompt: "safe prompt",
      fields: { question: "safe" },
    },
  });

  assertBlocked(result);
  assertEqual(provider.requests.length, 0, "unknown task outbound count");
}

async function filtersEveryTask(): Promise<void> {
  const tasks = Object.keys(AI_TASK_ALLOWED_FIELD_NAMES) as AiTaskKind[];

  for (const task of tasks) {
    const provider = new RecordingProvider(() => responseFor(task));
    const allowed = AI_TASK_ALLOWED_FIELD_NAMES[task][0];
    assertTruthy(allowed, `${task} registered field`);

    const result = await runAiTask({
      provider,
      task,
      context,
      policy: validPolicy([
        allowed,
        "customerEmail",
        "internalScore",
        "isVip",
      ]),
      payload: {
        prompt: `safe ${task} prompt`,
        fields: {
          [allowed]: safeValueFor(allowed),
          customerEmail: "customer@example.test",
          internalScore: 87,
          isVip: true,
        },
      },
      validateStructuredResult: isRecord,
    });

    assertEqual(result.status, "completed", `${task} status`);
    assertEqual(provider.requests.length, 1, `${task} outbound count`);

    const request = provider.requests[0];
    assertTruthy(request, `${task} request`);
    assertJsonEqual(Object.keys(request.fields), [allowed], `${task} fields`);
    assertOmitted(request, "customerEmail", `${task} string field`);
    assertOmitted(request, "internalScore", `${task} numeric field`);
    assertOmitted(request, "isVip", `${task} boolean field`);
  }
}

async function expectBlocked(policy: AiUsagePolicy): Promise<void> {
  const provider = new RecordingProvider(() => ({ text: "unused" }));
  const result = await runAiTask({
    provider,
    task: "assistant",
    context,
    policy,
    payload: { prompt: "safe prompt" },
  });

  assertBlocked(result);
  assertEqual(provider.requests.length, 0, "invalid policy outbound count");
}

function validPolicy(
  allowedFieldNames: readonly string[] = ["question"],
): AiUsagePolicy {
  return {
    ...defaultAiUsagePolicy,
    consent: "granted",
    purpose: "allowlist policy validation",
    maxRetries: 0,
    allowedFieldNames,
  };
}

function responseFor(task: AiTaskKind): AiProviderResult {
  if (task === "extraction") {
    return {
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
    };
  }

  if (task === "classification") {
    return {
      text: "classified",
      structured: { categoryId: "category-demo" },
    };
  }

  return { text: "safe result" };
}

function safeValueFor(field: string): string | number {
  return field.endsWith("Minor") ? 1500 : `safe-${field}`;
}

function isRecord(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class RecordingProvider implements AiProvider {
  readonly id = "recording";
  readonly model = "recording-model";
  readonly requests: SafeAiProviderRequest[] = [];

  constructor(private readonly response: () => AiProviderResult) {}

  async complete(
    request: SafeAiProviderRequest,
  ): Promise<AiProviderResult> {
    this.requests.push(request);
    return this.response();
  }
}

function assertBlocked(result: Awaited<ReturnType<typeof runAiTask>>): void {
  assertEqual(result.status, "blocked", "invalid policy status");
  const code = result.status === "blocked" ? result.code : undefined;
  assertEqual(code, "AI_POLICY_INVALID", "invalid policy code");
}

function assertOmitted(
  request: SafeAiProviderRequest,
  field: string,
  label: string,
): void {
  assertEqual(Object.hasOwn(request.fields, field), false, `${label} omitted`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    const message = `${label}: expected ${String(expected)}, got ${String(actual)}`;
    throw new Error(message);
  }
}

function assertTruthy<T>(
  value: T,
  label: string,
): asserts value is NonNullable<T> {
  if (!value) {
    throw new Error(`${label}: expected truthy value`);
  }
}

function assertJsonEqual(
  actual: unknown,
  expected: unknown,
  label: string,
): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    const message = `${label}: expected ${expectedJson}, got ${actualJson}`;
    throw new Error(message);
  }
}

await blocksInvalidAllowlists();
await blocksUnknownTask();
await filtersEveryTask();
