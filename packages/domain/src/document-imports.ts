import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

import type { ImportLineDirection, ISODate, TransactionKind } from "./index.js";

export type ImportDocumentClass = "bank_statement" | "credit_card_invoice";
export type StructuredImportKind = "xlsx" | "pdf";

export interface XlsxImportMapping {
  version: 1;
  date?: string;
  description?: string;
  amount?: string;
  currency?: string;
  instrument?: string;
  invoicePeriod?: string;
  installmentSequence?: string;
  installmentTotal?: string;
}

export interface StructuredImportProblem {
  rowNumber: number;
  severity: "error" | "warning";
  code: string;
  message: string;
}

export interface StructuredImportRow {
  rowNumber: number;
  occurredOn: ISODate;
  description: string;
  kind: Extract<TransactionKind, "income" | "expense">;
  direction: ImportLineDirection;
  amountMinor: number;
  currency: string;
  externalId?: string;
  maskedInstrument?: string;
  invoicePeriod?: string;
  installmentSequence?: number;
  installmentTotal?: number;
  sourceHash: string;
}

export interface StructuredImportPreview {
  state: "ready" | "mapping_required" | "blocked";
  documentClass: ImportDocumentClass;
  rows: readonly StructuredImportRow[];
  problems: readonly StructuredImportProblem[];
  xlsx?: {
    sheets: readonly string[];
    selectedSheet?: string;
    headers: readonly string[];
    mapping?: XlsxImportMapping;
  };
  pdf?: {
    parserId: string;
    parserVersion: string;
    institution: string;
  };
}

export interface PdfParserDescriptor {
  id: string;
  version: string;
  institution: string;
  documentClass: ImportDocumentClass;
  recognize: (text: string) => boolean;
  parse: (text: string) => Omit<StructuredImportPreview, "pdf">;
}

export class StructuredImportError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = "StructuredImportError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export const STRUCTURED_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const XLSX_MAX_ZIP_ENTRIES = 256;
export const XLSX_MAX_UNCOMPRESSED_BYTES = 16 * 1024 * 1024;
export const XLSX_MAX_ENTRY_BYTES = 4 * 1024 * 1024;

export function decodeStructuredImportBase64(value: string): Buffer {
  if (value.trim().length === 0) {
    throw new StructuredImportError("IMPORT_FILE_EMPTY", "Arquivo de importacao vazio.");
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new StructuredImportError(
      "IMPORT_FILE_ENCODING_INVALID",
      "Conteudo binario da importacao possui codificacao invalida.",
    );
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.length === 0) {
    throw new StructuredImportError("IMPORT_FILE_EMPTY", "Arquivo de importacao vazio.");
  }
  if (bytes.length > STRUCTURED_IMPORT_MAX_BYTES) {
    throw new StructuredImportError(
      "IMPORT_FILE_TOO_LARGE",
      "Arquivo excede o limite de 5 MB.",
      413,
    );
  }
  return bytes;
}

export function buildStructuredContentHash(bytes: Uint8Array): string {
  return `sha256-${createHash("sha256").update(bytes).digest("hex")}`;
}

