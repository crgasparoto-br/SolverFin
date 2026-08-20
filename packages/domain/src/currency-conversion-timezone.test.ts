import {
  CurrencyConversionContractError,
  createReferenceCurrencyPreference,
  resolveReferenceCurrencyAvailability,
  type ExchangeRateQuote,
} from "./currency-conversion.js";

const baseQuote: ExchangeRateQuote = {
  sourceCurrency: "USD",
  targetCurrency: "BRL",
  rate: "5.2500",
  referenceAt: "2026-08-20T12:00:00.000Z",
  expiresAt: "2026-08-20T18:00:00.000Z",
  source: "fixture:fx-timezone-contract",
};

testReferenceCurrencyPreferenceRejectsTimezoneLessTimestamp();
testQuoteReferenceRejectsTimezoneLessTimestamp();
testQuoteExpiryRejectsTimezoneLessTimestamp();
testEvaluationRejectsTimezoneLessTimestamp();
testImpossibleCalendarDateIsRejected();
testExplicitOffsetProducesDeterministicAvailability();

function testReferenceCurrencyPreferenceRejectsTimezoneLessTimestamp(): void {
  assertCurrencyContractError(
    () =>
      createReferenceCurrencyPreference({
        currency: "USD",
        updatedAt: "2026-08-20T10:00:00",
      }),
    "REFERENCE_CURRENCY_PREFERENCE_INVALID",
  );
}

function testQuoteReferenceRejectsTimezoneLessTimestamp(): void {
  assertCurrencyContractError(
    () =>
      resolveReferenceCurrencyAvailability({
        nativeCurrency: "USD",
        referenceCurrency: "BRL",
        quoteResult: {
          status: "available",
          quote: {
            ...baseQuote,
            referenceAt: "2026-08-20T12:00:00",
          },
        },
        evaluatedAt: "2026-08-20T15:00:00.000Z",
      }),
    "EXCHANGE_RATE_REFERENCE_INVALID",
  );
}

function testQuoteExpiryRejectsTimezoneLessTimestamp(): void {
  assertCurrencyContractError(
    () =>
      resolveReferenceCurrencyAvailability({
        nativeCurrency: "USD",
        referenceCurrency: "BRL",
        quoteResult: {
          status: "available",
          quote: {
            ...baseQuote,
            expiresAt: "2026-08-20T18:00:00",
          },
        },
        evaluatedAt: "2026-08-20T15:00:00.000Z",
      }),
    "EXCHANGE_RATE_EXPIRY_INVALID",
  );
}

function testEvaluationRejectsTimezoneLessTimestamp(): void {
  assertCurrencyContractError(
    () =>
      resolveReferenceCurrencyAvailability({
        nativeCurrency: "USD",
        referenceCurrency: "BRL",
        quoteResult: { status: "available", quote: baseQuote },
        evaluatedAt: "2026-08-20T15:00:00",
      }),
    "EXCHANGE_RATE_EXPIRY_INVALID",
  );
}

function testImpossibleCalendarDateIsRejected(): void {
  assertCurrencyContractError(
    () =>
      resolveReferenceCurrencyAvailability({
        nativeCurrency: "USD",
        referenceCurrency: "BRL",
        quoteResult: {
          status: "available",
          quote: {
            ...baseQuote,
            referenceAt: "2026-02-30T12:00:00.000Z",
          },
        },
        evaluatedAt: "2026-08-20T15:00:00.000Z",
      }),
    "EXCHANGE_RATE_REFERENCE_INVALID",
  );
}

function testExplicitOffsetProducesDeterministicAvailability(): void {
  const availability = resolveReferenceCurrencyAvailability({
    nativeCurrency: "USD",
    referenceCurrency: "BRL",
    quoteResult: {
      status: "available",
      quote: {
        ...baseQuote,
        referenceAt: "2026-08-20T12:00:00-03:00",
        expiresAt: "2026-08-20T13:00:00-03:00",
      },
    },
    evaluatedAt: "2026-08-20T15:30:00.000Z",
  });

  if (availability.kind !== "quote_available") {
    throw new Error(`Expected quote_available, received ${availability.kind}.`);
  }
}

function assertCurrencyContractError(
  action: () => unknown,
  expectedCode: CurrencyConversionContractError["code"],
): void {
  try {
    action();
  } catch (error) {
    if (error instanceof CurrencyConversionContractError) {
      if (error.code !== expectedCode) {
        throw new Error(`Expected ${expectedCode}, received ${error.code}.`);
      }
      return;
    }

    throw error;
  }

  throw new Error(`Expected CurrencyConversionContractError ${expectedCode}.`);
}
