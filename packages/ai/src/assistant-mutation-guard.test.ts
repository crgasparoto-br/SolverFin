import assert from "node:assert/strict";

import {
  answerFinancialQuestion,
  classifyFinancialAssistantIntent,
  defaultAiUsagePolicy,
  financialAssistantQuestionRequestsMutation,
  type AiProvider,
} from "./index.js";

const mutationCommands = [
  "Pague minha fatura este mes",
  "Exclua minha despesa deste mes",
  "Crie uma despesa de 100 reais",
  "Edite o valor desta parcela",
  "Concilie esta transacao",
  "Aprove este lancamento",
] as const;

for (const command of mutationCommands) {
  assert.equal(financialAssistantQuestionRequestsMutation(command), true, command);
  assert.equal(classifyFinancialAssistantIntent(command), "out_of_scope", command);
}

for (const consultation of [
  "Quanto paguei de fatura este mes?",
  "Quanto gastei este mes?",
  "Qual o valor da minha fatura este mes?",
]) {
  assert.equal(financialAssistantQuestionRequestsMutation(consultation), false, consultation);
  assert.notEqual(classifyFinancialAssistantIntent(consultation), "out_of_scope", consultation);
}

let providerCalls = 0;
const provider: AiProvider = {
  id: "mutation-guard",
  model: "fixture",
  async complete() {
    providerCalls += 1;
    return { text: "DIRECT" };
  },
};

const refused = await answerFinancialQuestion({
  question: "Pague minha fatura este mes",
  context: {
    organizationId: "org-mutation-guard",
    financialProfileId: "profile-mutation-guard",
    userId: "user-mutation-guard",
  },
  policy: {
    ...defaultAiUsagePolicy,
    consent: "granted",
    purpose: "financial_assistant_read_only",
    maxPromptChars: 4000,
    maxRetries: 0,
    timeoutMs: 1000,
    allowRawFinancialText: false,
  },
  provider,
  resolveConsent: () => "granted",
});

assert.equal(refused.intent, "out_of_scope");
assert.equal(refused.safeLogCode, "ASSISTANT_OUT_OF_SCOPE");
assert.match(refused.answer, /Nao executo operacoes financeiras/i);
assert.equal(providerCalls, 0, "mutation command must never reach the provider");