export function parseXlsxImport(input: {
  contentBase64: string;
  documentClass: ImportDocumentClass;
  sheetName?: string;
  mapping?: XlsxImportMapping;
  defaultCurrency?: string;
}): StructuredImportPreview {
  const bytes = decodeStructuredImportBase64(input.contentBase64);
  const entries = readZipEntries(bytes);
  if ([...entries.keys()].some((name) => /(^|\/)vbaProject\.bin$/i.test(name))) {
    // Active content is deliberately ignored. This is a diagnostic only: no macro engine is used.
  }

  const workbook = requireZipText(entries, "xl/workbook.xml");
  const workbookRels = requireZipText(entries, "xl/_rels/workbook.xml.rels");
  rejectUnsafeXml(workbook);
  rejectUnsafeXml(workbookRels);
  const relationTargets = parseRelationships(workbookRels);
  const sheets = parseWorkbookSheets(workbook, relationTargets);
  if (sheets.length === 0) {
    throw new StructuredImportError("IMPORT_XLSX_INVALID", "A planilha nao possui abas legiveis.");
  }

  const selected =
    input.sheetName === undefined
      ? sheets.length === 1
        ? sheets[0]
        : undefined
      : sheets.find((sheet) => sheet.name === input.sheetName);
  if (input.sheetName !== undefined && selected === undefined) {
    throw new StructuredImportError(
      "IMPORT_XLSX_SHEET_INVALID",
      "A planilha selecionada nao existe neste arquivo.",
      422,
    );
  }

  if (selected === undefined) {
    return {
      state: "mapping_required",
      documentClass: input.documentClass,
      rows: [],
      problems: [],
      xlsx: { sheets: sheets.map((sheet) => sheet.name), headers: [] },
    };
  }

  const sharedStrings = readSharedStrings(entries);
  const sheetXml = requireZipText(entries, selected.path);
  rejectUnsafeXml(sheetXml);
  const table = parseWorksheet(sheetXml, sharedStrings);
  if (table.length === 0) {
    return {
      state: "blocked",
      documentClass: input.documentClass,
      rows: [],
      problems: [
        {
          rowNumber: 0,
          severity: "error",
          code: "IMPORT_XLSX_NO_DATA_ROWS",
          message: "A planilha selecionada nao possui dados importaveis.",
        },
      ],
      xlsx: {
        sheets: sheets.map((sheet) => sheet.name),
        selectedSheet: selected.name,
        headers: [],
        ...(input.mapping ? { mapping: input.mapping } : {}),
      },
    };
  }

  const headers = table[0]!.values.map((value) => value.trim());
  if (new Set(headers.filter(Boolean).map(normalizeKey)).size !== headers.filter(Boolean).length) {
    throw new StructuredImportError(
      "IMPORT_XLSX_HEADER_INVALID",
      "A planilha possui cabecalhos vazios ou repetidos.",
      422,
    );
  }
  const mapping = input.mapping;
  if (mapping === undefined || !hasRequiredMapping(mapping)) {
    return {
      state: "mapping_required",
      documentClass: input.documentClass,
      rows: [],
      problems: [],
      xlsx: {
        sheets: sheets.map((sheet) => sheet.name),
        selectedSheet: selected.name,
        headers,
        ...(mapping ? { mapping } : {}),
      },
    };
  }
  assertMappingHeaders(headers, mapping);

  const problems: StructuredImportProblem[] = [];
  const rows: StructuredImportRow[] = [];
  for (const record of table.slice(1)) {
    if (record.values.every((value) => value.trim().length === 0)) continue;
    const result = normalizeMappedRow(
      record.rowNumber,
      headers,
      record.values,
      input.documentClass,
      mapping,
      input.defaultCurrency,
    );
    problems.push(...result.problems);
    if (result.row) rows.push(result.row);
  }

  return {
    state: rows.length > 0 ? "ready" : "blocked",
    documentClass: input.documentClass,
    rows,
    problems,
    xlsx: {
      sheets: sheets.map((sheet) => sheet.name),
      selectedSheet: selected.name,
      headers,
      mapping,
    },
  };
}

export const PDF_PARSER_CATALOG: readonly PdfParserDescriptor[] = [
  {
    id: "solverfin-fixture-bank-statement",
    version: "1",
    institution: "solverfin-fixture-bank",
    documentClass: "bank_statement",
    recognize: (text) => text.includes("%SOLVERFIN:STATEMENT:V1"),
    parse: (text) => parseFixturePdfRows(text, "bank_statement"),
  },
  {
    id: "solverfin-fixture-bank-statement-alt",
    version: "1",
    institution: "solverfin-fixture-bank-alt",
    documentClass: "bank_statement",
    recognize: (text) => text.includes("%SOLVERFIN:STATEMENT-ALT:V1"),
    parse: (text) => parseFixturePdfRows(text, "bank_statement"),
  },
  {
    id: "solverfin-fixture-card-invoice",
    version: "1",
    institution: "solverfin-fixture-card",
    documentClass: "credit_card_invoice",
    recognize: (text) => text.includes("%SOLVERFIN:CARD-INVOICE:V1"),
    parse: (text) => parseFixturePdfRows(text, "credit_card_invoice"),
  },
];

