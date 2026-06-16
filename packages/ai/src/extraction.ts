export type TransactionExtractionType = "income" | "expense" | "transfer" | "unknown";
export type TransactionExtractionSource = "bank_message" | "shared_text" | "import" | "manual_note";
export type TransactionExtractionStatus = "valid" | "needs_review" | "invalid";

export interface TransactionExtractionSuggestion {
  amountMinor: number;
  currency: string;
  occurredOn: string;
  type: TransactionExtractionType;
  merchant?: string;
  accountHint?: string;
  cardHint?: string;
  categorySuggestion?: string;
  confidence: number;
  source: TransactionExtractionSource;
  reasons: readonly string[];
}

export interface TransactionExtractionValidationProblem {
  code:
    | "EXTRACTION_NOT_OBJECT"
    | "EXTRACTION_FIELD_UNEXPECTED"
    | "EXTRACTION_AMOUNT_REQUIRED"
    | "EXTRACTION_AMOUNT_INVALID"
    | "EXTRACTION_CURRENCY_REQUIRED"
    | "EXTRACTION_CURRENCY_INVALID"
    | "EXTRACTION_DATE_REQUIRED"
    | "EXTRACTION_DATE_INVALID"
    | "EXTRACTION_TYPE_REQUIRED"
    | "EXTRACTION_TYPE_INVALID"
    | "EXTRACTION_CONFIDENCE_REQUIRED"
    | "EXTRACTION_CONFIDENCE_INVALID"
    | "EXTRACTION_SOURCE_REQUIRED"
    | "EXTRACTION_SOURCE_INVALID"
    | "EXTRACTION_REASONS_REQUIRED"
    | "EXTRACTION_REASONS_INVALID"
    | "EXTRACTION_LOW_CONFIDENCE";
  field?: string;
  message: string;
}

export interface TransactionExtractionValidationResult {
  status: TransactionExtractionStatus;
  suggestion?: TransactionExtractionSuggestion;
  problems: readonly TransactionExtractionValidationProblem[];
}

export interface TransactionExtractionSchemaOptions {
  minConfidenceForSuggestion: number;
}

const DEFAULT_OPTIONS: TransactionExtractionSchemaOptions = {
  minConfidenceForSuggestion: 0.7,
};

const ALLOWED_FIELDS = new Set([
  "amount",
  "amountMinor",
  "currency",
  "occurredOn",
  "date",
  "type",
  "merchant",
  "accountHint",
  "cardHint",
  "categorySuggestion",
  "confidence",
  "source",
  "reasons",
]);

const EXTRACTION_TYPES = new Set<TransactionExtractionType>([
  "income",
  "expense",
  "transfer",
  "unknown",
]);

const EXTRACTION_SOURCES = new Set<TransactionExtractionSource>([
  "bank_message",
  "shared_text",
  "import",
  "manual_note",
]);

export function validateTransactionExtraction(
  value: unknown,
  options: Partial<TransactionExtractionSchemaOptions> = {},
): TransactionExtractionValidationResult {
  const resolvedOptions = { ...DEFAULT_OPTIONS, ...options };
  const problems: TransactionExtractionValidationProblem[] = [];

  if (!isRecord(value)) {
    return {
      status: "invalid",
      problems: [
        {
          code: "EXTRACTION_NOT_OBJECT",
          message: "Provider response must be an object.",
        },
      ],
    };
  }

  for (const field of Object.keys(value)) {
    if (!ALLOWED_FIELDS.has(field)) {
      problems.push({
        code: "EXTRACTION_FIELD_UNEXPECTED",
        field,
        message: `Unexpected extraction field: ${field}.`,
      });
    }
  }

  const amountMinor = readAmountMinor(value, problems);
  const currency = readCurrency(value.currency, problems);
  const occurredOn = readDate(value.occurredOn ?? value.date, problems);
  const type = readType(value.type, problems);
  const confidence = readConfidence(value.confidence, problems);
  const source = readSource(value.source, problems);
  const reasons = readReasons(value.reasons, problems);

  if (confidence !== undefined && confidence < resolvedOptions.minConfidenceForSuggestion) {
    problems.push({
      code: "EXTRACTION_LOW_CONFIDENCE",
      field: "confidence",
      message: "Extraction confidence is below the automatic suggestion threshold.",
    });
  }

  const hasBlockingProblem = problems.some(
    (problem) => problem.code !== "EXTRACTION_LOW_CONFIDENCE",
  );

  if (
    hasBlockingProblem ||
    amountMinor === undefined ||
    currency === undefined ||
    occurredOn === undefined ||
    type === undefined ||
    confidence === undefined ||
    source === undefined ||
    reasons === undefined
  ) {
    return { status: "invalid", problems };
  }

  const suggestion: TransactionExtractionSuggestion = {
    amountMinor,
    currency,
    occurredOn,
    type,
    confidence,
    source,
    reasons,
  };

  assignOptionalString(suggestion, "merchant", value.merchant);
  assignOptionalString(suggestion, "accountHint", value.accountHint);
  assignOptionalString(suggestion, "cardHint", value.cardHint);
  assignOptionalString(suggestion, "categorySuggestion", value.categorySuggestion);

  return {
    status: problems.length > 0 ? "needs_review" : "valid",
    suggestion,
    problems,
  };
}

