import { strict as assert } from "node:assert";

import {
  assertNoUnmaskedFinancialIdentifier,
  maskFinancialIdentifier,
  maskSensitiveFinancialText,
} from "./masking.js";

masksCardAndAccountIdentifiers();
preservesAlreadyMaskedValues();
redactsDocumentsAndTokens();
assertsUnmaskedText();

function masksCardAndAccountIdentifiers(): void {
  assert.equal(maskFinancialIdentifier("1234567890123456"), "************3456");

  const result = maskSensitiveFinancialText(
    "Compra aprovada no cartao 4111 1111 1111 1111 e conta 12345678",
  );

  assert.equal(result.maskedText.includes("4111 1111 1111 1111"), false);
  assert.equal(result.maskedText.includes("****1111"), true);
  assert.equal(result.redactedKinds.includes("card_number"), true);
  assert.equal(result.redactedKinds.includes("account_identifier"), true);
}

function preservesAlreadyMaskedValues(): void {
  assert.equal(maskFinancialIdentifier("****1234"), "****1234");
}

function redactsDocumentsAndTokens(): void {
  const result = maskSensitiveFinancialText(
    "CPF 123.456.789-10 authorization=abc123 CNPJ 12.345.678/0001-99",
  );

  assert.equal(result.maskedText.includes("123.456.789-10"), false);
  assert.equal(result.maskedText.includes("authorization: ***"), true);
  assert.equal(result.redactedKinds.includes("document"), true);
  assert.equal(result.redactedKinds.includes("token"), true);
}

function assertsUnmaskedText(): void {
  assert.throws(
    () => assertNoUnmaskedFinancialIdentifier("Conta 12345678"),
    /unmasked sensitive identifiers/,
  );

  assert.doesNotThrow(() => assertNoUnmaskedFinancialIdentifier("Conta ****5678"));
}
