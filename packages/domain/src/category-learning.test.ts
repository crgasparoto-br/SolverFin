import type { Category, Transaction } from "./index.js";
import type { TenantContext } from "./tenant.js";
import {
  buildCategoryLearningKey,
  ignoreCategoryLearning,
  recordCategoryCorrection,
  suggestCategory,
  type CategoryLearningEntry,
  type MerchantCategoryRule,
} from "./category-learning.js";

const tenantA: TenantContext = {
  userId: "user-learning-a",
  organizationId: "org-learning-a",
  financialProfileId: "profile-learning-a",
  financialProfileKind: "personal",
};

const tenantB: TenantContext = {
  userId: "user-learning-b",
  organizationId: "org-learning-b",
  financialProfileId: "profile-learning-b",
  financialProfileKind: "mei",
};

const now = "2026-06-16T12:00:00.000Z";
const later = "2026-06-16T13:00:00.000Z";

const foodCategory = buildCategory(tenantA, "cat-food", "Alimentacao", "expense", "active");
const healthCategory = buildCategory(tenantA, "cat-health", "Saude", "expense", "active");
const archivedCategory = buildCategory(tenantA, "cat-old", "Antiga", "expense", "archived");
const meiFoodCategory = buildCategory(tenantB, "cat-mei-food", "Alimentacao MEI", "expense", "active");

testCorrectionImprovesFutureSuggestion();
testLearningDoesNotCrossTenantContext();
testMerchantRuleAndHistorySuggestions();
testConflictUsesMostFrequentCorrection();
testIgnoredLearningAndArchivedCategoryAreSkipped();
testAiLowConfidenceNeedsReview();

function testCorrectionImprovesFutureSuggestion(): void {
  const target = buildTarget("Mercado Demo", "Compra Mercado Demo");
  const learning = recordCategoryCorrection({
    id: "learn-market-1",
    context: tenantA,
    now,
    target,
    correctedCategory: foodCategory,
  });
  const suggestion = suggestCategory({
    context: tenantA,
    target,
    categories: [foodCategory, healthCategory],
    learningEntries: [learning],
  });

  assertEqual(learning.merchantKey, buildCategoryLearningKey(target), "learning key");
  assertEqual(suggestion.status, "suggested", "learning suggestion status");
  assertEqual(suggestion.source, "learning", "learning suggestion source");
  assertEqual(suggestion.categoryId, foodCategory.id, "learning category");
  assertEqual(suggestion.learningEntryId, learning.id, "learning entry id");
}

function testLearningDoesNotCrossTenantContext(): void {
  const target = buildTarget("Mercado Demo", "Compra Mercado Demo");
  const learning = recordCategoryCorrection({
    id: "learn-tenant-a",
    context: tenantA,
    now,
    target,
    correctedCategory: foodCategory,
  });
  const suggestion = suggestCategory({
    context: tenantB,
    target: {
      organizationId: tenantB.organizationId,
      financialProfileId: tenantB.financialProfileId,
      transactionKind: "expense",
      merchant: "Mercado Demo",
      description: "Compra Mercado Demo",
    },
    categories: [foodCategory, meiFoodCategory],
    learningEntries: [learning],
  });

  assertEqual(suggestion.status, "needs_review", "tenant isolated status");
  assertEqual(suggestion.source, "none", "tenant isolated source");
}

function testMerchantRuleAndHistorySuggestions(): void {
  const target = buildTarget("Farmacia Demo", "Compra Farmacia Demo");
  const rule: MerchantCategoryRule = {
    id: "rule-pharmacy",
    organizationId: tenantA.organizationId,
    financialProfileId: tenantA.financialProfileId,
    merchantKey: buildCategoryLearningKey(target),
    transactionKind: "expense",
    categoryId: healthCategory.id,
    confidence: 0.81,
    reason: "Regra de merchant recorrente para farmacia.",
  };
  const ruleSuggestion = suggestCategory({
    context: tenantA,
    target,
    categories: [foodCategory, healthCategory],
    merchantRules: [rule],
  });
  const historySuggestion = suggestCategory({
    context: tenantA,
    target: buildTarget("Padaria Demo", "Padaria Demo lanche"),
    categories: [foodCategory, healthCategory],
    history: [
      buildTransaction("tx-1", "Padaria Demo lanche", foodCategory.id),
      buildTransaction("tx-2", "Padaria Demo cafe", foodCategory.id),
    ],
  });

  assertEqual(ruleSuggestion.source, "merchant_rule", "merchant rule source");
  assertEqual(ruleSuggestion.categoryId, healthCategory.id, "merchant rule category");
  assertEqual(historySuggestion.source, "history", "history source");
  assertEqual(historySuggestion.categoryId, foodCategory.id, "history category");
}

