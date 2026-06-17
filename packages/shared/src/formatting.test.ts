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
  assert.equal(formatMinorCurrency(123456), "R$ 1.234,56");
}

function allowsExplicitCurrencyWithPtBrLocale(): void {
  assert.equal(formatMinorCurrency(123456, { currency: "USD" }), "US$ 1.234,56");
}

function formatsDateOnlyWithConfiguredTimeZone(): void {
  assert.equal(formatDateOnly("2026-06-17"), "17/06/2026");
}
