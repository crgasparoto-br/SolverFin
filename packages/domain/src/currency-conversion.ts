export type ReferenceCurrencyScope = "financial_profile";

export interface ConfiguredReferenceCurrency {
  status: "configured";
  scope: ReferenceCurrencyScope;
  currency: string;
}

export interface UnconfiguredReferenceCurrency {
  status: "unconfigured";
  scope: ReferenceCurrencyScope;
  currency: null;
}

export type ReferenceCurrencyResolution =
  | ConfiguredReferenceCurrency
  | UnconfiguredReferenceCurrency;

export interface MonetaryAmount {
  amountMinor: number;
  currency: string;
}

export interface ExchangeRateMetadata {
  sourceCurrency: string;
  targetCurrency: string;
  rate: string;
  quotedAt: string;
  source: string;
  quoteId?: string;
}

export type CurrencyConversionUnavailableReason =
  | "reference_currency_unconfigured"
  | "quote_missing"
  | "quote_expired"
  | "provider_unavailable";

export interface NativeReferenceCurrencyValue {
  status: "native";
  native: MonetaryAmount;
  referenceCurrency: string;
  converted: null;
  quote: null;
  estimated: false;
}

export interface ConvertedReferenceCurrencyValue {
  status: "converted";
  native: MonetaryAmount;
  referenceCurrency: string;
  converted: MonetaryAmount;
  quote: ExchangeRateMetadata;
  estimated: false;
}

export interface StaleReferenceCurrencyValue {
  status: "stale";
  native: MonetaryAmount;
  referenceCurrency: string;
  converted: MonetaryAmount;
  quote: ExchangeRateMetadata;
  estimated: true;
}

export interface UnavailableReferenceCurrencyValue {
  status: "unavailable";
  native: MonetaryAmount;
  referenceCurrency: string | null;
  converted: null;
  quote: null;
  estimated: false;
  reason: CurrencyConversionUnavailableReason;
}

export type ReferenceCurrencyValue =
  | NativeReferenceCurrencyValue
  | ConvertedReferenceCurrencyValue
  | StaleReferenceCurrencyValue
  | UnavailableReferenceCurrencyValue;

export type CurrencyConversionContractErrorCode =
  | "CURRENCY_CODE_INVALID"
  | "MONETARY_AMOUNT_INVALID"
  | "REFERENCE_CURRENCY_MISMATCH"
  | "CONVERSION_TARGET_EQUALS_SOURCE"
  | "CONVERSION_QUOTE_PAIR_MISMATCH"
  | "CONVERSION_RATE_INVALID"
  | "CONVERSION_QUOTED_AT_INVALID"
  | "CONVERSION_SOURCE_REQUIRED"
  | "CONVERSION_REASON_INVALID";

export class CurrencyConversionContractError extends Error {
  public readonly code: CurrencyConversionContractErrorCode;

  public constructor(
    code: CurrencyConversionContractErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CurrencyConversionContractError";
    this.code = code;
  }
}

export function normalizeCurrencyCode(currency: string): string {
  const normalized = currency.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new CurrencyConversionContractError(
      "CURRENCY_CODE_INVALID",
      "Currency must use a three-letter ISO 4217-compatible code.",
    );
  }

  return normalized;
}

export function resolveProfileReferenceCurrency(
  referenceCurrency: string | null | undefined,
): ReferenceCurrencyResolution {
  if (
    referenceCurrency === null ||
    referenceCurrency === undefined ||
    referenceCurrency.trim() === ""
  ) {
    return {
      status: "unconfigured",
      scope: "financial_profile",
      currency: null,
    };
  }

  return {
    status: "configured",
    scope: "financial_profile",
    currency: normalizeCurrencyCode(referenceCurrency),
  };
}

export function createNativeReferenceCurrencyValue(
  native: MonetaryAmount,
  referenceCurrency: string,
): NativeReferenceCurrencyValue {
  const normalizedNative = normalizeMonetaryAmount(native);
  const normalizedReferenceCurrency = normalizeCurrencyCode(referenceCurrency);

  if (normalizedNative.currency !== normalizedReferenceCurrency) {
    throw new CurrencyConversionContractError(
      "REFERENCE_CURRENCY_MISMATCH",
      "Native reference values require native and reference currencies to match.",
    );
  }

  return {
    status: "native",
    native: normalizedNative,
    referenceCurrency: normalizedReferenceCurrency,
    converted: null,
    quote: null,
    estimated: false,
  };
}

