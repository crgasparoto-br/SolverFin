import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CategoryEvolutionAccountNotAvailableError,
  parseCategoryEvolutionAccountId,
} from "./category-evolution-account-filter.js";
import { CategoryEvolutionFilterError } from "./category-evolution-report.js";

describe("category evolution account filter", () => {
  it("treats an absent accountId as the all-accounts contract", () => {
    assert.equal(parseCategoryEvolutionAccountId(new URLSearchParams()), undefined);
  });

  it("normalizes a valid UUID without accepting an empty or malformed value", () => {
    assert.equal(
      parseCategoryEvolutionAccountId(
        new URLSearchParams({ accountId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" }),
      ),
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );

    for (const accountId of ["", "not-a-uuid", "aaaaaaaa-aaaa-0aaa-8aaa-aaaaaaaaaaaa"]) {
      assert.throws(
        () => parseCategoryEvolutionAccountId(new URLSearchParams({ accountId })),
        (error: unknown) =>
          error instanceof CategoryEvolutionFilterError &&
          error.code === "REPORT_CATEGORY_EVOLUTION_FILTER_INVALID" &&
          /Conta inválida/.test(error.message),
      );
    }
  });

  it("uses one public not-available contract for inaccessible accounts", () => {
    const error = new CategoryEvolutionAccountNotAvailableError();
    assert.equal(error.code, "REPORT_CATEGORY_EVOLUTION_ACCOUNT_NOT_AVAILABLE");
    assert.equal(error.statusCode, 404);
    assert.doesNotMatch(error.message, /arquivada|perfil|tenant|inexistente/i);
  });
});
