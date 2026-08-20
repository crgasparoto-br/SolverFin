import type { ISODateTime } from "./index.js";

export type ReferenceCurrencyUnavailableReason =
  | "quote_missing"
  | "quote_expired"
  | "quote_unavailable";

export interface MoneyAmount {
  amountMinor: number;
  currency: string;
}

export interface ReferenceCurrencyPreference {
  currency: string;
  updatedAt: ISODateTime;
}

export interface ExchangeRateQuote {
  sourceCurrency: string;
  targetCurrency: string;
  rate: string;
  referenceAt: ISODateTime;
  expiresAt: ISODateTime;
  source: string;
}

export type ExchangeRateLookupResult =
  | { status: "available"; quote: ExchangeRateQuote }
  | { status: "missing" }
  | { status: "unavailable" };

export type ReferenceCurrencyAvailability =
  | {
      kind: "native";
      nativeCurrency: string;
      referenceCurrency: string;
    }
  | {
      kind: "quote_available";
      nativeCurrency: string;
      referenceCurrency: string;
      quote: ExchangeRateQuote;
    }
  | {
      kind: "unavailable";
      nativeCurrency: string;
      referenceCurrency: string;
      reason: ReferenceCurrencyUnavailableReason;
    };

export type ReferenceCurrencyAmount =
  | {
      kind: "native";
      native: MoneyAmount;
      referenceCurrency: string;
    }
  | {
      kind: "converted";
      native: MoneyAmount;
      referenceCurrency: string;
      converted: MoneyAmount;
      exchangeRate: ExchangeRateQuote;
    }
  | {
      kind: "unavailable";
      native: MoneyAmount;
      referenceCurrency: string;
      reason: ReferenceCurrencyUnavailableReason;
    };

export type CurrencyConversionContractErrorCode =
  | "CURRENCY_CODE_INVALID"
  | "MONEY_AMOUNT_INVALID"
  | "REFERENCE_CURRENCY_PREFERENCE_INVALID"
  | "EXCHANGE_RATE_INVALID"
  | "EXCHANGE_RATE_REFERENCE_INVALID"
  | "EXCHANGE_RATE_EXPIRY_INVALID"
  | "EXCHANGE_RATE_NOT_YET_VALID"
  | "EXCHANGE_RATE_EXPIRED"
  | "EXCHANGE_RATE_SOURCE_REQUIRED"
  | "EXCHANGE_RATE_CURRENCY_MISMATCH"
  | "REFERENCE_CURRENCY_MISMATCH"
  | "CONVERTED_AMOUNT_CURRENCY_MISMATCH"
  | "CONVERSION_NOT_REQUIRED";

export class CurrencyConversionContractError extends Error {
  readonly code: CurrencyConversionContractErrorCode;

  constructor(code: CurrencyConversionContractErrorCode, message: string) {
    super(message);
    this.name = "CurrencyConversionContractError";
    this.code = code;
  }
}

export function createReferenceCurrencyPreference(input: {
  currency: string;
  updatedAt: ISODateTime;
}): ReferenceCurrencyPreference {
  return {
    currency: normalizeCurrencyCode(input.currency),
    updatedAt: validateIsoDateTime(
      input.updatedAt,
      "REFERENCE_CURRENCY_PREFERENCE_INVALID",
      "Reference currency preference updatedAt must be a valid ISO date-time.",
    ),
  };
}

