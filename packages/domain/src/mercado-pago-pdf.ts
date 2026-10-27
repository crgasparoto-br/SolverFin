import { createHash } from "node:crypto";

import type { ISODate } from "./index.js";
import type {
  PdfParserDescriptor,
  StructuredImportPreview,
  StructuredImportProblem,
  StructuredImportRow,
} from "./document-imports.js";

export interface PdfExtractedWord {
  text: string;
  x: number;
  y: number;
}

export interface PdfExtractedPage {
  words: readonly PdfExtractedWord[];
}

type ParsedStatement = Omit<StructuredImportPreview, "pdf">;
type Movement = {
  date: string;
  description: string;
  externalId: string;
  signed: number;
  balance: number;
};

export const MERCADO_PAGO_STATEMENT_PARSER: PdfParserDescriptor = {
  id: "mercado-pago-bank-statement",
  version: "1",
  institution: "mercado-pago",
  documentClass: "bank_statement",
  recognize: (_text, pages) => pages !== undefined && recognizeMercadoPagoStatement(pages),
  parse: (_text, pages) => parseMercadoPagoStatement(pages ?? []),
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function recognizeMercadoPagoStatement(pages: readonly PdfExtractedPage[]): boolean {
  if (pages.length === 0 || pages.length > 30) return false;
  const allText = normalize(
    pages.map((page) => page.words.map((word) => word.text).join(" ")).join(" "),
  );
  return (
    allText.includes("extrato de conta") &&
    allText.includes("detalhe dos movimentos") &&
    allText.includes("id da operacao") &&
    allText.includes("mercado pago instituicao de pagamento")
  );
}

function parseMoney(raw: string): number | undefined {
  const text = raw.replace(/\s+/g, " ").trim();
  const match = /^R\$\s*(-?)(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$/.exec(text);
  if (!match) return undefined;
  const amount = Number(match[2]!.replace(/\./g, "")) * 100 + Number(match[3]);
  return Number.isSafeInteger(amount) ? (match[1] === "-" ? -amount : amount) : undefined;
}

function findSummaryAmount(
  page: PdfExtractedPage,
  label: string,
  minX: number,
  maxX: number,
): number | undefined {
  const key = normalize(label);
  const target = page.words.find(
    (word) =>
      normalize(word.text).replace(/:$/, "") === key &&
      word.x >= minX &&
      word.x < maxX &&
      word.y >= 85 &&
      word.y < 140,
  );
  if (!target) return undefined;
  const text = page.words
    .filter(
      (word) =>
        word.y >= target.y - 3 && word.y <= target.y + 3 && word.x > target.x && word.x < maxX,
    )
    .sort((a, b) => a.x - b.x)
    .map((word) => word.text)
    .join(" ");
  const amount = /R\$\s*-?[\d.,]+/.exec(text);
  return amount ? parseMoney(amount[0]) : undefined;
}

function pageDescriptions(
  page: PdfExtractedPage,
  header: PdfExtractedWord,
  footerY: number,
  rowYs: readonly number[],
): string[] | undefined {
  const words = page.words
    .filter(
      (word) =>
        word !== header &&
        word.x >= 76 &&
        word.x < 195 &&
        word.y >= header.y - 3.5 &&
        word.y < footerY,
    )
    .sort((a, b) => a.y - b.y || a.x - b.x);
  if (words.some((word) => word.y <= header.y + 3.5 || word.y >= footerY - 3.5)) return undefined;
  const lines: PdfExtractedWord[][] = [];
  for (const word of words) {
    const last = lines[lines.length - 1];
    if (!last || Math.abs(word.y - last[0]!.y) > 2.5) lines.push([word]);
    else last.push(word);
  }
  const descriptions: string[] = [];
  let cursor = 0;
  for (const y of rowYs) {
    const first = lines[cursor];
    if (!first) return undefined;
    let end: number | undefined;
    // The homologated layout centers each multiline description on the date
    // and monetary fields. Consume a unique whole block, never a fixed-height
    // crop or a midpoint slice. The ordered scan stops past the alignment band.
    for (let i = cursor; i < lines.length; i += 1) {
      const center = (first[0]!.y + lines[i]![0]!.y) / 2;
      if (center > y + 3.5) break;
      if (Math.abs(center - y) <= 3.5) {
        if (end !== undefined) return undefined;
        end = i;
      }
    }
    if (end === undefined) return undefined;
    descriptions.push(
      lines
        .slice(cursor, end + 1)
        .map((line) =>
          line
            .sort((a, b) => a.x - b.x)
            .map((word) => word.text)
            .join(" "),
        )
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    );
    cursor = end + 1;
  }
  return cursor === lines.length ? descriptions : undefined;
}

function rowText(page: PdfExtractedPage, y: number, left: number, right: number): string {
  return page.words
    .filter((word) => word.x >= left && word.x < right && Math.abs(word.y - y) <= 3.5)
    .sort((a, b) => a.x - b.x)
    .map((word) => word.text)
    .join(" ")
    .trim();
}

function tableFooterY(page: PdfExtractedPage, headerY: number): number {
  const markers = page.words.filter((word) => {
    if (word.y <= headerY) return false;
    if (word.x >= 380 && /^\d+\/\d+$/.test(word.text)) return true;
    if (word.x >= 76 || !["data", "voce", "mercado"].includes(normalize(word.text))) return false;
    const line = normalize(rowText(page, word.y, 0, 445));
    return /^(?:data de geracao:|voce tem alguma duvida\?|mercado pago instituicao de pagamento\b)/.test(
      line,
    );
  });
  return Math.min(Infinity, ...markers.map((word) => word.y));
}

function parsePageMovements(page: PdfExtractedPage): Movement[] | undefined {
  const header = page.words.find(
    (word) => normalize(word.text) === "data" && word.x >= 25 && word.x < 65 && word.y < 220,
  );
  if (!header) return undefined;
  const descriptionHeader = page.words.find(
    (word) =>
      normalize(word.text) === "descricao" &&
      Math.abs(word.y - header.y) < 3 &&
      word.x >= 70 &&
      word.x < 185,
  );
  if (
    !descriptionHeader ||
    !page.words.some(
      (word) => normalize(word.text) === "saldo" && Math.abs(word.y - header.y) < 3 && word.x > 350,
    )
  )
    return undefined;

  // Derive row cardinality from the transaction columns, not just valid dates.
  // A malformed or missing date must never hide a financial movement from the
  // balance/total checks. Each row has an operation ID and monetary columns.
  // A table has no fixed vertical cutoff. Inspect financial anchors all the
  // way down the page, including beyond the observed footer, before excluding
  // any footer text. Otherwise a displaced row could disappear silently.
  const footerY = tableFooterY(page, header.y);
  const rowWord = (word: PdfExtractedWord): boolean => word.y >= header.y;
  const isFinancialAnchor = (word: PdfExtractedWord): boolean =>
    rowWord(word) &&
    ((word.x >= 195 && word.x < 285 && /^\d{7,18}$/.test(word.text)) ||
      (word.x >= 285 &&
        word.x < 445 &&
        (word.text === "R$" ||
          (/^-?\d[\d.,]*$/.test(word.text) && (word.y < footerY || /,\d{2}$/.test(word.text))))));
  const dateWords = page.words.filter(
    (word) =>
      rowWord(word) && Math.abs(word.x - header.x) < 6 && /^\d{2}-\d{2}-\d{4}$/.test(word.text),
  );
  const anchors = [...dateWords, ...page.words.filter(isFinancialAnchor)].sort((a, b) => a.y - b.y);
  // Plain address/contact numbers in a recognized footer are not movements,
  // but dates, operation IDs and monetary fields there make the layout unsafe.
  if (anchors.some((word) => word.y <= header.y + 3.5 || word.y >= footerY - 3.5)) return undefined;
  const rowAnchors: number[] = [];
  for (const anchor of anchors) {
    const last = rowAnchors[rowAnchors.length - 1];
    if (last === undefined || Math.abs(anchor.y - last) > 3.5) rowAnchors.push(anchor.y);
  }
  if (rowAnchors.length === 0 || rowAnchors.length !== dateWords.length) return undefined;
  const dates = rowAnchors.map((y) => dateWords.find((word) => Math.abs(word.y - y) <= 3.5));
  if (dates.some((date) => date === undefined)) return undefined;
  const descriptions = pageDescriptions(
    page,
    descriptionHeader,
    footerY,
    dates.map((date) => date!.y),
  );
  if (!descriptions) return undefined;

  const movements: Movement[] = [];
  for (let i = 0; i < dates.length; i += 1) {
    const date = dates[i]!;
    const description = descriptions[i]!;
    const externalId = rowText(page, date.y, 195, 285);
    const signed = parseMoney(rowText(page, date.y, 285, 354));
    const balance = parseMoney(rowText(page, date.y, 354, 445));
    if (
      !description ||
      description.length > 240 ||
      !/^\d{11,18}$/.test(externalId) ||
      signed === undefined ||
      signed === 0 ||
      balance === undefined
    )
      return undefined;
    movements.push({ date: date.text, description, externalId, signed, balance });
  }
  return movements;
}

function block(code: string, rowNumber = 0): ParsedStatement {
  const problem: StructuredImportProblem = {
    rowNumber,
    severity: "error",
    code,
    message: "Nao foi possivel validar integralmente as linhas e saldos do extrato Mercado Pago.",
  };
  return { state: "blocked", documentClass: "bank_statement", rows: [], problems: [problem] };
}

export function parseMercadoPagoStatement(pages: readonly PdfExtractedPage[]): ParsedStatement {
  if (!recognizeMercadoPagoStatement(pages)) return block("IMPORT_PDF_LAYOUT_UNSUPPORTED");
  const firstPage = pages[0]!;
  const opening = findSummaryAmount(firstPage, "inicial", 55, 165);
  const incoming = findSummaryAmount(firstPage, "entradas", 170, 310);
  const outgoing = findSummaryAmount(firstPage, "saidas", 170, 310);
  const closing = findSummaryAmount(firstPage, "final", 335, 445);
  if ([opening, incoming, outgoing, closing].some((value) => value === undefined))
    return block("IMPORT_PDF_SUMMARY_INVALID");

  const movements: Movement[] = [];
  for (const page of pages) {
    const pageMovements = parsePageMovements(page);
    if (!pageMovements) return block("IMPORT_PDF_ROW_INVALID", movements.length + 1);
    movements.push(...pageMovements);
  }
  if (movements.length === 0) return block("IMPORT_PDF_NO_VALID_ROWS");

  const ids = new Set<string>();
  const rows: StructuredImportRow[] = [];
  let balance = opening!;
  let credits = 0;
  let debits = 0;
  for (const movement of movements) {
    const [day, month, year] = movement.date.split("-");
    const occurredOn = `${year}-${month}-${day}`;
    const date = new Date(`${occurredOn}T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== occurredOn ||
      ids.has(movement.externalId)
    )
      return block("IMPORT_PDF_ROW_INVALID", rows.length + 1);
    ids.add(movement.externalId);
    balance += movement.signed;
    if (!Number.isSafeInteger(balance) || balance !== movement.balance)
      return block("IMPORT_PDF_BALANCE_MISMATCH", rows.length + 1);
    if (movement.signed > 0) credits += movement.signed;
    else debits += movement.signed;
    const rowNumber = rows.length + 1;
    rows.push({
      rowNumber,
      occurredOn: occurredOn as ISODate,
      description: movement.description,
      kind: movement.signed > 0 ? "income" : "expense",
      direction: movement.signed > 0 ? "inflow" : "outflow",
      amountMinor: Math.abs(movement.signed),
      currency: "BRL",
      externalId: movement.externalId,
      sourceHash: `sha256-${createHash("sha256")
        .update(
          [
            String(rowNumber),
            occurredOn,
            movement.externalId,
            String(movement.signed),
            String(movement.balance),
            movement.description,
          ].join("\u001f"),
        )
        .digest("hex")}`,
    });
  }
  if (balance !== closing || credits !== incoming || debits !== outgoing)
    return block("IMPORT_PDF_TOTAL_MISMATCH");
  return { state: "ready", documentClass: "bank_statement", rows, problems: [] };
}
