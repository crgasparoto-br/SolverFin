import {
  defaultAiUsagePolicy,
  OpenAiProvider,
  parseBankMessage,
  type AiHttpClient,
  type AiUsageContext,
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
  let outboundCalls = 0;
  let outboundBody: string | undefined;
  const httpClient: AiHttpClient = async (_url, init) => {
    outboundCalls += 1;
    outboundBody = init.body;
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
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
                }),
              },
            },
          ],
        });
      },
    };
  };
  const provider = new OpenAiProvider(
    {
      endpoint: "https://example.invalid/v1/chat/completions",
      apiKey: "fixture-api-key-0000000000000000",
      model: "fixture-v1",
      maxOutputTokens: 256,
      maxRequestBytes: 64_000,
      requestTimeoutMs: 1_000,
    },
    httpClient,
  );

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

  assertEqual(outboundCalls, 1, "one executor attempt must create one HTTP call");
  assertDefined(outboundBody, "provider HTTP body");
  assertEqual(result.sourceKind, "ai", "result source");
  assertEqual(result.status, "suggested", "result status");

  const serialized = outboundBody.toLocaleLowerCase("pt-BR");
  for (const forbidden of [
    text,
    sensitiveName,
    sensitivePurpose,
    sensitiveEmail,
    "Maria",
    "Silva",
    "almoco",
    "privado",
  ]) {
    assertEqual(
      serialized.includes(forbidden.toLocaleLowerCase("pt-BR")),
      false,
      `HTTP body must omit ${forbidden}`,
    );
  }
  assertEqual(serialized.includes("r$ 42,50"), true, "HTTP body keeps amount");
  assertEqual(serialized.includes("05/08/2026"), true, "HTTP body keeps date");
  assertEqual(serialized.includes("pagamento"), true, "HTTP body keeps financial signal");
  assertEqual(serialized.includes("[texto]"), true, "HTTP body marks redacted spans");
  assertEqual(
    countOccurrences(serialized, "r$ 42,50"),
    1,
    "message content must not be duplicated in prompt",
  );
}

function countOccurrences(value: string, search: string): number {
  return value.split(search).length - 1;
}

function assertDefined<T>(value: T | undefined, label: string): asserts value is T {
  if (value === undefined) throw new Error(`${label}: expected defined value`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
