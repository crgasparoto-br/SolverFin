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
export type CsvRequiredField = "date" | "description" | "amount";

export type ImportFileErrorCode =
  | "IMPORT_FILE_EMPTY"
  | "IMPORT_FILE_TOO_LARGE"
  | "IMPORT_FILE_KIND_UNSUPPORTED"
  | "IMPORT_FILE_ENCODING_INVALID"
  | "IMPORT_CSV_DELIMITER_INVALID"
  | "IMPORT_CSV_STRUCTURE_INVALID"
  | "IMPORT_CSV_HEADER_INVALID"
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

export interface CsvImportMapping {
  date?: string;
  description?: string;
  amount?: string;
  kind?: string;
  externalId?: string;
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
  missingRequiredFields: readonly CsvRequiredField[];
  sampleRows: readonly CsvImportPreviewSample[];
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
  externalId?: string;
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

const defaultMaxSizeInBytes = 1024 * 1024;
const defaultCurrency = "BRL";
const requiredFields: readonly CsvRequiredField[] = ["date", "description", "amount"];
const csvAliases: Readonly<Record<keyof CsvImportMapping, readonly string[]>> = {
  date: ["date", "data", "data do movimento", "data movimento", "dtposted"],
  description: ["description", "descricao", "descrição", "historico", "histórico", "memo", "name"],
  amount: ["amount", "valor", "value", "trnamt"],
  kind: ["kind", "tipo", "natureza", "trntype"],
  externalId: ["externalid", "external id", "id externo", "fitid", "identificador"],
};

export function previewImportedStatement(input: ImportFileInput): ImportPreview {
  assertContentSize(input.content, input.maxSizeInBytes ?? defaultMaxSizeInBytes);
  assertSupportedTextEncoding(input.content);

  const kind = input.kind ?? inferImportFileKind(input.originalFileName);
  const parsed = parseImportRows(kind, input);
  const existingSourceHashes = new Set(input.existingSourceHashes ?? []);
  const problems: ImportProblem[] = [];
  const suggestions: ImportTransactionSuggestion[] = [];

  if (parsed.mappingRequired) {
    const batch = buildBatchDraft(input, kind, 0, suggestions, problems, parsed.metadata);

    return {
      state: "mapping_required",
      persisted: false,
      batch,
      suggestions,
      problems,
      ...(parsed.metadata === undefined ? {} : { csv: parsed.metadata }),
    };
  }

  for (const row of parsed.rows) {
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
): { rows: ParsedImportRow[]; metadata?: CsvImportPreviewMetadata; mappingRequired: boolean } {
  if (kind === "csv") {
    const result = parseCsvRows(input);
    return {
      rows: result.rows,
      metadata: result.metadata,
      mappingRequired: result.mappingRequired,
    };
  }

  return { rows: parseOfxRows(input.content), mappingRequired: false };
}

function parseCsvRows(input: ImportFileInput): CsvParseResult {
  const normalizedContent = stripUtf8Bom(input.content);
  const delimiterResolution = resolveCsvDelimiter(normalizedContent, input.csvDelimiter);

  if (delimiterResolution.delimiter === undefined) {
    const metadata: CsvImportPreviewMetadata = {
      delimiterCandidates: delimiterResolution.candidates,
      headers: [],
      mapping: input.csvMapping ?? {},
      missingRequiredFields: requiredFields,
      sampleRows: [],
    };
    return { rows: [], metadata, mappingRequired: true };
  }

  const table = parseCsvTable(normalizedContent, delimiterResolution.delimiter);
  const nonEmptyRecords = table.records.filter((record) =>
    record.values.some((value) => value.trim().length > 0),
  );

  if (nonEmptyRecords.length === 0) {
    throw new ImportFileError("IMPORT_FILE_EMPTY", "Arquivo de importacao vazio.");
  }

  if (nonEmptyRecords.length === 1) {
    throw new ImportFileError(
      "IMPORT_CSV_NO_DATA_ROWS",
      "CSV precisa ter cabecalho e ao menos uma linha de movimento.",
    );
  }

  const headerRecord = nonEmptyRecords[0] as CsvRecord;
  const headers = headerRecord.values.map(normalizeHeaderName);
  assertCsvHeaders(headers);
  const mapping = resolveCsvMapping(headers, input.csvMapping);
  const missingRequiredFields = requiredFields.filter((field) => mapping[field] === undefined);
  const dataRecords = nonEmptyRecords.slice(1);
  const metadata: CsvImportPreviewMetadata = {
    delimiter: table.delimiter,
    delimiterCandidates: [table.delimiter],
    headers,
    mapping,
    missingRequiredFields,
    sampleRows: [],
  };

  if (missingRequiredFields.length > 0) {
    return { rows: [], metadata, mappingRequired: true };
  }

  const columns = resolveCsvColumns(headers, mapping);
  const rows = dataRecords.map((record) => {
    const values = record.values;
    const amountText = readCsvValue(values, columns.amountIndex);
    const parsedAmount = parseAmountMinor(amountText);
    const kindText = readOptionalCsvValue(values, columns.kindIndex);
    const kind = parseTransactionKind(kindText, parsedAmount.signedAmountMinor);
    const occurredOnText = readCsvValue(values, columns.dateIndex);
    const description = normalizeDescription(readCsvValue(values, columns.descriptionIndex));
    const externalId = readOptionalCsvValue(values, columns.externalIdIndex);

    return {
      rowNumber: record.rowNumber,
      occurredOn: normalizeDate(occurredOnText),
      description,
      amountMinor: parsedAmount.amountMinor,
      kind,
      accountId: input.defaultAccountId,
      categoryId: undefined,
      externalId,
      rawFingerprintSeed: [
        normalizeDate(occurredOnText) ?? occurredOnText ?? "",
        description ?? "",
        parsedAmount.signedAmountMinor ?? amountText ?? "",
        kind ?? "",
        externalId ?? "",
      ].join("|"),
    };
  });

  return { rows, metadata, mappingRequired: false };
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
    sourceHash: buildStableImportHash(sourceHashSeed),
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
  const problems: ImportProblem[] = [];
  if (row.occurredOn === undefined)
    problems.push(
      buildRowError(row.rowNumber, "IMPORT_ROW_DATE_INVALID", "Informe uma data valida."),
    );
  if (row.description === undefined)
    problems.push(
      buildRowError(row.rowNumber, "IMPORT_ROW_DESCRIPTION_REQUIRED", "Informe uma descricao."),
    );
  if (row.amountMinor === undefined)
    problems.push(
      buildRowError(row.rowNumber, "IMPORT_ROW_AMOUNT_INVALID", "Informe um valor valido."),
    );
  if (row.kind === undefined)
    problems.push(
      buildRowError(row.rowNumber, "IMPORT_ROW_KIND_INVALID", "Informe receita ou despesa."),
    );
  return problems;
}

function buildRowError(rowNumber: number, code: string, message: string): ImportProblem {
  return { rowNumber, severity: "error", code, message };
}

function assertContentSize(content: string, maxSizeInBytes: number): void {
  if (content.trim().length === 0) {
    throw new ImportFileError("IMPORT_FILE_EMPTY", "Arquivo de importacao vazio.");
  }

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

function resolveCsvDelimiter(
  content: string,
  requested: CsvDelimiter | undefined,
): { delimiter?: CsvDelimiter; candidates: CsvDelimiter[] } {
  if (requested !== undefined) return { delimiter: requested, candidates: [requested] };
  const firstRecord = content.split(/\r?\n/, 1)[0] ?? "";
  const commaCount = countOutsideQuotes(firstRecord, ",");
  const semicolonCount = countOutsideQuotes(firstRecord, ";");

  if (commaCount === 0 && semicolonCount === 0) return { candidates: [",", ";"] };
  if (commaCount === semicolonCount) return { candidates: [",", ";"] };
  return commaCount > semicolonCount
    ? { delimiter: ",", candidates: [","] }
    : { delimiter: ";", candidates: [";"] };
}

function countOutsideQuotes(value: string, needle: CsvDelimiter): number {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"') {
      if (quoted && value[index + 1] === '"') index += 1;
      else quoted = !quoted;
      continue;
    }
    if (!quoted && character === needle) count += 1;
  }
  return count;
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
      } else {
        quoted = !quoted;
      }
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