function readAmountMinor(
  value: Readonly<Record<string, unknown>>,
  problems: TransactionExtractionValidationProblem[],
): number | undefined {
  if (value.amountMinor !== undefined) {
    return readIntegerAmountMinor(value.amountMinor, problems);
  }

  if (value.amount === undefined) {
    problems.push({
      code: "EXTRACTION_AMOUNT_REQUIRED",
      field: "amount",
      message: "Extraction amount is required.",
    });
    return undefined;
  }

  const amount =
    typeof value.amount === "number" ? value.amount : parseLocalizedAmount(value.amount);

  if (amount === undefined || amount <= 0) {
    problems.push({
      code: "EXTRACTION_AMOUNT_INVALID",
      field: "amount",
      message: "Extraction amount must be a positive number.",
    });
    return undefined;
  }

  return Math.round(amount * 100);
}

function readIntegerAmountMinor(
  value: unknown,
  problems: TransactionExtractionValidationProblem[],
): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  problems.push({
    code: "EXTRACTION_AMOUNT_INVALID",
    field: "amountMinor",
    message: "Extraction amountMinor must be a positive integer.",
  });
  return undefined;
}

function readCurrency(
  value: unknown,
  problems: TransactionExtractionValidationProblem[],
): string | undefined {
  if (value === undefined) {
    problems.push({
      code: "EXTRACTION_CURRENCY_REQUIRED",
      field: "currency",
      message: "Extraction currency is required.",
    });
    return undefined;
  }

  if (typeof value !== "string" || !/^[a-z]{3}$/i.test(value.trim())) {
    problems.push({
      code: "EXTRACTION_CURRENCY_INVALID",
      field: "currency",
      message: "Extraction currency must be an ISO-like 3-letter code.",
    });
    return undefined;
  }

  return value.trim().toUpperCase();
}

function readDate(
  value: unknown,
  problems: TransactionExtractionValidationProblem[],
): string | undefined {
  if (value === undefined) {
    problems.push({
      code: "EXTRACTION_DATE_REQUIRED",
      field: "occurredOn",
      message: "Extraction date is required.",
    });
    return undefined;
  }

  if (typeof value !== "string") {
    problems.push({
      code: "EXTRACTION_DATE_INVALID",
      field: "occurredOn",
      message: "Extraction date must be a string.",
    });
    return undefined;
  }

  const trimmed = value.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);

  if (isoMatch) {
    return normalizeDateParts(isoMatch[1], isoMatch[2], isoMatch[3], problems);
  }

  const brMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);

  if (brMatch) {
    return normalizeDateParts(brMatch[3], brMatch[2], brMatch[1], problems);
  }

  problems.push({
    code: "EXTRACTION_DATE_INVALID",
    field: "occurredOn",
    message: "Extraction date must use YYYY-MM-DD or DD/MM/YYYY.",
  });
  return undefined;
}