function testConflictUsesMostFrequentCorrection(): void {
  const target = buildTarget("Loja Demo", "Compra Loja Demo");
  const firstLearning = recordCategoryCorrection({
    id: "learn-conflict-1",
    context: tenantA,
    now,
    target,
    correctedCategory: foodCategory,
  });
  const strongerLearning = recordCategoryCorrection({
    id: "learn-conflict-2",
    context: tenantA,
    now: later,
    target,
    correctedCategory: healthCategory,
    existingLearning: {
      ...firstLearning,
      id: "learn-conflict-2",
      categoryId: healthCategory.id,
      correctionCount: 2,
      updatedAt: later,
    },
  });
  const suggestion = suggestCategory({
    context: tenantA,
    target,
    categories: [foodCategory, healthCategory],
    learningEntries: [firstLearning, strongerLearning],
  });

  assertEqual(suggestion.source, "learning", "conflict source");
  assertEqual(suggestion.categoryId, healthCategory.id, "conflict winner");
  assertEqual(suggestion.confidence <= 0.78, true, "conflict lowers confidence");
}

function testIgnoredLearningAndArchivedCategoryAreSkipped(): void {
  const target = buildTarget("Mercado Arquivado", "Compra Mercado Arquivado");
  const learning = recordCategoryCorrection({
    id: "learn-ignored",
    context: tenantA,
    now,
    target,
    correctedCategory: foodCategory,
  });
  const ignored = ignoreCategoryLearning(tenantA, learning, later);
  const ignoredSuggestion = suggestCategory({
    context: tenantA,
    target,
    categories: [foodCategory],
    learningEntries: [ignored],
  });
  const archivedSuggestion = suggestCategory({
    context: tenantA,
    target,
    categories: [archivedCategory],
    learningEntries: [{ ...learning, categoryId: archivedCategory.id }],
  });

  assertEqual(ignored.status, "ignored", "ignored learning status");
  assertEqual(ignoredSuggestion.source, "none", "ignored learning skipped");
  assertEqual(archivedSuggestion.source, "none", "archived category skipped");
}

function testAiLowConfidenceNeedsReview(): void {
  const suggestion = suggestCategory({
    context: tenantA,
    target: buildTarget("Servico Demo", "Servico Demo mensal"),
    categories: [foodCategory, healthCategory],
    aiSuggestion: {
      categoryId: healthCategory.id,
      confidence: 0.42,
      reason: "IA encontrou sinal fraco em descricao ficticia.",
      provider: "fake",
      model: "fake-local",
    },
  });

  assertEqual(suggestion.status, "needs_review", "low confidence ai status");
  assertEqual(suggestion.source, "ai", "low confidence ai source");
  assertEqual(suggestion.categoryId, undefined, "low confidence ai category omitted");
}

function buildTarget(merchant: string, description: string) {
  return {
    organizationId: tenantA.organizationId,
    financialProfileId: tenantA.financialProfileId,
    transactionKind: "expense" as const,
    merchant,
    description,
  };
}

function buildCategory(
  context: TenantContext,
  id: string,
  name: string,
  kind: Category["kind"],
  status: Category["status"],
): Category {
  return {
    id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    name,
    kind,
    status,
    createdAt: now,
    updatedAt: now,
    createdByUserId: context.userId,
    updatedByUserId: context.userId,
  };
}

function buildTransaction(id: string, description: string, categoryId: string): Transaction {
  return {
    id,
    organizationId: tenantA.organizationId,
    financialProfileId: tenantA.financialProfileId,
    kind: "expense",
    status: "posted",
    source: "manual",
    amountMinor: 2500,
    currency: "BRL",
    occurredOn: "2026-06-16",
    description,
    accountId: "account-demo",
    categoryId,
    createdAt: now,
    updatedAt: now,
    createdByUserId: tenantA.userId,
    updatedByUserId: tenantA.userId,
  };
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
