import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseMercadoPagoStatement,
  recognizeMercadoPagoStatement,
  type PdfExtractedPage,
  type PdfExtractedWord,
} from "./mercado-pago-pdf.js";

const w = (text: string, x: number, y: number): PdfExtractedWord => ({ text, x, y });
const row = (date: string, description: readonly string[], id: string, value: string, balance: string, y: number) => [
  w(date, 40, y),
  ...description.flatMap((line, i) => line.split(" ").map((word, j) => w(word, 89 + j * 10, y + (i - (description.length - 1) / 2) * 12))),
  w(id, 197, y),
  w("R$", 300, y),
  w(value, 315, y),
  w("R$", 365, y),
  w(balance, 378, y),
];

function pages(): PdfExtractedPage[] {
  const header = (y: number) => [
    w("Data", 40, y), w("Descrição", 89, y),
    w("ID", 197, y), w("da", 210, y), w("operação", 223, y),
    w("Valor", 312, y), w("Saldo", 384, y),
  ];
  return [
    { words: [
      w("EXTRATO", 330, 30), w("DE", 370, 30), w("CONTA", 390, 30),
      w("DETALHE", 175, 155), w("DOS", 210, 155), w("MOVIMENTOS", 230, 155),
      w("Saldo", 44, 106), w("inicial:", 68, 106), w("R$", 96, 107), w("100,00", 107, 107),
      w("Entradas:", 179, 100), w("R$", 218, 101), w("15,50", 230, 101),
      w("Saidas:", 179, 113), w("R$", 215, 114), w("-15,00", 227, 114),
      w("Saldo", 318, 107), w("final:", 341, 107), w("R$", 368, 108), w("100,50", 382, 108),
      ...header(183),
      ...row("01-10-2026", ["Recebimento de", "cliente"], "123456789012", "10,00", "110,00", 215),
      ...row("02-10-2026", ["Pagamento Pix"], "123456789013", "-15,00", "95,00", 252),
    ] },
    { words: [
      ...header(41),
      ...row("03-10-2026", ["Rendimentos"], "123456789014", "5,50", "100,50", 75),
      w("Mercado", 32, 600), w("Pago", 65, 600), w("Instituição", 92, 600),
      w("de", 136, 600), w("Pagamento", 150, 600),
    ] },
  ];
}

describe("Mercado Pago bank statement PDF layout", () => {
  it("recognizes the homologated layout, joins multiline descriptions and validates balances/totals", () => {
    const parsed = parseMercadoPagoStatement(pages());
    assert.equal(recognizeMercadoPagoStatement(pages()), true);
    assert.equal(parsed.state, "ready");
    assert.equal(parsed.rows.length, 3);
    assert.deepEqual(parsed.rows.map((r) => [r.occurredOn, r.amountMinor, r.direction]), [
      ["2026-10-01", 1000, "inflow"],
      ["2026-10-02", 1500, "outflow"],
      ["2026-10-03", 550, "inflow"],
    ]);
    assert.match(parsed.rows[0]!.description, /Recebimento de cliente/);
    assert.equal(parsed.rows[0]!.externalId, "123456789012");
    assert.equal(parsed.rows[0]!.currency, "BRL");
    assert.notEqual(parsed.rows[0]!.sourceHash, parsed.rows[1]!.sourceHash);
  });

  it("fails closed when bank identity, a row, a balance, or totals are tampered", () => {
    const missingIdentity = pages();
    missingIdentity[1] = { words: missingIdentity[1]!.words.filter((word) => word.text !== "Mercado") };
    assert.equal(parseMercadoPagoStatement(missingIdentity).state, "blocked");

    const missingOperation = pages();
    missingOperation[0] = { words: missingOperation[0]!.words.filter((word) => word.text !== "123456789013") };
    assert.equal(parseMercadoPagoStatement(missingOperation).problems[0]?.code, "IMPORT_PDF_ROW_INVALID");

    const wrongBalance = pages();
    wrongBalance[1] = { words: wrongBalance[1]!.words.map((word) => word.text === "100,50" ? { ...word, text: "101,50" } : word) };
    assert.equal(parseMercadoPagoStatement(wrongBalance).problems[0]?.code, "IMPORT_PDF_BALANCE_MISMATCH");

    const wrongTotals = pages();
    wrongTotals[0] = { words: wrongTotals[0]!.words.map((word) => word.text === "15,50" ? { ...word, text: "19,50" } : word) };
    assert.equal(parseMercadoPagoStatement(wrongTotals).problems[0]?.code, "IMPORT_PDF_TOTAL_MISMATCH");
  });

  it("rejects duplicated operation IDs before financial proposals are built", () => {
    const duplicateId = pages();
    duplicateId[1] = { words: duplicateId[1]!.words.map((word) => word.text === "123456789014" ? { ...word, text: "123456789012" } : word) };
    const parsed = parseMercadoPagoStatement(duplicateId);
    assert.equal(parsed.state, "blocked");
    assert.equal(parsed.rows.length, 0);
  });
});
