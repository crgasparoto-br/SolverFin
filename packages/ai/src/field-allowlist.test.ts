import {
  AI_TASK_ALLOWED_FIELD_NAMES,
  defaultAiUsagePolicy,
  runAiTask,
  type AiProvider,
  type AiProviderResult,
  type AiTaskKind,
  type SafeAiProviderRequest,
} from "./index.js";

const context = {
  organizationId: "org-allowlist-test",
  financialProfileId: "profile-allowlist-test",
  correlationId: "corr-allowlist-test",
};

async function blocksMissingAndEmptyAllowlist(): Promise<void> {
  for (const allowedFieldNames of [undefined, []] as const) {
    const provider = new RecordingProvider(() => ({ text: "not called" }));
    const basePolicy = {
      ...defaultAiUsagePolicy,
      consent: "granted" as const,
      purpose: "allowlist policy validation",
      maxRetries: 0,
    };
    const policy =
      allowedFieldNames === undefined
        ? (({ allowedFieldNames: _omitted, ...rest }) => rest)(basePolicy)
        : { ...basePolicy, allowedFieldNames };
    const result = await runAiTask({
      provider,
      task: "assistant",
      context,
      policy: policy as typeof defaultAiUsagePolicy,
      payload: { prompt: "safe prompt" },
    });

    assertEqual(result.status, "blocked", "missing or empty allowlist blocks");
    if (result.status === "blocked") {
      assertEqual(result.code, "AI_POLICY_INVALID", "invalid allowlist code");
    }
    assertEqual(
      provider.requests.length,
      0,
      "invalid allowlist prevents outbound",
    );
  }
}

async function blocksUnregisteredTaskPolicy(): Promise<void> {
  const provider = new RecordingProvider(() => ({ text: "not called" }));
  const result = await runAiTask({
    provider,
    task: "unsupported" as AiTaskKind,
    context,
    policy: {
      ...defaultAiUsagePolicy,
      consent: "granted",
      purpose: "unregistered task policy",
      maxRetries: 0,
      allowedFieldNames: ["question"],
    },
    payload: { prompt: "safe prompt", fields: { question: "safe" } },
  });

  assertEqual(result.status, "blocked", "unregistered task blocks");
  if (result.status === "blocked") {
    assertEqual(result.code, "AI_POLICY_INVALID", "unregistered task code");
  }
  assertEqual(
    provider.requests.length,
    0,
    "unregistered task prevents outbound",
  );
}

async function filtersUnauthorizedFieldsForEveryTask(): Promise<void> {
  for (const task of Object.keys(AI_TASK_ALLOWED_FIELD_NAMES) as AiTaskKind[]) {
    const provider = new RecordingProvider(() => responseFor(task));
    const registeredField = AI_TASK_ALLOWED_FIELD_NAMES[task][0];
    assertTruthy(registeredField, `${task} has a registered field policy`);

    const result = await runAiTask({
      provider,
      task,
      context,
      policy: {
        ...defaultAiUsagePolicy,
        consent: "granted",
        purpose: `${task} allowlist enforcement`,
        maxRetries: 0,
        allowedFieldNames: [
          registeredField,
          "customerEmail",
          "internalScore",
          "isVip",
        ],
      },
      payload: {
        prompt: `safe ${task} prompt`,
        fields: {
          [registeredField]: safeValueFor(registeredField),
          customerEmail: "customer@example.test",
          internalScore: 87,
          isVip: true,
        },
      },
      ...(task === "classification"
        ? {
            validateStructuredResult: (value: unknown) =>
              typeof value === "object" &&
              value !== null &&
              !Array.isArray(value),
          }
        : {}),
    });

    assertEqual(
      result.status,
      "completed",
      `${task} completes with registered field`,
    );
    assertEqual(
      provider.requests.length,
      1,
      `${task} performs one outbound request`,
    );

    const request = provider.requests[0];
    assertTruthy(request, `${task} request exists`);
    assertJsonEqual(
      Object.keys(request.fields),
      [registeredField],
      `${task} sends only registered field`,
    );
    assertEqual(
      Object.hasOwn(request.fields, "customerEmail"),
      false,
      `${task} omits string field`,
    );
    assertEqual(
      Object.hasOwn(request.fields, "internalScore"),
      false,
      `${task} omits numeric field`,
    );
    assertEqual(
      Object.hasOwn(request.fields, "isVip"),
      false,
      `${task} omits boolean field`,
    );
  }
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
    return { text: "classified", structured: { categoryId: "category-demo" } };
  }

  return { text: "safe result" };
}

function safeValueFor(field: string): string | number {
  return field.endsWith("Minor") ? 1500 : `safe-${field}`;
}

class RecordingProvider implements AiProvider {
  readonly id = "recording";
  readonly model = "recording-model";
  readonly requests: SafeAiProviderRequest[] = [];

  constructor(private readonly response: () => AiProviderResult) {}

  async complete(request: SafeAiProviderRequest): Promise<AiProviderResult> {
    this.requests.push(request);
    return this.response();
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, got ${String(actual)}`,
    );
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
    throw new Error(`${label}: expected ${expectedJson}, got ${actualJson}`);
  }
}

await blocksMissingAndEmptyAllowlist();
await blocksUnregisteredTaskPolicy();
await filtersUnauthorizedFieldsForEveryTask();
