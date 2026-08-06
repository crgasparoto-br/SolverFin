import { bankMessageAiInboxControllerScript } from "./bank-message-ai-inbox-controller.js";

const script = bankMessageAiInboxControllerScript();

assertIncludes(script, 'new URL("/api/bank-message-inbox", window.location.origin)');
assertIncludes(script, 'url.searchParams.set("status", "all")');
assertIncludes(script, 'new URLSearchParams(window.location.search).get("profileId")');
assertIncludes(script, 'url.searchParams.set("profileId", profileId)');
assertIncludes(script, "Regra determinística");
assertIncludes(script, "Assistida por IA");
assertIncludes(script, "Em processamento");
assertIncludes(script, "Baixa confiança");
assertIncludes(script, "IA temporariamente indisponível");
assertIncludes(script, "buildRowsByMaskedText");
assertIncludes(script, "findUnambiguousMessageRow");
assertIncludes(script, "matches.length === 1");
assertIncludes(script, "message.maskedText");
assertIncludes(script, "message.diagnosticMessage");
assertNotIncludes(script, "rows[index]");
assertIncludes(script, "dataset.retryBankMessage");
assertIncludes(script, "Tentar novamente");
assertIncludes(script, "o texto original não foi armazenado");
assertIncludes(script, 'textarea[name="text"]');
assertIncludes(script, "dataset.bankMessageRetryStatus");
assertIncludes(script, 'status.setAttribute("role", "status")');
assertIncludes(script, 'status.setAttribute("aria-live", "polite")');
assertIncludes(script, 'form.insertAdjacentElement("afterend", status)');
assertIncludes(script, "clearRetryStatus");
assertIncludes(script, 'data-open-dialog="new-inbox-message-dialog"');
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