export function createConvertedReferenceCurrencyValue(input: {
  status: "converted" | "stale";
  native: MonetaryAmount;
  converted: MonetaryAmount;
  quote: ExchangeRateMetadata;
}): ConvertedReferenceCurrencyValue | StaleReferenceCurrencyValue {
  const native = normalizeMonetaryAmount(input.native);
  const converted = normalizeMonetaryAmount(input.converted);
  const quote = normalizeExchangeRateMetadata(input.quote);

  if (native.currency === converted.currency) {
    throw new CurrencyConversionContractError(
      "CONVERSION_TARGET_EQUALS_SOURCE",
      "Currency conversion requires different source and target currencies.",
    );
  }

  if (
    quote.sourceCurrency !== native.currency ||
    quote.targetCurrency !== converted.currency
  ) {
    throw new CurrencyConversionContractError(
      "CONVERSION_QUOTE_PAIR_MISMATCH",
      "Exchange-rate metadata must describe the same source and target currencies as the value.",
    );
  }

  if (input.status === "stale") {
    return {
      status: "stale",
      native,
      referenceCurrency: converted.currency,
      converted,
      quote,
      estimated: true,
    };
  }

  return {
    status: "converted",
    native,
    referenceCurrency: converted.currency,
    converted,
    quote,
    estimated: false,
  };
}

export function createUnavailableReferenceCurrencyValue(input: {
  native: MonetaryAmount;
  referenceCurrency?: string | null;
  reason: CurrencyConversionUnavailableReason;
}): UnavailableReferenceCurrencyValue {
  const native = normalizeMonetaryAmount(input.native);
  const referenceCurrency =
    input.referenceCurrency === null || input.referenceCurrency === undefined
      ? null
      : normalizeCurrencyCode(input.referenceCurrency);

  if (
    input.reason === "reference_currency_unconfigured" &&
    referenceCurrency !== null
  ) {
    throw new CurrencyConversionContractError(
      "CONVERSION_REASON_INVALID",
      "An unconfigured reference currency cannot include a target currency.",
    );
  }

  if (
    input.reason !== "reference_currency_unconfigured" &&
    referenceCurrency === null
  ) {
    throw new CurrencyConversionContractError(
      "CONVERSION_REASON_INVALID",
      "Quote-related unavailability requires the requested reference currency.",
    );
  }

  if (referenceCurrency === native.currency) {
    throw new CurrencyConversionContractError(
      "CONVERSION_TARGET_EQUALS_SOURCE",
      "A native value does not require an unavailable currency conversion result.",
    );
  }

  return {
    status: "unavailable",
    native,
    referenceCurrency,
    converted: null,
    quote: null,
    estimated: false,
    reason: input.reason,
  };
}

function normalizeMonetaryAmount(value: MonetaryAmount): MonetaryAmount {
  if (!Number.isSafeInteger(value.amountMinor)) {
    throw new CurrencyConversionContractError(
      "MONETARY_AMOUNT_INVALID",
      "Monetary amounts must use safe integer minor units.",
    );
  }

  return {
    amountMinor: value.amountMinor,
    currency: normalizeCurrencyCode(value.currency),
  };
}

function normalizeExchangeRateMetadata(
  metadata: ExchangeRateMetadata,
): ExchangeRateMetadata {
  const sourceCurrency = normalizeCurrencyCode(metadata.sourceCurrency);
  const targetCurrency = normalizeCurrencyCode(metadata.targetCurrency);
  const rate = metadata.rate.trim();
  const source = metadata.source.trim();
  const quotedAt = metadata.quotedAt.trim();

  if (!isPositiveDecimal(rate)) {
    throw new CurrencyConversionContractError(
      "CONVERSION_RATE_INVALID",
      "Exchange rates must be positive decimal strings.",
    );
  }

  if (Number.isNaN(Date.parse(quotedAt))) {
    throw new CurrencyConversionContractError(
      "CONVERSION_QUOTED_AT_INVALID",
      "Exchange-rate metadata requires a valid reference date or instant.",
    );
  }

  if (source.length === 0) {
    throw new CurrencyConversionContractError(
      "CONVERSION_SOURCE_REQUIRED",
      "Exchange-rate metadata requires a non-empty source identifier.",
    );
  }

  const normalized: ExchangeRateMetadata = {
    sourceCurrency,
    targetCurrency,
    rate,
    quotedAt,
    source,
  };

  const quoteId = metadata.quoteId?.trim();
  if (quoteId) {
    normalized.quoteId = quoteId;
  }

  return normalized;
}

function isPositiveDecimal(value: string): boolean {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    return false;
  }

  return /[1-9]/.test(value);
}
