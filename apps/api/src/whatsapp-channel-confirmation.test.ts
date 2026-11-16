import assert from "node:assert/strict";
import test from "node:test";

import { redactWhatsappConfirmationLabel } from "./whatsapp-channel-confirmation.js";

test("resumo WhatsApp mascara identificadores sensíveis formatados", () => {
  const sensitive = [
    "CPF 123.456.789-09",
    "CPF 12345678909",
    "CNPJ 12.345.678/0001-90",
    "Cartão 4111 1111 1111 1111",
    "Cartão 4111-1111-1111-1111",
    "Telefone (11) 98888-7777",
    "Conta 1234-567890",
    "Pix 550e8400-e29b-41d4-a716-446655440000",
    "Contato titular@example.com",
    "https://example.invalid/cliente/12345678901",
  ];
  for (const value of sensitive) {
    const result = redactWhatsappConfirmationLabel(value);
    assert.ok(result.length > 0, "o resumo deve manter um rótulo seguro");
    assert.doesNotMatch(
      result,
      /(?:123|456|789|4111|98888|567890|550e8400|titular@|example\.invalid)/i,
      value,
    );
  }
});

test("resumo WhatsApp preserva rótulos inofensivos e normaliza controles", () => {
  assert.equal(redactWhatsappConfirmationLabel("Compra na Loja Centro"), "Compra na Loja Centro");
  assert.equal(redactWhatsappConfirmationLabel("Pedido 42\nLoja"), "Pedido 42 Loja");
});
