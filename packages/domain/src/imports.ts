import type {
  EntityId,
  ImportSourceKind,
  ImportStatus,
  ISODate,
  ISODateTime,
  TenantScoped,
  TransactionKind,
} from "./index.js";
import type { TenantContext } from "./tenant.js";

export type ImportFileKind = Extract<ImportSourceKind, "csv" | "ofx">;
export type ImportPreviewState = "ready" | "blocked";
export type ImportProblemSeverity = "error" | "warning";
export type ImportSuggestionStatus = "pending_review" | "duplicate";

export type ImportFileErrorCode =
  | "IMPORT_FILE_EMPTY"
  | "IMPORT_FILE_TOO_LARGE"
  | "IMPORT_FILE_KIND_UNSUPPORTED"
  | "IMPORT_CSV_HEADER_INVALID"
  | "IMPORT_OFX_INVALID";

export class ImportFileError extends Error {
  readonly code: ImportFileErrorCode;
  readonly statusCode = 400;

  constructor(code: ImportFileErrorCode, message: string) {
    super(message);
    this.name = "ImportFileError";
    this.code = code;
  }
}

export interface ImportFileInput {
  context: TenantContext;
  now: ISODateTime;
  originalFileName: string;
  content: string;
  kind?: ImportFileKind;
  maxSizeInBytes?: number;
  existingSourceHashes?: readonly string[];
  csvMapping?: CsvImportMapping;
}

export interface CsvImportMapping {
  date?: string;
  description?: string;
  amount?: string;
  kind?: string;
  accountId?: string;
  categoryId?: string;
}

export interface ImportBatchDraft extends TenantScoped {
  sourceKind: ImportFileKind;
  status: ImportStatus;
  originalFileName: string;
  sourceHash: string;
  receivedAt: ISODateTime;
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  problemRows: number;
}

export interface ImportProblem {
  rowNumber: number;
  severity: ImportProblemSeverity;
  code: string;
  message: string;
}

export interface ImportTransactionSuggestion extends TenantScoped {
  id: EntityId;
  status: ImportSuggestionStatus;
  sourceKind: ImportFileKind;
  sourceHash: string;
  sourceRowNumber: number;
  occurredOn: ISODate;
  description: string;
  kind: TransactionKind;
  amountMinor: number;
  currency: string;
  accountId?: EntityId;
  categoryId?: EntityId;
  externalId?: string;
}

export interface ImportPreview {
  state: ImportPreviewState;
  batch: ImportBatchDraft;
  suggestions: readonly ImportTransactionSuggestion[];
  problems: readonly ImportProblem[];
}

interface ParsedImportRow {
  rowNumber: number;
  occurredOn: ISODate | undefined;
  description: string | undefined;
  amountMinor: number | undefined;
  kind: TransactionKind | undefined;
  accountId: EntityId | undefined;
  categoryId: EntityId | undefined;
  externalId: string | undefined;
  rawFingerprintSeed: string;
}

const defaultMaxSizeInBytes = 1024 * 1024;
const defaultCurrency = "BRL";

export function previewImportedStatement(input: ImportFileInput): ImportPreview {
  assertContentSize(input.content, input.maxSizeInBytes ?? defaultMaxSizeInBytes);

  const kind = input.kind ?? inferImportFileKind(input.originalFileName);
  const parsedRows = parseImportRows(kind, input.content, input.csvMapping);
  const existingSourceHashes = new Set(input.existingSourceHashes ?? []);
  const problems: ImportProblem[] = [];
  const suggestions: ImportTransactionSuggestion[] = [];

  for (const row of parsedRows) {
    const rowProblems = validateParsedRow(row);
    problems.push(...rowProblems);

    if (rowProblems.some((problem) => problem.severity === "error")) {
      continue;
    }

    const sourceHash = buildStableImportHash(
      `${kind}:${input.context.organizationId}:${input.context.financialProfileId}:${row.rawFingerprintSeed}`,
    );
    const duplicate = existingSourceHashes.has(sourceHash);
    const suggestion = buildSuggestion(input.context, kind, row, sourceHash, duplicate);
    suggestions.push(suggestion);

    if (duplicate) {
      problems.push({
        rowNumber: row.rowNumber,
        severity: "warning",
        code: "IMPORT_ROW_DUPLICATE",
        message: "Esta linha parece ja ter sido importada e deve ser revisada antes de confirmar.",
      });
    }
  }

  const batch = buildBatchDraft(input, kind, parsedRows.length, suggestions, problems);

  return {
    state: suggestions.length > 0 ? "ready" : "blocked",
    batch,
    suggestions,
    problems,
  };
}

