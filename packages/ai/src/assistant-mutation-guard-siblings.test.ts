import assert from "node:assert/strict";

import {
  classifyFinancialAssistantIntent,
  financialAssistantQuestionRequestsMutation,
} from "./index.js";

const classify = classifyFinancialAssistantIntent;
const requestsMutation = financialAssistantQuestionRequestsMutation;

const mutationCommands = [
  "Faca o pagamento da minha fatura",
  "Marque minha fatura como paga",
  "Atualize o valor desta despesa",
  "Modifique esta parcela",
];

for (const command of mutationCommands) {
  assert.equal(requestsMutation(command), true, command);
  assert.equal(classify(command), "out_of_scope", command);
}

const consultations = [
  "Quanto paguei de fatura este mes?",
  "Faca um resumo deste mes",
];

for (const consultation of consultations) {
  assert.equal(requestsMutation(consultation), false, consultation);
  assert.notEqual(classify(consultation), "out_of_scope", consultation);
}
