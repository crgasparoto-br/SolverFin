import {
  defaultAiUsagePolicy,
  parseBankMessage,
  type AiProvider,
  type AiUsageContext,
  type SafeAiProviderRequest,
} from "./index.js";

const context: AiUsageContext = {
  organizationId: "org-minimization-a",
  financialProfileId: "profile-minimization-a",
  userId: "user-minimization-a",
  correlationId: "corr-minimization-1",
};

await testProviderReceivesOnlyMinimizedMessage();

async function testProviderReceivesOnlyMinimizedMessage(): Promise<void> {
  const sensitiveName = "Maria Silva";
  const sensitivePurpose = "almoco privado";
  const sensitiveEmail = "maria.silva@example.com";
  const text =
    `Pagamento de ${sensitivePurpose} para ${sensitiveName} ` +
    `email ${sensitiveEmail} no valor de R$ 42,50 em 05/08/2026`;
  let calls = 0;
  let captured: SafeAiProviderRequest | undefined;
  const provider: AiProvider = {
    id: "minimization-spy",
    model: "fixture-v1",
    async complete(request) {
      calls += 1;
      captured = request;
      return {
        text: "structured",
        structured: {
          amountMinor: 4250,
          currency: "BRL",
          occurredOn: "2026-08-05",
          type: "expense",
          confidence: 0.91,
          source: "bank_message",
          reasons: ["fixture"],
        },
      };
    },
  };

  const result = await parseBankMessage({
    text,
    provider,
    context,
    policy: {
      ...defaultAiUsagePolicy,
      consent: "granted",
      purpose: "bank_message_transaction_extraction",
      maxRetries: 0,
      allowRawFinancialText: false,
      allowedFieldNames: ["message"],
    },
    resolveConsent: () => "granted",
  });

  assertEqual(calls, 1, "one executor attempt must create one outbound call");
  assertDefined(captured, "provider request");
  assertEqual(result.sourceKind, "ai", "result source");
  assertEqual(result.status, "suggested", "result status");
  assertEqual(captured.prompt.includes(text), false, "prompt must not duplicate raw message");
  assertEqual(captured.prompt.includes(sensitiveName), false, "prompt must omit sensitive name");
  assertEqual(captured.prompt.includes(sensitivePurpose), false, "prompt must omit sensitive purpose");
  assertEqual(captured.prompt.includes(sensitiveEmail), false, "prompt must omit sensitive email");

  const minimized = String(captured.fields.message ?? "");
  for (const forbidden of [sensitiveName, sensitivePurpose, sensitiveEmail, "Maria", "Silva", "almoco", "privado"]) {
    assertEqual(
      minimized.toLocaleLowerCase("pt-BR").includes(forbidden.toLocaleLowerCase("pt-BR")),
      false,
      `minimized field must omit ${forbidden}`,
    );
  }
  assertEqual(minimized.includes("R$ 42,50"), true, "minimized field keeps amount");
  assertEqual(minimized.includes("05/08/2026"), true, "minimized field keeps date");
  assertEqual(
    minimized.toLocaleLowerCase("pt-BR").includes("pagamento"),
    true,
    "minimized field keeps financial signal",
  );
  assertEqual(minimized.includes("[texto]"), true, "minimized field marks redacted spans");
}

function assertDefined<T>(value: T | undefined, label: string): asserts value is T {
  if (value === undefined) throw new Error(`${label}: expected defined value`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
