import assert from "node:assert/strict";

import {
  classifyFinancialAssistantIntent,
  financialAssistantQuestionRequestsMutation,
} from "./index.js";

for (const command of [
  "Faca o pagamento da minha fatura",
  "Marque minha fatura como paga",
  "Atualize o valor desta despesa",
  "Modifique esta parcela",
]) {
  assert.equal(financialAssistantQuestionRequestsMutation(command), true, command);
  assert.equal(classifyFinancialAssistantIntent(command), "out_of_scope", command);
}

for (const consultation of [
  "Quanto paguei de fatura este mes?",
  "Faca um resumo deste mes",
]) {
  assert.equal(financialAssistantQuestionRequestsMutation(consultation), false, consultation);
  assert.notEqual(classifyFinancialAssistantIntent(consultation), "out_of_scope", consultation);
}