export function parsePdfImport(input: {
  contentBase64: string;
  documentClass: ImportDocumentClass;
}): StructuredImportPreview {
  const bytes = decodeStructuredImportBase64(input.contentBase64);
  const text = bytes.toString("latin1");
  if (!text.startsWith("%PDF-")) {
    throw new StructuredImportError("IMPORT_PDF_INVALID", "PDF estruturalmente invalido.");
  }
  if (/\/Encrypt\b/.test(text)) {
    throw new StructuredImportError(
      "IMPORT_PDF_PROTECTED",
      "PDF protegido por senha nao pode ser importado.",
      422,
    );
  }

  const candidates = PDF_PARSER_CATALOG.filter(
    (parser) => parser.documentClass === input.documentClass && parser.recognize(text),
  );
  if (candidates.length === 0) {
    throw new StructuredImportError(
      "IMPORT_PDF_LAYOUT_UNSUPPORTED",
      "Layout de PDF ainda nao suportado.",
      422,
    );
  }
  if (candidates.length > 1) {
    throw new StructuredImportError(
      "IMPORT_PDF_LAYOUT_AMBIGUOUS",
      "O PDF corresponde a mais de um layout homologado e precisa ser bloqueado.",
      422,
    );
  }

  const parser = candidates[0]!;
  const parsed = parser.parse(text);
  return {
    ...parsed,
    pdf: {
      parserId: parser.id,
      parserVersion: parser.version,
      institution: parser.institution,
    },
  };
}

function parseFixturePdfRows(
  text: string,
  documentClass: ImportDocumentClass,
): Omit<StructuredImportPreview, "pdf"> {
  const lines = text.split(/\r?\n/);
  const rows: StructuredImportRow[] = [];
  const problems: StructuredImportProblem[] = [];
  let invoicePeriod: string | undefined;
  let invoiceCurrency: string | undefined;
  let invoiceInstrument: string | undefined;

  for (const line of lines) {
    if (line.startsWith("%META|")) {
      for (const part of line.slice(6).split("|")) {
        const [key, value] = part.split("=", 2);
        if (key === "currency") invoiceCurrency = normalizeCurrency(value);
        if (key === "invoicePeriod" && /^\d{4}-\d{2}$/.test(value ?? "")) invoicePeriod = value;
        if (key === "instrument") invoiceInstrument = safeText(value, 32);
      }
      continue;
    }

    const prefix = documentClass === "bank_statement" ? "%TX|" : "%PURCHASE|";
    if (!line.startsWith(prefix)) continue;
    const rowNumber = rows.length + problems.length + 1;
    const parts = line.slice(prefix.length).split("|");
    const [dateRaw, amountRaw, currencyRaw, descriptionRaw, externalOrInstrument, installmentRaw] =
      parts;
    const occurredOn = normalizeDate(dateRaw);
    const signed = parseDecimalMinor(amountRaw);
    const currency = normalizeCurrency(currencyRaw ?? invoiceCurrency);
    const description = safeText(descriptionRaw, 240);
    if (!occurredOn || signed === undefined || signed === 0 || !currency || !description) {
      problems.push({
        rowNumber,
        severity: "error",
        code: "IMPORT_PDF_ROW_INVALID",
        message: "Linha do PDF homologado possui campos obrigatorios invalidos.",
      });
      continue;
    }

    if (documentClass === "credit_card_invoice" && signed < 0) {
      problems.push({
        rowNumber,
        severity: "error",
        code: "IMPORT_PDF_CARD_AMOUNT_INVALID",
        message: "Compra da fatura precisa possuir valor positivo.",
      });
      continue;
    }

    const kind =
      documentClass === "credit_card_invoice" ? "expense" : signed < 0 ? "expense" : "income";
    const direction =
      documentClass === "credit_card_invoice" ? "outflow" : signed < 0 ? "outflow" : "inflow";
    const installment = parseInstallment(installmentRaw);
    const externalId =
      documentClass === "bank_statement" ? safeText(externalOrInstrument, 120) : undefined;
    const maskedInstrument =
      documentClass === "credit_card_invoice"
        ? safeText(externalOrInstrument, 32) ?? invoiceInstrument
        : undefined;
    rows.push({
      rowNumber,
      occurredOn,
      description,
      kind,
      direction,
      amountMinor: Math.abs(signed),
      currency,
      sourceHash: hashRow([
        String(rowNumber),
        dateRaw ?? "",
        amountRaw ?? "",
        currency,
        description,
        externalOrInstrument ?? "",
        installmentRaw ?? "",
      ]),
      ...(externalId === undefined ? {} : { externalId }),
      ...(documentClass === "credit_card_invoice"
        ? {
            ...(maskedInstrument === undefined ? {} : { maskedInstrument }),
            ...(invoicePeriod ? { invoicePeriod } : {}),
            ...(installment ? installment : {}),
          }
        : {}),
    });
  }

  return {
    state: rows.length > 0 ? "ready" : "blocked",
    documentClass,
    rows,
    problems:
      rows.length === 0 && problems.length === 0
        ? [
            {
              rowNumber: 0,
              severity: "error",
              code: "IMPORT_PDF_NO_VALID_ROWS",
              message: "O layout foi reconhecido, mas nao possui linhas financeiras validas.",
            },
          ]
        : problems,
  };
}

