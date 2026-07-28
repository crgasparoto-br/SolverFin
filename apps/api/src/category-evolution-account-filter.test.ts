import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CategoryEvolutionSourceNotAvailableError,
  parseCategoryEvolutionSourceFilter,
} from "./category-evolution-account-filter.js";
import { CategoryEvolutionFilterError } from "./category-evolution-report.js";

const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CARD_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("category evolution source filter", () => {
  it("treats absent accountId and cardId as the all-sources contract", () => {
    assert.deepEqual(parseCategoryEvolutionSourceFilter(new URLSearchParams()), { kind: "all" });
  });

  it("normalizes a valid account or card UUID", () => {
    assert.deepEqual(
      parseCategoryEvolutionSourceFilter(
        new URLSearchParams({ accountId: ACCOUNT_ID.toUpperCase() }),
      ),
      { kind: "account", id: ACCOUNT_ID },
    );
    assert.deepEqual(
      parseCategoryEvolutionSourceFilter(new URLSearchParams({ cardId: CARD_ID.toUpperCase() })),
      { kind: "card", id: CARD_ID },
    );
  });

  it("rejects empty or malformed source identifiers with a field-specific safe message", () => {
    for (const [field, label] of [
      ["accountId", "Conta"],
      ["cardId", "Cartão"],
    ] as const) {
      for (const value of ["", "not-a-uuid", "aaaaaaaa-aaaa-0aaa-8aaa-aaaaaaaaaaaa"]) {
        assert.throws(
          () => parseCategoryEvolutionSourceFilter(new URLSearchParams({ [field]: value })),
          (error: unknown) =>
            error instanceof CategoryEvolutionFilterError &&
            error.code === "REPORT_CATEGORY_EVOLUTION_FILTER_INVALID" &&
            error.message.includes(`${label} inválido`),
        );
      }
    }
  });

  it("rejects accountId and cardId together before resolving a financial source", () => {
    assert.throws(
      () =>
        parseCategoryEvolutionSourceFilter(
          new URLSearchParams({ accountId: ACCOUNT_ID, cardId: CARD_ID }),
        ),
      (error: unknown) =>
        error instanceof CategoryEvolutionFilterError &&
        error.code === "REPORT_CATEGORY_EVOLUTION_FILTER_INVALID" &&
        /somente uma conta ou um cartão/.test(error.message),
    );
  });

  it("uses one public not-available contract for inaccessible accounts and cards", () => {
    const error = new CategoryEvolutionSourceNotAvailableError();
    assert.equal(error.code, "REPORT_CATEGORY_EVOLUTION_SOURCE_NOT_AVAILABLE");
    assert.equal(error.statusCode, 404);
    assert.doesNotMatch(error.message, /arquivad|bloquead|perfil|tenant|inexistent/i);
  });
});
