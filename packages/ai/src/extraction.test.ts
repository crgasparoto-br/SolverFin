import assert from "node:assert/strict";

import {
  type TransactionExtractionValidationProblem,
  validateTransactionExtraction,
} from "./extraction.js";

validOutputIsAcceptedAndNormalized();
invalidOutputIsRejectedForReview();
lowConfidenceOutputNeedsReview();
amountMinorAndIsoDatetimeAreNormalized();
emptyReasonsAreRejected();

function validOutputIsAcceptedAndNormalized(): void {
  const result = validateTransactionExtraction({
    amount: "1.234,56",
    currency: "brl",
    date: "16/06/2026",
    type: "EXPENSE",
    merchant: " Mercado Demo ",
    accountHint: "Conta principal",
    cardHint: "Final 1234",
    categorySuggestion: "Alimentacao",
    confidence: 0.86,
    source: "bank_message",
    reasons: ["Valor e data encontrados em mensagem ficticia."],
  });

  assert.equal(result.status, "valid");
  assert.equal(result.problems.length, 0);
  assert.equal(result.suggestion?.amountMinor, 123456);
  assert.equal(result.suggestion?.currency, "BRL");
  assert.equal(result.suggestion?.occurredOn, "2026-06-16");
  assert.equal(result.suggestion?.type, "expense");
  assert.equal(result.suggestion?.merchant, "Mercado Demo");
  assert.equal(result.suggestion?.source, "bank_message");
  assert.deepEqual(result.suggestion?.reasons, ["Valor e data encontrados em mensagem ficticia."]);
}

function invalidOutputIsRejectedForReview(): void {
  const result = validateTransactionExtraction({
    amount: "abc",
    currency: "BRL",
    type: "expense",
    confidence: 0.9,
    source: "bank_message",
    reasons: ["valor ilegivel"],
    unexpected: "field",
  });

  assert.equal(result.status, "invalid");
  assert.equal(result.suggestion, undefined);
  assertProblemCode(result.problems, "EXTRACTION_AMOUNT_INVALID");
  assertProblemCode(result.problems, "EXTRACTION_DATE_REQUIRED");
  assertProblemCode(result.problems, "EXTRACTION_FIELD_UNEXPECTED");
}

function lowConfidenceOutputNeedsReview(): void {
  const result = validateTransactionExtraction({
    amount: 25,
    currency: "BRL",
    occurredOn: "2026-06-16",
    type: "expense",
    confidence: 0.42,
    source: "shared_text",
    reasons: ["Texto incompleto, mas contem valor e data."],
  });

  assert.equal(result.status, "needs_review");
  assert.equal(result.suggestion?.amountMinor, 2500);
  assertProblemCode(result.problems, "EXTRACTION_LOW_CONFIDENCE");
}

function amountMinorAndIsoDatetimeAreNormalized(): void {
  const result = validateTransactionExtraction({
    amountMinor: 2500,
    currency: "usd",
    occurredOn: "2026-06-16T10:00:00Z",
    type: "income",
    confidence: 0.91,
    source: "import",
    reasons: ["Registro importado contem valor minoritario."],
  });

  assert.equal(result.status, "valid");
  assert.equal(result.suggestion?.amountMinor, 2500);
  assert.equal(result.suggestion?.currency, "USD");
  assert.equal(result.suggestion?.occurredOn, "2026-06-16");
}

function emptyReasonsAreRejected(): void {
  const result = validateTransactionExtraction({
    amountMinor: 2500,
    currency: "BRL",
    occurredOn: "2026-02-31",
    type: "expense",
    confidence: 0.91,
    source: "manual_note",
    reasons: ["  "],
  });

  assert.equal(result.status, "invalid");
  assertProblemCode(result.problems, "EXTRACTION_DATE_INVALID");
  assertProblemCode(result.problems, "EXTRACTION_REASONS_INVALID");
}

function assertProblemCode(
  problems: readonly TransactionExtractionValidationProblem[],
  code: TransactionExtractionValidationProblem["code"],
): void {
  assert.ok(
    problems.some((problem) => problem.code === code),
    `Expected problem code ${code}`,
  );
}