function normalizeMappedRow(
  rowNumber: number,
  headers: readonly string[],
  values: readonly string[],
  documentClass: ImportDocumentClass,
  mapping: XlsxImportMapping,
  defaultCurrency: string | undefined,
): { row?: StructuredImportRow; problems: StructuredImportProblem[] } {
  const get = (header: string | undefined): string | undefined => {
    if (!header) return undefined;
    const index = headers.findIndex((candidate) => candidate === header);
    return index < 0 ? undefined : values[index]?.trim();
  };
  const occurredOn = normalizeDate(get(mapping.date));
  const description = safeText(get(mapping.description), 240);
  const signed = parseDecimalMinor(get(mapping.amount));
  const currency = normalizeCurrency(get(mapping.currency) || defaultCurrency);
  const problems: StructuredImportProblem[] = [];
  if (!occurredOn || !description || signed === undefined || signed === 0 || !currency) {
    problems.push({
      rowNumber,
      severity: "error",
      code: "IMPORT_XLSX_ROW_INVALID",
      message: "Linha da planilha possui data, descricao, valor ou moeda invalidos.",
    });
    return { problems };
  }
  if (documentClass === "credit_card_invoice" && signed < 0) {
    problems.push({
      rowNumber,
      severity: "error",
      code: "IMPORT_XLSX_CARD_AMOUNT_INVALID",
      message: "Compra da fatura precisa possuir valor positivo.",
    });
    return { problems };
  }
  const installmentSequence = parsePositiveInteger(get(mapping.installmentSequence));
  const installmentTotal = parsePositiveInteger(get(mapping.installmentTotal));
  if (
    (installmentSequence === undefined) !== (installmentTotal === undefined) ||
    (installmentSequence !== undefined &&
      installmentTotal !== undefined &&
      installmentSequence > installmentTotal)
  ) {
    problems.push({
      rowNumber,
      severity: "warning",
      code: "IMPORT_INSTALLMENT_REVIEW_REQUIRED",
      message:
        "Parcelamento incompleto ou inconsistente foi mantido para revisao sem ser inventado.",
    });
  }

  const kind =
    documentClass === "credit_card_invoice" ? "expense" : signed < 0 ? "expense" : "income";
  const direction =
    documentClass === "credit_card_invoice" ? "outflow" : signed < 0 ? "outflow" : "inflow";
  const row: StructuredImportRow = {
    rowNumber,
    occurredOn,
    description,
    kind,
    direction,
    amountMinor: Math.abs(signed),
    currency,
    sourceHash: hashRow([String(rowNumber), occurredOn, description, String(signed), currency]),
  };
  const instrument = safeText(get(mapping.instrument), 32);
  const invoicePeriod = get(mapping.invoicePeriod);
  if (documentClass === "credit_card_invoice") {
    if (instrument) row.maskedInstrument = instrument;
    if (invoicePeriod && /^\d{4}-\d{2}$/.test(invoicePeriod)) row.invoicePeriod = invoicePeriod;
    if (
      installmentSequence !== undefined &&
      installmentTotal !== undefined &&
      installmentSequence <= installmentTotal
    ) {
      row.installmentSequence = installmentSequence;
      row.installmentTotal = installmentTotal;
    }
  }
  return { row, problems };
}

