import { createHash } from "node:crypto";

import type {
  DeterministicReviewPayloadV1,
  EntityId,
  ImportSourceKind,
  ImportStatus,
  ISODate,
  ISODateTime,
  TenantScoped,
  TransactionExtractionPayloadV1,
  TransactionKind,
} from "./index.js";
import type { TenantContext } from "./tenant.js";

export type ImportFileKind = Extract<ImportSourceKind, "csv" | "ofx">;
export type ImportPreviewState = "ready" | "mapping_required" | "blocked";
export type ImportProblemSeverity = "error" | "warning";
export type ImportSuggestionStatus = "pending_review" | "duplicate";
export type CsvDelimiter = "," | ";";
export type CsvValueStrategy = "signed" | "split";
export type CsvRequiredField =
  | "date"
  | "description"
  | "valueStrategy"
  | "amount"
  | "incomeAmount"
  | "expenseAmount";
export type CsvAmbiguousField = CsvRequiredField;

export type ImportFileErrorCode =
  | "IMPORT_FILE_EMPTY"
  | "IMPORT_FILE_TOO_LARGE"
  | "IMPORT_FILE_KIND_UNSUPPORTED"
  | "IMPORT_FILE_ENCODING_INVALID"
  | "IMPORT_CSV_DELIMITER_INVALID"
  | "IMPORT_CSV_STRUCTURE_INVALID"
  | "IMPORT_CSV_HEADER_INVALID"
  | "IMPORT_CSV_MAPPING_INVALID"
  | "IMPORT_CSV_NO_DATA_ROWS"
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
  csvDelimiter?: CsvDelimiter;
  defaultAccountId?: EntityId;
}

export interface CsvLegacyImportMapping {
  version?: 1;
  date?: string | undefined;
  description?: string | undefined;
  amount?: string | undefined;
  kind?: string | undefined;
  externalId?: string | undefined;
}

export interface CsvSignedAmountMappingV2 {
  version: 2;
  date?: string | undefined;
  description?: string | undefined;
  valueStrategy: "signed";
  amount?: string | undefined;
}

export interface CsvSplitAmountMappingV2 {
  version: 2;
  date?: string | undefined;
  description?: string | undefined;
  valueStrategy: "split";
  incomeAmount?: string | undefined;
  expenseAmount?: string | undefined;
}

export type CsvImportMapping =
  | CsvLegacyImportMapping
  | CsvSignedAmountMappingV2
  | CsvSplitAmountMappingV2;

export interface CsvImportInterpretation {
  source: string;
  target: "date" | "description" | "income" | "expense" | "amount" | "ignored";
  label: string;
}

export interface CsvImportPreviewSample {
  sourceRowNumber: number;
  occurredOn: ISODate;
  description: string;
  kind: "income" | "expense";
  amountMinor: number;
  currency: string;
}

export interface CsvImportPreviewMetadata {
  delimiter?: CsvDelimiter;
  delimiterCandidates: readonly CsvDelimiter[];
  headers: readonly string[];
  mapping: CsvImportMapping;
  valueStrategy?: CsvValueStrategy | undefined;
  valueCandidates?: {
    amount?: string | undefined;
    incomeAmount?: string | undefined;
    expenseAmount?: string | undefined;
  };
  missingRequiredFields: readonly CsvRequiredField[];
  ambiguousFields: readonly CsvAmbiguousField[];
  interpretation: readonly CsvImportInterpretation[];
  ignoredHeaders: readonly string[];
  sampleRows: readonly CsvImportPreviewSample[];
}

export interface ImportBatchDraft extends TenantScoped {
  sourceKind: ImportFileKind;
  status: ImportStatus;
  originalFileName: string;
  sourceHash: string;
  contentHash: string;
  receivedAt: ISODateTime;
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  problemRows: number;
  defaultAccountId?: EntityId;
  csvDelimiter?: CsvDelimiter;
  csvMapping?: CsvImportMapping;
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
  externalId?: string | undefined;
}

export interface ImportPreview {
  state: ImportPreviewState;
  persisted: false;
  batch: ImportBatchDraft;
  suggestions: readonly ImportTransactionSuggestion[];
  problems: readonly ImportProblem[];
  csv?: CsvImportPreviewMetadata;
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
  structuralProblem?: ImportProblem;
}

interface CsvCellTable {
  records: readonly CsvRecord[];
  delimiter: CsvDelimiter;
}

interface CsvRecord {
  rowNumber: number;
  values: readonly string[];
}

interface CsvParseResult {
  rows: ParsedImportRow[];
  metadata: CsvImportPreviewMetadata;
  mappingRequired: boolean;
}

interface CsvMappingResolution {
  mapping: CsvImportMapping;
  ambiguousFields: CsvAmbiguousField[];
  missingRequiredFields: CsvRequiredField[];
  valueCandidates?: {
    amount?: string | undefined;
    incomeAmount?: string | undefined;
    expenseAmount?: string | undefined;
  };
}

interface CsvColumnIndexes {
  dateIndex: number;
  descriptionIndex: number;
  strategy: CsvValueStrategy;
  amountIndex?: number | undefined;
  incomeAmountIndex?: number | undefined;
  expenseAmountIndex?: number | undefined;
  kindIndex?: number | undefined;
  externalIdIndex?: number | undefined;
  legacy: boolean;
}

interface ParsedAmount {
  amountMinor?: number;
  signedAmountMinor?: number;
  state: "valid" | "empty" | "zero" | "invalid";
}

const defaultMaxSizeInBytes = 5 * 1024 * 1024;
const defaultCurrency = "BRL";

