import assert from "node:assert/strict";

import type { FinancialAssistantDataResolution } from "./financial-assistant-data.js";
import {
  FinancialAssistantServiceError,
  guardFinancialAssistantCategoryResolution,
  normalizeAndValidateFinancialAssistantMessage,
} from "./financial-assistant-service.js";

const unresolvedCategory = {
  kind: "evidence",
  intent: "category_spending",
  filters: {
    currency: "BRL",
    periodStartOn: "2026-08-01",
    periodEndOn: "2026-08-31",
  },
  evidence: {
    currency: "BRL",
    period: { startOn: "2026-08-01", endOn: "2026-08-31" },
    filters: ["Moeda: BRL"],
    metrics: [{ key: "expense", label: "Despesas realizadas", amountMinor: 12345, count: 3 }],
    assumptions: [],
    limitations: [],
    sources: ["lancamentos"],
    confidence: "high",
  },
} satisfies FinancialAssistantDataResolution;

const guarded = guardFinancialAssistantCategoryResolution(
  unresolvedCategory,
  "Quanto gastei com Transporte este mes?",
);
assert.equal(guarded.kind, "clarification");
if (guarded.kind !== "clarification") assert.fail("expected category clarification");
assert.equal(guarded.intent, "category_spending");
assert.equal(guarded.filters.currency, "BRL");
assert.equal(guarded.filters.periodStartOn, "2026-08-01");
assert.equal(guarded.filters.periodEndOn, "2026-08-31");
assert.match(guarded.message, /categoria solicitada/i);

const grouped = guardFinancialAssistantCategoryResolution(
  unresolvedCategory,
  "Mostre meus gastos por categoria este mes",
);
assert.equal(grouped.kind, "clarification");

const aggregateQuestion = guardFinancialAssistantCategoryResolution(
  unresolvedCategory,
  "Quanto gastei este mes?",
);
assert.equal(aggregateQuestion, unresolvedCategory);

const resolvedCategory = {
  ...unresolvedCategory,
  filters: {
    ...unresolvedCategory.filters,
    categoryId: "44444444-4444-4444-8444-444444444444",
    categoryName: "Transporte",
  },
} satisfies FinancialAssistantDataResolution;
const resolved = guardFinancialAssistantCategoryResolution(
  resolvedCategory,
  "Quanto gastei com Transporte este mes?",
);
assert.equal(resolved, resolvedCategory);

assert.equal(
  normalizeAndValidateFinancialAssistantMessage("  Resumo   deste mes  ", "message-12345678"),
  "Resumo deste mes",
);
assert.throws(
  () => normalizeAndValidateFinancialAssistantMessage("x".repeat(1001), "message-12345678"),
  (error: unknown) =>
    error instanceof FinancialAssistantServiceError && error.code === "ASSISTANT_QUESTION_TOO_LONG",
);
