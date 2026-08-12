import assert from "node:assert/strict";

import {
  answerFinancialQuestion,
  classifyFinancialAssistantIntent,
  defaultAiUsagePolicy,
  FakeAiProvider,
  type AvailabilityCalculationResult,
  type AiProvider,
  type AiUsageContext,
  type FinancialAssistantEvidence,
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
  purpose: "financial_assistant_read_only",
  maxPromptChars: 4000,
  maxRetries: 0,
  timeoutMs: 1000,
  allowRawFinancialText: false,
};

const monthlyEvidence: FinancialAssistantEvidence = {
  currency: "BRL",
  period: { startOn: "2026-06-01", endOn: "2026-06-30" },
  filters: ["Moeda: BRL"],
  metrics: [
    { key: "income", label: "Receitas realizadas", amountMinor: 500000, count: 2 },
    { key: "expense", label: "Despesas realizadas", amountMinor: 180000, count: 8 },
  ],
  assumptions: ["Somente lancamentos realizados e revisados entram nos totais."],
  limitations: ["Movimentacoes ainda nao registradas nao aparecem no resultado."],
  sources: ["lancamentos"],
  confidence: "high",
};

await dailyAvailabilityUsesStructuredCalculation();
await dailyAvailabilityDoesNotInventWithoutService();
await assistantKeepsDeterministicAnswerWithoutConsent();
await assistantRequiresStructuredEvidence();
await assistantFallsBackWithoutConsentResolver();
await assistantRechecksConsentBeforeProviderCallAndFallsBack();
await deterministicEvidenceAnswersWithoutProvider();
await noDataIsExplicit();
await providerFailureKeepsDeterministicAnswer();
await providerReceivesOnlyAggregatesAndIntent();
await providerAddsOnlyQualitativeNarrative();
await quantitativeProviderNarrativeIsRejected();
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
        label: "Saldo projetado",
        kind: "balance",
        amountMinor: 50000,
        confidence: "high",
        source: "contas e lancamentos",
      },
      {
        label: "Compromissos conhecidos",
        kind: "known_expense",
        amountMinor: -28000,
        confidence: "high",
        source: "lancamentos previstos",
      },
    ],
    assumptions: ["Horizonte ate o fim do mes."],
    limitations: ["Gastos futuros nao registrados podem alterar o valor."],
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
  assert.equal(answer.sources.includes("contas e lancamentos"), true);
  assert.match(answer.answer, /R\$\s*124,50/);
}

async function dailyAvailabilityDoesNotInventWithoutService(): Promise<void> {
  const answer = await answerFinancialQuestion({
    question: "Quanto posso gastar hoje?",
    context,
    policy: grantedPolicy,
  });

  assert.equal(answer.status, "needs_review");
  assert.equal(answer.safeLogCode, "ASSISTANT_AVAILABILITY_SERVICE_MISSING");
  assert.match(answer.answer, /nao vou estimar/i);
}

async function assistantKeepsDeterministicAnswerWithoutConsent(): Promise<void> {
  const answer = await answerFinancialQuestion({
    question: "Resuma meus gastos deste mes",
    context,
    policy: { ...grantedPolicy, consent: "revoked" },
    evidence: monthlyEvidence,
  });

  assert.equal(answer.status, "answered");
  assert.equal(answer.safeLogCode, "ASSISTANT_DETERMINISTIC_ANSWERED");
  assert.match(answer.answer, /Receitas realizadas/);
}

async function assistantRequiresStructuredEvidence(): Promise<void> {
  const answer = await answerFinancialQuestion({
    question: "Resuma meus gastos deste mes",
    context,
    policy: grantedPolicy,
  });

  assert.equal(answer.status, "needs_review");
  assert.equal(answer.safeLogCode, "ASSISTANT_EVIDENCE_REQUIRED");
}

async function assistantFallsBackWithoutConsentResolver(): Promise<void> {
  let calls = 0;
  const provider: AiProvider = {
    id: "counting",
    model: "counting-model",
    async complete() {
      calls += 1;
      return { text: "Nao deveria ser chamado." };
    },
  };
  const answer = await answerFinancialQuestion({
    question: "Resumo mensal deste mes",
    context,
    policy: grantedPolicy,
    evidence: monthlyEvidence,
    provider,
  });

  assert.equal(answer.status, "answered");
  assert.equal(answer.safeLogCode, "ASSISTANT_PROVIDER_FALLBACK_AI_CONSENT_REQUIRED");
  assert.equal(calls, 0);
  assert.match(answer.answer, /Receitas realizadas/);
}

async function assistantRechecksConsentBeforeProviderCallAndFallsBack(): Promise<void> {
  let calls = 0;
  const provider: AiProvider = {
    id: "counting",
    model: "counting-model",
    async complete() {
      calls += 1;
      return { text: "Nao deveria ser chamado." };
    },
  };
  const states = ["granted", "revoked"] as const;
  let consentIndex = 0;
  const answer = await answerFinancialQuestion({
    question: "Resumo mensal deste mes",
    context,
    policy: grantedPolicy,
    evidence: monthlyEvidence,
    provider,
    resolveConsent: () => states[consentIndex++] ?? "revoked",
  });

  assert.equal(answer.status, "answered");
  assert.equal(answer.safeLogCode, "ASSISTANT_PROVIDER_FALLBACK_AI_CONSENT_REQUIRED");
  assert.equal(calls, 0);
  assert.match(answer.answer, /Receitas realizadas/);
}

