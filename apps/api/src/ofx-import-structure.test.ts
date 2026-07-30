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

function wrapTransaction(fields: string): string {
  return `<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST><STMTTRN>${fields}</BANKTRANLIST></STMTRS></OFX>`;
}

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

  it("rejects processing instructions that could inject canonical OFX fields", () => {
    assertInvalidOfx(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<OFX><STMTRS><CURDEF>BRL</CURDEF><BANKTRANLIST><STMTTRN>",
        "<?ignored <TRNAMT>-999.99 ?>",
        "<DTPOSTED>20260729</DTPOSTED><NAME>Compra segura</NAME>",
        "</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
    );
    assertInvalidOfx(
      [
        '<?xml version="1.0"?>',
        "<OFX><STMTRS><CURDEF>BRL</CURDEF><BANKTRANLIST>",
        "<?ignored <STMTTRN><DTPOSTED>20260729</DTPOSTED><TRNAMT>-1</TRNAMT>",
        "<FITID>pi-row</FITID><NAME>Registro inativo</NAME></STMTTRN> ?>",
        "</BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
    );
    assertInvalidOfx(
      [
        '<?xml version="1.0"?>',
        "<OFX><STMTRS><?ignored <CURDEF>USD ?>",
        "<BANKTRANLIST><STMTTRN><DTPOSTED>20260729</DTPOSTED>",
        "<TRNAMT>-1</TRNAMT><NAME>Compra</NAME></STMTTRN>",
        "</BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
    );
    assertInvalidOfx(
      "<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST><STMTTRN><?ignored <TRNAMT>-1</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
    );

    const result = preview(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<OFX><STMTRS><!-- <?ignored <CURDEF>USD ?> -->",
        "<![CDATA[<?ignored <STMTTRN><TRNAMT>-999</TRNAMT></STMTTRN> ?>]]>",
        "<CURDEF>BRL</CURDEF><BANKTRANLIST><STMTTRN>",
        "<DTPOSTED>20260729</DTPOSTED><TRNAMT>-10</TRNAMT>",
        "<FITID>active-after-pi</FITID><NAME>Compra ativa</NAME>",
        "</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
    );
    assert.equal(result.suggestions[0]?.amountMinor, 1000);
    assert.equal(result.suggestions[0]?.externalId, "active-after-pi");
  });

  it("rejects duplicate canonical fields inside one STMTTRN", () => {
    const invalidTransactions = [
      "<DTPOSTED>20260729<DTPOSTED>20260730<TRNAMT>-10<FITID>duplicate-date<NAME>Compra",
      "<DTPOSTED>20260729<TRNAMT>-10<TRNAMT>-1000<FITID>duplicate-amount<NAME>Compra",
      "<DTPOSTED>20260729<TRNAMT>-10<FITID>first<FITID>second<NAME>Compra",
      "<DTPOSTED>20260729<TRNAMT>-10<FITID>duplicate-name<NAME>Compra<NAME>Outra",
      "<DTPOSTED>20260729<TRNAMT>-10<FITID>duplicate-memo<MEMO>Compra<MEMO>Outra",
      "<TRNTYPE>DEBIT<TRNTYPE>CREDIT<DTPOSTED>20260729<TRNAMT>-10<FITID>duplicate-type<NAME>Compra",
    ];

    for (const transaction of invalidTransactions) {
      assertInvalidOfx(wrapTransaction(transaction));
    }

    const inactiveDuplicate = preview(
      wrapTransaction(
        "<DTPOSTED>20260729<TRNAMT>-10<!-- <TRNAMT>-1000 --><FITID>inactive-duplicate<NAME>Compra",
      ),
    );
    assert.equal(inactiveDuplicate.suggestions[0]?.amountMinor, 1000);
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

  it("rejects CURDEF outside canonical statement metadata", () => {
    assertInvalidOfx(
      `<OFX><STMTRS><BANKTRANLIST><CURDEF>USD${validTransaction}</BANKTRANLIST></STMTRS></OFX>`,
    );
    assertInvalidOfx(
      `<OFX><STMTRS><BANKTRANLIST><STMTTRN><CURDEF>USD<DTPOSTED>20260729<TRNAMT>-10.25<FITID>nested-currency<NAME>Compra</BANKTRANLIST></STMTRS></OFX>`,
    );
    assertInvalidOfx(
      `<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST><CURDEF>USD${validTransaction}</BANKTRANLIST></STMTRS></OFX>`,
    );
    assertInvalidOfx(
      `<OFX><CURDEF>USD<STMTRS><BANKTRANLIST>${validTransaction}</BANKTRANLIST></STMTRS></OFX>`,
    );
    assertInvalidOfx(
      `<OFX><STMTRS><CURDEF ISO="4217">USD<BANKTRANLIST>${validTransaction}</BANKTRANLIST></STMTRS></OFX>`,
    );
    assertInvalidOfx(
      `<OFX><STMTRS><ns:CURDEF>USD<BANKTRANLIST>${validTransaction}</BANKTRANLIST></STMTRS></OFX>`,
    );

    const result = preview(
      `<OFX><STMTRS><!-- <CURDEF>USD --> <![CDATA[<CURDEF>USD]]><CURDEF>BRL<BANKTRANLIST>${validTransaction}</BANKTRANLIST></STMTRS></OFX>`,
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
