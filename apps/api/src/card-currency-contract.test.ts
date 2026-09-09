import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CardCurrencyContractError,
  assertCardCurrencyChangeAllowed,
  assertLinkedPaymentAccountCurrency,
  normalizeRequiredCardCurrency,
  resolveCanonicalCardPurchaseCurrency,
} from "./card-currency-contract.js";

assert.equal(normalizeRequiredCardCurrency(" usd "), "USD");
assert.throws(
  () => normalizeRequiredCardCurrency(undefined),
  (error: unknown) =>
    error instanceof CardCurrencyContractError &&
    error.code === "CARD_CURRENCY_REQUIRED" &&
    error.statusCode === 400,
);
assert.throws(
  () => normalizeRequiredCardCurrency("REAL"),
  (error: unknown) =>
    error instanceof CardCurrencyContractError && error.code === "CARD_CURRENCY_INVALID",
);

assert.equal(resolveCanonicalCardPurchaseCurrency("USD", undefined), "USD");
assert.equal(resolveCanonicalCardPurchaseCurrency(" usd ", "USD"), "USD");
assert.throws(
  () => resolveCanonicalCardPurchaseCurrency(undefined, undefined),
  (error: unknown) =>
    error instanceof CardCurrencyContractError &&
    error.code === "CARD_CURRENCY_REQUIRED" &&
    error.statusCode === 409,
);
assert.throws(
  () => resolveCanonicalCardPurchaseCurrency("BRL", "USD"),
  (error: unknown) =>
    error instanceof CardCurrencyContractError &&
    error.code === "CARD_PURCHASE_CURRENCY_MISMATCH",
);

assert.doesNotThrow(() => assertLinkedPaymentAccountCurrency("usd", " USD "));
assert.throws(
  () => assertLinkedPaymentAccountCurrency("USD", "BRL"),
  (error: unknown) =>
    error instanceof CardCurrencyContractError &&
    error.code === "CARD_CURRENCY_PAYMENT_ACCOUNT_MISMATCH",
);

assert.doesNotThrow(() => assertCardCurrencyChangeAllowed(undefined, "USD", true));
assert.doesNotThrow(() => assertCardCurrencyChangeAllowed("USD", "USD", true));
assert.doesNotThrow(() => assertCardCurrencyChangeAllowed("USD", "BRL", false));
assert.throws(
  () => assertCardCurrencyChangeAllowed("USD", "BRL", true),
  (error: unknown) =>
    error instanceof CardCurrencyContractError && error.code === "CARD_CURRENCY_LOCKED",
);

const migration = readFileSync(
  new URL(
    "../../../prisma/migrations/20260907143000_add_card_default_currency/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
assert.match(migration, /WITH currency_candidates AS/i);
assert.match(migration, /UNION ALL/);
assert.match(migration, /COUNT\(DISTINCT "currency"\) = 1/);
assert.match(migration, /BOOL_AND\("currency" ~ '\^\[A-Z\]\{3\}\$'\)/);
assert.match(migration, /card\."currency" IS NULL/);
