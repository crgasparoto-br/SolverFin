import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  StructuredImportError,
  parsePdfImport,
  parseXlsxImport,
  type XlsxImportMapping,
} from "./document-imports.js";

function pdf(lines: readonly string[]): string {
  const headerAndComments = ["%PDF-1.4", ...lines].join("\n") + "\n";
  const objectOffset = Buffer.byteLength(headerAndComments, "latin1");
  const body = headerAndComments + "1 0 obj\n<< /Type /Catalog >>\nendobj\n";
  const xrefOffset = Buffer.byteLength(body, "latin1");
  const objectOffsetText = String(objectOffset).padStart(10, "0");
  const document =
    body +
    [
      "xref",
      "0 2",
      "0000000000 65535 f ",
      `${objectOffsetText} 00000 n `,
      "trailer",
      "<< /Size 2 /Root 1 0 R >>",
      "startxref",
      String(xrefOffset),
      "%%EOF",
    ].join("\n");
  return Buffer.from(document, "latin1").toString("base64");
}

describe("document imports", () => {
  it("parses the homologated fictitious bank PDF without guessing the account", () => {
    const result = parsePdfImport({
      contentBase64: pdf([
        "%SOLVERFIN:STATEMENT:V1",
        "%TX|2026-09-01|-12,34|BRL|Padaria|fit-001",
        "%TX|2026-09-02|2500.00|BRL|Salario|fit-002",
      ]),
      documentClass: "bank_statement",
    });

    assert.equal(result.state, "ready");
    assert.equal(result.pdf?.parserId, "solverfin-fixture-bank-statement");
    assert.deepEqual(
      result.rows.map((row) => [row.occurredOn, row.direction, row.amountMinor, row.currency]),
      [
        ["2026-09-01", "outflow", 1234, "BRL"],
        ["2026-09-02", "inflow", 250000, "BRL"],
      ],
    );
  });

  it("keeps equal legitimate card purchases distinct and ignores totals/payments", () => {
    const result = parsePdfImport({
      contentBase64: pdf([
        "%SOLVERFIN:CARD-INVOICE:V1",
        "%META|currency=BRL|invoicePeriod=2026-09|instrument=****1234",
        "%PURCHASE|2026-09-01|10.00|BRL|Cafe|****1234|1/3",
        "%PURCHASE|2026-09-01|10.00|BRL|Cafe|****1234|1/3",
        "%TOTAL|20.00",
        "%PAYMENT|20.00",
      ]),
      documentClass: "credit_card_invoice",
    });

    assert.equal(result.state, "ready");
    assert.equal(result.rows.length, 2);
    assert.notEqual(result.rows[0]?.sourceHash, result.rows[1]?.sourceHash);
    assert.equal(result.rows[0]?.invoicePeriod, "2026-09");
    assert.equal(result.rows[0]?.amountMinor, 1000);
    assert.equal(result.rows[0]?.installmentAmountMinor, 1000);
    assert.equal(result.rows[0]?.installmentSequence, 1);
    assert.equal(result.rows[0]?.installmentTotal, 3);
    const requiresTotalReview = result.problems.some(
      (problem) => problem.code === "IMPORT_INSTALLMENT_TOTAL_REVIEW_REQUIRED",
    );
    assert.equal(requiresTotalReview, true);
  });

  it("fails closed for corrupt or unsupported PDFs", () => {
    const truncatedLines = [
      "%PDF-1.4",
      "%SOLVERFIN:STATEMENT:V1",
      "%TX|2026-09-01|-1.00|BRL|Teste|x",
    ];
    const truncated = Buffer.from(truncatedLines.join("\n"), "latin1").toString("base64");
    assert.throws(
      () => parsePdfImport({ contentBase64: truncated, documentClass: "bank_statement" }),
      (error: unknown) =>
        error instanceof StructuredImportError && error.code === "IMPORT_PDF_INVALID",
    );

    const validPdf = pdf([
      "%SOLVERFIN:STATEMENT:V1",
      "%TX|2026-09-01|-1.00|BRL|Teste|x",
    ]);
    const corruptPdfText = Buffer.from(validPdf, "base64")
      .toString("latin1")
      .replace(/startxref\n\d+/, "startxref\n999999");
    const corruptStartxref = Buffer.from(corruptPdfText, "latin1").toString("base64");
    assert.throws(
      () => parsePdfImport({ contentBase64: corruptStartxref, documentClass: "bank_statement" }),
      (error: unknown) =>
        error instanceof StructuredImportError && error.code === "IMPORT_PDF_INVALID",
    );

    assert.throws(
      () =>
        parsePdfImport({
          contentBase64: pdf(["%SOLVERFIN:STATEMENT:V2"]),
          documentClass: "bank_statement",
        }),
      (error: unknown) =>
        error instanceof StructuredImportError && error.code === "IMPORT_PDF_LAYOUT_UNSUPPORTED",
    );
    assert.throws(
      () =>
        parsePdfImport({
          contentBase64: pdf([
            "%SOLVERFIN:STATEMENT:V1",
            "%SOLVERFIN:STATEMENT-ALT:V1",
            "%TX|2026-09-01|-1.00|BRL|Teste|x",
          ]),
          documentClass: "bank_statement",
        }),
      (error: unknown) =>
        error instanceof StructuredImportError && error.code === "IMPORT_PDF_LAYOUT_AMBIGUOUS",
    );
    assert.throws(
      () =>
        parsePdfImport({
          contentBase64: pdf(["/Encrypt 1 0 R", "%SOLVERFIN:STATEMENT:V1"]),
          documentClass: "bank_statement",
        }),
      (error: unknown) =>
        error instanceof StructuredImportError && error.code === "IMPORT_PDF_PROTECTED",
    );
  });

  it("requires explicit XLSX sheet and column mapping and never evaluates formulas", () => {
    const contentBase64 = xlsxFixture();
    const first = parseXlsxImport({
      contentBase64,
      documentClass: "bank_statement",
      defaultCurrency: "BRL",
    });
    assert.equal(first.state, "mapping_required");
    assert.deepEqual(first.xlsx?.sheets, ["Movimentos", "Resumo"]);

    const mapping: XlsxImportMapping = {
      version: 1,
      date: "Data",
      description: "Descricao",
      amount: "Valor",
      currency: "Moeda",
    };
    const mapped = parseXlsxImport({
      contentBase64,
      documentClass: "bank_statement",
      sheetName: "Movimentos",
      mapping,
      defaultCurrency: "BRL",
    });

    assert.equal(mapped.state, "ready");
    assert.equal(mapped.rows.length, 1);
    assert.equal(mapped.rows[0]?.amountMinor, 1234);
    assert.equal(
      mapped.problems.some((problem) => problem.code === "IMPORT_XLSX_ROW_INVALID"),
      true,
      "formula row is rejected because formula output is never executed or trusted",
    );
  });
});