  const nonEmptyHeaders = headers.filter((header) => header.length > 0);
  if (new Set(nonEmptyHeaders).size !== nonEmptyHeaders.length) {
    throw new ImportFileError(
      "IMPORT_CSV_HEADER_INVALID",
      "CSV possui colunas com o mesmo nome. Renomeie os cabecalhos e tente novamente.",
    );
  }
}

function resolveCsvMapping(
  headers: readonly string[],
  supplied: CsvImportMapping | undefined,
): CsvImportMapping {
  const mapping: CsvImportMapping = {};
  for (const field of Object.keys(csvAliases) as (keyof CsvImportMapping)[]) {
    const requestedHeader = supplied?.[field];
    const resolved = requestedHeader
      ? headers.find((header) => header === normalizeHeaderName(requestedHeader))
      : csvAliases[field].find((alias) => headers.includes(normalizeHeaderName(alias)));
    if (resolved !== undefined) mapping[field] = resolved;
  }
  return mapping;
}

interface CsvColumnIndexes {
  dateIndex: number;
  descriptionIndex: number;
  amountIndex: number;
  kindIndex: number | undefined;
  externalIdIndex: number | undefined;
}

function resolveCsvColumns(header: readonly string[], mapping: CsvImportMapping): CsvColumnIndexes {
  return {
    dateIndex: requireCsvColumn(header, mapping.date),
    descriptionIndex: requireCsvColumn(header, mapping.description),
    amountIndex: requireCsvColumn(header, mapping.amount),
    kindIndex: findCsvColumn(header, mapping.kind),
    externalIdIndex: findCsvColumn(header, mapping.externalId),
  };
}

