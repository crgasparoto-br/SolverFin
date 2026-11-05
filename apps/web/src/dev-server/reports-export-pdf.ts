import type { CanonicalReportExport } from "./reports-export-serializers.js";

function pdfVisibleText(value: string): string {
  const windows1252 = new Map<number, number>([
    [0x20ac, 0x80],
    [0x201a, 0x82],
    [0x0192, 0x83],
    [0x201e, 0x84],
    [0x2026, 0x85],
    [0x2020, 0x86],
    [0x2021, 0x87],
    [0x02c6, 0x88],
    [0x2030, 0x89],
    [0x0160, 0x8a],
    [0x2039, 0x8b],
    [0x0152, 0x8c],
    [0x017d, 0x8e],
    [0x2018, 0x91],
    [0x2019, 0x92],
    [0x201c, 0x93],
    [0x201d, 0x94],
    [0x2022, 0x95],
    [0x2013, 0x96],
    [0x2014, 0x97],
    [0x02dc, 0x98],
    [0x2122, 0x99],
    [0x0161, 0x9a],
    [0x203a, 0x9b],
    [0x0153, 0x9c],
    [0x017e, 0x9e],
    [0x0178, 0x9f],
  ]);
  return Array.from(value, (char) => {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 32 && code <= 126) return char;
    if (code >= 160 && code <= 255) return char;
    const mapped = windows1252.get(code);
    if (mapped !== undefined) return String.fromCharCode(mapped);
    if (code === 9 || code === 10 || code === 13) return " ";
    return "\\u{" + code.toString(16).toUpperCase() + "}";
  }).join("");
}

function pdfLiteral(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function wrapPdfLine(value: string): string[] {
  const printable = pdfVisibleText(value);
  const result: string[] = [];
  for (let offset = 0; offset < printable.length; offset += 100) {
    result.push(printable.slice(offset, offset + 100));
  }
  return result.length ? result : [""];
}

export function serializeReportPdf(report: CanonicalReportExport): Buffer {
  const lines: string[] = [
    "SolverFin | " + report.view,
    "Periodo: " + report.period,
    ...Object.entries(report.filters).map(([key, value]) => key + ": " + value),
  ];
  for (const table of report.tables) {
    lines.push("", "Moeda: " + (table.currency || "sem movimentos"), "Secao: " + table.name);
    lines.push(table.rows.length + " registros");
    for (const row of table.rows) {
      lines.push(
        table.columns.map((column, index) => column + ": " + String(row[index] ?? "")).join(" | "),
      );
    }
  }
  const wrapped = lines.flatMap(wrapPdfLine);
  const pages: string[][] = [];
  for (let index = 0; index < wrapped.length; index += 57) {
    pages.push(wrapped.slice(index, index + 57));
  }
  const objects: string[] = ["", "", ""];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  const pageReferences: string[] = [];
  for (const [index, page] of pages.entries()) {
    const pageId = 4 + index * 2;
    const contentId = pageId + 1;
    pageReferences.push(pageId + " 0 R");
    const content =
      "BT /F1 9 Tf 40 800 Td 12 TL " +
      page.map((line) => "(" + pdfLiteral(line) + ") Tj T*").join(" ") +
      " ET";
    objects[pageId] =
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents " +
      contentId +
      " 0 R >>";
    objects[contentId] =
      "<< /Length " +
      Buffer.byteLength(content, "latin1") +
      " >>\nstream\n" +
      content +
      "\nendstream";
  }
  objects[2] =
    "<< /Type /Pages /Kids [" + pageReferences.join(" ") + "] /Count " + pages.length + " >>";
  let output = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(output, "latin1"));
    output += index + " 0 obj\n" + objects[index] + "\nendobj\n";
  }
  const indexStart = Buffer.byteLength(output, "latin1");
  output += "xref\n0 " + objects.length + "\n0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    output += String(offset).padStart(10, "0") + " 00000 n \n";
  }
  output +=
    "trailer\n<< /Size " +
    objects.length +
    " /Root 1 0 R >>\nstartxref\n" +
    indexStart +
    "\n%%EOF\n";
  return Buffer.from(output, "latin1");
}
