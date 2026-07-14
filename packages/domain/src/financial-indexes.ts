export type FinancialIndexKind = "cdi";
export type FinancialIndexRateStatus = "confirmed" | "rejected";

export interface FinancialIndexRateInput {
  kind: FinancialIndexKind;
  referenceOn: string;
  dailyRatePercent: number;
  dailyFactor: number;
  source: string;
  status: FinancialIndexRateStatus;
}

export interface CalculateAccountRemunerationInput {
  balanceMinor: number;
  dailyRatePercent: number;
  remunerationPercent: number;
}

export interface AccountRemunerationCalculation {
  balanceMinor: number;
  dailyRatePercent: number;
  remunerationPercent: number;
  appliedDailyRatePercent: number;
  amountMinor: number;
}

export type FinancialIndexErrorCode =
  | "FINANCIAL_INDEX_RESPONSE_INVALID"
  | "FINANCIAL_INDEX_DATE_INVALID"
  | "FINANCIAL_INDEX_RATE_INVALID"
  | "ACCOUNT_REMUNERATION_BALANCE_INVALID"
  | "ACCOUNT_REMUNERATION_PERCENT_INVALID";

export class FinancialIndexError extends Error {
  readonly code: FinancialIndexErrorCode;
  readonly statusCode = 400;

  constructor(code: FinancialIndexErrorCode, message: string) {
    super(message);
    this.name = "FinancialIndexError";
    this.code = code;
  }
}

export function parseBcbSgsCdiResponse(payload: unknown): FinancialIndexRateInput[] {
  if (!Array.isArray(payload)) {
    throw new FinancialIndexError(
      "FINANCIAL_INDEX_RESPONSE_INVALID",
      "BCB SGS response must be an array.",
    );
  }

  const rates = payload.map((entry) => parseBcbSgsCdiEntry(entry));
  const uniqueDates = new Set<string>();

  for (const rate of rates) {
    if (uniqueDates.has(rate.referenceOn)) {
      throw new FinancialIndexError(
        "FINANCIAL_INDEX_RESPONSE_INVALID",
        `BCB SGS response contains duplicate CDI date ${rate.referenceOn}.`,
      );
    }

    uniqueDates.add(rate.referenceOn);
  }

  return rates.sort((left, right) => left.referenceOn.localeCompare(right.referenceOn));
}

export function calculateAccountRemuneration(
  input: CalculateAccountRemunerationInput,
): AccountRemunerationCalculation {
  if (!Number.isInteger(input.balanceMinor)) {
    throw new FinancialIndexError(
      "ACCOUNT_REMUNERATION_BALANCE_INVALID",
      "Account remuneration balance must use integer minor units.",
    );
  }

  const dailyRatePercent = validatePositiveDecimal(
    input.dailyRatePercent,
    "FINANCIAL_INDEX_RATE_INVALID",
    "CDI daily rate must be greater than zero.",
  );
  const remunerationPercent = validatePercentage(input.remunerationPercent);
  const appliedDailyRatePercent = dailyRatePercent * (remunerationPercent / 100);
  const amountMinor =
    input.balanceMinor > 0 ? Math.round(input.balanceMinor * (appliedDailyRatePercent / 100)) : 0;

  return {
    balanceMinor: input.balanceMinor,
    dailyRatePercent,
    remunerationPercent,
    appliedDailyRatePercent,
    amountMinor,
  };
}

export function validateRemunerationPercentage(value: number): number {
  return validatePercentage(value);
}

function parseBcbSgsCdiEntry(entry: unknown): FinancialIndexRateInput {
  if (typeof entry !== "object" || entry === null) {
    throw new FinancialIndexError(
      "FINANCIAL_INDEX_RESPONSE_INVALID",
      "BCB SGS CDI entry must be an object.",
    );
  }

  const record = entry as Record<string, unknown>;
  const referenceOn = parseBrazilianDate(String(record.data ?? ""));
  const dailyRatePercent = parseBrazilianDecimal(String(record.valor ?? ""));

  return {
    kind: "cdi",
    referenceOn,
    dailyRatePercent,
    dailyFactor: 1 + dailyRatePercent / 100,
    source: "BCB_SGS_12",
    status: "confirmed",
  };
}

function parseBrazilianDate(value: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());

  if (!match) {
    throw new FinancialIndexError(
      "FINANCIAL_INDEX_DATE_INVALID",
      "BCB SGS CDI date must use DD/MM/YYYY format.",
    );
  }

  const [, day = "", month = "", year = ""] = match;
  const normalized = `${year}-${month}-${day}`;
  const date = new Date(`${normalized}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    throw new FinancialIndexError("FINANCIAL_INDEX_DATE_INVALID", "BCB SGS CDI date is invalid.");
  }

  return normalized;
}

function parseBrazilianDecimal(value: string): number {
  const parsed = Number(value.trim().replace(",", "."));

  return validatePositiveDecimal(
    parsed,
    "FINANCIAL_INDEX_RATE_INVALID",
    "BCB SGS CDI rate must be greater than zero.",
  );
}

function validatePercentage(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > 1_000) {
    throw new FinancialIndexError(
      "ACCOUNT_REMUNERATION_PERCENT_INVALID",
      "Account remuneration percentage must be greater than zero and at most 1000%.",
    );
  }

  return value;
}

function validatePositiveDecimal(
  value: number,
  code: FinancialIndexErrorCode,
  message: string,
): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new FinancialIndexError(code, message);
  }

  return value;
}
