import assert from "node:assert/strict";

import type { CanonicalReportExport, ExportCell } from "./reports-export-serializers.js";

type CsvCell = { value: string; quoted: boolean };

function readCsv(source: Buffer): CsvCell[][] {
  const input = source.toString("utf8").replace(/^\uFEFF/u, "");
  const rows: CsvCell[][] = [];
  let record: CsvCell[] = [];
  let value = "";
  let quoted = false;
  let withinQuotes = false;
  const addCell = (): void => {
    record.push({ value, quoted });
    value = "";
    quoted = false;
  };
  const addRecord = (): void => {
    addCell();
    rows.push(record);
    record = [];
  };
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"') {
      if (withinQuotes && input[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        assert.ok(withinQuotes || value === "", "CSV quote must start a cell");
        withinQuotes = !withinQuotes;
        if (withinQuotes) quoted = true;
      }
    } else if (!withinQuotes && char === ";") {
      addCell();
    } else if (!withinQuotes && char === "\r" && input[index + 1] === "\n") {
      addRecord();
      index += 1;
    } else if (!withinQuotes && char === "\n") {
      addRecord();
    } else {
      value += char;
    }
  }
  assert.equal(withinQuotes, false, "CSV has a dangling quote");
  assert.deepEqual(record, [], "CSV has an unterminated row");
  assert.equal(value, "", "CSV must terminate its last record");
  return rows;
}

function csvText(value: ExportCell): CsvCell {
  if (value === null) return { value: "", quoted: false };
  if (typeof value === "number") return { value: String(value), quoted: true };
  return {
    value: value.replace(/(^|[\r\n])([\t \u00a0]*)(?=[=+\-@])/gu, "$1$2'"),
    quoted: true,
  };
}

export function assertCsvParity(report: CanonicalReportExport, file: Buffer): void {
  const expected: CsvCell[][] = [
    ["solverfin_report", "1"].map(csvText),
    ["view", report.view].map(csvText),
    ["period", report.period].map(csvText),
    ...Object.entries(report.filters).map(([key, value]) => ["filter", key, value].map(csvText)),
  ];
  for (const table of report.tables) {
    expected.push([{ value: "", quoted: false }]);
    expected.push(["currency", table.currency].map(csvText));
    expected.push(["table", table.name].map(csvText));
    expected.push(table.columns.map(csvText));
    expected.push(...table.rows.map((row) => row.map(csvText)));
  }
  assert.deepEqual(readCsv(file), expected, "CSV must retain every currency, row and cell");
}

function unzipEntries(input: Buffer): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  let index = 0;
  while (index + 30 <= input.length && input.readUInt32LE(index) === 0x04034b50) {
    assert.equal(input.readUInt16LE(index + 8), 0, "XLSX uses supported stored ZIP entries");
    const size = input.readUInt32LE(index + 18);
    const fileNameLength = input.readUInt16LE(index + 26);
    const extraLength = input.readUInt16LE(index + 28);
    const start = index + 30 + fileNameLength + extraLength;
    const name = input.subarray(index + 30, index + 30 + fileNameLength).toString("utf8");
    result.set(name, input.subarray(start, start + size).toString("utf8"));
    index = start + size;
  }
  return result;
}

