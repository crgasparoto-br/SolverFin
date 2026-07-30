import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TenantContext } from "@solverfin/domain";

import { parseOfxImportPreview } from "./repositories/ofx-imports.js";

const context: TenantContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  financialProfileId: "33333333-3333-4333-8333-333333333333",
  financialProfileKind: "personal",
};

function preview(amounts: readonly string[]) {
  const transactions = amounts
    .map(
      (amount, index) =>
        `<STMTTRN><DTPOSTED>20260730</DTPOSTED><TRNAMT>${amount}</TRNAMT>` +
        `<FITID>amount-${index + 1}</FITID><NAME>Amount ${index + 1}</NAME></STMTTRN>`,
    )
    .join("");
  return parseOfxImportPreview({
    context,
    now: "2026-07-30T14:00:00.000Z",
    originalFileName: "amount-precision.ofx",
    content: `<OFX><STMTRS><CURDEF>BRL</CURDEF><BANKTRANLIST>${transactions}</BANKTRANLIST></STMTRS></OFX>`,
    accountId: "44444444-4444-4444-8444-444444444444",
    accountCurrency: "BRL",
  });
}

describe("OFX TRNAMT cent precision", () => {
  it("keeps exact positive and negative cent values symmetric", () => {
    const result = preview(["10.25", "-10.25", "+12", "12.3", "-0.01", "&#49;0.25"]);

    assert.equal(result.state, "ready");
    assert.deepEqual(
      result.suggestions.map((suggestion) => ({
        amountMinor: suggestion.amountMinor,
        direction: suggestion.direction,
        kind: suggestion.kind,
      })),
      [
        { amountMinor: 1025, direction: "inflow", kind: "income" },
        { amountMinor: 1025, direction: "outflow", kind: "expense" },
        { amountMinor: 1200, direction: "inflow", kind: "income" },
        { amountMinor: 1230, direction: "inflow", kind: "income" },
        { amountMinor: 1, direction: "outflow", kind: "expense" },
        { amountMinor: 1025, direction: "inflow", kind: "income" },
      ],
    );
  });

  it("rejects unsupported precision and punctuation without rounding or reinterpretation", () => {
    const result = preview([
      "0.005",
      "-0.005",
      "1.999",
      "1,234",
      "12.340",
      "10000000000000.00",
    ]);

    assert.equal(result.state, "blocked");
    assert.equal(result.batch.validRows, 0);
    assert.equal(result.batch.problemRows, 6);
    assert.equal(result.suggestions.length, 0);
    assert.deepEqual(
      result.problems
        .filter((problem) => problem.code === "IMPORT_ROW_NUMBER_INVALID")
        .map((problem) => problem.rowNumber),
      [1, 2, 3, 4, 5, 6],
    );
  });

  it("preserves valid siblings when one row has unsupported precision", () => {
    const result = preview(["25.50", "-0.005", "-7.01"]);

    assert.equal(result.state, "ready");
    assert.equal(result.batch.validRows, 2);
    assert.equal(result.batch.problemRows, 1);
    assert.deepEqual(
      result.suggestions.map((suggestion) => suggestion.amountMinor),
      [2550, 701],
    );
    assert.deepEqual(
      result.suggestions.map((suggestion) => suggestion.sourceRowNumber),
      [1, 3],
    );
  });

  it("keeps apparent amounts in comments and CDATA inactive", () => {
    const content = [
      '<?xml version="1.0"?>',
      "<OFX><STMTRS><CURDEF>BRL</CURDEF><BANKTRANLIST><STMTTRN>",
      "<!-- <TRNAMT>0.005</TRNAMT> -->",
      "<![CDATA[<TRNAMT>1,234</TRNAMT>]]>",
      "<DTPOSTED>20260730</DTPOSTED><TRNAMT>-10.25</TRNAMT>",
      "<FITID>inactive-amount</FITID><NAME>Compra</NAME>",
      "</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
    ].join("");
    const result = parseOfxImportPreview({
      context,
      now: "2026-07-30T14:00:00.000Z",
      originalFileName: "inactive-amount.ofx",
      content,
      accountId: "44444444-4444-4444-8444-444444444444",
      accountCurrency: "BRL",
    });

    assert.equal(result.state, "ready");
    assert.equal(result.suggestions[0]?.amountMinor, 1025);
    assert.equal(result.suggestions[0]?.direction, "outflow");
  });
});
