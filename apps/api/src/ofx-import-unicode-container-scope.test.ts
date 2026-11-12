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

function preview(content: string) {
  return parseOfxImportPreview({
    context,
    now: "2026-07-30T06:00:00.000Z",
    originalFileName: "unicode-scope.ofx",
    content,
    accountId: "44444444-4444-4444-8444-444444444444",
    accountCurrency: "BRL",
  });
}

function assertInvalidOfx(content: string): void {
  assert.throws(
    () => preview(content),
    (error: unknown) => error instanceof ImportReviewError && error.code === "IMPORT_OFX_INVALID",
  );
}

describe("OFX Unicode container scope", () => {
  it("rejects canonical transaction fields nested under Unicode-named containers", () => {
    const invalidDocuments = [
      [
        "OFXHEADER:100\nDATA:OFXSGML\n",
        "<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST><STMTTRN>",
        "<EXTENSÃO><DTPOSTED>20260729<TRNAMT>-10<FITID>unicode-nested<NAME>Compra",
        "</EXTENSÃO></STMTTRN></BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
      [
        "<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST><STMTTRN>",
        "<DTPOSTED>20260729<TRNAMT>-10<FITID>unicode-name",
        "<AGRUPAÇÃO><NAME>Nome aninhado</NAME></AGRUPAÇÃO>",
        "</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
      [
        '<?xml version="1.0"?>',
        "<OFX><STMTRS><CURDEF>BRL</CURDEF><BANKTRANLIST><STMTTRN>",
        "<DTPOSTED>20260729</DTPOSTED><NAME>Compra</NAME>",
        "<EXTENSÃO><TRNAMT>-10</TRNAMT></EXTENSÃO>",
        "</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
    ];

    for (const content of invalidDocuments) assertInvalidOfx(content);
  });

  it("rejects CURDEF nested under a Unicode-named statement container", () => {
    assertInvalidOfx(
      [
        "<OFX><STMTRS><METADADOS_BANCÁRIOS><CURDEF>USD</CURDEF></METADADOS_BANCÁRIOS>",
        "<BANKTRANLIST><STMTTRN><DTPOSTED>20260729<TRNAMT>-10<NAME>Compra",
        "</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
    );
  });

  it("rejects Unicode namespace prefixes on canonical currency and transaction fields", () => {
    const invalidDocuments = [
      [
        '<?xml version="1.0"?>',
        "<OFX><STMTRS><pré:CURDEF>USD</pré:CURDEF><BANKTRANLIST><STMTTRN>",
        "<DTPOSTED>20260729</DTPOSTED><TRNAMT>-10</TRNAMT>",
        "<FITID>unicode-prefix-currency</FITID><NAME>Compra</NAME>",
        "</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
      [
        '<?xml version="1.0"?>',
        "<OFX><STMTRS><CURDEF>BRL</CURDEF><BANKTRANLIST><STMTTRN>",
        "<DTPOSTED>20260729</DTPOSTED><pré:TRNAMT>-10</pré:TRNAMT>",
        "<FITID>unicode-prefix-amount</FITID><NAME>Compra</NAME>",
        "</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
    ];

    for (const content of invalidDocuments) assertInvalidOfx(content);
  });

  it("keeps a closed Unicode extension compatible when canonical fields remain siblings", () => {
    const result = preview(
      [
        "<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST><STMTTRN>",
        "<EXTENSÃO><CAMPO>valor</CAMPO></extensão>",
        "<DTPOSTED>20260729<TRNAMT>-10<FITID>unicode-sibling<NAME>Compra válida",
        "</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
    );

    assert.equal(result.state, "ready");
    assert.equal(result.suggestions[0]?.externalId, "unicode-sibling");
    assert.equal(result.suggestions[0]?.amountMinor, 1000);
  });

  it("keeps apparent Unicode containers inactive inside comments and CDATA", () => {
    const result = preview(
      [
        '<?xml version="1.0"?>',
        "<OFX><STMTRS><CURDEF>BRL</CURDEF><BANKTRANLIST><STMTTRN>",
        "<!-- <EXTENSÃO><TRNAMT>-999</TRNAMT></EXTENSÃO> -->",
        "<![CDATA[<AGRUPAÇÃO><NAME>Nome inativo</NAME></AGRUPAÇÃO>]]>",
        "<DTPOSTED>20260729</DTPOSTED><TRNAMT>-10</TRNAMT>",
        "<FITID>unicode-inactive</FITID><NAME>Compra ativa</NAME>",
        "</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
    );

    assert.equal(result.suggestions[0]?.externalId, "unicode-inactive");
    assert.equal(result.suggestions[0]?.description, "Compra ativa");
  });
});