export function buildStableImportHash(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function parseImportRows(
  kind: ImportFileKind,
  content: string,
  csvMapping: CsvImportMapping | undefined,
): ParsedImportRow[] {
  if (kind === "csv") {
    return parseCsvRows(content, csvMapping);
  }

  return parseOfxRows(content);
}

function parseCsvRows(content: string, mapping: CsvImportMapping | undefined): ParsedImportRow[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new ImportFileError(
      "IMPORT_CSV_HEADER_INVALID",
      "CSV precisa ter cabecalho e ao menos uma linha de movimento.",
    );
  }

  const header = splitCsvLine(lines[0] as string).map(normalizeHeaderName);
  const columns = resolveCsvColumns(header, mapping);

  return lines.slice(1).map((line, index) => {
    const values = splitCsvLine(line);
    const amountText = readCsvValue(values, columns.amountIndex);
    const parsedAmount = parseAmountMinor(amountText);
    const kindText = readOptionalCsvValue(values, columns.kindIndex);
    const kind = parseTransactionKind(kindText, parsedAmount.signedAmountMinor);

    return {
      rowNumber: index + 2,
      occurredOn: normalizeDate(readCsvValue(values, columns.dateIndex)),
      description: normalizeDescription(readCsvValue(values, columns.descriptionIndex)),
      amountMinor: parsedAmount.amountMinor,
      kind,
      accountId: readOptionalCsvValue(values, columns.accountIndex),
      categoryId: readOptionalCsvValue(values, columns.categoryIndex),
      externalId: undefined,
      rawFingerprintSeed: line,
    };
  });
}

function parseOfxRows(content: string): ParsedImportRow[] {
  const blocks = [...content.matchAll(/<STMTTRN>([\s\S]*?)(?=<STMTTRN>|<\/BANKTRANLIST>|$)/gi)];

  if (blocks.length === 0) {
    throw new ImportFileError(
      "IMPORT_OFX_INVALID",
      "OFX precisa conter ao menos uma transacao STMTTRN.",
    );
  }

  return blocks.map((block, index) => {
    const rawBlock = block[1] ?? "";
    const amountText = readOfxTag(rawBlock, "TRNAMT");
    const parsedAmount = parseAmountMinor(amountText);
    const trnType = readOfxTag(rawBlock, "TRNTYPE");
    const name = readOfxTag(rawBlock, "NAME");
    const memo = readOfxTag(rawBlock, "MEMO");
    const fitId = readOfxTag(rawBlock, "FITID");

    return {
      rowNumber: index + 1,
      occurredOn: normalizeOfxDate(readOfxTag(rawBlock, "DTPOSTED")),
      description: normalizeDescription(name ?? memo ?? fitId),
      amountMinor: parsedAmount.amountMinor,
      kind: parseOfxTransactionKind(trnType, parsedAmount.signedAmountMinor),
      accountId: undefined,
      categoryId: undefined,
      externalId: normalizeDescription(fitId),
      rawFingerprintSeed: rawBlock.trim(),
    };
  });
}

function buildSuggestion(
  context: TenantContext,
  kind: ImportFileKind,
  row: ParsedImportRow,
  sourceHash: string,
  duplicate: boolean,
): ImportTransactionSuggestion {
  const suggestion: ImportTransactionSuggestion = {
    id: `import-suggestion-${sourceHash}`,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    status: duplicate ? "duplicate" : "pending_review",
    sourceKind: kind,
    sourceHash,
    sourceRowNumber: row.rowNumber,
    occurredOn: row.occurredOn as ISODate,
    description: row.description as string,
    kind: row.kind as TransactionKind,
    amountMinor: row.amountMinor as number,
    currency: defaultCurrency,
  };

  if (row.accountId !== undefined) {
    suggestion.accountId = row.accountId;
  }

  if (row.categoryId !== undefined) {
    suggestion.categoryId = row.categoryId;
  }

  if (row.externalId !== undefined) {
    suggestion.externalId = row.externalId;
  }

  return suggestion;
}

