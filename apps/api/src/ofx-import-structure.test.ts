import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TenantContext } from "@solverfin/domain";

import { ImportReviewError } from "./repositories/imports.js";
import { parseOfxImportPreview } from "./repositories/ofx-imports.js";

const context: TenantContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  financialProfileId: "33333333-3333-4333-8333-333333333333",
  financialProfileKind: "personal",
};

function preview(content: string, accountCurrency = "BRL") {
  return parseOfxImportPreview({
    context,
    now: "2026-07-29T12:00:00.000Z",
    originalFileName: "estrutura.ofx",
    content,
    accountId: "44444444-4444-4444-8444-444444444444",
    accountCurrency,
  });
}

function assertInvalidOfx(content: string): void {
  assert.throws(
    () => preview(content),
    (error: unknown) => error instanceof ImportReviewError && error.code === "IMPORT_OFX_INVALID",
  );
}

const validTransaction =
  "<STMTTRN><DTPOSTED>20260729<TRNAMT>-10.25<FITID>scope-valid<NAME>Compra valida";

describe("OFX structural scope", () => {
  it("rejects STMTTRN outside the canonical BANKTRANLIST", () => {
    assertInvalidOfx(
      `<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST></BANKTRANLIST>${validTransaction}</STMTRS></OFX>`,
    );
    assertInvalidOfx(
      `<OFX>${validTransaction}<STMTRS><CURDEF>BRL<BANKTRANLIST></BANKTRANLIST></STMTRS></OFX>`,
    );
  });

  it("ignores comments and CDATA instead of parsing inactive transactions", () => {
    const result = preview(
      [
        "<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST>",
        `<!-- ${validTransaction} -->`,
        `<![CDATA[${validTransaction}]]>`,
        "<STMTTRN><DTPOSTED>20260730<TRNAMT>-2<FITID>active<NAME>Ativa",
        "</BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
    );

    assert.equal(result.batch.totalRows, 1);
    assert.equal(result.suggestions.length, 1);
    assert.equal(result.suggestions[0]?.externalId, "active");

    assertInvalidOfx(
      `<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST><!-- ${validTransaction} --></BANKTRANLIST></STMTRS></OFX>`,
    );
    assertInvalidOfx(
      `<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST><![CDATA[${validTransaction}]]></BANKTRANLIST></STMTRS></OFX>`,
    );
  });

  it("preserves structural offsets when inactive content follows astral Unicode", () => {
    const result = preview(
      [
        "<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST>😀",
        `<!-- ${validTransaction} -->`,
        "<STMTTRN><DTPOSTED>20260730<TRNAMT>-2<FITID>unicode-active<NAME>Ativa",
        "</BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
    );

    assert.equal(result.batch.totalRows, 1);
    assert.equal(result.suggestions[0]?.externalId, "unicode-active");
  });

  it("reads CURDEF only from statement metadata, never from the transaction list", () => {
    const result = preview(
      "<OFX><STMTRS><BANKTRANLIST><CURDEF>USD" +
        validTransaction +
        "</BANKTRANLIST></STMTRS></OFX>",
      "BRL",
    );

    assert.equal(result.suggestions[0]?.currency, "BRL");
    assertInvalidOfx(
      `<OFX><STMTRS><CURDEF>BRL<CURDEF>USD<BANKTRANLIST>${validTransaction}</BANKTRANLIST></STMTRS></OFX>`,
    );
  });

  it("rejects multiple recognized statement sections instead of mixing contexts", () => {
    assertInvalidOfx(
      [
        `<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST>${validTransaction}</BANKTRANLIST></STMTRS>`,
        `<CCSTMTRS><CURDEF>BRL<BANKTRANLIST>${validTransaction}</BANKTRANLIST></CCSTMTRS></OFX>`,
      ].join(""),
    );
  });

  it("rejects malformed strict XML transaction nesting", () => {
    assertInvalidOfx(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<OFX><STMTRS><CURDEF>BRL</CURDEF><BANKTRANLIST>",
        "<STMTTRN><DTPOSTED>20260729</DTPOSTED><TRNAMT>-10.25</TRNAMT>",
        "<FITID>xml-truncated</FITID>",
        "</BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
    );
  });
});
