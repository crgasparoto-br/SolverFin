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
    now: "2026-07-30T01:00:00.000Z",
    originalFileName: "direct-child-scope.ofx",
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

describe("OFX canonical direct-child scope", () => {
  it("rejects canonical transaction fields nested in explicit extension containers", () => {
    const invalidDocuments = [
      [
        '<?xml version="1.0"?>',
        "<OFX><STMTRS><CURDEF>BRL</CURDEF><BANKTRANLIST><STMTTRN>",
        "<DTPOSTED>20260729</DTPOSTED><NAME>Compra segura</NAME>",
        "<EXTENSION><TRNAMT>-999.99</TRNAMT></EXTENSION>",
        "</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
      [
        "<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST><STMTTRN>",
        "<DTPOSTED>20260729<TRNAMT>-10<NAME>Compra segura",
        "<EXTENSION><FITID>nested-fitid</EXTENSION>",
        "</BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
      [
        '<?xml version="1.0"?>',
        "<OFX><STMTRS><CURDEF>BRL</CURDEF><BANKTRANLIST><STMTTRN>",
        "<DTPOSTED>20260729</DTPOSTED><TRNAMT>-10</TRNAMT>",
        "<WRAPPER><NAME>Nome aninhado</NAME></WRAPPER>",
        "</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
      [
        '<?xml version="1.0"?>',
        "<OFX><STMTRS><CURDEF>BRL</CURDEF><BANKTRANLIST><STMTTRN>",
        "<DTPOSTED>20260729</DTPOSTED><NAME>Compra segura</NAME>",
        "<EXTENSION><TRNAMT>-999.99</TRNAMT>",
        "</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
    ];

    for (const content of invalidDocuments) assertInvalidOfx(content);
  });

  it("rejects canonical XML fields nested inside scalar elements", () => {
    const invalidDocuments = [
      [
        '<?xml version="1.0"?>',
        "<OFX><STMTRS><CURDEF>BRL</CURDEF><BANKTRANLIST><STMTTRN>",
        "<DTPOSTED>20260729</DTPOSTED><NAME><TRNAMT>-10</TRNAMT></NAME>",
        "<FITID>nested-amount</FITID>",
        "</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
      [
        '<?xml version="1.0"?>',
        "<OFX><STMTRS><CURDEF>BRL</CURDEF><BANKTRANLIST><STMTTRN>",
        "<DTPOSTED>20260729</DTPOSTED><TRNAMT>-10</TRNAMT>",
        "<MEMO><FITID>nested-fitid-scalar</FITID></MEMO>",
        "</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
      [
        '<?xml version="1.0"?>',
        "<OFX><STMTRS><MKTGINFO><CURDEF>BRL</CURDEF></MKTGINFO>",
        "<BANKTRANLIST><STMTTRN><DTPOSTED>20260729</DTPOSTED>",
        "<TRNAMT>-10</TRNAMT><FITID>nested-currency</FITID>",
        "</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
    ];

    for (const content of invalidDocuments) assertInvalidOfx(content);
  });

  it("rejects unclosed intermediate containers in SGML and XML without declarations", () => {
    const invalidDocuments = [
      [
        "OFXHEADER:100\nDATA:OFXSGML\n",
        "<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST><STMTTRN>",
        "<DTPOSTED>20260729<NAME>Compra segura",
        "<EXTENSION><TRNAMT>-999.99<FITID>nested-fitid",
        "</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
      [
        "<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST><STMTTRN>",
        "<DTPOSTED>20260729<TRNAMT>-10",
        "<WRAPPER><NAME>Nome aninhado",
        "</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
      [
        "OFXHEADER:100\nDATA:OFXSGML\n",
        "<OFX><STMTRS><BANKACCTFROM><CURDEF>USD",
        "<BANKTRANLIST><STMTTRN><DTPOSTED>20260729<TRNAMT>-10<NAME>Compra",
        "</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
    ];

    for (const content of invalidDocuments) assertInvalidOfx(content);
  });

  it("keeps supported scalar siblings and empty-value fallback semantics", () => {
    const scalarSibling = preview(
      [
        "OFXHEADER:100\nDATA:OFXSGML\n",
        "<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST><STMTTRN>",
        "<CHECKNUM>12345<DTPOSTED>20260729<TRNAMT>-10",
        "<FITID>scalar-sibling<NAME>Compra segura",
        "</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
    );

    assert.equal(scalarSibling.suggestions[0]?.amountMinor, 1000);
    assert.equal(scalarSibling.suggestions[0]?.externalId, "scalar-sibling");

    const emptyNameFallback = preview(
      [
        "OFXHEADER:100\nDATA:OFXSGML\n",
        "<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST><STMTTRN>",
        "<DTPOSTED>20260729<TRNAMT>-10<FITID>empty-name-fallback",
        "<NAME><MEMO>Descricao pelo memo",
        "</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
    );

    assert.equal(emptyNameFallback.suggestions[0]?.description, "Descricao pelo memo");
  });

  it("rejects CURDEF nested in another statement metadata container", () => {
    assertInvalidOfx(
      [
        '<?xml version="1.0"?>',
        "<OFX><STMTRS><BANKACCTFROM><CURDEF>USD</CURDEF></BANKACCTFROM>",
        "<BANKTRANLIST><STMTTRN><DTPOSTED>20260729</DTPOSTED>",
        "<TRNAMT>-10</TRNAMT><NAME>Compra</NAME></STMTTRN></BANKTRANLIST>",
        "</STMTRS></OFX>",
      ].join(""),
    );

    const result = preview(
      [
        '<?xml version="1.0"?>',
        "<OFX><STMTRS><CURDEF>BRL</CURDEF>",
        "<BANKACCTFROM><BANKID>001</BANKID><ACCTID>synthetic</ACCTID></BANKACCTFROM>",
        "<BANKTRANLIST><STMTTRN><DTPOSTED>20260729</DTPOSTED>",
        "<TRNAMT>-10</TRNAMT><FITID>direct-fields</FITID><NAME>Compra</NAME>",
        "</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
    );

    assert.equal(result.suggestions[0]?.amountMinor, 1000);
    assert.equal(result.suggestions[0]?.externalId, "direct-fields");
    assert.equal(result.suggestions[0]?.currency, "BRL");
  });

  it("keeps apparent nested fields inactive inside comments and CDATA", () => {
    const result = preview(
      [
        '<?xml version="1.0"?>',
        "<OFX><STMTRS><CURDEF>BRL</CURDEF><BANKTRANLIST><STMTTRN>",
        "<!-- <EXTENSION><TRNAMT>-999.99</TRNAMT></EXTENSION> -->",
        "<![CDATA[<WRAPPER><NAME>Nome inativo</NAME></WRAPPER>]]>",
        "<DTPOSTED>20260729</DTPOSTED><TRNAMT>-10</TRNAMT>",
        "<FITID>inactive-nesting</FITID><NAME>Compra ativa</NAME>",
        "</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
    );

    assert.equal(result.suggestions[0]?.amountMinor, 1000);
    assert.equal(result.suggestions[0]?.description, "Compra ativa");
  });
});