async function deterministicEvidenceAnswersWithoutProvider(): Promise<void> {
  const answer = await answerFinancialQuestion({
    question: "Resumo mensal deste mes",
    context,
    policy: grantedPolicy,
    evidence: monthlyEvidence,
  });

  assert.equal(answer.status, "answered");
  assert.equal(answer.intent, "monthly_summary");
  assert.deepEqual(answer.sources, ["lancamentos"]);
  assert.deepEqual(answer.filters, ["Moeda: BRL"]);
  assert.match(answer.answer, /R\$\s*5\.000,00/);
}

async function noDataIsExplicit(): Promise<void> {
  const answer = await answerFinancialQuestion({
    question: "Resumo mensal deste mes",
    context,
    policy: grantedPolicy,
    evidence: {
      ...monthlyEvidence,
      confidence: "low",
      metrics: [
        { key: "income", label: "Receitas realizadas", amountMinor: 0, count: 0 },
        { key: "expense", label: "Despesas realizadas", amountMinor: 0, count: 0 },
      ],
    },
  });

  assert.equal(answer.status, "needs_review");
  assert.match(answer.answer, /Nao ha dados suficientes/i);
}

async function providerFailureKeepsDeterministicAnswer(): Promise<void> {
  const provider: AiProvider = {
    id: "failing",
    model: "fixture",
    async complete() {
      throw new Error("fixture provider failure");
    },
  };
  const answer = await answerFinancialQuestion({
    question: "Resumo mensal deste mes",
    context,
    policy: grantedPolicy,
    evidence: monthlyEvidence,
    provider,
    resolveConsent: () => "granted",
  });

  assert.equal(answer.status, "answered");
  assert.match(answer.safeLogCode, /ASSISTANT_PROVIDER_FALLBACK_/);
  assert.match(answer.answer, /Despesas realizadas/);
}

async function providerReceivesOnlyAggregatesAndIntent(): Promise<void> {
  const rawQuestionMarker = "MERCADO-PRIVADO-CLIENTE";
  let outbound = "";
  const provider: AiProvider = {
    id: "capturing",
    model: "fixture",
    async complete(request) {
      outbound = JSON.stringify(request);
      return { text: "O recorte autorizado pode ser acompanhado com atencao." };
    },
  };
  await answerFinancialQuestion({
    question: `Resumo mensal deste mes ${rawQuestionMarker}`,
    context,
    policy: grantedPolicy,
    evidence: monthlyEvidence,
    provider,
    resolveConsent: () => "granted",
  });

  assert.doesNotMatch(outbound, new RegExp(rawQuestionMarker));
  assert.doesNotMatch(outbound, /org-assistant-a|profile-assistant-a|user-assistant-a/);
  assert.match(outbound, /monthly_summary/);
  assert.match(outbound, /Receitas realizadas/);
}

async function providerAddsOnlyQualitativeNarrative(): Promise<void> {
  const provider = new FakeAiProvider([
    {
      text: "Os dados autorizados mostram um padrao que merece acompanhamento.",
      confidence: 0.82,
    },
  ]);
  const answer = await answerFinancialQuestion({
    question: "Resumo mensal deste mes",
    context,
    policy: grantedPolicy,
    evidence: monthlyEvidence,
    provider,
    resolveConsent: () => "granted",
  });

  assert.equal(answer.status, "answered");
  assert.equal(answer.safeLogCode, "ASSISTANT_PROVIDER_NARRATIVE_ANSWERED");
  assert.match(answer.answer, /padrao que merece acompanhamento/i);
  assert.match(answer.answer, /Despesas realizadas/);
}

async function quantitativeProviderNarrativeIsRejected(): Promise<void> {
  const provider = new FakeAiProvider([{ text: "As despesas cresceram 25%." }]);
  const answer = await answerFinancialQuestion({
    question: "Resumo mensal deste mes",
    context,
    policy: grantedPolicy,
    evidence: monthlyEvidence,
    provider,
    resolveConsent: () => "granted",
  });

  assert.equal(answer.safeLogCode, "ASSISTANT_PROVIDER_NARRATIVE_REJECTED");
  assert.doesNotMatch(answer.answer, /25/);
  assert.match(answer.answer, /Despesas realizadas/);
}

function intentClassifierRecognizesSupportedQuestions(): void {
  assert.equal(classifyFinancialAssistantIntent("Quanto posso gastar hoje?"), "daily_availability");
  assert.equal(classifyFinancialAssistantIntent("Qual meu saldo projetado?"), "balance_projection");
  assert.equal(classifyFinancialAssistantIntent("Tenho assinaturas recorrentes?"), "subscriptions");
  assert.equal(classifyFinancialAssistantIntent("Resumo mensal deste mes"), "monthly_summary");
  assert.equal(classifyFinancialAssistantIntent("Qual a previsao do tempo?"), "out_of_scope");
}