function buildBatchDraft(
  input: ImportFileInput,
  kind: ImportFileKind,
  totalRows: number,
  suggestions: readonly ImportTransactionSuggestion[],
  problems: readonly ImportProblem[],
): ImportBatchDraft {
  const duplicateRows = suggestions.filter((suggestion) => suggestion.status === "duplicate").length;
  const errorRows = new Set(
    problems.filter((problem) => problem.severity === "error").map((problem) => problem.rowNumber),
  );

  return {
    organizationId: input.context.organizationId,
    financialProfileId: input.context.financialProfileId,
    sourceKind: kind,
    status: suggestions.length > 0 ? "reviewing" : "failed",
    originalFileName: input.originalFileName,
    sourceHash: buildStableImportHash(`${kind}:${input.content}`),
    receivedAt: input.now,
    totalRows,
    validRows: suggestions.length,
    duplicateRows,
    problemRows: errorRows.size,
  };
}

function validateParsedRow(row: ParsedImportRow): ImportProblem[] {
  const problems: ImportProblem[] = [];

  if (row.occurredOn === undefined) {
    problems.push(buildRowError(row.rowNumber, "IMPORT_ROW_DATE_INVALID", "Informe uma data valida."));
  }

  if (row.description === undefined) {
    problems.push(
      buildRowError(row.rowNumber, "IMPORT_ROW_DESCRIPTION_REQUIRED", "Informe uma descricao."),
    );
  }

  if (row.amountMinor === undefined) {
    problems.push(
      buildRowError(row.rowNumber, "IMPORT_ROW_AMOUNT_INVALID", "Informe um valor valido."),
    );
  }

  if (row.kind === undefined) {
    problems.push(
      buildRowError(row.rowNumber, "IMPORT_ROW_KIND_INVALID", "Informe receita ou despesa."),
    );
  }

  return problems;
}

function buildRowError(rowNumber: number, code: string, message: string): ImportProblem {
  return {
    rowNumber,
    severity: "error",
    code,
    message,
  };
}

function assertContentSize(content: string, maxSizeInBytes: number): void {
  if (content.trim().length === 0) {
    throw new ImportFileError("IMPORT_FILE_EMPTY", "Arquivo de importacao vazio.");
  }

  if (content.length > maxSizeInBytes) {
    throw new ImportFileError("IMPORT_FILE_TOO_LARGE", "Arquivo excede o tamanho permitido.");
  }
}

function inferImportFileKind(fileName: string): ImportFileKind {
  const normalizedFileName = fileName.trim().toLowerCase();

  if (normalizedFileName.endsWith(".csv")) {
    return "csv";
  }

  if (normalizedFileName.endsWith(".ofx")) {
    return "ofx";
  }

  throw new ImportFileError(
    "IMPORT_FILE_KIND_UNSUPPORTED",
    "Formato de arquivo nao suportado para importacao.",
  );
}

interface CsvColumnIndexes {
  dateIndex: number;
  descriptionIndex: number;
  amountIndex: number;
  kindIndex: number | undefined;
  accountIndex: number | undefined;
  categoryIndex: number | undefined;
}

function resolveCsvColumns(header: readonly string[], mapping: CsvImportMapping | undefined): CsvColumnIndexes {
  const dateIndex = requireCsvColumn(header, mapping?.date ?? "date");
  const descriptionIndex = requireCsvColumn(header, mapping?.description ?? "description");
  const amountIndex = requireCsvColumn(header, mapping?.amount ?? "amount");

  return {
    dateIndex,
    descriptionIndex,
    amountIndex,
    kindIndex: findCsvColumn(header, mapping?.kind ?? "kind"),
    accountIndex: findCsvColumn(header, mapping?.accountId ?? "accountId"),
    categoryIndex: findCsvColumn(header, mapping?.categoryId ?? "categoryId"),
  };
}

