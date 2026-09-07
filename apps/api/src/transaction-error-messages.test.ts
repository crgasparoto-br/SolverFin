import assert from "node:assert/strict";
import test from "node:test";

import { buildApiErrorResponse } from "./errors.js";

const cases = [
  ["TRANSACTION_KIND_REQUIRED", "Informe o tipo do lançamento."],
  [
    "TRANSACTION_KIND_INVALID",
    "O tipo de lançamento informado não é suportado.",
  ],
  [
    "TRANSACTION_STATUS_INVALID",
    "A situação do lançamento informada não é suportada.",
  ],
  [
    "TRANSACTION_SOURCE_INVALID",
    "A origem do lançamento informada não é suportada.",
  ],
  ["TRANSACTION_AMOUNT_INVALID", "Informe um valor válido maior que zero."],
  ["TRANSACTION_DATE_REQUIRED", "Informe a data do evento."],
  [
    "TRANSACTION_EFFECTIVE_DATE_REQUIRED",
    "Lançamentos efetivados ou conciliados exigem data efetiva.",
  ],
  ["TRANSACTION_ACCOUNT_REQUIRED", "Selecione uma conta para o lançamento."],
  [
    "TRANSACTION_ACCOUNT_INVALID",
    "A conta selecionada não corresponde ao lançamento.",
  ],
  ["TRANSACTION_ACCOUNT_ARCHIVED", "A conta selecionada precisa estar ativa."],
  [
    "TRANSACTION_DESTINATION_ACCOUNT_REQUIRED",
    "Selecione a conta de destino da transferência.",
  ],
  [
    "TRANSACTION_DESTINATION_ACCOUNT_INVALID",
    "A conta de destino da transferência é inválida.",
  ],
  [
    "TRANSACTION_TRANSFER_SAME_ACCOUNT",
    "A conta de origem e a conta de destino devem ser diferentes.",
  ],
  [
    "TRANSACTION_CURRENCY_MISMATCH",
    "A moeda do lançamento deve ser a mesma da conta.",
  ],
  ["TRANSACTION_CATEGORY_INVALID", "A categoria selecionada é inválida."],
  [
    "TRANSACTION_CATEGORY_ARCHIVED",
    "A categoria selecionada precisa estar ativa.",
  ],
] as const;

test("API expõe todos os códigos TransactionError com mensagens em pt-BR", () => {
  for (const [code, expectedMessage] of cases) {
    const response = buildApiErrorResponse({
      error: {
        code,
        statusCode: 400,
        message: "technical english message that must not be exposed",
      },
      correlationId: "corr-issue-653",
    });

    assert.equal(response.statusCode, 400, `${code} preserva o status HTTP`);
    assert.equal(response.body.error.code, code, `${code} permanece estável`);
    assert.equal(
      response.body.error.message,
      expectedMessage,
      `${code} usa mensagem em pt-BR`,
    );
  }
});
