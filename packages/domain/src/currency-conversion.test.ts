import {
  CurrencyConversionContractError,
  createConvertedReferenceCurrencyAmount,
  createNativeReferenceCurrencyAmount,
  createReferenceCurrencyPreference,
  createUnavailableReferenceCurrencyAmount,
  resolveReferenceCurrencyAvailability,
  type ExchangeRateQuote,
} from "./currency-conversion.js";

const activeUsdToBrlQuote: ExchangeRateQuote = {
  sourceCurrency: "USD",
  targetCurrency: "BRL",
  rate: "5.2500",
  referenceAt: "2026-08-20T12:00:00.000Z",
  expiresAt: "2026-08-20T18:00:00.000Z",
  source: "fixture:fx-contract",
};

testReferenceCurrencyPreferenceRequiresExplicitCurrency();
testSameCurrencyUsesNativeRepresentationWithoutQuote();
testMissingQuoteFailsClosedWithoutConvertedValue();
testUnavailableQuoteFailsClosedWithoutConvertedValue();
testExpiredQuoteFailsClosedWithoutConvertedValue();
testAvailableQuotePreservesAuditableMetadata();
testConvertedValuePreservesNativeAndConvertedAmounts();
testSourceCurrencyMismatchIsRejected();
testTargetCurrencyMismatchIsRejected();
testZeroRateIsRejected();
testSameCurrencyCannotBeFabricatedAsConversion();

function testReferenceCurrencyPreferenceRequiresExplicitCurrency(): void {
  const preference = createReferenceCurrencyPreference({
    currency: " usd ",
    updatedAt: "2026-08-20T10:00:00.000Z",
  });

  assertEqual(preference.currency, "USD", "reference currency normalization");
  assertCurrencyContractError(
    () =>
      createReferenceCurrencyPreference({
        currency: "",
        updatedAt: "2026-08-20T10:00:00.000Z",
      }),
    "CURRENCY_CODE_INVALID",
  );
}

function testSameCurrencyUsesNativeRepresentationWithoutQuote(): void {
  const availability = resolveReferenceCurrencyAvailability({
    nativeCurrency: "brl",
    referenceCurrency: "BRL",
    quoteResult: { status: "missing" },
    evaluatedAt: "2026-08-20T13:00:00.000Z",
  });
  const amount = createNativeReferenceCurrencyAmount({
    native: { amountMinor: 12345, currency: "brl" },
    referenceCurrency: "BRL",
  });

  assertEqual(availability.kind, "native", "same currency availability");
  assertEqual(amount.kind, "native", "same currency amount kind");
  assertEqual(amount.native.currency, "BRL", "same currency remains native");
  assert(!("exchangeRate" in amount), "native value must not fabricate exchange-rate evidence");
}

function testMissingQuoteFailsClosedWithoutConvertedValue(): void {
  const availability = resolveReferenceCurrencyAvailability({
    nativeCurrency: "USD",
    referenceCurrency: "BRL",
    quoteResult: { status: "missing" },
    evaluatedAt: "2026-08-20T13:00:00.000Z",
  });

  assertEqual(availability.kind, "unavailable", "missing quote availability");
  if (availability.kind !== "unavailable") {
    throw new Error("Expected unavailable result for missing quote.");
  }
  assertEqual(availability.reason, "quote_missing", "missing quote reason");

  const amount = createUnavailableReferenceCurrencyAmount({
    native: { amountMinor: 2000, currency: "USD" },
    referenceCurrency: "BRL",
    reason: availability.reason,
  });
  assertEqual(amount.kind, "unavailable", "missing quote amount kind");
  assert(!("converted" in amount), "missing quote must not create zero or parity conversion");
}

function testUnavailableQuoteFailsClosedWithoutConvertedValue(): void {
  const availability = resolveReferenceCurrencyAvailability({
    nativeCurrency: "EUR",
    referenceCurrency: "USD",
    quoteResult: { status: "unavailable" },
    evaluatedAt: "2026-08-20T13:00:00.000Z",
  });

  assertEqual(availability.kind, "unavailable", "unavailable quote availability");
  if (availability.kind !== "unavailable") {
    throw new Error("Expected unavailable result for unavailable quote.");
  }
  assertEqual(availability.reason, "quote_unavailable", "unavailable quote reason");
}

function testExpiredQuoteFailsClosedWithoutConvertedValue(): void {
  const availability = resolveReferenceCurrencyAvailability({
    nativeCurrency: "USD",
    referenceCurrency: "BRL",
    quoteResult: {
      status: "available",
      quote: activeUsdToBrlQuote,
    },
    evaluatedAt: "2026-08-20T18:00:00.001Z",
  });

  assertEqual(availability.kind, "unavailable", "expired quote availability");
  if (availability.kind !== "unavailable") {
    throw new Error("Expected unavailable result for expired quote.");
  }
  assertEqual(availability.reason, "quote_expired", "expired quote reason");
}