export function resolveReferenceCurrencyAvailability(input: {
  nativeCurrency: string;
  referenceCurrency: string;
  quoteResult: ExchangeRateLookupResult;
  evaluatedAt: ISODateTime;
}): ReferenceCurrencyAvailability {
  const nativeCurrency = normalizeCurrencyCode(input.nativeCurrency);
  const referenceCurrency = normalizeCurrencyCode(input.referenceCurrency);
  const evaluatedAt = validateIsoDateTime(
    input.evaluatedAt,
    "EXCHANGE_RATE_EXPIRY_INVALID",
    "Currency conversion evaluation time must be a valid ISO date-time.",
  );

  if (nativeCurrency === referenceCurrency) {
    return {
      kind: "native",
      nativeCurrency,
      referenceCurrency,
    };
  }

  if (input.quoteResult.status === "missing") {
    return {
      kind: "unavailable",
      nativeCurrency,
      referenceCurrency,
      reason: "quote_missing",
    };
  }

  if (input.quoteResult.status === "unavailable") {
    return {
      kind: "unavailable",
      nativeCurrency,
      referenceCurrency,
      reason: "quote_unavailable",
    };
  }

  const quote = normalizeExchangeRateQuote(input.quoteResult.quote);
  assertExchangeRatePair(quote, nativeCurrency, referenceCurrency);
  assertQuoteNotBeforeReference(quote, evaluatedAt);

  if (Date.parse(evaluatedAt) > Date.parse(quote.expiresAt)) {
    return {
      kind: "unavailable",
      nativeCurrency,
      referenceCurrency,
      reason: "quote_expired",
    };
  }

  return {
    kind: "quote_available",
    nativeCurrency,
    referenceCurrency,
    quote,
  };
}

export function createNativeReferenceCurrencyAmount(input: {
  native: MoneyAmount;
  referenceCurrency: string;
}): ReferenceCurrencyAmount {
  const native = normalizeMoneyAmount(input.native);
  const referenceCurrency = normalizeCurrencyCode(input.referenceCurrency);

  if (native.currency !== referenceCurrency) {
    throw new CurrencyConversionContractError(
      "REFERENCE_CURRENCY_MISMATCH",
      "Native reference-currency values require native and reference currencies to match.",
    );
  }

  return {
    kind: "native",
    native,
    referenceCurrency,
  };
}

export function createUnavailableReferenceCurrencyAmount(input: {
  native: MoneyAmount;
  referenceCurrency: string;
  reason: ReferenceCurrencyUnavailableReason;
}): ReferenceCurrencyAmount {
  const native = normalizeMoneyAmount(input.native);
  const referenceCurrency = normalizeCurrencyCode(input.referenceCurrency);

  if (native.currency === referenceCurrency) {
    throw new CurrencyConversionContractError(
      "CONVERSION_NOT_REQUIRED",
      "A quote cannot be unavailable when the native currency already is the reference currency.",
    );
  }

  return {
    kind: "unavailable",
    native,
    referenceCurrency,
    reason: input.reason,
  };
}

export function createConvertedReferenceCurrencyAmount(input: {
  native: MoneyAmount;
  referenceCurrency: string;
  convertedAmountMinor: number;
  exchangeRate: ExchangeRateQuote;
  evaluatedAt: ISODateTime;
}): ReferenceCurrencyAmount {
  const native = normalizeMoneyAmount(input.native);
  const referenceCurrency = normalizeCurrencyCode(input.referenceCurrency);

  if (native.currency === referenceCurrency) {
    throw new CurrencyConversionContractError(
      "CONVERSION_NOT_REQUIRED",
      "Do not represent same-currency amounts as converted values or fabricate a 1:1 quote.",
    );
  }

  const exchangeRate = normalizeExchangeRateQuote(input.exchangeRate);
  const evaluatedAt = validateIsoDateTime(
    input.evaluatedAt,
    "EXCHANGE_RATE_EXPIRY_INVALID",
    "Currency conversion evaluation time must be a valid ISO date-time.",
  );
  assertExchangeRatePair(exchangeRate, native.currency, referenceCurrency);
  assertQuoteNotBeforeReference(exchangeRate, evaluatedAt);
  assertQuoteNotExpired(exchangeRate, evaluatedAt);

  const converted: MoneyAmount = {
    amountMinor: validateAmountMinor(input.convertedAmountMinor),
    currency: referenceCurrency,
  };

  if (converted.currency !== exchangeRate.targetCurrency) {
    throw new CurrencyConversionContractError(
      "CONVERTED_AMOUNT_CURRENCY_MISMATCH",
      "Converted amount currency must match the exchange-rate target currency.",
    );
  }

  return {
    kind: "converted",
    native,
    referenceCurrency,
    converted,
    exchangeRate,
  };
}

