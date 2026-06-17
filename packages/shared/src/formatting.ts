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
  return createSolverFinCurrencyFormatter(options).format(amountMinor / 100);
}

export function formatDateOnly(date: string, options: SolverFinDateFormatterOptions = {}): string {
  return createSolverFinDateFormatter(options).format(new Date(`${date}T00:00:00.000Z`));
}
