import { strict as assert } from "node:assert";

import {
  createSolverFinCurrencyFormatter,
  createSolverFinDateFormatter,
  formatDateOnly,
  formatMinorCurrency,
  SOLVERFIN_FORMATTING_CONFIG,
} from "./formatting.js";

usesPtBrFormattingConfig();
formatsMinorCurrencyAsBrazilianReal();
formatsSafeIntegerBoundaryWithoutPrecisionLoss();
rejectsUnsafeMinorCurrency();
allowsExplicitCurrencyWithPtBrLocale();
formatsDateOnlyWithConfiguredTimeZone();

function usesPtBrFormattingConfig(): void {
  assert.equal(SOLVERFIN_FORMATTING_CONFIG.locale, "pt-BR");
  assert.equal(SOLVERFIN_FORMATTING_CONFIG.currency, "BRL");
  assert.equal(SOLVERFIN_FORMATTING_CONFIG.dateTimeZone, "UTC");

  assert.equal(createSolverFinCurrencyFormatter().resolvedOptions().locale, "pt-BR");
  assert.equal(createSolverFinDateFormatter().resolvedOptions().locale, "pt-BR");
}

function formatsMinorCurrencyAsBrazilianReal(): void {
  assert.match(formatMinorCurrency(123456), /^R\$\s1\.234,56$/u);
}

function formatsSafeIntegerBoundaryWithoutPrecisionLoss(): void {
  assert.match(formatMinorCurrency(Number.MAX_SAFE_INTEGER), /^R\$\s90\.071\.992\.547\.409,91$/u);
  assert.match(formatMinorCurrency(Number.MIN_SAFE_INTEGER), /^-R\$\s90\.071\.992\.547\.409,91$/u);
}

function rejectsUnsafeMinorCurrency(): void {
  assert.throws(() => formatMinorCurrency(Number.MAX_SAFE_INTEGER + 1), RangeError);
}

function allowsExplicitCurrencyWithPtBrLocale(): void {
  assert.match(formatMinorCurrency(123456, { currency: "USD" }), /^US\$\s1\.234,56$/u);
}

function formatsDateOnlyWithConfiguredTimeZone(): void {
  assert.equal(formatDateOnly("2026-06-17"), "17/06/2026");
}