function readType(
  value: unknown,
  problems: TransactionExtractionValidationProblem[],
): TransactionExtractionType | undefined {
  if (value === undefined) {
    problems.push({
      code: "EXTRACTION_TYPE_REQUIRED",
      field: "type",
      message: "Extraction type is required.",
    });
    return undefined;
  }

  if (typeof value !== "string") {
    problems.push({
      code: "EXTRACTION_TYPE_INVALID",
      field: "type",
      message: "Extraction type must be a string enum.",
    });
    return undefined;
  }

  const normalized = value.trim().toLowerCase() as TransactionExtractionType;

  if (!EXTRACTION_TYPES.has(normalized)) {
    problems.push({
      code: "EXTRACTION_TYPE_INVALID",
      field: "type",
      message: "Extraction type is not supported.",
    });
    return undefined;
  }

  return normalized;
}

function readConfidence(
  value: unknown,
  problems: TransactionExtractionValidationProblem[],
): number | undefined {
  if (value === undefined) {
    problems.push({
      code: "EXTRACTION_CONFIDENCE_REQUIRED",
      field: "confidence",
      message: "Extraction confidence is required.",
    });
    return undefined;
  }

  if (typeof value !== "number" || value < 0 || value > 1) {
    problems.push({
      code: "EXTRACTION_CONFIDENCE_INVALID",
      field: "confidence",
      message: "Extraction confidence must be between 0 and 1.",
    });
    return undefined;
  }

  return value;
}

function readSource(
  value: unknown,
  problems: TransactionExtractionValidationProblem[],
): TransactionExtractionSource | undefined {
  if (value === undefined) {
    problems.push({
      code: "EXTRACTION_SOURCE_REQUIRED",
      field: "source",
      message: "Extraction source is required.",
    });
    return undefined;
  }

  if (typeof value !== "string") {
    problems.push({
      code: "EXTRACTION_SOURCE_INVALID",
      field: "source",
      message: "Extraction source must be a string enum.",
    });
    return undefined;
  }

  const normalized = value.trim().toLowerCase() as TransactionExtractionSource;

  if (!EXTRACTION_SOURCES.has(normalized)) {
    problems.push({
      code: "EXTRACTION_SOURCE_INVALID",
      field: "source",
      message: "Extraction source is not supported.",
    });
    return undefined;
  }

  return normalized;
}

function readReasons(
  value: unknown,
  problems: TransactionExtractionValidationProblem[],
): readonly string[] | undefined {
  if (value === undefined) {
    problems.push({
      code: "EXTRACTION_REASONS_REQUIRED",
      field: "reasons",
      message: "Extraction reasons are required.",
    });
    return undefined;
  }

  if (!Array.isArray(value)) {
    problems.push({
      code: "EXTRACTION_REASONS_INVALID",
      field: "reasons",
      message: "Extraction reasons must be an array of strings.",
    });
    return undefined;
  }

  const reasons = value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());

  if (reasons.length === 0) {
    problems.push({
      code: "EXTRACTION_REASONS_INVALID",
      field: "reasons",
      message: "Extraction reasons must include at least one non-empty string.",
    });
    return undefined;
  }

  return reasons;
}

function normalizeDateParts(
  year: string,
  month: string,
  day: string,
  problems: TransactionExtractionValidationProblem[],
): string | undefined {
  const isoDate = `${year}-${month}-${day}`;
  const parsed = new Date(`${isoDate}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== isoDate) {
    problems.push({
      code: "EXTRACTION_DATE_INVALID",
      field: "occurredOn",
      message: "Extraction date must be a real calendar date.",
    });
    return undefined;
  }

  return isoDate;
}

function parseLocalizedAmount(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function assignOptionalString(
  suggestion: TransactionExtractionSuggestion,
  field: "merchant" | "accountHint" | "cardHint" | "categorySuggestion",
  value: unknown,
): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    return;
  }

  const normalized = value.trim();

  switch (field) {
    case "merchant":
      suggestion.merchant = normalized;
      break;
    case "accountHint":
      suggestion.accountHint = normalized;
      break;
    case "cardHint":
      suggestion.cardHint = normalized;
      break;
    case "categorySuggestion":
      suggestion.categorySuggestion = normalized;
      break;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
