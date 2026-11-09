import type { CanonicalReportExport } from "./reports-export-serializers.js";

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

function pdfDisplayCharacter(char: string): string {
  const code = char.codePointAt(0) ?? 0;
  if (code >= 32 && code <= 126) return char;
  if (code >= 160 && code <= 255) return char;
  const mapped = windows1252.get(code);
  if (mapped !== undefined) return String.fromCharCode(mapped);
  if (code === 9 || code === 10 || code === 13) return " ";
  // A readable, unambiguous visual fallback. The original is preserved in /ActualText.
  return "[U+" + code.toString(16).toUpperCase() + "]";
}

function pdfLiteral(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

// Helvetica metrics (1/1000 em) for ASCII in the PDF standard WinAnsi font.
// All remaining WinAnsi glyphs are conservatively bounded by the widest glyph.
const helveticaAsciiWidths: readonly number[] = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const pageTextWidth = ((595 - 2 * 40) * 1000) / 9;

type PdfLine = { display: string; original: string };

function glyphWidth(value: string): number {
  let width = 0;
  for (const char of value) {
    const code = char.charCodeAt(0);
    width += code >= 32 && code <= 126 ? (helveticaAsciiWidths[code - 32] ?? 1015) : 1015;
  }
  return width;
}

/** Wrap on original Unicode code point boundaries, not UTF-16 surrogate halves. */
function wrapPdfLine(value: string): PdfLine[] {
  const characters = Array.from(value, (original) => ({
    original,
    display: pdfDisplayCharacter(original),
  }));
  if (!characters.length) return [{ original: "", display: "" }];
  const lines: PdfLine[] = [];
  let start = 0;
  while (start < characters.length) {
    let cursor = start;
    let lineWidth = 0;
    let preferredBreak = start;
    while (cursor < characters.length) {
      const character = characters[cursor];
      if (!character) break;
      const width = glyphWidth(character.display);
      if (cursor > start && lineWidth + width > pageTextWidth) break;
      lineWidth += width;
      cursor += 1;
      if (character.original === " " || character.original === "|") preferredBreak = cursor;
    }
    const end =
      cursor === characters.length ? cursor : preferredBreak > start ? preferredBreak : cursor;
    const segment = characters.slice(start, end);
    lines.push({
      original: segment.map((character) => character.original).join(""),
      display: segment.map((character) => character.display).join(""),
    });
    start = end;
  }
  return lines;
}

/** PDF text alternatives use a UTF-16BE string with the required Unicode BOM. */
function unicodePdfHex(value: string): string {
  let hex = "FEFF";
  for (let index = 0; index < value.length; index += 1) {
    hex += value.charCodeAt(index).toString(16).padStart(4, "0").toUpperCase();
  }
  return hex;
}

function pdfTextOperation(line: PdfLine): string {
  const text = "(" + pdfLiteral(line.display) + ") Tj";
  if (line.original === line.display) return text + " T*";
  // Helvetica is limited to WinAnsi. Preserve unsupported Unicode exactly in
  // accessible/copyable PDF text while showing a visible U+XXXX fallback.
  return "/Span << /ActualText <" + unicodePdfHex(line.original) + "> >> BDC " + text + " EMC T*";
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
    for (const [index, row] of table.rows.entries()) {
      lines.push("Registro " + (index + 1) + " de " + table.rows.length);
      lines.push(
        table.columns
          .map(
            (column, columnIndex) =>
              column +
              ": " +
              (row[columnIndex] === null ? "<nulo>" : String(row[columnIndex] ?? "")),
          )
          .join(" | "),
      );
    }
  }
  const wrapped = lines.flatMap(wrapPdfLine);
  const pages: PdfLine[][] = [];
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
    const content = "BT /F1 9 Tf 40 800 Td 12 TL " + page.map(pdfTextOperation).join(" ") + " ET";
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