function readZipEntries(bytes: Buffer): Map<string, Buffer> {
  const eocd = findEndOfCentralDirectory(bytes);
  const entryCount = bytes.readUInt16LE(eocd + 10);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  if (entryCount > XLSX_MAX_ZIP_ENTRIES) {
    throw new StructuredImportError(
      "IMPORT_XLSX_LIMIT_EXCEEDED",
      "XLSX possui arquivos internos demais.",
      422,
    );
  }

  const result = new Map<string, Buffer>();
  let offset = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) {
      throw new StructuredImportError("IMPORT_XLSX_INVALID", "Diretorio ZIP do XLSX e invalido.");
    }
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if ((flags & 1) !== 0) {
      throw new StructuredImportError(
        "IMPORT_XLSX_PROTECTED",
        "XLSX protegido nao pode ser importado.",
        422,
      );
    }
    if (uncompressedSize > XLSX_MAX_ENTRY_BYTES) {
      throw new StructuredImportError(
        "IMPORT_XLSX_LIMIT_EXCEEDED",
        "Parte interna do XLSX excede o limite seguro.",
        422,
      );
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > XLSX_MAX_UNCOMPRESSED_BYTES) {
      throw new StructuredImportError(
        "IMPORT_XLSX_LIMIT_EXCEEDED",
        "XLSX descompactado excede o limite seguro.",
        422,
      );
    }
    if (bytes.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new StructuredImportError("IMPORT_XLSX_INVALID", "Entrada ZIP do XLSX e invalida.");
    }
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    let unpacked: Buffer;
    if (method === 0) unpacked = Buffer.from(compressed);
    else if (method === 8) unpacked = inflateRawSync(compressed);
    else {
      throw new StructuredImportError(
        "IMPORT_XLSX_COMPRESSION_UNSUPPORTED",
        "XLSX usa compressao nao suportada.",
        422,
      );
    }
    if (unpacked.length !== uncompressedSize) {
      throw new StructuredImportError(
        "IMPORT_XLSX_INVALID",
        "Tamanho descompactado do XLSX e inconsistente.",
      );
    }
    result.set(name.replace(/\\/g, "/"), unpacked);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return result;
}

function findEndOfCentralDirectory(bytes: Buffer): number {
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new StructuredImportError(
    "IMPORT_XLSX_INVALID",
    "Arquivo XLSX nao possui diretorio ZIP valido.",
  );
}

function requireZipText(entries: ReadonlyMap<string, Buffer>, path: string): string {
  const entry = entries.get(path);
  if (!entry) {
    throw new StructuredImportError(
      "IMPORT_XLSX_INVALID",
      "Estrutura OOXML obrigatoria ausente.",
    );
  }
  return entry.toString("utf8");
}

function rejectUnsafeXml(xml: string): void {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new StructuredImportError(
      "IMPORT_XLSX_XML_UNSAFE",
      "XML interno do XLSX contem construcao nao permitida.",
      422,
    );
  }
}

function parseRelationships(xml: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const match of xml.matchAll(/<Relationship\b([^>]+?)\/?\s*>/g)) {
    const attrs = parseXmlAttrs(match[1] ?? "");
    if (attrs.Id && attrs.Target) result.set(attrs.Id, attrs.Target);
  }
  return result;
}

