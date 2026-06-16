import {
  defaultAiUsagePolicy,
  FakeAiProvider,
  parseBankMessage,
  type AiUsageContext,
  type SafeAiLogEvent,
} from "./index.js";

const context: AiUsageContext = {
  organizationId: "org-parser-a",
  financialProfileId: "profile-parser-a",
  userId: "user-parser-a",
  correlationId: "corr-parser-1",
};

const grantedPolicy = {
  ...defaultAiUsagePolicy,
  consent: "granted" as const,
  purpose: "bank message transaction extraction",
  maxPromptChars: 1000,
  maxRetries: 0,
  timeoutMs: 1000,
  allowRawFinancialText: false,
};

await testCardPurchaseRuleFixture();
await testPixReceivedRuleFixture();
await testAmbiguousRuleNeedsReview();
await testAiProviderValidStructuredOutput();
await testAiBlockedWithoutConsent();
await testAiInvalidOutputNeedsReview();

type ParserResult = Awaited<ReturnType<typeof parseBankMessage>>;

async function testCardPurchaseRuleFixture(): Promise<void> {
  const result = await parseBankMessage({
    text: "Banco Azul: compra aprovada no cartao final 1234 em Mercado Demo R$ 42,50 em 16/06/2026",
  });

  assertEqual(result.status, "suggested", "card rule status");
  assertEqual(result.sourceKind, "rule", "card rule source");
  assertSuggestion(result);
  assertEqual(result.suggestion.amountMinor, 4250, "card amount");
  assertEqual(result.suggestion.currency, "BRL", "card currency");
  assertEqual(result.suggestion.occurredOn, "2026-06-16", "card date");
  assertEqual(result.suggestion.type, "expense", "card type");
  assertEqual(result.suggestion.merchant, "Mercado Demo", "card merchant");
  assertEqual(result.suggestion.cardHint, "final 1234", "card hint");
  assertEqual(result.suggestion.ruleId, "card_purchase_v1", "card rule id");
  assertEqual(result.maskedText.includes("1234"), true, "masked text keeps last card digits");
}

async function testPixReceivedRuleFixture(): Promise<void> {
  const result = await parseBankMessage({
    text: "Banco Verde informa: Pix recebido de Cliente Demo em 2026-06-16 no valor de R$ 100,00",
  });

  assertEqual(result.status, "suggested", "pix received status");
  assertSuggestion(result);
  assertEqual(result.suggestion.type, "income", "pix received type");
  assertEqual(result.suggestion.amountMinor, 10000, "pix received amount");
  assertEqual(result.suggestion.merchant, "Cliente Demo", "pix received merchant");
  assertEqual(result.suggestion.ruleId, "pix_received_v1", "pix received rule id");
}

async function testAmbiguousRuleNeedsReview(): Promise<void> {
  const result = await parseBankMessage({
    text: "Banco Roxo: compra aprovada no cartao final 9876 em Padaria Demo R$ 18,90",
  });

  assertEqual(result.status, "needs_review", "ambiguous status");
  assertEqual(result.sourceKind, "rule", "ambiguous source");
  assertEqual(result.code, "BANK_MESSAGE_RULE_NEEDS_REVIEW", "ambiguous code");
  assertProblem(result, "EXTRACTION_DATE_REQUIRED");
  assertEqual(result.suggestion, undefined, "ambiguous suggestion absent");
}

async function testAiProviderValidStructuredOutput(): Promise<void> {
  const events: SafeAiLogEvent[] = [];
  const provider = new FakeAiProvider([
    {
      text: "structured",
      structured: {
        amount: "77,10",
        currency: "brl",
        occurredOn: "2026-06-16",
        type: "expense",
        merchant: "Farmacia Demo",
        accountHint: "Conta principal",
        categorySuggestion: "Saude",
        confidence: 0.88,
        source: "bank_message",
        reasons: ["IA identificou valor, data e estabelecimento em fixture ficticia."],
      },
    },
  ]);

  const result = await parseBankMessage({
    text: "Aviso: pagamento identificado em Farmacia Demo, valor setenta e sete reais em 16/06/2026",
    provider,
    context,
    policy: grantedPolicy,
    logger: (event) => events.push(event),
  });

  assertEqual(result.status, "suggested", "ai status");
  assertEqual(result.sourceKind, "ai", "ai source");
  assertSuggestion(result);
  assertEqual(result.suggestion.amountMinor, 7710, "ai amount");
  assertEqual(result.suggestion.providerId, "fake", "ai provider id");
  assertEqual(result.suggestion.model, "fake-local", "ai model");
  assertEqual(
    events.some((event) => "prompt" in event),
    false,
    "safe parser logs omit prompt",
  );
}

async function testAiBlockedWithoutConsent(): Promise<void> {
  const provider = new FakeAiProvider([{ text: "never used" }]);
  const result = await parseBankMessage({
    text: "Mensagem nao reconhecida com conta 123456789 e documento 12345678909",
    provider,
    context,
    policy: { ...grantedPolicy, consent: "revoked" },
  });

  assertEqual(result.status, "needs_review", "blocked status");
  assertEqual(result.code, "BANK_MESSAGE_AI_BLOCKED", "blocked code");
  assertEqual(result.maskedText.includes("12345678909"), false, "blocked masked document");
}

async function testAiInvalidOutputNeedsReview(): Promise<void> {
  const provider = new FakeAiProvider([{ text: "nao e json" }]);
  const result = await parseBankMessage({
    text: "Mensagem bancaria fora dos padroes conhecidos",
    provider,
    context,
    policy: grantedPolicy,
  });

  assertEqual(result.status, "needs_review", "invalid ai status");
  assertEqual(result.code, "BANK_MESSAGE_AI_INVALID_OUTPUT", "invalid ai code");
  assertProblem(result, "EXTRACTION_NOT_OBJECT");
}

function assertSuggestion(
  result: ParserResult,
): asserts result is ParserResult & { suggestion: NonNullable<ParserResult["suggestion"]> } {
  if (!result.suggestion) {
    throw new Error("Expected parser suggestion.");
  }
}

function assertProblem(result: ParserResult, code: string): void {
  if (!result.problems.some((problem) => problem.code === code)) {
    throw new Error(`Expected parser problem ${code}.`);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