function requireCsvColumn(header: readonly string[], columnName: string | undefined): number {
  const index = findCsvColumn(header, columnName);
  if (index === undefined) {
    throw new ImportFileError(
      "IMPORT_CSV_HEADER_INVALID",
      "Mapeie as colunas de data, descricao e valor antes de continuar.",
    );
  }
  return index;
}

function findCsvColumn(
  header: readonly string[],
  columnName: string | undefined,
): number | undefined {
  if (columnName === undefined) return undefined;
  const index = header.indexOf(normalizeHeaderName(columnName));
  return index >= 0 ? index : undefined;
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

function parseAmountMinor(value: string | undefined): {
  amountMinor: number | undefined;
  signedAmountMinor: number | undefined;
} {
  const normalizedValue = normalizeDescription(value)?.replace(/\s/g, "").replace(/^R\$/i, "");
  if (normalizedValue === undefined)
    return { amountMinor: undefined, signedAmountMinor: undefined };

  const comma = normalizedValue.lastIndexOf(",");
  const dot = normalizedValue.lastIndexOf(".");
  let decimalValue = normalizedValue;
  if (comma >= 0 && dot >= 0) {
    decimalValue =
      comma > dot
        ? normalizedValue.replace(/\./g, "").replace(",", ".")
        : normalizedValue.replace(/,/g, "");
  } else if (comma >= 0) {
    decimalValue = normalizedValue.replace(/\./g, "").replace(",", ".");
  }

  if (!/^[+-]?\d+(?:\.\d+)?$/.test(decimalValue))
    return { amountMinor: undefined, signedAmountMinor: undefined };
  const parsedValue = Number(decimalValue);
  if (!Number.isFinite(parsedValue) || parsedValue === 0)
    return { amountMinor: undefined, signedAmountMinor: undefined };
  const signedAmountMinor = Math.round(parsedValue * 100);
  if (!Number.isSafeInteger(signedAmountMinor) || signedAmountMinor === 0)
    return { amountMinor: undefined, signedAmountMinor: undefined };
  return { amountMinor: Math.abs(signedAmountMinor), signedAmountMinor };
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
  return [mapping.date, mapping.description, mapping.amount, mapping.kind, mapping.externalId]
    .map((value) => value ?? "")
    .join("|");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
