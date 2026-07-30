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

const modes = ["sgml-header", "sgml-direct", "xml-declaration", "xml-no-declaration"] as const;
const consumedNodes = [
  "CURDEF",
  "STMTTRN",
  "DTPOSTED",
  "TRNAMT",
  "FITID",
  "NAME",
  "MEMO",
  "TRNTYPE",
] as const;
const placements = ["direct", "generic-container", "scalar-container"] as const;

type Mode = (typeof modes)[number];
type ConsumedNode = (typeof consumedNodes)[number];
type Placement = (typeof placements)[number];

const fieldValues: Record<Exclude<ConsumedNode, "CURDEF" | "STMTTRN">, string> = {
  DTPOSTED: "20260730",
  TRNAMT: "-10.25",
  FITID: "matrix-fitid",
  NAME: "Compra matriz",
  MEMO: "Memo matriz",
  TRNTYPE: "DEBIT",
};

function preview(content: string) {
  return parseOfxImportPreview({
    context,
    now: "2026-07-30T12:00:00.000Z",
    originalFileName: "matrix.ofx",
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

function isXml(mode: Mode): boolean {
  return mode === "xml-declaration" || mode === "xml-no-declaration";
}

function scalarTag(name: string, value: string, xml: boolean): string {
  return xml ? `<${name}>${value}</${name}>` : `<${name}>${value}`;
}

function placeNode(
  node: ConsumedNode,
  value: string,
  placement: Placement,
  xml: boolean,
): string {
  const target = scalarTag(node, value, xml);
  if (placement === "direct") return target;
  const wrapper = placement === "generic-container" ? "WRAPPER" : scalarWrapperFor(node);
  return xml ? `<${wrapper}>${target}</${wrapper}>` : `<${wrapper}>${target}</${wrapper}>`;
}

function scalarWrapperFor(node: ConsumedNode): string {
  if (node === "CURDEF") return "MKTGINFO";
  if (node === "STMTTRN") return "MEMO";
  return "CHECKNUM";
}

function buildTransaction(mode: Mode, target: ConsumedNode, placement: Placement): string {
  const xml = isXml(mode);
  const fields = (Object.keys(fieldValues) as Array<keyof typeof fieldValues>).map((name) => {
    const fieldPlacement = target === name ? placement : "direct";
    return placeNode(name, fieldValues[name], fieldPlacement, xml);
  });
  const body = fields.join("");
  return xml ? `<STMTTRN>${body}</STMTTRN>` : `<STMTTRN>${body}</STMTTRN>`;
}

function buildDocument(mode: Mode, target: ConsumedNode, placement: Placement): string {
  const xml = isXml(mode);
  const currency =
    target === "CURDEF"
      ? placeNode("CURDEF", "BRL", placement, xml)
      : scalarTag("CURDEF", "BRL", xml);
  const transaction = buildTransaction(mode, target, placement);
  const listBody =
    target === "STMTTRN" && placement !== "direct"
      ? placeNode("STMTTRN", transaction.slice("<STMTTRN>".length, -"</STMTTRN>".length), placement, xml)
      : transaction;
  const envelope = `<OFX><STMTRS>${currency}<BANKTRANLIST>${listBody}</BANKTRANLIST></STMTRS></OFX>`;
  if (mode === "xml-declaration") return `<?xml version="1.0" encoding="UTF-8"?>${envelope}`;
  if (mode === "sgml-header") return `OFXHEADER:100\nDATA:OFXSGML\n${envelope}`;
  return envelope;
}

describe("OFX input parser attack matrix", () => {
  for (const mode of modes) {
    for (const node of consumedNodes) {
      it(`${mode} accepts direct ${node}`, () => {
        const result = preview(buildDocument(mode, node, "direct"));
        assert.equal(result.state, "ready");
        assert.equal(result.batch.totalRows, 1);
      });

      for (const placement of placements.filter((candidate) => candidate !== "direct")) {
        it(`${mode} rejects ${node} in ${placement}`, () => {
          assertInvalidOfx(buildDocument(mode, node, placement));
        });
      }
    }
  }

  for (const mode of modes) {
    it(`${mode} ignores financial-looking comments and CDATA`, () => {
      const document = buildDocument(mode, "TRNAMT", "direct").replace(
        "<BANKTRANLIST>",
        "<BANKTRANLIST><!-- <WRAPPER><STMTTRN><TRNAMT>-999</TRNAMT></STMTTRN></WRAPPER> --><![CDATA[<NAME><TRNAMT>-888</TRNAMT></NAME>]]>",
      );
      const result = preview(document);
      assert.equal(result.state, "ready");
      assert.equal(result.suggestions[0]?.amountMinor, 1025);
    });
  }
});
