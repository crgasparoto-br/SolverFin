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
const now = "2026-07-28T12:00:00.000Z";
const accountId = "44444444-4444-4444-8444-444444444444";

function preview(
  content: string,
  overrides: Partial<Parameters<typeof parseOfxImportPreview>[0]> = {},
) {
  return parseOfxImportPreview({
    context,
    now,
    originalFileName: "extrato.ofx",
    content,
    accountId,
    accountCurrency: "BRL",
    ...overrides,
  });
}

function ofx(transactions: string, currency = "BRL"): string {
  return `<OFX><STMTRS><CURDEF>${currency}</CURDEF><BANKTRANLIST>${transactions}</BANKTRANLIST></STMTRS></OFX>`;
}

function transaction(fields: string): string {
  return `<STMTTRN>${fields}</STMTTRN>`;
}

describe("OFX import parser", () => {
  it("normalizes XML and SGML records using the amount sign as canonical direction", () => {
    const content = [
      "OFXHEADER:100",
      "DATA:OFXSGML",
      "<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST>",
      "<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260715120000[-3:BRT]<TRNAMT>-12.34<FITID>fit-1<NAME>Mercado",
      "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260716<TRNAMT>50.00<FITID>fit-2<MEMO>Reembolso",
      "</BANKTRANLIST></STMTRS></OFX>",
    ].join("\n");

    const result = preview(content);

    assert.equal(result.state, "ready");
    assert.equal(result.persisted, false);
    assert.equal(result.batch.sourceKind, "ofx");
    assert.equal(result.batch.totalRows, 2);
    assert.equal(result.batch.validRows, 2);
    assert.deepEqual(
      result.suggestions.map((item) => ({
        row: item.sourceRowNumber,
        date: item.occurredOn,
        description: item.description,
        kind: item.kind,
        direction: item.direction,
        amountMinor: item.amountMinor,
        currency: item.currency,
        externalId: item.externalId,
        accountId: item.accountId,
      })),
      [
        {
          row: 1,
          date: "2026-07-15",
          description: "Mercado",
          kind: "expense",
          direction: "outflow",
          amountMinor: 1234,
          currency: "BRL",
          externalId: "fit-1",
          accountId,
        },
        {
          row: 2,
          date: "2026-07-16",
          description: "Reembolso",
          kind: "income",
          direction: "inflow",
          amountMinor: 5000,
          currency: "BRL",
          externalId: "fit-2",
          accountId,
        },
      ],
    );
    assert.equal(
      result.problems.filter((problem) => problem.code === "IMPORT_OFX_TRNTYPE_CONFLICT").length,
      2,
    );
  });

  it("uses NAME, then MEMO, then FITID without returning unrelated raw fields", () => {
    const secret = "raw-bank-secret";
    const result = preview(
      ofx(
        [
          transaction(
            `<DTPOSTED>20260717<TRNAMT>-1<FITID>one<NAME>Name preferred<MEMO>Memo ignored<REFNUM>${secret}`,
          ),
          transaction("<DTPOSTED>20260718<TRNAMT>-2<FITID>two<MEMO>Memo fallback"),
          transaction("<DTPOSTED>20260719<TRNAMT>-3<FITID>three"),
        ].join(""),
      ),
    );

    assert.deepEqual(
      result.suggestions.map((item) => item.description),
      ["Name preferred", "Memo fallback", "three"],
    );
    assert.equal(JSON.stringify(result).includes(secret), false);
  });

  it("uses the selected account currency when CURDEF is absent", () => {
    const result = preview(
      "<OFX><STMTRS><BANKTRANLIST><STMTTRN><DTPOSTED>20260717<TRNAMT>-1<FITID>usd-1</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
      { accountCurrency: "USD" },
    );

    assert.equal(result.suggestions[0]?.currency, "USD");
  });

  it("rejects a declared currency that differs from the selected account", () => {
    assert.throws(
      () => preview(ofx(transaction("<DTPOSTED>20260717<TRNAMT>-1<FITID>eur-1"), "EUR")),
      (error: unknown) =>
        error instanceof ImportReviewError && error.code === "IMPORT_ACCOUNT_CURRENCY_MISMATCH",
    );
  });

  it("keeps valid rows, diagnoses invalid rows safely and blocks files with no valid rows", () => {
    const rawAmount = "not-a-number-secret";
    const partial = preview(
      ofx(
        [
          transaction("<DTPOSTED>20260717<TRNAMT>-10<FITID>ok-1"),
          transaction(`<DTPOSTED>bad-date<TRNAMT>${rawAmount}<FITID>bad-1`),
        ].join(""),
      ),
    );

    assert.equal(partial.state, "ready");
    assert.equal(partial.batch.validRows, 1);
    assert.equal(partial.batch.problemRows, 1);
    assert.ok(partial.problems.some((problem) => problem.code === "IMPORT_ROW_DATE_INVALID"));
    assert.ok(partial.problems.some((problem) => problem.code === "IMPORT_ROW_NUMBER_INVALID"));
    assert.equal(JSON.stringify(partial.problems).includes(rawAmount), false);

    const blocked = preview(ofx(transaction("<DTPOSTED>bad<TRNAMT>0")));
    assert.equal(blocked.state, "blocked");
    assert.equal(blocked.batch.validRows, 0);
    assert.equal(blocked.suggestions.length, 0);
  });

  it("scopes batch and row identities by tenant, profile and selected account", () => {
    const content = ofx(transaction("<DTPOSTED>20260717<TRNAMT>-10<FITID>same-fit"));
    const first = preview(content);
    const otherAccount = preview(content, { accountId: "55555555-5555-4555-8555-555555555555" });
    const otherProfile = preview(content, {
      context: {
        ...context,
        financialProfileId: "66666666-6666-4666-8666-666666666666",
      },
    });

    assert.notEqual(first.batch.sourceHash, otherAccount.batch.sourceHash);
    assert.notEqual(first.batch.sourceHash, otherProfile.batch.sourceHash);
    assert.notEqual(first.suggestions[0]?.sourceHash, otherAccount.suggestions[0]?.sourceHash);
    assert.notEqual(first.suggestions[0]?.sourceHash, otherProfile.suggestions[0]?.sourceHash);
  });

  it("rejects missing transactions, unsupported extensions, invalid encoding and oversized files", () => {
    assert.throws(
      () => preview("<OFX><STMTRS><CURDEF>BRL</CURDEF></STMTRS></OFX>"),
      (error: unknown) => error instanceof ImportReviewError && error.code === "IMPORT_OFX_INVALID",
    );
    assert.throws(
      () =>
        preview(ofx(transaction("<DTPOSTED>20260717<TRNAMT>-1<FITID>x")), {
          originalFileName: "x.csv",
        }),
      (error: unknown) =>
        error instanceof ImportReviewError && error.code === "IMPORT_FILE_KIND_UNSUPPORTED",
    );
    assert.throws(
      () => preview("<OFX>\u0000</OFX>"),
      (error: unknown) =>
        error instanceof ImportReviewError && error.code === "IMPORT_FILE_ENCODING_INVALID",
    );
    assert.throws(
      () => preview("<OFX>" + "x".repeat(5 * 1024 * 1024) + "</OFX>"),
      (error: unknown) =>
        error instanceof ImportReviewError && error.code === "IMPORT_FILE_TOO_LARGE",
    );
  });
});