function testAvailableQuotePreservesAuditableMetadata(): void {
  const availability = resolveReferenceCurrencyAvailability({
    nativeCurrency: "usd",
    referenceCurrency: "brl",
    quoteResult: {
      status: "available",
      quote: {
        ...activeUsdToBrlQuote,
        sourceCurrency: " usd ",
        targetCurrency: " brl ",
        source: " fixture:fx-contract ",
      },
    },
    evaluatedAt: "2026-08-20T17:59:59.999Z",
  });

  assertEqual(availability.kind, "quote_available", "active quote availability");
  if (availability.kind !== "quote_available") {
    throw new Error("Expected active quote to be available.");
  }
  assertEqual(availability.quote.sourceCurrency, "USD", "quote source currency");
  assertEqual(availability.quote.targetCurrency, "BRL", "quote target currency");
  assertEqual(availability.quote.rate, "5.2500", "quote rate precision");
  assertEqual(availability.quote.source, "fixture:fx-contract", "quote source");
}

function testConvertedValuePreservesNativeAndConvertedAmounts(): void {
  const amount = createConvertedReferenceCurrencyAmount({
    native: { amountMinor: 2000, currency: "USD" },
    referenceCurrency: "BRL",
    convertedAmountMinor: 10500,
    exchangeRate: activeUsdToBrlQuote,
  });

  assertEqual(amount.kind, "converted", "converted amount kind");
  if (amount.kind !== "converted") {
    throw new Error("Expected converted amount.");
  }
  assertEqual(amount.native.amountMinor, 2000, "native amount preserved");
  assertEqual(amount.native.currency, "USD", "native currency preserved");
  assertEqual(amount.converted.amountMinor, 10500, "converted amount preserved");
  assertEqual(amount.converted.currency, "BRL", "converted currency explicit");
  assertEqual(amount.referenceCurrency, "BRL", "reference currency explicit");
  assertEqual(amount.exchangeRate.rate, "5.2500", "conversion evidence preserved");
}

function testSourceCurrencyMismatchIsRejected(): void {
  assertCurrencyContractError(
    () =>
      resolveReferenceCurrencyAvailability({
        nativeCurrency: "EUR",
        referenceCurrency: "BRL",
        quoteResult: { status: "available", quote: activeUsdToBrlQuote },
        evaluatedAt: "2026-08-20T13:00:00.000Z",
      }),
    "EXCHANGE_RATE_CURRENCY_MISMATCH",
  );
}

function testTargetCurrencyMismatchIsRejected(): void {
  assertCurrencyContractError(
    () =>
      createConvertedReferenceCurrencyAmount({
        native: { amountMinor: 2000, currency: "USD" },
        referenceCurrency: "EUR",
        convertedAmountMinor: 1800,
        exchangeRate: activeUsdToBrlQuote,
      }),
    "EXCHANGE_RATE_CURRENCY_MISMATCH",
  );
}

function testZeroRateIsRejected(): void {
  assertCurrencyContractError(
    () =>
      resolveReferenceCurrencyAvailability({
        nativeCurrency: "USD",
        referenceCurrency: "BRL",
        quoteResult: {
          status: "available",
          quote: { ...activeUsdToBrlQuote, rate: "0" },
        },
        evaluatedAt: "2026-08-20T13:00:00.000Z",
      }),
    "EXCHANGE_RATE_INVALID",
  );
}

function testSameCurrencyCannotBeFabricatedAsConversion(): void {
  assertCurrencyContractError(
    () =>
      createConvertedReferenceCurrencyAmount({
        native: { amountMinor: 1000, currency: "BRL" },
        referenceCurrency: "BRL",
        convertedAmountMinor: 1000,
        exchangeRate: {
          ...activeUsdToBrlQuote,
          sourceCurrency: "BRL",
          targetCurrency: "BRL",
          rate: "1",
        },
      }),
    "CONVERSION_NOT_REQUIRED",
  );
}

function assertCurrencyContractError(
  action: () => unknown,
  expectedCode: CurrencyConversionContractError["code"],
): void {
  try {
    action();
  } catch (error) {
    if (error instanceof CurrencyConversionContractError) {
      assertEqual(error.code, expectedCode, `expected error ${expectedCode}`);
      return;
    }

    throw error;
  }

  throw new Error(`Expected CurrencyConversionContractError ${expectedCode}.`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}.`);
  }
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