function parseWorkbookSheets(
  xml: string,
  relations: ReadonlyMap<string, string>,
): Array<{ name: string; path: string }> {
  const result: Array<{ name: string; path: string }> = [];
  for (const match of xml.matchAll(/<sheet\b([^>]+?)\/?\s*>/g)) {
    const attrs = parseXmlAttrs(match[1] ?? "");
    const relationId = attrs["r:id"];
    const target = relationId ? relations.get(relationId) : undefined;
    if (!attrs.name || !target) continue;
    const normalizedTarget = target.replace(/^\.?\//, "");
    result.push({
      name: decodeXml(attrs.name),
      path: normalizedTarget.startsWith("xl/") ? normalizedTarget : `xl/${normalizedTarget}`,
    });
  }
  return result;
}

function readSharedStrings(entries: ReadonlyMap<string, Buffer>): string[] {
  const entry = entries.get("xl/sharedStrings.xml");
  if (!entry) return [];
  const xml = entry.toString("utf8");
  rejectUnsafeXml(xml);
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
    [...(match[1] ?? "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map((piece) => decodeXml(piece[1] ?? ""))
      .join(""),
  );
}

function parseWorksheet(
  xml: string,
  sharedStrings: readonly string[],
): Array<{ rowNumber: number; values: string[] }> {
  const rows: Array<{ rowNumber: number; values: string[] }> = [];
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowAttrs = parseXmlAttrs(rowMatch[1] ?? "");
    const rowNumber = Number(rowAttrs.r) || rows.length + 1;
    const values: string[] = [];
    for (const cellMatch of (rowMatch[2] ?? "").matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = parseXmlAttrs(cellMatch[1] ?? "");
      const reference = attrs.r ?? "";
      const column = columnIndex(reference);
      while (values.length <= column) values.push("");
      const body = cellMatch[2] ?? "";
      if (/<f\b/i.test(body)) {
        values[column] = "";
        continue;
      }
      const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
      const inline = /<is\b[^>]*>([\s\S]*?)<\/is>/.exec(body)?.[1];
      if (attrs.t === "s" && raw !== undefined) {
        values[column] = sharedStrings[Number(raw)] ?? "";
      } else if (inline !== undefined) {
        values[column] = [...inline.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
          .map((match) => decodeXml(match[1] ?? ""))
          .join("");
      } else {
        values[column] = decodeXml(raw ?? "");
      }
    }
    rows.push({ rowNumber, values });
  }
  return rows;
}

function columnIndex(reference: string): number {
  const letters = /^[A-Z]+/i.exec(reference)?.[0]?.toUpperCase() ?? "A";
  let value = 0;
  for (const char of letters) value = value * 26 + char.charCodeAt(0) - 64;
  return Math.max(0, value - 1);
}

function parseXmlAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(/([:\w-]+)\s*=\s*["']([^"']*)["']/g)) {
    attrs[match[1]!] = decodeXml(match[2] ?? "");
  }
  return attrs;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function hasRequiredMapping(mapping: XlsxImportMapping): boolean {
  return Boolean(mapping.date && mapping.description && mapping.amount);
}

function assertMappingHeaders(headers: readonly string[], mapping: XlsxImportMapping): void {
  const used = [
    mapping.date,
    mapping.description,
    mapping.amount,
    mapping.currency,
    mapping.instrument,
    mapping.invoicePeriod,
    mapping.installmentSequence,
    mapping.installmentTotal,
  ].filter((value): value is string => Boolean(value));
  if (new Set(used).size !== used.length || used.some((value) => !headers.includes(value))) {
    throw new StructuredImportError(
      "IMPORT_XLSX_MAPPING_INVALID",
      "Mapeamento XLSX e invalido ou conflitante.",
      422,
    );
  }
}

function normalizeDate(value: string | undefined): ISODate | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed
      ? undefined
      : trimmed;
  }
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!match) return undefined;
  return normalizeDate(`${match[3]}-${match[2]}-${match[1]}`);
}

function parseDecimalMinor(value: string | undefined): number | undefined {
  if (!value) return undefined;
  let normalized = value.trim().replace(/\s/g, "");
  if (!normalized) return undefined;
  if (/^-?\d{1,3}(\.\d{3})+,\d{1,2}$/.test(normalized)) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(,\d{3})+\.\d{1,2}$/.test(normalized)) {
    normalized = normalized.replace(/,/g, "");
  } else if (/^-?\d+,\d{1,2}$/.test(normalized)) {
    normalized = normalized.replace(",", ".");
  }
  const match = /^(-?)(\d{1,13})(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return undefined;
  const cents = Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return undefined;
  return match[1] === "-" ? -cents : cents;
}

function normalizeCurrency(value: string | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized ?? "") ? normalized : undefined;
}

function safeText(value: string | undefined, max: number): string | undefined {
  const normalized = value?.replace(/[\u0000-\u001f\u007f]/g, " ").trim().replace(/\s+/g, " ");
  return normalized && normalized.length <= max ? normalized : undefined;
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseInstallment(
  value: string | undefined,
): { installmentSequence: number; installmentTotal: number } | undefined {
  const match = /^(\d{1,3})\/(\d{1,3})$/.exec(value?.trim() ?? "");
  if (!match) return undefined;
  const installmentSequence = Number(match[1]);
  const installmentTotal = Number(match[2]);
  if (
    installmentSequence < 1 ||
    installmentTotal < 1 ||
    installmentSequence > installmentTotal
  )
    return undefined;
  return { installmentSequence, installmentTotal };
}

function normalizeKey(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function hashRow(parts: readonly string[]): string {
  return `sha256-${createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex")}`;
}