function normalizeMoneyAmount(input: MoneyAmount): MoneyAmount {
  return {
    amountMinor: validateAmountMinor(input.amountMinor),
    currency: normalizeCurrencyCode(input.currency),
  };
}

function validateAmountMinor(amountMinor: number): number {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new CurrencyConversionContractError(
      "MONEY_AMOUNT_INVALID",
      "Money amount must be a safe integer in minor units.",
    );
  }

  return amountMinor;
}

function normalizeExchangeRateQuote(input: ExchangeRateQuote): ExchangeRateQuote {
  const sourceCurrency = normalizeCurrencyCode(input.sourceCurrency);
  const targetCurrency = normalizeCurrencyCode(input.targetCurrency);
  const rate = input.rate.trim();
  const referenceAt = validateIsoDateTime(
    input.referenceAt,
    "EXCHANGE_RATE_REFERENCE_INVALID",
    "Exchange-rate referenceAt must be a valid ISO date-time.",
  );
  const expiresAt = validateIsoDateTime(
    input.expiresAt,
    "EXCHANGE_RATE_EXPIRY_INVALID",
    "Exchange-rate expiresAt must be a valid ISO date-time.",
  );
  const source = input.source.trim();

  if (!isPositiveDecimal(rate)) {
    throw new CurrencyConversionContractError(
      "EXCHANGE_RATE_INVALID",
      "Exchange rate must be a positive decimal string.",
    );
  }

  if (Date.parse(expiresAt) < Date.parse(referenceAt)) {
    throw new CurrencyConversionContractError(
      "EXCHANGE_RATE_EXPIRY_INVALID",
      "Exchange-rate expiresAt cannot be earlier than referenceAt.",
    );
  }

  if (!source) {
    throw new CurrencyConversionContractError(
      "EXCHANGE_RATE_SOURCE_REQUIRED",
      "Exchange-rate source is required for auditability.",
    );
  }

  return {
    sourceCurrency,
    targetCurrency,
    rate,
    referenceAt,
    expiresAt,
    source,
  };
}

function assertExchangeRatePair(
  quote: ExchangeRateQuote,
  nativeCurrency: string,
  referenceCurrency: string,
): void {
  if (quote.sourceCurrency !== nativeCurrency || quote.targetCurrency !== referenceCurrency) {
    throw new CurrencyConversionContractError(
      "EXCHANGE_RATE_CURRENCY_MISMATCH",
      "Exchange-rate currencies must match the native and reference currencies.",
    );
  }
}

function assertQuoteNotBeforeReference(quote: ExchangeRateQuote, evaluatedAt: ISODateTime): void {
  if (Date.parse(evaluatedAt) < Date.parse(quote.referenceAt)) {
    throw new CurrencyConversionContractError(
      "EXCHANGE_RATE_NOT_YET_VALID",
      "Exchange rate cannot be used before its referenceAt instant.",
    );
  }
}

function assertQuoteNotExpired(quote: ExchangeRateQuote, evaluatedAt: ISODateTime): void {
  if (Date.parse(evaluatedAt) > Date.parse(quote.expiresAt)) {
    throw new CurrencyConversionContractError(
      "EXCHANGE_RATE_EXPIRED",
      "Exchange rate cannot be used after its expiresAt instant.",
    );
  }
}

function normalizeCurrencyCode(currency: string): string {
  const normalizedCurrency = currency.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    throw new CurrencyConversionContractError(
      "CURRENCY_CODE_INVALID",
      "Currency must use a three-letter ISO 4217-compatible code.",
    );
  }

  return normalizedCurrency;
}

function validateIsoDateTime(
  value: string,
  errorCode: CurrencyConversionContractErrorCode,
  message: string,
): ISODateTime {
  const normalizedValue = value.trim();

  if (
    !normalizedValue ||
    !normalizedValue.includes("T") ||
    Number.isNaN(Date.parse(normalizedValue))
  ) {
    throw new CurrencyConversionContractError(errorCode, message);
  }

  return normalizedValue;
}

function isPositiveDecimal(value: string): boolean {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    return false;
  }

  return !/^0(?:\.0+)?$/.test(value);
}