function requireCsvColumn(header: readonly string[], columnName: string): number {
  const index = findCsvColumn(header, columnName);

  if (index === undefined) {
    throw new ImportFileError(
      "IMPORT_CSV_HEADER_INVALID",
      `CSV precisa conter a coluna obrigatoria ${columnName}.`,
    );
  }

  return index;
}

function findCsvColumn(header: readonly string[], columnName: string): number | undefined {
  const normalizedColumnName = normalizeHeaderName(columnName);
  const index = header.indexOf(normalizedColumnName);

  return index >= 0 ? index : undefined;
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let currentValue = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && nextCharacter === '"') {
      currentValue += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (character === "," && !insideQuotes) {
      values.push(currentValue.trim());
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  values.push(currentValue.trim());
  return values;
}

function readCsvValue(values: readonly string[], index: number): string | undefined {
  return normalizeDescription(values[index]);
}

function readOptionalCsvValue(values: readonly string[], index: number | undefined): string | undefined {
  if (index === undefined) {
    return undefined;
  }

  return normalizeDescription(values[index]);
}

function normalizeHeaderName(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeDescription(value: string | undefined): string | undefined {
  const normalizedValue = value?.trim();

  return normalizedValue === undefined || normalizedValue.length === 0 ? undefined : normalizedValue;
}

function normalizeDate(value: string | undefined): ISODate | undefined {
  const normalizedValue = normalizeDescription(value);

  if (normalizedValue === undefined) {
    return undefined;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    return normalizedValue;
  }

  const brDate = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(normalizedValue);

  if (brDate !== null) {
    return `${brDate[3]}-${brDate[2]}-${brDate[1]}`;
  }

  return undefined;
}

function normalizeOfxDate(value: string | undefined): ISODate | undefined {
  const normalizedValue = normalizeDescription(value);

  if (normalizedValue === undefined || !/^\d{8}/.test(normalizedValue)) {
    return undefined;
  }

  return `${normalizedValue.slice(0, 4)}-${normalizedValue.slice(4, 6)}-${normalizedValue.slice(6, 8)}`;
}

function parseAmountMinor(value: string | undefined): {
  amountMinor: number | undefined;
  signedAmountMinor: number | undefined;
} {
  const normalizedValue = normalizeDescription(value);

  if (normalizedValue === undefined) {
    return { amountMinor: undefined, signedAmountMinor: undefined };
  }

  const decimalValue = normalizedValue.includes(",")
    ? normalizedValue.replace(/\./g, "").replace(",", ".")
    : normalizedValue;
  const parsedValue = Number.parseFloat(decimalValue);

  if (!Number.isFinite(parsedValue) || parsedValue === 0) {
    return { amountMinor: undefined, signedAmountMinor: undefined };
  }

  const signedAmountMinor = Math.round(parsedValue * 100);

  return {
    amountMinor: Math.abs(signedAmountMinor),
    signedAmountMinor,
  };
}

function parseTransactionKind(
  value: string | undefined,
  signedAmountMinor: number | undefined,
): TransactionKind | undefined {
  const normalizedValue = normalizeDescription(value)?.toLowerCase();

  if (normalizedValue === "income" || normalizedValue === "receita" || normalizedValue === "credit") {
    return "income";
  }

  if (normalizedValue === "expense" || normalizedValue === "despesa" || normalizedValue === "debit") {
    return "expense";
  }

  if (signedAmountMinor === undefined) {
    return undefined;
  }

  return signedAmountMinor < 0 ? "expense" : "income";
}

function parseOfxTransactionKind(
  trnType: string | undefined,
  signedAmountMinor: number | undefined,
): TransactionKind | undefined {
  const normalizedType = normalizeDescription(trnType)?.toUpperCase();

  if (normalizedType === "CREDIT" || normalizedType === "DEP") {
    return "income";
  }

  if (normalizedType === "DEBIT" || normalizedType === "PAYMENT" || normalizedType === "ATM") {
    return "expense";
  }

  return parseTransactionKind(undefined, signedAmountMinor);
}

function readOfxTag(block: string, tagName: string): string | undefined {
  const expression = new RegExp(`<${tagName}>([^<\r\n]+)`, "i");
  const match = expression.exec(block);

  return normalizeDescription(match?.[1]);
}
