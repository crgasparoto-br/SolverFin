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

const transaction =
  "<STMTTRN><DTPOSTED>20260729<TRNAMT>-10.25<FITID>curdef-cardinality<NAME>Compra valida";

function preview(content: string, accountCurrency = "BRL") {
  return parseOfxImportPreview({
    context,
    now: "2026-07-29T12:00:00.000Z",
    originalFileName: "curdef-cardinality.ofx",
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

describe("OFX CURDEF cardinality", () => {
  it("rejects empty and duplicate CURDEF tags instead of falling back to the account currency", () => {
    const invalidDocuments = [
      `<OFX><STMTRS><CURDEF></CURDEF><BANKTRANLIST>${transaction}</BANKTRANLIST></STMTRS></OFX>`,
      `<OFX><STMTRS><CURDEF></CURDEF><CURDEF></CURDEF><BANKTRANLIST>${transaction}</BANKTRANLIST></STMTRS></OFX>`,
      `<OFX><STMTRS><CURDEF></CURDEF><CURDEF>BRL</CURDEF><BANKTRANLIST>${transaction}</BANKTRANLIST></STMTRS></OFX>`,
    ];

    for (const content of invalidDocuments) assertInvalidOfx(content);
  });

  it("uses the selected account currency only when CURDEF is actually absent", () => {
    const result = preview(
      `<OFX><STMTRS><BANKTRANLIST>${transaction}</BANKTRANLIST></STMTRS></OFX>`,
      "USD",
    );

    assert.equal(result.state, "ready");
    assert.equal(result.suggestions[0]?.currency, "USD");
  });
});
