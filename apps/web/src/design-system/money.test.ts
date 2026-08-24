import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatMinorCurrency } from "@solverfin/shared";

import { renderMoney, type MoneyProps } from "./money.js";

describe("Money primitive", () => {
  it(
    "reuses the shared formatter with the explicit currency for BRL, USD and EUR",
    () => {
      const amountMinor = 12_345;

      for (const currency of ["BRL", "USD", "EUR"] as const) {
        const expected = formatMinorCurrency(amountMinor, { currency });
        const markup = renderMoney({ amountMinor, currency });

        assert.ok(
          markup.includes(expected),
          `${currency} should preserve the shared formatter output`,
        );
        assert.match(markup, new RegExp(`data-currency="${currency}"`));
        assert.match(markup, new RegExp(`aria-label="Moeda ${currency}"`));
        assert.match(markup, new RegExp(`>${currency}</small>`));
      }

      assert.notEqual(
        renderMoney({ amountMinor, currency: "BRL" }),
        renderMoney({ amountMinor, currency: "USD" }),
      );
      assert.notEqual(
        renderMoney({ amountMinor, currency: "USD" }),
        renderMoney({ amountMinor, currency: "EUR" }),
      );
    },
  );

  it(
    "covers positive, negative, zero and the largest safe minor-unit value",
    () => {
      for (const amountMinor of [12_345, -12_345, 0, Number.MAX_SAFE_INTEGER]) {
        const markup = renderMoney({ amountMinor, currency: "BRL" });
        assert.ok(
          markup.includes(formatMinorCurrency(amountMinor, { currency: "BRL" })),
        );
        assert.match(markup, /data-money-availability="available"/);
      }
    },
  );

  it(
    "represents unavailable values without silently turning them into zero",
    () => {
      const markup = renderMoney({ amountMinor: null, currency: "USD" });

      assert.match(markup, /data-money-availability="unavailable"/);
      assert.match(markup, /Indisponível/);
      assert.match(markup, />USD<\/small>/);
      assert.doesNotMatch(markup, /0,00/);
    },
  );

  it(
    "rejects missing currency before the shared BRL fallback can mask the error",
    () => {
      const sharedLegacyFallback = formatMinorCurrency(12_345);
      assert.match(sharedLegacyFallback, /R\$/);

      const missingCurrency = { amountMinor: 12_345 } as unknown as MoneyProps;
      assert.throws(
        () => renderMoney(missingCurrency),
        /requires an explicit three-letter currency code/,
      );
    },
  );

  it(
    "rejects a missing amount and requires null for the unavailable state",
    () => {
      const missingAmount = { currency: "BRL" } as unknown as MoneyProps;
      assert.throws(() => renderMoney(missingAmount), /requires amountMinor/);
    },
  );

  it(
    "distinguishes native and converted presentation without converting the amount",
    () => {
      const amountMinor = 9_876;
      const native = renderMoney({
        amountMinor,
        currency: "EUR",
        context: "native",
      });
      const converted = renderMoney({
        amountMinor,
        currency: "EUR",
        context: "converted",
      });
      const formatted = formatMinorCurrency(amountMinor, { currency: "EUR" });

      assert.ok(native.includes(formatted));
      assert.ok(converted.includes(formatted));
      assert.match(native, /data-money-context="native"/);
      assert.doesNotMatch(native, />Convertido<\/small>/);
      assert.match(converted, /data-money-context="converted"/);
      assert.match(
        converted,
        /aria-label="Valor convertido">Convertido<\/small>/,
      );
    },
  );

  it(
    "normalizes an explicit ISO-like currency code but never supplies one",
    () => {
      const markup = renderMoney({ amountMinor: 100, currency: "usd" });
      assert.match(markup, /data-currency="USD"/);
      assert.throws(
        () => renderMoney({ amountMinor: 100, currency: "US" }),
        /three-letter currency code/,
      );
    },
  );
});
