import { bankMessageAiInboxControllerScript } from "./bank-message-ai-inbox-controller.js";

const script = bankMessageAiInboxControllerScript();

assertIncludes(script, "/api/bank-message-inbox?status=all");
assertIncludes(script, "Regra determinística");
assertIncludes(script, "Assistida por IA");
assertIncludes(script, "Baixa confiança");
assertIncludes(script, "IA temporariamente indisponível");
assertIncludes(script, "dataRetryBankMessage");
assertIncludes(script, "Tentar novamente");
assertIncludes(script, "o texto original não foi armazenado");
assertIncludes(script, 'textarea[name="text"]');
assertIncludes(script, "dataBankMessageRetryStatus");
assertIncludes(script, 'status.setAttribute("role", "status")');
assertIncludes(script, 'status.setAttribute("aria-live", "polite")');
assertIncludes(script, 'form.insertAdjacentElement("afterend", status)');
assertNotIncludes(script, "message.rawText");
assertNotIncludes(script, "message.text");

function assertIncludes(value: string, expected: string): void {
  if (!value.includes(expected)) {
    throw new Error(`Expected generated controller to include: ${expected}`);
  }
}

function assertNotIncludes(value: string, unexpected: string): void {
  if (value.includes(unexpected)) {
    throw new Error(`Expected generated controller to omit: ${unexpected}`);
  }
}
