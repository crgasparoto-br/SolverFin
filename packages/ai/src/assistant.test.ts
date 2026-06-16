import assert from "node:assert/strict";

import {
  answerFinancialQuestion,
  classifyFinancialAssistantIntent,
  defaultAiUsagePolicy,
  FakeAiProvider,
  type AvailabilityCalculationResult,
  type AiUsageContext,
} from "./index.js";

const context: AiUsageContext = {
  organizationId: "org-assistant-a",
  financialProfileId: "profile-assistant-a",
  userId: "user-assistant-a",
  correlationId: "corr-assistant-a",
};

const grantedPolicy = {
  ...defaultAiUsagePolicy,
  consent: "granted" as const,
  purpose: "financial assistant",
  maxPromptChars: 1000,
  maxRetries: 0,
  timeoutMs: 1000,
  allowRawFinancialText: false,
};

await dailyAvailabilityUsesStructuredCalculation();
await dailyAvailabilityDoesNotInventWithoutService();
await assistantBlocksWithoutConsent();
await providerAnswersNonAvailabilityQuestionWithMock();
intentClassifierRecognizesSupportedQuestions();

async function dailyAvailabilityUsesStructuredCalculation(): Promise<void> {
  const availability: AvailabilityCalculationResult = {
    availableTodayMinor: 12450,
    currency: "BRL",
    horizonStartOn: "2026-06-16",
    horizonEndOn: "2026-06-30",
    confidence: "high",
    components: [
      {
        label: "Saldo atual",
        kind: "balance",
        amountMinor: 50000,
        confidence: "high",
        source: "availability_service",
      },
      {
        label: "Fatura prevista",
        kind: "card",
        amountMinor: -28000,
        confidence: "high",
        source: "cards",
      },
      {
        label: "Mercado recorrente inferido",
        kind: "inferred",
        amountMinor: -7550,
        confidence: "medium",
        source: "recurrence_inference",
      },
    ],
    assumptions: ["Horizonte ate o fim do mes.", "Margem de seguranca aplicada."],
    limitations: ["Gastos futuros nao previstos podem alterar o valor."],
    calculatedAt: "2026-06-16T12:00:00.000Z",
  };

  const answer = await answerFinancialQuestion({
    question: "Quanto posso gastar hoje?",
    context,
    policy: grantedPolicy,
    availability,
  });

  assert.equal(answer.status, "answered");
  assert.equal(answer.intent, "daily_availability");
  assert.equal(answer.confidence, "high");
  assert.equal(answer.period?.startOn, "2026-06-16");
  assert.equal(answer.sources.includes("cards"), true);
  assert.match(answer.answer, /R\$\s*124,50/);
  assert.match(answer.answer, /Fatura prevista/);
}

async function dailyAvailabilityDoesNotInventWithoutService(): Promise<void> {
  const answer = await answerFinancialQuestion({
    question: "Quanto posso gastar hoje?",
    context,
    policy: grantedPolicy,
  });

  assert.equal(answer.status, "needs_review");
  assert.equal(answer.intent, "daily_availability");
  assert.equal(answer.safeLogCode, "ASSISTANT_AVAILABILITY_SERVICE_MISSING");
  assert.match(answer.answer, /nao vou estimar/i);
}

async function assistantBlocksWithoutConsent(): Promise<void> {
  const answer = await answerFinancialQuestion({
    question: "Resuma meus gastos do mes",
    context,
    policy: { ...grantedPolicy, consent: "revoked" },
  });

  assert.equal(answer.status, "blocked");
  assert.equal(answer.safeLogCode, "ASSISTANT_CONSENT_REQUIRED");
}

async function providerAnswersNonAvailabilityQuestionWithMock(): Promise<void> {
  const provider = new FakeAiProvider([
    {
      text: "No periodo autorizado, a maior variacao ficou em despesas ficticias de mercado.",
      confidence: 0.82,
    },
  ]);
  const answer = await answerFinancialQuestion({
    question: "Resumo mensal dos meus gastos",
    context,
    policy: grantedPolicy,
    provider,
  });

  assert.equal(answer.status, "answered");
  assert.equal(answer.intent, "category_spending");
  assert.equal(answer.sources.includes("fake"), true);
  assert.match(answer.answer, /mercado/i);
}

function intentClassifierRecognizesSupportedQuestions(): void {
  assert.equal(classifyFinancialAssistantIntent("Quanto posso gastar hoje?"), "daily_availability");
  assert.equal(classifyFinancialAssistantIntent("Qual meu saldo projetado?"), "balance_projection");
  assert.equal(classifyFinancialAssistantIntent("Tenho assinaturas recorrentes?"), "subscriptions");
  assert.equal(classifyFinancialAssistantIntent("Qual a previsao do tempo?"), "out_of_scope");
}