const primaryDateAliases = [
  "data lancamento",
  "data do lancamento",
  "data movimento",
  "data do movimento",
  "data transacao",
  "data da transacao",
  "transaction date",
  "movement date",
];
const genericDateAliases = ["date", "data", "dtposted"];
const fallbackDateAliases = [
  "data contabil",
  "data de contabilizacao",
  "data contabilizacao",
  "posting date",
  "accounting date",
];
const primaryDescriptionAliases = ["description", "descricao", "historico", "memo"];
const fallbackDescriptionAliases = ["titulo", "title", "name", "nome"];
const signedAmountAliases = ["amount", "valor", "value", "trnamt", "valor lancamento"];
const incomeAmountAliases = [
  "entrada",
  "credito",
  "credit",
  "receita",
  "income",
  "valor entrada",
  "valor credito",
];
const expenseAmountAliases = [
  "saida",
  "debito",
  "debit",
  "despesa",
  "expense",
  "valor saida",
  "valor debito",
];
const balanceAliases = ["saldo", "saldo do dia", "balance", "saldo atual", "saldo final"];
export function previewImportedStatement(input: ImportFileInput): ImportPreview {
  assertContentSize(input.content, input.maxSizeInBytes ?? defaultMaxSizeInBytes);
  assertSupportedTextEncoding(input.content);

  const kind = input.kind ?? inferImportFileKind(input.originalFileName);
  const parsed = parseImportRows(kind, input);
  const existingSourceHashes = new Set(input.existingSourceHashes ?? []);
  const problems: ImportProblem[] = [];
  const suggestions: ImportTransactionSuggestion[] = [];

  if (parsed.mappingRequired) {
    const metadata = parsed.metadata as CsvImportPreviewMetadata;
    const batch = buildBatchDraft(input, kind, 0, suggestions, problems, metadata);
    return {
      state: "mapping_required",
      persisted: false,
      batch,
      suggestions,
      problems,
      csv: metadata,
    };
  }

  for (const row of parsed.rows) {
    const rowProblems = validateParsedRow(row);
    problems.push(...rowProblems);
    if (rowProblems.some((problem) => problem.severity === "error")) continue;

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
        message:
          "Esta linha parece ja ter sido importada e precisa ser revisada antes da confirmacao.",
      });
    }
  }

  const batch = buildBatchDraft(
    input,
    kind,
    parsed.rows.length,
    suggestions,
    problems,
    parsed.metadata,
  );
  const csv =
    parsed.metadata === undefined
      ? undefined
      : {
          ...parsed.metadata,
          sampleRows: suggestions.slice(0, 10).map((suggestion) => ({
            sourceRowNumber: suggestion.sourceRowNumber,
            occurredOn: suggestion.occurredOn,
            description: suggestion.description,
            kind: suggestion.kind as "income" | "expense",
            amountMinor: suggestion.amountMinor,
            currency: suggestion.currency,
          })),
        };

  return {
    state: suggestions.length > 0 ? "ready" : "blocked",
    persisted: false,
    batch,
    suggestions,
    problems,
    ...(csv === undefined ? {} : { csv }),
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

export function buildSecureImportHash(value: string): string {
  return `sha256-${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

export function buildImportContentHash(content: string): string {
  return buildSecureImportHash(content);
}

export function buildLegacyImportBatchHash(input: {
  kind: ImportFileKind;
  content: string;
  defaultAccountId?: EntityId;
  csvDelimiter?: CsvDelimiter;
  csvMapping?: CsvImportMapping;
}): string {
  return buildStableImportHash(
    [
      input.kind,
      input.content,
      input.defaultAccountId ?? "",
      input.csvDelimiter ?? "",
      canonicalLegacyMapping(input.csvMapping),
    ].join(":"),
  );
}

export function buildTransactionExtractionPayload(
  suggestion: ImportTransactionSuggestion,
): TransactionExtractionPayloadV1 {
  if (suggestion.kind !== "income" && suggestion.kind !== "expense") {
    throw new ImportFileError(
      "IMPORT_CSV_STRUCTURE_INVALID",
      "A importacao CSV aceita apenas receitas e despesas.",
    );
  }
  return {
    payloadVersion: 1,
    sourceRowNumber: suggestion.sourceRowNumber,
    sourceHash: suggestion.sourceHash,
    occurredOn: suggestion.occurredOn,
    kind: suggestion.kind,
    amountMinor: suggestion.amountMinor,
    currency: suggestion.currency,
    description: suggestion.description,
    ...(suggestion.accountId === undefined ? {} : { accountId: suggestion.accountId }),
    ...(suggestion.categoryId === undefined ? {} : { categoryId: suggestion.categoryId }),
    ...(suggestion.externalId === undefined ? {} : { externalId: suggestion.externalId }),
  };
}

export function parseTransactionExtractionPayload(
  value: unknown,
): TransactionExtractionPayloadV1 | undefined {
  if (!isRecord(value) || value.payloadVersion !== 1) return undefined;
  if (!Number.isSafeInteger(value.sourceRowNumber) || Number(value.sourceRowNumber) < 1)
    return undefined;
  if (typeof value.sourceHash !== "string" || value.sourceHash.length === 0) return undefined;
  if (typeof value.occurredOn !== "string" || normalizeDate(value.occurredOn) === undefined)
    return undefined;
  if (value.kind !== "income" && value.kind !== "expense") return undefined;
  if (!Number.isSafeInteger(value.amountMinor) || Number(value.amountMinor) <= 0) return undefined;
  if (typeof value.currency !== "string" || value.currency.length !== 3) return undefined;
  if (typeof value.description !== "string" || value.description.trim().length === 0)
    return undefined;
  return {
    payloadVersion: 1,
    sourceRowNumber: Number(value.sourceRowNumber),
    sourceHash: value.sourceHash,
    occurredOn: value.occurredOn,
    kind: value.kind,
    amountMinor: Number(value.amountMinor),
    currency: value.currency.toUpperCase(),
    description: value.description.trim(),
    ...(typeof value.accountId === "string" && value.accountId.length > 0
      ? { accountId: value.accountId }
      : {}),
    ...(typeof value.categoryId === "string" && value.categoryId.length > 0
      ? { categoryId: value.categoryId }
      : {}),
    ...(typeof value.externalId === "string" && value.externalId.length > 0
      ? { externalId: value.externalId }
      : {}),
  };
}

export function buildImportPayloadFingerprint(payload: TransactionExtractionPayloadV1): string {
  return buildStableImportHash(
    [
      payload.payloadVersion,
      payload.sourceRowNumber,
      payload.sourceHash,
      payload.occurredOn,
      payload.kind,
      payload.amountMinor,
      payload.currency,
      payload.description,
      payload.accountId ?? "",
      payload.categoryId ?? "",
      payload.externalId ?? "",
    ].join(":"),
  );
}

export function parseDeterministicReviewPayload(
  value: unknown,
): DeterministicReviewPayloadV1 | undefined {
  if (!isRecord(value) || value.payloadVersion !== 1) return undefined;
  if (typeof value.sourceSuggestionId !== "string" || value.sourceSuggestionId.length === 0)
    return undefined;
  if (
    typeof value.sourcePayloadFingerprint !== "string" ||
    value.sourcePayloadFingerprint.length === 0
  )
    return undefined;
  if (typeof value.targetTransactionId !== "string" || value.targetTransactionId.length === 0)
    return undefined;
  if (!isStringArray(value.reasons) || !isStringArray(value.conflicts)) return undefined;
  return {
    payloadVersion: 1,
    sourceSuggestionId: value.sourceSuggestionId,
    sourcePayloadFingerprint: value.sourcePayloadFingerprint,
    targetTransactionId: value.targetTransactionId,
    reasons: value.reasons,
    conflicts: value.conflicts,
  };
}

function parseImportRows(
  kind: ImportFileKind,
  input: ImportFileInput,
): {
  rows: ParsedImportRow[];
  metadata?: CsvImportPreviewMetadata;
  mappingRequired: boolean;
} {
  if (kind === "csv") return parseCsvRows(input);
  return { rows: parseOfxRows(input.content), mappingRequired: false };
}

function parseCsvRows(input: ImportFileInput): CsvParseResult {
  const normalizedContent = stripUtf8Bom(input.content);
  const recordProbe = parseCsvTable(normalizedContent, ",").records.filter((record) =>
    record.values.some((value) => value.trim().length > 0),
  );
  if (recordProbe.length === 0)
    throw new ImportFileError("IMPORT_FILE_EMPTY", "Arquivo de importacao vazio.");
  if (recordProbe.length === 1) {
    throw new ImportFileError(
      "IMPORT_CSV_NO_DATA_ROWS",
      "CSV precisa ter cabecalho e ao menos uma linha de movimento.",
    );
  }

  const delimiterResolution = resolveCsvDelimiter(
    normalizedContent,
    input.csvDelimiter,
    input.csvMapping,
  );
  if (delimiterResolution.delimiter === undefined) {
    const mapping = normalizeSuppliedMapping(input.csvMapping);
    return {
      rows: [],
      metadata: {
        delimiterCandidates: delimiterResolution.candidates,
        headers: delimiterResolution.headers,
        mapping,
        ...(input.csvMapping === undefined || getValueStrategy(mapping) === undefined
          ? {}
          : { valueStrategy: getValueStrategy(mapping) }),
        missingRequiredFields: ["date", "description", "valueStrategy"],
        ambiguousFields: [],
        interpretation: [],
        ignoredHeaders: findBalanceHeaders(delimiterResolution.headers),
        sampleRows: [],
      },
      mappingRequired: true,
    };
  }

  const table = parseCsvTable(normalizedContent, delimiterResolution.delimiter);
  const nonEmptyRecords = table.records.filter((record) =>
    record.values.some((value) => value.trim().length > 0),
  );
  if (nonEmptyRecords.length === 0)
    throw new ImportFileError("IMPORT_FILE_EMPTY", "Arquivo de importacao vazio.");
  if (nonEmptyRecords.length === 1) {
    throw new ImportFileError(
      "IMPORT_CSV_NO_DATA_ROWS",
      "CSV precisa ter cabecalho e ao menos uma linha de movimento.",
    );
  }

  const headerRecord = nonEmptyRecords[0] as CsvRecord;
  const headers = headerRecord.values.map((header, index) =>
    index === 0 ? stripUtf8Bom(header).trim() : header.trim(),
  );
  assertCsvHeaders(headers);
  const resolution = resolveCsvMapping(headers, input.csvMapping);
  assertNoDuplicateCsvMapping(resolution.mapping);
  assertNoBalanceValueMapping(resolution.mapping);
  const ignoredHeaders = findBalanceHeaders(headers);
  const metadata: CsvImportPreviewMetadata = {
    delimiter: table.delimiter,
    delimiterCandidates: [table.delimiter],
    headers,
    mapping: resolution.mapping,
    ...(resolveDetectedValueStrategy(resolution) === undefined
      ? {}
      : { valueStrategy: resolveDetectedValueStrategy(resolution) }),
    ...(resolution.valueCandidates === undefined
      ? {}
      : { valueCandidates: resolution.valueCandidates }),
    missingRequiredFields: resolution.missingRequiredFields,
    ambiguousFields: resolution.ambiguousFields,
    interpretation: buildInterpretation(resolution.mapping, ignoredHeaders),
    ignoredHeaders,
    sampleRows: [],
  };

  if (resolution.missingRequiredFields.length > 0 || resolution.ambiguousFields.length > 0) {
    return { rows: [], metadata, mappingRequired: true };
  }

  const columns = resolveCsvColumns(headers, resolution.mapping);
  const rows = nonEmptyRecords
    .slice(1)
    .map((record) => parseCsvRecord(record, headers, columns, input));
  return { rows, metadata, mappingRequired: false };
}

function parseCsvRecord(
  record: CsvRecord,
  headers: readonly string[],
  columns: CsvColumnIndexes,
  input: ImportFileInput,
): ParsedImportRow {
  if (record.values.length !== headers.length) {
    return invalidStructuralRow(
      record.rowNumber,
      input.defaultAccountId,
      "IMPORT_CSV_COLUMN_COUNT_MISMATCH",
      `A linha possui ${record.values.length} coluna(s), mas o cabecalho possui ${headers.length}. Corrija o arquivo e reimporte.`,
    );
  }

  const values = record.values;
  const occurredOnText = readCsvValue(values, columns.dateIndex);
  const description = normalizeDescription(readCsvValue(values, columns.descriptionIndex));
  let amountMinor: number | undefined;
  let kind: TransactionKind | undefined;
  let amountSeed = "";
  let structuralProblem: ImportProblem | undefined;

  if (columns.strategy === "signed") {
    const amountText = readCsvValue(values, requireIndex(columns.amountIndex));
    const parsed = parseAmountMinor(amountText);
    amountSeed = parsed.signedAmountMinor?.toString() ?? amountText ?? "";
    if (parsed.state !== "valid") {
      structuralProblem = amountProblem(record.rowNumber, parsed.state, "valor");
    } else {
      amountMinor = parsed.amountMinor;
      kind = columns.legacy
        ? parseTransactionKind(
            readOptionalCsvValue(values, columns.kindIndex),
            parsed.signedAmountMinor,
          )
        : parsed.signedAmountMinor! < 0
          ? "expense"
          : "income";
    }
  } else {
    const incomeText = readOptionalCsvValue(values, columns.incomeAmountIndex);
    const expenseText = readOptionalCsvValue(values, columns.expenseAmountIndex);
    const income = parseAmountMinor(incomeText);
    const expense = parseAmountMinor(expenseText);
    amountSeed = `${income.signedAmountMinor ?? incomeText ?? ""}|${expense.signedAmountMinor ?? expenseText ?? ""}`;
    const incomePresent = income.state === "valid";
    const expensePresent = expense.state === "valid";
    if (income.state === "invalid")
      structuralProblem = amountProblem(record.rowNumber, "invalid", "entrada");
    else if (expense.state === "invalid")
      structuralProblem = amountProblem(record.rowNumber, "invalid", "saida");
    else if (incomePresent && expensePresent) {
      structuralProblem = buildRowError(
        record.rowNumber,
        "IMPORT_ROW_SPLIT_AMOUNT_CONFLICT",
        "Informe somente entrada ou somente saida nesta linha.",
      );
    } else if (!incomePresent && !expensePresent) {
      structuralProblem = buildRowError(
        record.rowNumber,
        "IMPORT_ROW_SPLIT_AMOUNT_REQUIRED",
        "Informe uma entrada ou uma saida diferente de zero.",
      );
    } else if (incomePresent) {
      amountMinor = income.amountMinor;
      kind = "income";
    } else {
      amountMinor = expense.amountMinor;
      kind = "expense";
    }
  }

  const externalId = columns.legacy
    ? readOptionalCsvValue(values, columns.externalIdIndex)
    : undefined;
  return {
    rowNumber: record.rowNumber,
    occurredOn: normalizeDate(occurredOnText),
    description,
    amountMinor,
    kind,
    accountId: input.defaultAccountId,
    categoryId: undefined,
    externalId,
    rawFingerprintSeed: [
      normalizeDate(occurredOnText) ?? occurredOnText ?? "",
      description ?? "",
      amountSeed,
      kind ?? "",
      externalId ?? "",
    ].join("|"),
    ...(structuralProblem === undefined ? {} : { structuralProblem }),
  };
}

function invalidStructuralRow(
  rowNumber: number,
  accountId: EntityId | undefined,
  code: string,
  message: string,
): ParsedImportRow {
  return {
    rowNumber,
    occurredOn: undefined,
    description: undefined,
    amountMinor: undefined,
    kind: undefined,
    accountId,
    categoryId: undefined,
    externalId: undefined,
    rawFingerprintSeed: "",
    structuralProblem: buildRowError(rowNumber, code, message),
  };
}

function amountProblem(
  rowNumber: number,
  state: Exclude<ParsedAmount["state"], "valid">,
  field: string,
): ImportProblem {
  if (state === "empty") {
    return buildRowError(rowNumber, "IMPORT_ROW_AMOUNT_REQUIRED", `Informe ${field} nesta linha.`);
  }
  if (state === "zero") {
    return buildRowError(
      rowNumber,
      "IMPORT_ROW_AMOUNT_ZERO",
      `${field[0]?.toUpperCase()}${field.slice(1)} precisa ser diferente de zero.`,
    );
  }
  return buildRowError(
    rowNumber,
    "IMPORT_ROW_NUMBER_INVALID",
    `${field[0]?.toUpperCase()}${field.slice(1)} possui formato numerico invalido.`,
  );
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
  if (row.accountId !== undefined) suggestion.accountId = row.accountId;
  if (row.categoryId !== undefined) suggestion.categoryId = row.categoryId;
  if (row.externalId !== undefined) suggestion.externalId = row.externalId;
  return suggestion;
}

function buildBatchDraft(
  input: ImportFileInput,
  kind: ImportFileKind,
  totalRows: number,
  suggestions: readonly ImportTransactionSuggestion[],
  problems: readonly ImportProblem[],
  csvMetadata?: CsvImportPreviewMetadata,
): ImportBatchDraft {
  const duplicateRows = suggestions.filter(
    (suggestion) => suggestion.status === "duplicate",
  ).length;
  const errorRows = new Set(
    problems.filter((problem) => problem.severity === "error").map((problem) => problem.rowNumber),
  );
  const csvDelimiter = csvMetadata?.delimiter;
  const csvMapping = csvMetadata?.mapping;
  const sourceHashSeed = [
    kind,
    input.content,
    input.defaultAccountId ?? "",
    csvDelimiter ?? "",
    canonicalMapping(csvMapping),
  ].join(":");
  return {
    organizationId: input.context.organizationId,
    financialProfileId: input.context.financialProfileId,
    sourceKind: kind,
    status: suggestions.length > 0 ? "reviewing" : "failed",
    originalFileName: input.originalFileName,
    sourceHash: buildSecureImportHash(sourceHashSeed),
    contentHash: buildImportContentHash(input.content),
    receivedAt: input.now,
    totalRows,
    validRows: suggestions.length,
    duplicateRows,
    problemRows: errorRows.size,
    ...(input.defaultAccountId === undefined ? {} : { defaultAccountId: input.defaultAccountId }),
    ...(csvDelimiter === undefined ? {} : { csvDelimiter }),
    ...(csvMapping === undefined ? {} : { csvMapping }),
  };
}

function validateParsedRow(row: ParsedImportRow): ImportProblem[] {
  if (row.structuralProblem?.code === "IMPORT_CSV_COLUMN_COUNT_MISMATCH") {
    return [row.structuralProblem];
  }
  const problems: ImportProblem[] = row.structuralProblem ? [row.structuralProblem] : [];
  if (row.occurredOn === undefined)
    problems.push(
      buildRowError(row.rowNumber, "IMPORT_ROW_DATE_INVALID", "Informe uma data valida."),
    );
  if (row.description === undefined)
    problems.push(
      buildRowError(row.rowNumber, "IMPORT_ROW_DESCRIPTION_REQUIRED", "Informe uma descricao."),
    );
  if (row.amountMinor === undefined && row.structuralProblem === undefined)
    problems.push(
      buildRowError(row.rowNumber, "IMPORT_ROW_AMOUNT_INVALID", "Informe um valor valido."),
    );
  if (row.kind === undefined && row.structuralProblem === undefined)
    problems.push(
      buildRowError(
        row.rowNumber,
        "IMPORT_ROW_KIND_INVALID",
        "Nao foi possivel inferir receita ou despesa.",
      ),
    );
  return problems;
}

function buildRowError(rowNumber: number, code: string, message: string): ImportProblem {
  return { rowNumber, severity: "error", code, message };
}

function assertContentSize(content: string, maxSizeInBytes: number): void {
  if (content.trim().length === 0)
    throw new ImportFileError("IMPORT_FILE_EMPTY", "Arquivo de importacao vazio.");
  if (Buffer.byteLength(content, "utf8") > maxSizeInBytes) {
    throw new ImportFileError("IMPORT_FILE_TOO_LARGE", "Arquivo excede o tamanho permitido.");
  }
}

function assertSupportedTextEncoding(content: string): void {
  if (content.includes("\u0000") || content.includes("\uFFFD")) {
    throw new ImportFileError(
      "IMPORT_FILE_ENCODING_INVALID",
      "Nao foi possivel ler o CSV como texto UTF-8. Salve o arquivo em UTF-8 e tente novamente.",
    );
  }
}

function inferImportFileKind(fileName: string): ImportFileKind {
  const normalizedFileName = fileName.trim().toLowerCase();
  if (normalizedFileName.endsWith(".csv")) return "csv";
  if (normalizedFileName.endsWith(".ofx")) return "ofx";
  throw new ImportFileError(
    "IMPORT_FILE_KIND_UNSUPPORTED",
    "Formato de arquivo nao suportado para importacao.",
  );
}

interface CsvDelimiterResolution {
  delimiter?: CsvDelimiter;
  candidates: CsvDelimiter[];
  headers: string[];
}

function resolveCsvDelimiter(
  content: string,
  requested: CsvDelimiter | undefined,
  suppliedMapping: CsvImportMapping | undefined,
): CsvDelimiterResolution {
  if (requested !== undefined)
    return { delimiter: requested, candidates: [requested], headers: [] };
  const analyses = ([",", ";"] as const).map((delimiter) => {
    const table = parseCsvTable(content, delimiter);
    const records = table.records.filter((record) =>
      record.values.some((value) => value.trim().length > 0),
    );
    const headerRecord = records[0];
    const headers =
      headerRecord?.values.map((header, index) =>
        index === 0 ? stripUtf8Bom(header).trim() : header.trim(),
      ) ?? [];
    const expectedColumns = headers.length;
    const structurallyConsistent =
      expectedColumns > 1 &&
      records.slice(1).length > 0 &&
      records.slice(1).some((record) => record.values.length === expectedColumns);
    let mappable = false;
    try {
      const resolution = resolveCsvMapping(headers, suppliedMapping);
      mappable =
        suppliedMapping !== undefined ||
        resolution.missingRequiredFields.length < 3 ||
        resolution.ambiguousFields.length > 0;
    } catch {
      mappable = false;
    }
    return { delimiter, headers, structurallyConsistent, mappable };
  });
  const plausible = analyses.filter((item) => item.structurallyConsistent && item.mappable);
  if (plausible.length === 1) {
    const selected = plausible[0]!;
    return {
      delimiter: selected.delimiter,
      candidates: [selected.delimiter],
      headers: selected.headers,
    };
  }
  const candidates = analyses
    .filter((analysis) => analysis.headers.length > 1)
    .map((analysis) => analysis.delimiter);
  const bestHeaders =
    analyses.slice().sort((a, b) => b.headers.length - a.headers.length)[0]?.headers ?? [];
  return {
    candidates: candidates.length > 0 ? candidates : [",", ";"],
    headers: bestHeaders,
  };
}

function resolveCsvMapping(
  headers: readonly string[],
  supplied: CsvImportMapping | undefined,
): CsvMappingResolution {
  if (supplied !== undefined) return resolveSuppliedCsvMapping(headers, supplied);

  const date = resolvePrioritizedHeader(
    headers,
    primaryDateAliases,
    genericDateAliases,
    fallbackDateAliases,
  );
  const description = resolvePrioritizedHeader(
    headers,
    primaryDescriptionAliases,
    fallbackDescriptionAliases,
  );
  const signed = resolveAliasGroup(headers, signedAmountAliases);
  const income = resolveAliasGroup(headers, incomeAmountAliases);
  const expense = resolveAliasGroup(headers, expenseAmountAliases);
  const ambiguousFields: CsvAmbiguousField[] = [];
  if (date.ambiguous) ambiguousFields.push("date");
  if (description.ambiguous) ambiguousFields.push("description");

  const signedAvailable = signed.candidates.length > 0;
  const splitAvailable = income.candidates.length > 0 || expense.candidates.length > 0;
  const valueCandidates = {
    ...(signed.candidates.length === 1 ? { amount: signed.candidates[0] } : {}),
    ...(income.candidates.length === 1 ? { incomeAmount: income.candidates[0] } : {}),
    ...(expense.candidates.length === 1 ? { expenseAmount: expense.candidates[0] } : {}),
  };
  let mapping: CsvImportMapping;
  if (signedAvailable && splitAvailable) {
    mapping = {
      version: 2,
      valueStrategy: "signed",
      ...(date.header ? { date: date.header } : {}),
      ...(description.header ? { description: description.header } : {}),
      ...(valueCandidates.amount === undefined ? {} : { amount: valueCandidates.amount }),
    };
    ambiguousFields.push("valueStrategy");
  } else if (signedAvailable) {
    mapping = {
      version: 2,
      valueStrategy: "signed",
      ...(date.header ? { date: date.header } : {}),
      ...(description.header ? { description: description.header } : {}),
      ...(signed.candidates.length === 1 ? { amount: signed.candidates[0] } : {}),
    };
    if (signed.candidates.length > 1) ambiguousFields.push("amount");
  } else {
    mapping = {
      version: 2,
      valueStrategy: "split",
      ...(date.header ? { date: date.header } : {}),
      ...(description.header ? { description: description.header } : {}),
      ...(income.candidates.length === 1 ? { incomeAmount: income.candidates[0] } : {}),
      ...(expense.candidates.length === 1 ? { expenseAmount: expense.candidates[0] } : {}),
    };
    if (income.candidates.length > 1) ambiguousFields.push("incomeAmount");
    if (expense.candidates.length > 1) ambiguousFields.push("expenseAmount");
  }

  const missingRequiredFields = collectMissingRequiredFields(mapping);
  if (ambiguousFields.includes("valueStrategy")) {
    removeItem(missingRequiredFields, "amount");
    removeItem(missingRequiredFields, "incomeAmount");
    removeItem(missingRequiredFields, "expenseAmount");
    if (!missingRequiredFields.includes("valueStrategy"))
      missingRequiredFields.push("valueStrategy");
  } else if (!signedAvailable && !splitAvailable) {
    removeItem(missingRequiredFields, "incomeAmount");
    removeItem(missingRequiredFields, "expenseAmount");
    if (!missingRequiredFields.includes("valueStrategy"))
      missingRequiredFields.push("valueStrategy");
  }
  return {
    mapping,
    ambiguousFields: unique(ambiguousFields),
    missingRequiredFields,
    ...(Object.keys(valueCandidates).length === 0 ? {} : { valueCandidates }),
  };
}

function resolveSuppliedCsvMapping(
  headers: readonly string[],
  supplied: CsvImportMapping,
): CsvMappingResolution {
  const normalized = normalizeSuppliedMapping(supplied);
  const ambiguousFields: CsvAmbiguousField[] = [];
  const mapHeader = (value: string | undefined): string | undefined => {
    if (value === undefined) return undefined;
    const candidates = headers.filter(
      (header) => normalizeHeaderName(header) === normalizeHeaderName(value),
    );
    return candidates.length === 1 ? candidates[0] : undefined;
  };

  if (isV2Mapping(normalized)) {
    if (normalized.valueStrategy === "signed") {
      const mappedDate = mapHeader(normalized.date);
      const mappedDescription = mapHeader(normalized.description);
      const mappedAmount = mapHeader(normalized.amount);
      const mapping: CsvSignedAmountMappingV2 = {
        version: 2,
        valueStrategy: "signed",
        ...(mappedDate === undefined ? {} : { date: mappedDate }),
        ...(mappedDescription === undefined ? {} : { description: mappedDescription }),
        ...(mappedAmount === undefined ? {} : { amount: mappedAmount }),
      };
      return {
        mapping,
        ambiguousFields,
        missingRequiredFields: collectMissingRequiredFields(mapping),
      };
    }
    const mappedDate = mapHeader(normalized.date);
    const mappedDescription = mapHeader(normalized.description);
    const mappedIncomeAmount = mapHeader(normalized.incomeAmount);
    const mappedExpenseAmount = mapHeader(normalized.expenseAmount);
    const mapping: CsvSplitAmountMappingV2 = {
      version: 2,
      valueStrategy: "split",
      ...(mappedDate === undefined ? {} : { date: mappedDate }),
      ...(mappedDescription === undefined ? {} : { description: mappedDescription }),
      ...(mappedIncomeAmount === undefined ? {} : { incomeAmount: mappedIncomeAmount }),
      ...(mappedExpenseAmount === undefined ? {} : { expenseAmount: mappedExpenseAmount }),
    };
    return {
      mapping,
      ambiguousFields,
      missingRequiredFields: collectMissingRequiredFields(mapping),
    };
  }

  const mappedDate = mapHeader(normalized.date);
  const mappedDescription = mapHeader(normalized.description);
  const mappedAmount = mapHeader(normalized.amount);
  const mappedKind = mapHeader(normalized.kind);
  const mappedExternalId = mapHeader(normalized.externalId);
  const mapping: CsvLegacyImportMapping = {
    ...(mappedDate === undefined ? {} : { date: mappedDate }),
    ...(mappedDescription === undefined ? {} : { description: mappedDescription }),
    ...(mappedAmount === undefined ? {} : { amount: mappedAmount }),
    ...(mappedKind === undefined ? {} : { kind: mappedKind }),
    ...(mappedExternalId === undefined ? {} : { externalId: mappedExternalId }),
  };
  return {
    mapping,
    ambiguousFields,
    missingRequiredFields: collectMissingRequiredFields(mapping),
  };
}

function normalizeSuppliedMapping(mapping: CsvImportMapping | undefined): CsvImportMapping {
  if (mapping === undefined) return { version: 2, valueStrategy: "signed" };
  if (isV2Mapping(mapping)) return mapping;
  if (mapping.kind !== undefined || mapping.externalId !== undefined || mapping.version === 1)
    return mapping;
  return {
    version: 2,
    valueStrategy: "signed",
    ...(mapping.date === undefined ? {} : { date: mapping.date }),
    ...(mapping.description === undefined ? {} : { description: mapping.description }),
    ...(mapping.amount === undefined ? {} : { amount: mapping.amount }),
  };
}

function isV2Mapping(
  mapping: CsvImportMapping,
): mapping is CsvSignedAmountMappingV2 | CsvSplitAmountMappingV2 {
  return mapping.version === 2;
}

function getValueStrategy(mapping: CsvImportMapping): CsvValueStrategy | undefined {
  return isV2Mapping(mapping) ? mapping.valueStrategy : mapping.amount ? "signed" : undefined;
}

function resolveDetectedValueStrategy(
  resolution: CsvMappingResolution,
): CsvValueStrategy | undefined {
  if (
    resolution.missingRequiredFields.includes("valueStrategy") ||
    resolution.ambiguousFields.includes("valueStrategy")
  )
    return undefined;
  return getValueStrategy(resolution.mapping);
}

function collectMissingRequiredFields(mapping: CsvImportMapping): CsvRequiredField[] {
  const missing: CsvRequiredField[] = [];
  if (!mapping.date) missing.push("date");
  if (!mapping.description) missing.push("description");
  if (isV2Mapping(mapping)) {
    if (mapping.valueStrategy === "signed") {
      if (!mapping.amount) missing.push("amount");
    } else {
      if (!mapping.incomeAmount) missing.push("incomeAmount");
      if (!mapping.expenseAmount) missing.push("expenseAmount");
    }
  } else if (!mapping.amount) missing.push("amount");
  return missing;
}

function resolvePrioritizedHeader(
  headers: readonly string[],
  ...aliasGroups: readonly (readonly string[])[]
): { header?: string; ambiguous: boolean } {
  for (const aliases of aliasGroups) {
    const candidates = resolveAliasGroup(headers, aliases).candidates;
    if (candidates.length === 1) return { header: candidates[0] as string, ambiguous: false };
    if (candidates.length > 1) return { ambiguous: true };
  }
  return { ambiguous: false };
}

function resolveAliasGroup(
  headers: readonly string[],
  aliases: readonly string[],
): { candidates: string[] } {
  const normalizedAliases = new Set(aliases.map(normalizeAliasHeader));
  return {
    candidates: headers.filter((header) => normalizedAliases.has(normalizeAliasHeader(header))),
  };
}

function assertNoDuplicateCsvMapping(mapping: CsvImportMapping): void {
  const values = mappingValues(mapping).map(normalizeHeaderName);
  if (new Set(values).size !== values.length) {
    throw new ImportFileError(
      "IMPORT_CSV_MAPPING_INVALID",
      "A mesma coluna nao pode ser usada para mais de um campo. Revise o mapeamento.",
    );
  }
}

function assertNoBalanceValueMapping(mapping: CsvImportMapping): void {
  const valueHeaders = isV2Mapping(mapping)
    ? mapping.valueStrategy === "signed"
      ? [mapping.amount]
      : [mapping.incomeAmount, mapping.expenseAmount]
    : [mapping.amount];
  if (valueHeaders.some((header) => header !== undefined && isBalanceHeader(header))) {
    throw new ImportFileError(
      "IMPORT_CSV_MAPPING_INVALID",
      "Saldo nao pode ser usado como valor de lancamento. Selecione valor, entrada ou saida.",
    );
  }
}

function mappingValues(mapping: CsvImportMapping): string[] {
  if (isV2Mapping(mapping)) {
    return mapping.valueStrategy === "signed"
      ? [mapping.date, mapping.description, mapping.amount].filter(isString)
      : [mapping.date, mapping.description, mapping.incomeAmount, mapping.expenseAmount].filter(
          isString,
        );
  }
  return [
    mapping.date,
    mapping.description,
    mapping.amount,
    mapping.kind,
    mapping.externalId,
  ].filter(isString);
}

function buildInterpretation(
  mapping: CsvImportMapping,
  ignoredHeaders: readonly string[],
): CsvImportInterpretation[] {
  const items: CsvImportInterpretation[] = [];
  if (mapping.date) items.push({ source: mapping.date, target: "date", label: "Data" });
  if (mapping.description)
    items.push({
      source: mapping.description,
      target: "description",
      label: "Descricao",
    });
  if (isV2Mapping(mapping)) {
    if (mapping.valueStrategy === "signed" && mapping.amount)
      items.push({
        source: mapping.amount,
        target: "amount",
        label: "Valor com sinal",
      });
    if (mapping.valueStrategy === "split") {
      if (mapping.incomeAmount)
        items.push({
          source: mapping.incomeAmount,
          target: "income",
          label: "Receita",
        });
      if (mapping.expenseAmount)
        items.push({
          source: mapping.expenseAmount,
          target: "expense",
          label: "Despesa",
        });
    }
  } else if (mapping.amount) {
    items.push({ source: mapping.amount, target: "amount", label: "Valor" });
  }
  for (const source of ignoredHeaders) items.push({ source, target: "ignored", label: "Ignorado" });
  return items;
}

function findBalanceHeaders(headers: readonly string[]): string[] {
  return headers.filter(isBalanceHeader);
}

function isBalanceHeader(header: string): boolean {
  const normalized = normalizeAliasHeader(header);
  return (
    balanceAliases.some((alias) => normalized === normalizeAliasHeader(alias)) ||
    normalized.startsWith("saldo ") ||
    normalized.startsWith("balance ") ||
    normalized.endsWith(" balance")
  );
}

function resolveCsvColumns(
  headers: readonly string[],
  mapping: CsvImportMapping,
): CsvColumnIndexes {
  if (isV2Mapping(mapping)) {
    if (mapping.valueStrategy === "signed") {
      return {
        dateIndex: requireCsvColumn(headers, mapping.date),
        descriptionIndex: requireCsvColumn(headers, mapping.description),
        strategy: "signed",
        amountIndex: requireCsvColumn(headers, mapping.amount),
        legacy: false,
      };
    }
    return {
      dateIndex: requireCsvColumn(headers, mapping.date),
      descriptionIndex: requireCsvColumn(headers, mapping.description),
      strategy: "split",
      incomeAmountIndex: requireCsvColumn(headers, mapping.incomeAmount),
      expenseAmountIndex: requireCsvColumn(headers, mapping.expenseAmount),
      legacy: false,
    };
  }
  return {
    dateIndex: requireCsvColumn(headers, mapping.date),
    descriptionIndex: requireCsvColumn(headers, mapping.description),
    strategy: "signed",
    amountIndex: requireCsvColumn(headers, mapping.amount),
    ...(findCsvColumn(headers, mapping.kind) === undefined
      ? {}
      : { kindIndex: findCsvColumn(headers, mapping.kind) }),
    ...(findCsvColumn(headers, mapping.externalId) === undefined
      ? {}
      : { externalIdIndex: findCsvColumn(headers, mapping.externalId) }),
    legacy: mapping.kind !== undefined || mapping.externalId !== undefined || mapping.version === 1,
  };
}

function requireCsvColumn(headers: readonly string[], name: string | undefined): number {
  const index = findCsvColumn(headers, name);
  if (index === undefined) {
    throw new ImportFileError(
      "IMPORT_CSV_HEADER_INVALID",
      "Mapeie data, descricao e a estrategia de valor antes de continuar.",
    );
  }
  return index;
}

function requireIndex(index: number | undefined): number {
  if (index === undefined) {
    throw new ImportFileError("IMPORT_CSV_HEADER_INVALID", "Mapeamento de valor incompleto.");
  }
  return index;
}

function findCsvColumn(headers: readonly string[], name: string | undefined): number | undefined {
  if (name === undefined) return undefined;
  const index = headers.findIndex(
    (header) => normalizeHeaderName(header) === normalizeHeaderName(name),
  );
  return index >= 0 ? index : undefined;
}

function parseCsvTable(content: string, delimiter: CsvDelimiter): CsvCellTable {
  const records: CsvRecord[] = [];
  let values: string[] = [];
  let current = "";
  let quoted = false;
  let physicalRow = 1;
  let recordStartRow = 1;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index] as string;
    const nextCharacter = content[index + 1];
    if (character === '"') {
      if (quoted && nextCharacter === '"') {
        current += '"';
        index += 1;
      } else quoted = !quoted;
      continue;
    }
    if (!quoted && character === delimiter) {
      values.push(current.trim());
      current = "";
      continue;
    }
    if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && nextCharacter === "\n") index += 1;
      values.push(current.trim());
      records.push({ rowNumber: recordStartRow, values });
      values = [];
      current = "";
      physicalRow += 1;
      recordStartRow = physicalRow;
      continue;
    }
    if (character === "\n") physicalRow += 1;
    current += character;
  }
  if (quoted) {
    throw new ImportFileError(
      "IMPORT_CSV_STRUCTURE_INVALID",
      "CSV possui aspas nao fechadas. Corrija o arquivo e tente novamente.",
    );
  }
  if (current.length > 0 || values.length > 0) {
    values.push(current.trim());
    records.push({ rowNumber: recordStartRow, values });
  }
  return { records, delimiter };
}

function stripUtf8Bom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function assertCsvHeaders(headers: readonly string[]): void {
  if (headers.length === 0 || headers.every((header) => header.length === 0)) {
    throw new ImportFileError(
      "IMPORT_CSV_HEADER_INVALID",
      "CSV precisa conter um cabecalho valido.",
    );
  }
  const normalizedHeaders = headers.filter((header) => header.length > 0).map(normalizeHeaderName);
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    throw new ImportFileError(
      "IMPORT_CSV_HEADER_INVALID",
      "CSV possui colunas com o mesmo nome. Renomeie os cabecalhos e tente novamente.",
    );
  }
}

function readCsvValue(values: readonly string[], index: number): string | undefined {
  return normalizeDescription(values[index]);
}

function readOptionalCsvValue(
  values: readonly string[],
  index: number | undefined,
): string | undefined {
  return index === undefined ? undefined : normalizeDescription(values[index]);
}

function normalizeHeaderName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, "");
}

function normalizeAliasHeader(value: string): string {
  return normalizeHeaderName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*\((?:r\$|brl|usd|eur)\)\s*$/i, "")
    .replace(/\s+(?:r\$|brl|usd|eur)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDescription(value: string | undefined): string | undefined {
  const normalizedValue = value?.trim();
  return normalizedValue === undefined || normalizedValue.length === 0
    ? undefined
    : normalizedValue;
}

function normalizeDate(value: string | undefined): ISODate | undefined {
  const normalizedValue = normalizeDescription(value);
  if (normalizedValue === undefined) return undefined;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizedValue);
  if (iso !== null) return isValidDateParts(iso[1], iso[2], iso[3]) ? normalizedValue : undefined;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(normalizedValue);
  if (br !== null && isValidDateParts(br[3], br[2], br[1])) return `${br[3]}-${br[2]}-${br[1]}`;
  return undefined;
}

function isValidDateParts(
  year: string | undefined,
  month: string | undefined,
  day: string | undefined,
): boolean {
  if (!year || !month || !day) return false;
  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) &&
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() + 1 === Number(month) &&
    date.getUTCDate() === Number(day)
  );
}

function normalizeOfxDate(value: string | undefined): ISODate | undefined {
  const normalizedValue = normalizeDescription(value);
  if (normalizedValue === undefined || !/^\d{8}/.test(normalizedValue)) return undefined;
  return normalizeDate(
    `${normalizedValue.slice(0, 4)}-${normalizedValue.slice(4, 6)}-${normalizedValue.slice(6, 8)}`,
  );
}

function parseAmountMinor(value: string | undefined): ParsedAmount {
  const raw = normalizeDescription(value);
  if (raw === undefined) return { state: "empty" };
  const normalizedValue = raw.replace(/\s/g, "").replace(/^R\$/i, "");
  const comma = normalizedValue.lastIndexOf(",");
  const dot = normalizedValue.lastIndexOf(".");
  let decimalValue = normalizedValue;
  if (comma >= 0 && dot >= 0) {
    decimalValue =
      comma > dot
        ? normalizedValue.replace(/\./g, "").replace(",", ".")
        : normalizedValue.replace(/,/g, "");
  } else if (comma >= 0) decimalValue = normalizedValue.replace(/\./g, "").replace(",", ".");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(decimalValue)) return { state: "invalid" };
  const parsedValue = Number(decimalValue);
  if (!Number.isFinite(parsedValue)) return { state: "invalid" };
  if (parsedValue === 0) return { state: "zero" };
  const signedAmountMinor = Math.round(parsedValue * 100);
  if (!Number.isSafeInteger(signedAmountMinor)) return { state: "invalid" };
  if (signedAmountMinor === 0) return { state: "zero" };
  return {
    state: "valid",
    amountMinor: Math.abs(signedAmountMinor),
    signedAmountMinor,
  };
}

function parseTransactionKind(
  value: string | undefined,
  signedAmountMinor: number | undefined,
): TransactionKind | undefined {
  const normalizedValue = normalizeDescription(value)?.toLowerCase();
  if (["income", "receita", "credit", "credito", "crédito"].includes(normalizedValue ?? ""))
    return "income";
  if (["expense", "despesa", "debit", "debito", "débito"].includes(normalizedValue ?? ""))
    return "expense";
  if (signedAmountMinor === undefined) return undefined;
  return signedAmountMinor < 0 ? "expense" : "income";
}

function parseOfxTransactionKind(
  trnType: string | undefined,
  signedAmountMinor: number | undefined,
): TransactionKind | undefined {
  const normalizedType = normalizeDescription(trnType)?.toUpperCase();
  if (normalizedType === "CREDIT" || normalizedType === "DEP") return "income";
  if (normalizedType === "DEBIT" || normalizedType === "PAYMENT" || normalizedType === "ATM")
    return "expense";
  return parseTransactionKind(undefined, signedAmountMinor);
}

function readOfxTag(block: string, tagName: string): string | undefined {
  const expression = new RegExp(`<${tagName}>([^<\\r\\n]+)`, "i");
  const match = expression.exec(block);
  return normalizeDescription(match?.[1]);
}

function canonicalMapping(mapping: CsvImportMapping | undefined): string {
  if (mapping === undefined) return "";
  if (isV2Mapping(mapping)) {
    return mapping.valueStrategy === "signed"
      ? [2, "signed", mapping.date, mapping.description, mapping.amount]
          .map((value) => value ?? "")
          .join("|")
      : [2, "split", mapping.date, mapping.description, mapping.incomeAmount, mapping.expenseAmount]
          .map((value) => value ?? "")
          .join("|");
  }
  return [1, mapping.date, mapping.description, mapping.amount, mapping.kind, mapping.externalId]
    .map((value) => value ?? "")
    .join("|");
}

function canonicalLegacyMapping(mapping: CsvImportMapping | undefined): string {
  if (mapping === undefined) return "";
  if (isV2Mapping(mapping)) {
    if (mapping.valueStrategy === "signed") {
      return [mapping.date, mapping.description, mapping.amount, "", ""]
        .map((value) => value ?? "")
        .join("|");
    }
    return canonicalMapping(mapping);
  }
  return [mapping.date, mapping.description, mapping.amount, mapping.kind, mapping.externalId]
    .map((value) => value ?? "")
    .join("|");
}

function removeItem<T>(items: T[], item: T): void {
  const index = items.indexOf(item);
  if (index >= 0) items.splice(index, 1);
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

function isString(value: string | undefined): value is string {
  return typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
