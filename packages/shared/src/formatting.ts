export const SOLVERFIN_FORMAT_LOCALE = "pt-BR" as const;
export const SOLVERFIN_FORMAT_CURRENCY = "BRL" as const;
export const SOLVERFIN_DATE_TIME_ZONE = "UTC" as const;

export const SOLVERFIN_FORMATTING_CONFIG = Object.freeze({
  locale: SOLVERFIN_FORMAT_LOCALE,
  currency: SOLVERFIN_FORMAT_CURRENCY,
  dateTimeZone: SOLVERFIN_DATE_TIME_ZONE,
});

export interface SolverFinCurrencyFormatterOptions {
  currency?: string;
}

export interface SolverFinDateFormatterOptions {
  timeZone?: string;
}

export function createSolverFinCurrencyFormatter(
  options: SolverFinCurrencyFormatterOptions = {},
): Intl.NumberFormat {
  return new Intl.NumberFormat(SOLVERFIN_FORMATTING_CONFIG.locale, {
    style: "currency",
    currency: options.currency ?? SOLVERFIN_FORMATTING_CONFIG.currency,
  });
}

export function createSolverFinDateFormatter(
  options: SolverFinDateFormatterOptions = {},
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(SOLVERFIN_FORMATTING_CONFIG.locale, {
    timeZone: options.timeZone ?? SOLVERFIN_FORMATTING_CONFIG.dateTimeZone,
  });
}

export function formatMinorCurrency(
  amountMinor: number,
  options: SolverFinCurrencyFormatterOptions = {},
): string {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError("amountMinor must be a safe integer before currency formatting.");
  }

  const exactDecimal = minorUnitsToExactDecimal(amountMinor);
  const formatter = createSolverFinCurrencyFormatter(options);
  // ECMA-402 accepts a decimal StringNumericLiteral and preserves its exact
  // mathematical value. TypeScript's Intl declaration is narrower, so keep the
  // cast isolated here instead of converting the decimal back to a Number.
  const formatExact = formatter.format as unknown as (value: string) => string;

  return formatExact(exactDecimal);
}

export function formatDateOnly(date: string, options: SolverFinDateFormatterOptions = {}): string {
  return createSolverFinDateFormatter(options).format(new Date(`${date}T00:00:00.000Z`));
}

function minorUnitsToExactDecimal(amountMinor: number): string {
  const value = BigInt(amountMinor);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const major = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");

  return `${negative ? "-" : ""}${major}.${fraction}`;
}
