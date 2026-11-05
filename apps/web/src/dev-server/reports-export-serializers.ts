import type { ReportsView } from "./reports-route-page-shared.js";

export type ExportCell = string | number | null;

export interface ExportTable {
  name: string;
  currency: string;
  columns: readonly string[];
  rows: readonly (readonly ExportCell[])[];
}

export interface CanonicalReportExport {
  view: ReportsView;
  period: string;
  filters: Readonly<Record<string, string>>;
  tables: readonly ExportTable[];
}

const separator = ";";

export function serializeReportCsv(report: CanonicalReportExport): Buffer {
  const lines: string[] = [
    csvLine(["solverfin_report", "1"]),
    csvLine(["view", report.view]),
    csvLine(["period", report.period]),
    ...Object.entries(report.filters).map(([key, value]) => csvLine(["filter", key, value])),
  ];
  for (const table of report.tables) {
    lines.push("");
    lines.push(csvLine(["currency", table.currency]));
    lines.push(csvLine(["table", table.name]));
    lines.push(csvLine(table.columns));
    for (const row of table.rows) lines.push(csvLine(row));
  }
  return Buffer.from("\uFEFF" + lines.join("\r\n") + "\r\n", "utf8");
}

function csvLine(values: readonly ExportCell[]): string {
  return values
    .map((value) => {
      const text =
        typeof value === "string"
          ? safeSpreadsheetText(value)
          : value === null
            ? ""
            : String(value);
      return '"' + text.replaceAll('"', '""') + '"';
    })
    .join(separator);
}

/** Neutralize formula-leading strings, including formulas after a line break. */
export function safeSpreadsheetText(value: string): string {
  return value.replace(/(^|[\r\n])([\t \u00a0]*)(?=[=+\-@])/gu, "$1$2'");
}

function xmlText(value: string): string {
  return value
    .replace(/\p{Cc}/gu, (character) =>
      character === "\t" || character === "\n" || character === "\r" ? character : "\uFFFD",
    )
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function sheetCell(value: ExportCell, row: number, column: number): string {
  const reference = columnReference(column) + row;
  if (typeof value === "number" && Number.isFinite(value)) {
    return '<c r="' + reference + '"><v>' + String(value) + "</v></c>";
  }
  const content = xmlText(safeSpreadsheetText(value === null ? "" : String(value)));
  return (
    '<c r="' +
    reference +
    '" t="inlineStr"><is><t xml:space="preserve">' +
    content +
    "</t></is></c>"
  );
}

function columnReference(index: number): string {
  let result = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
  }
  return result;
}

function sheetXml(columns: readonly string[], rows: readonly (readonly ExportCell[])[]): string {
  const widths = columns.map((column) => Math.max(12, Math.min(56, column.length + 2)));
  for (const row of rows) {
    for (let index = 0; index < widths.length; index += 1) {
      widths[index] = Math.max(
        widths[index] ?? 12,
        Math.min(56, String(row[index] ?? "").length + 2),
      );
    }
  }
  const columnSettings =
    "<cols>" +
    widths
      .map(
        (width, index) =>
          '<col min="' +
          (index + 1) +
          '" max="' +
          (index + 1) +
          '" width="' +
          width +
          '" customWidth="1"/>',
      )
      .join("") +
    "</cols>";
  const allRows: readonly (readonly ExportCell[])[] = [columns, ...rows];
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    columnSettings +
    "<sheetData>" +
    allRows
      .map(
        (values, index) =>
          '<row r="' +
          (index + 1) +
          '">' +
          values.map((value, col) => sheetCell(value, index + 1, col)).join("") +
          "</row>",
      )
      .join("") +
    "</sheetData></worksheet>"
  );
}

export function serializeReportXlsx(report: CanonicalReportExport): Buffer {
  const contextRows: ExportCell[][] = [
    ["view", report.view],
    ["period", report.period],
    ...Object.entries(report.filters).map(([key, value]) => ["filter:" + key, value]),
  ];
  const sheets = [
    { name: "Contexto", columns: ["campo", "valor"], rows: contextRows },
    ...report.tables.map((table, index) => ({
      name: String(index + 1).padStart(2, "0") + "-" + table.currency + "-" + table.name,
      columns: table.columns,
      rows: table.rows,
    })),
  ];
  const names = sheets.map((sheet) => sheet.name.replace(/[^a-zA-Z0-9 _-]/g, "-").slice(0, 31));
  const types =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    sheets
      .map(
        (_, index) =>
          '<Override PartName="/xl/worksheets/sheet' +
          (index + 1) +
          '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
      )
      .join("") +
    "</Types>";
  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    names
      .map(
        (name, index) =>
          '<sheet name="' +
          xmlText(name) +
          '" sheetId="' +
          (index + 1) +
          '" r:id="rId' +
          (index + 1) +
          '"/>',
      )
      .join("") +
    "</sheets></workbook>";
  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets
      .map(
        (_, index) =>
          '<Relationship Id="rId' +
          (index + 1) +
          '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
          'Target="worksheets/sheet' +
          (index + 1) +
          '.xml"/>',
      )
      .join("") +
    "</Relationships>";
  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    "</Relationships>";
  const files = [
    { name: "[Content_Types].xml", data: Buffer.from(types) },
    { name: "_rels/.rels", data: Buffer.from(rootRels) },
    { name: "xl/workbook.xml", data: Buffer.from(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(workbookRels) },
    ...sheets.map((sheet, index) => ({
      name: "xl/worksheets/sheet" + (index + 1) + ".xml",
      data: Buffer.from(sheetXml(sheet.columns, sheet.rows)),
    })),
  ];
  return zipFiles(files);
}

function crc32(data: Buffer): number {
  let result = 0xffffffff;
  for (const byte of data) {
    result ^= byte;
    for (let shift = 0; shift < 8; shift += 1) {
      result = (result >>> 1) ^ (result & 1 ? 0xedb88320 : 0);
    }
  }
  return (result ^ 0xffffffff) >>> 0;
}

/** Minimal uncompressed ZIP container; no runtime dependency or external network. */
function zipFiles(files: readonly { name: string; data: Buffer }[]): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const checksum = crc32(file.data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(file.data.length, 18);
    header.writeUInt32LE(file.data.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, file.data);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x0800, 8);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(file.data.length, 20);
    directory.writeUInt32LE(file.data.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, name);
    offset += header.length + name.length + file.data.length;
  }
  const centralSize = central.reduce((total, item) => total + item.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

export { serializeReportPdf } from "./reports-export-pdf.js";