function xlsxFixture(): string {
  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Movimentos" sheetId="1" r:id="rId1"/><sheet name="Resumo" sheetId="2" r:id="rId2"/></sheets>
</workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships>
<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Target="worksheets/sheet2.xml"/>
</Relationships>`;
  const sheet1 = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet><sheetData>
<row r="1">${cells(["Data", "Descricao", "Valor", "Moeda"], 1)}</row>
<row r="2">${cells(["01/09/2026", "Padaria", "-12,34", "BRL"], 2)}</row>
<row r="3"><c r="A3" t="inlineStr"><is><t>02/09/2026</t></is></c><c r="B3" t="inlineStr"><is><t>Formula</t></is></c><c r="C3"><f>6*7</f><v>42</v></c><c r="D3" t="inlineStr"><is><t>BRL</t></is></c></row>
</sheetData></worksheet>`;
  const sheet2 = `<?xml version="1.0" encoding="UTF-8"?><worksheet><sheetData><row r="1">${cells(["Total"], 1)}</row></sheetData></worksheet>`;
  return zip([
    ["xl/workbook.xml", workbook],
    ["xl/_rels/workbook.xml.rels", rels],
    ["xl/worksheets/sheet1.xml", sheet1],
    ["xl/worksheets/sheet2.xml", sheet2],
  ]).toString("base64");
}

function cells(values: readonly string[], row: number): string {
  return values
    .map(
      (value, index) =>
        `<c r="${String.fromCharCode(65 + index)}${row}" t="inlineStr"><is><t>${value}</t></is></c>`,
    )
    .join("");
}

function zip(entries: readonly (readonly [string, string])[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const [name, text] of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const data = Buffer.from(text, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }

  const centralDirectory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralDirectory, eocd]);
}
