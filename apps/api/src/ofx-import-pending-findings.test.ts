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
    now: "2026-07-30T12:00:00.000Z",
    originalFileName: "scope.ofx",
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

const sgmlTransaction =
  "<STMTTRN><DTPOSTED>20260730<TRNAMT>-10.25<FITID>nested-sgml<NAME>Compra";

const xmlTransaction =
  "<STMTTRN><DTPOSTED>20260730</DTPOSTED><TRNAMT>-10.25</TRNAMT><FITID>nested-xml</FITID><NAME>Compra</NAME></STMTTRN>";

describe("OFX transaction container scope", () => {
  it("rejects SGML transactions nested in an extension container", () => {
    assertInvalidOfx(
      `OFXHEADER:100\nDATA:OFXSGML\n<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST><EXTENSION>${sgmlTransaction}</EXTENSION></BANKTRANLIST></STMTRS></OFX>`,
    );
  });

  it("rejects XML-without-declaration transactions nested in a wrapper", () => {
    assertInvalidOfx(
      `<OFX><STMTRS><CURDEF>BRL</CURDEF><BANKTRANLIST><WRAPPER>${xmlTransaction}</WRAPPER></BANKTRANLIST></STMTRS></OFX>`,
    );
  });

  it("rejects strict XML transactions nested in a Unicode container", () => {
    assertInvalidOfx(
      `<?xml version="1.0" encoding="UTF-8"?><OFX><STMTRS><CURDEF>BRL</CURDEF><BANKTRANLIST><EXTENSÃO>${xmlTransaction}</EXTENSÃO></BANKTRANLIST></STMTRS></OFX>`,
    );
  });

  it("keeps direct BANKTRANLIST children valid", () => {
    const result = preview(
      `<OFX><STMTRS><CURDEF>BRL</CURDEF><BANKTRANLIST>${xmlTransaction}</BANKTRANLIST></STMTRS></OFX>`,
    );

    assert.equal(result.state, "ready");
    assert.equal(result.batch.totalRows, 1);
    assert.equal(result.suggestions[0]?.externalId, "nested-xml");
  });
});