function unescapeXml(text: string): string {
  return text
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function readSheet(xml: string): ExportCell[][] {
  const rows: ExportCell[][] = [];
  for (const rowMatch of xml.matchAll(/<row r="\d+">([\s\S]*?)<\/row>/gu)) {
    const cells: ExportCell[] = [];
    const rowXml = rowMatch[1] ?? "";
    for (const cellMatch of rowXml.matchAll(
      /<c r="([A-Z]+)\d+"(?: t="inlineStr")?(?:\s*\/>|>([\s\S]*?)<\/c>)/gu,
    )) {
      const letters = cellMatch[1] ?? "";
      const offset =
        [...letters].reduce((previous, char) => previous * 26 + char.charCodeAt(0) - 64, 0) - 1;
      const body = cellMatch[2];
      if (body === undefined) {
        cells[offset] = null;
      } else if (cellMatch[0]?.includes('t="inlineStr"')) {
        const text = /<t xml:space="preserve">([\s\S]*?)<\/t>/u.exec(body)?.[1];
        assert.ok(text !== undefined, "XLSX inline string must be present");
        cells[offset] = unescapeXml(text);
      } else {
        const number = /<v>([^<]*)<\/v>/u.exec(body)?.[1];
        assert.ok(number !== undefined, "XLSX numeric cell must have a value");
        cells[offset] = Number(number);
      }
    }
    rows.push(cells);
  }
  return rows;
}

export function assertXlsxParity(report: CanonicalReportExport, file: Buffer): void {
  const zip = unzipEntries(file);
  const workbook = zip.get("xl/workbook.xml") ?? "";
  const names = [
    ...workbook.matchAll(/<sheet name="([^"]+)" sheetId="\d+" r:id="rId\d+"\/>/gu),
  ].map((match) => unescapeXml(match[1] ?? ""));
  const sheets = names.map((_, index) =>
    readSheet(zip.get(`xl/worksheets/sheet${index + 1}.xml`) ?? ""),
  );
  const context = [
    ["campo", "valor"],
    ["view", report.view],
    ["period", report.period],
    ...Object.entries(report.filters).map(([key, value]) => ["filter:" + key, value]),
  ];
  assert.equal(names[0], "Contexto");
  assert.deepEqual(sheets[0], context, "XLSX context must retain view, period and filters");
  assert.equal(sheets.length, report.tables.length + 1);
  for (const [index, table] of report.tables.entries()) {
    const expectedName = `${String(index + 1).padStart(2, "0")}-${table.currency}-${table.name}`;
    assert.equal(names[index + 1], expectedName.slice(0, 31));
    const expectedRows = [
      [...table.columns],
      ...table.rows.map((row) =>
        row.map((cell) => (typeof cell === "string" ? csvText(cell).value : cell)),
      ),
    ];
    assert.deepEqual(sheets[index + 1], expectedRows, `XLSX table ${index} (${table.currency})`);
  }
}

function pdfActualText(hex: string): string {
  assert.ok(hex.startsWith("FEFF") && hex.length % 4 === 0, "PDF uses valid UTF-16BE text");
  const bytes = Buffer.from(hex, "hex");
  const swapped = Buffer.alloc(bytes.length - 2);
  for (let i = 2; i < bytes.length; i += 2) {
    swapped[i - 2] = bytes[i + 1] ?? 0;
    swapped[i - 1] = bytes[i] ?? 0;
  }
  return swapped.toString("utf16le");
}

function readPdfLines(pdf: Buffer): string[] {
  const text = pdf.toString("latin1");
  assert.match(text, /^%PDF-1\.4/u);
  const lines: string[] = [];
  const operations =
    /(?:\/Span << \/ActualText <([0-9A-F]+)> >> BDC )?\(((?:\\.|[^\\)])*)\) Tj( EMC)? T\*/gu;
  for (const match of text.matchAll(operations)) {
    const originalHex = match[1];
    const marked = match[3] !== undefined;
    assert.equal(marked, originalHex !== undefined, "marked PDF text requires /ActualText");
    lines.push(
      originalHex
        ? pdfActualText(originalHex)
        : (match[2] ?? "").replace(/\\([\\()])/gu, "$1"),
    );
  }
  return lines;
}

export function assertPdfParity(report: CanonicalReportExport, file: Buffer): void {
  const lines = readPdfLines(file);
  assert.equal(lines.shift(), "SolverFin | " + report.view);
  assert.equal(lines.shift(), "Periodo: " + report.period);
  for (const [key, value] of Object.entries(report.filters)) {
    assert.equal(lines.shift(), key + ": " + value);
  }
  for (const table of report.tables) {
    assert.equal(lines.shift(), "");
    assert.equal(lines.shift(), "Moeda: " + (table.currency || "sem movimentos"));
    assert.equal(lines.shift(), "Secao: " + table.name);
    assert.equal(lines.shift(), table.rows.length + " registros");
    for (const [index, row] of table.rows.entries()) {
      assert.equal(lines.shift(), `Registro ${index + 1} de ${table.rows.length}`);
      const expected = table.columns
        .map(
          (column, col) => column + ": " + (row[col] === null ? "<nulo>" : String(row[col] ?? "")),
        )
        .join(" | ");
      let reconstructed = "";
      while (reconstructed.length < expected.length) {
        assert.ok(lines.length, "PDF ended before finishing row " + index);
        reconstructed += lines.shift();
      }
      assert.equal(
        reconstructed,
        expected,
        `PDF table ${table.name} currency ${table.currency} row ${index}`,
      );
    }
  }
  assert.deepEqual(lines, [], "PDF must not append unexpected or omit semantic records");
}
