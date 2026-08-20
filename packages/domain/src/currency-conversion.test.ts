import assert from "node:assert/strict";

import {
  CurrencyConversionContractError,
  createConvertedReferenceCurrencyValue,
  createNativeReferenceCurrencyValue,
  createUnavailableReferenceCurrencyValue,
  resolveProfileReferenceCurrency,
} from "./currency-conversion.js";

resolvesProfileReferenceCurrencyWithoutUniversalFallback();
keepsNativeValuesDistinctFromConversions();
requiresAuditableMetadataForConvertedValues();
marksStaleQuotesAsEstimated();
representsUnavailableQuotesWithoutInventingAmounts();
rejectsMismatchedQuotePairs();
rejectsInvalidUnavailableReasons();

function resolvesProfileReferenceCurrencyWithoutUniversalFallback(): void {
  assert.deepEqual(resolveProfileReferenceCurrency(undefined), {
    status: "unconfigured",
    scope: "financial_profile",
    currency: null,
  });
  assert.deepEqual(resolveProfileReferenceCurrency(" usd "), {
    status: "configured",
    scope: "financial_profile",
    currency: "USD",
  });
}

function keepsNativeValuesDistinctFromConversions(): void {
  const result = createNativeReferenceCurrencyValue(
    { amountMinor: 12_345, currency: "brl" },
    "BRL",
  );

  assert.equal(result.status, "native");
  assert.deepEqual(result.native, { amountMinor: 12_345, currency: "BRL" });
  assert.equal(result.referenceCurrency, "BRL");
  assert.equal(result.converted, null);
  assert.equal(result.quote, null);
  assert.equal(result.estimated, false);
}

function requiresAuditableMetadataForConvertedValues(): void {
  const result = createConvertedReferenceCurrencyValue({
    status: "converted",
    native: { amountMinor: 10_000, currency: "USD" },
    converted: { amountMinor: 54_250, currency: "BRL" },
    quote: {
      sourceCurrency: "USD",
      targetCurrency: "BRL",
      rate: "5.425",
      quotedAt: "2026-08-19T18:00:00.000Z",
      source: "test-fixture",
      quoteId: "usd-brl-20260819T1800Z",
    },
  });

  assert.equal(result.status, "converted");
  assert.equal(result.native.currency, "USD");
  assert.equal(result.converted.currency, "BRL");
  assert.equal(result.referenceCurrency, "BRL");
  assert.equal(result.quote.rate, "5.425");
  assert.equal(result.quote.source, "test-fixture");
  assert.equal(result.estimated, false);
}

function marksStaleQuotesAsEstimated(): void {
  const result = createConvertedReferenceCurrencyValue({
    status: "stale",
    native: { amountMinor: 1_000, currency: "EUR" },
    converted: { amountMinor: 6_200, currency: "BRL" },
    quote: {
      sourceCurrency: "EUR",
      targetCurrency: "BRL",
      rate: "6.2",
      quotedAt: "2026-08-18T18:00:00.000Z",
      source: "test-fixture",
    },
  });

  assert.equal(result.status, "stale");
  assert.equal(result.estimated, true);
  assert.equal(result.converted.amountMinor, 6_200);
}

function representsUnavailableQuotesWithoutInventingAmounts(): void {
  const missingQuote = createUnavailableReferenceCurrencyValue({
    native: { amountMinor: 5_000, currency: "USD" },
    referenceCurrency: "BRL",
    reason: "quote_missing",
  });
  const unconfiguredReference = createUnavailableReferenceCurrencyValue({
    native: { amountMinor: 5_000, currency: "USD" },
    reason: "reference_currency_unconfigured",
  });

  assert.equal(missingQuote.status, "unavailable");
  assert.equal(missingQuote.converted, null);
  assert.equal(missingQuote.quote, null);
  assert.equal(missingQuote.referenceCurrency, "BRL");
  assert.equal(unconfiguredReference.referenceCurrency, null);
  assert.equal(unconfiguredReference.converted, null);
}

function rejectsMismatchedQuotePairs(): void {
  assertContractError(
    () =>
      createConvertedReferenceCurrencyValue({
        status: "converted",
        native: { amountMinor: 10_000, currency: "USD" },
        converted: { amountMinor: 54_250, currency: "BRL" },
        quote: {
          sourceCurrency: "EUR",
          targetCurrency: "BRL",
          rate: "5.425",
          quotedAt: "2026-08-19T18:00:00.000Z",
          source: "test-fixture",
        },
      }),
    "CONVERSION_QUOTE_PAIR_MISMATCH",
  );
}

function rejectsInvalidUnavailableReasons(): void {
  assertContractError(
    () =>
      createUnavailableReferenceCurrencyValue({
        native: { amountMinor: 5_000, currency: "USD" },
        referenceCurrency: "BRL",
        reason: "reference_currency_unconfigured",
      }),
    "CONVERSION_REASON_INVALID",
  );
}

function assertContractError(
  action: () => unknown,
  expectedCode: CurrencyConversionContractError["code"],
): void {
  assert.throws(
    action,
    (error: unknown) =>
      error instanceof CurrencyConversionContractError && error.code === expectedCode,
  );
}
