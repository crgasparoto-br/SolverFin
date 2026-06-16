import type {
  Category,
  EntityId,
  ISODateTime,
  TenantScoped,
  Traceable,
  Transaction,
  TransactionKind,
} from "./index.js";
import type { TenantContext } from "./tenant.js";
import { getTenantScopedResource, listTenantScopedResources } from "./tenant-authorization.js";

export type CategoryLearningStatus = "active" | "ignored" | "reverted";
export type CategorySuggestionStatus = "suggested" | "needs_review";
export type CategoryLearningSuggestionSource =
  | "learning"
  | "merchant_rule"
  | "history"
  | "ai"
  | "none";

export interface CategoryLearningEntry extends Traceable, TenantScoped {
  merchantKey: string;
  transactionKind: TransactionKind;
  categoryId: EntityId;
  status: CategoryLearningStatus;
  confidence: number;
  correctionCount: number;
  lastCorrectedAt: ISODateTime;
  ignoredAt?: ISODateTime;
  revertedAt?: ISODateTime;
}

export interface CategorySuggestionTarget extends TenantScoped {
  transactionKind: TransactionKind;
  description: string;
  merchant?: string;
  amountMinor?: number;
}

export interface MerchantCategoryRule extends TenantScoped {
  id: EntityId;
  merchantKey: string;
  transactionKind: TransactionKind;
  categoryId: EntityId;
  confidence: number;
  reason: string;
}

export interface AiCategorySuggestion {
  categoryId: EntityId;
  confidence: number;
  reason: string;
  provider?: string;
  model?: string;
}

export interface CategorySuggestionResult {
  status: CategorySuggestionStatus;
  source: CategoryLearningSuggestionSource;
  categoryId?: EntityId;
  confidence: number;
  reason: string;
  learningEntryId?: EntityId;
  ruleId?: EntityId;
  provider?: string;
  model?: string;
}

export interface RecordCategoryCorrectionInput {
  id: EntityId;
  context: TenantContext;
  now: ISODateTime;
  target: CategorySuggestionTarget;
  correctedCategory: Category | undefined;
  existingLearning?: CategoryLearningEntry;
}

export interface SuggestCategoryInput {
  context: TenantContext;
  target: CategorySuggestionTarget | undefined;
  categories: readonly Category[];
  learningEntries?: readonly CategoryLearningEntry[];
  merchantRules?: readonly MerchantCategoryRule[];
  history?: readonly Transaction[];
  aiSuggestion?: AiCategorySuggestion;
  minConfidenceForAutoSuggestion?: number;
}

const DEFAULT_LEARNING_CONFIDENCE = 0.86;
const DEFAULT_MIN_CONFIDENCE = 0.7;

export function recordCategoryCorrection(
  input: RecordCategoryCorrectionInput,
): CategoryLearningEntry {
  const category = assertUsableCategory(
    input.context,
    input.correctedCategory,
    input.target.transactionKind,
  );
  const merchantKey = buildCategoryLearningKey(input.target);
  const existingLearning = input.existingLearning
    ? getTenantScopedResource(input.context, input.existingLearning)
    : undefined;

  if (existingLearning !== undefined && existingLearning.merchantKey === merchantKey) {
    const entry: CategoryLearningEntry = {
      ...existingLearning,
      transactionKind: input.target.transactionKind,
      categoryId: category.id,
      status: "active",
      confidence: Math.min(0.98, existingLearning.confidence + 0.04),
      correctionCount: existingLearning.correctionCount + 1,
      lastCorrectedAt: input.now,
      updatedAt: input.now,
      updatedByUserId: input.context.userId,
    };

    delete entry.ignoredAt;
    delete entry.revertedAt;
    return entry;
  }

  return {
    id: input.id,
    organizationId: input.context.organizationId,
    financialProfileId: input.context.financialProfileId,
    merchantKey,
    transactionKind: input.target.transactionKind,
    categoryId: category.id,
    status: "active",
    confidence: DEFAULT_LEARNING_CONFIDENCE,
    correctionCount: 1,
    lastCorrectedAt: input.now,
    createdAt: input.now,
    updatedAt: input.now,
    createdByUserId: input.context.userId,
    updatedByUserId: input.context.userId,
  };
}

export function ignoreCategoryLearning(
  context: TenantContext,
  entry: CategoryLearningEntry | undefined,
  now: ISODateTime,
): CategoryLearningEntry {
  const scopedEntry = getTenantScopedResource(context, entry);

  return {
    ...scopedEntry,
    status: "ignored",
    ignoredAt: now,
    updatedAt: now,
    updatedByUserId: context.userId,
  };
}

export function revertCategoryLearning(
  context: TenantContext,
  entry: CategoryLearningEntry | undefined,
  now: ISODateTime,
): CategoryLearningEntry {
  const scopedEntry = getTenantScopedResource(context, entry);

  return {
    ...scopedEntry,
    status: "reverted",
    revertedAt: now,
    updatedAt: now,
    updatedByUserId: context.userId,
  };
}

export function suggestCategory(input: SuggestCategoryInput): CategorySuggestionResult {
  const target = getTenantScopedResource(input.context, input.target);
  const activeCategories = listTenantScopedResources(input.context, input.categories).filter(
    (category) => category.status === "active" && category.kind === target.transactionKind,
  );
  const minConfidence = input.minConfidenceForAutoSuggestion ?? DEFAULT_MIN_CONFIDENCE;
  const learningSuggestion = suggestFromLearning(
    input.context,
    target,
    input.learningEntries ?? [],
    activeCategories,
  );

  if (learningSuggestion !== undefined) {
    return learningSuggestion;
  }

  const ruleSuggestion = suggestFromMerchantRules(
    input.context,
    target,
    input.merchantRules ?? [],
    activeCategories,
  );

  if (ruleSuggestion !== undefined) {
    return ruleSuggestion;
  }

  const historySuggestion = suggestFromHistory(
    input.context,
    target,
    input.history ?? [],
    activeCategories,
  );

  if (historySuggestion !== undefined) {
    return historySuggestion;
  }

  if (input.aiSuggestion !== undefined) {
    return suggestFromAi(input.aiSuggestion, activeCategories, minConfidence);
  }

  return {
    status: "needs_review",
    source: "none",
    confidence: 0,
    reason: "Nenhuma regra, historico, aprendizado ou IA gerou sugestao confiavel.",
  };
}

export function buildCategoryLearningKey(
  target: Pick<CategorySuggestionTarget, "merchant" | "description">,
): string {
  return normalizeCategoryText(target.merchant ?? target.description);
}

function suggestFromLearning(
  context: TenantContext,
  target: CategorySuggestionTarget,
  learningEntries: readonly CategoryLearningEntry[],
  activeCategories: readonly Category[],
): CategorySuggestionResult | undefined {
  const merchantKey = buildCategoryLearningKey(target);
  const categoryIds = new Set(activeCategories.map((category) => category.id));
  const matches = listTenantScopedResources(context, learningEntries)
    .filter(
      (entry) =>
        entry.status === "active" &&
        entry.transactionKind === target.transactionKind &&
        entry.merchantKey === merchantKey &&
        categoryIds.has(entry.categoryId),
    )
    .sort(compareLearningEntries);
  const bestMatch = matches[0];

  if (bestMatch === undefined) {
    return undefined;
  }

  const hasConflict = matches.some((entry) => entry.categoryId !== bestMatch.categoryId);

  return {
    status: "suggested",
    source: "learning",
    categoryId: bestMatch.categoryId,
    confidence: hasConflict ? Math.min(bestMatch.confidence, 0.78) : bestMatch.confidence,
    learningEntryId: bestMatch.id,
    reason: hasConflict
      ? "Aprendizado recorrente encontrado, mas ha correcoes conflitantes para merchant semelhante."
      : "Aprendizado criado a partir de correcao anterior do usuario para merchant semelhante.",
  };
}

function suggestFromMerchantRules(
  context: TenantContext,
  target: CategorySuggestionTarget,
  rules: readonly MerchantCategoryRule[],
  activeCategories: readonly Category[],
): CategorySuggestionResult | undefined {
  const merchantKey = buildCategoryLearningKey(target);
  const categoryIds = new Set(activeCategories.map((category) => category.id));
  const rule = listTenantScopedResources(context, rules)
    .filter(
      (item) =>
        item.transactionKind === target.transactionKind &&
        item.merchantKey === merchantKey &&
        categoryIds.has(item.categoryId),
    )
    .sort((left, right) => right.confidence - left.confidence)[0];

  if (rule === undefined) {
    return undefined;
  }

  return {
    status: "suggested",
    source: "merchant_rule",
    categoryId: rule.categoryId,
    confidence: rule.confidence,
    ruleId: rule.id,
    reason: rule.reason,
  };
}

function suggestFromHistory(
  context: TenantContext,
  target: CategorySuggestionTarget,
  history: readonly Transaction[],
  activeCategories: readonly Category[],
): CategorySuggestionResult | undefined {
  const merchantKey = buildCategoryLearningKey(target);
  const categoryIds = new Set(activeCategories.map((category) => category.id));
  const counts = new Map<EntityId, number>();

  for (const transaction of listTenantScopedResources(context, history)) {
    if (
      transaction.kind !== target.transactionKind ||
      transaction.categoryId === undefined ||
      !categoryIds.has(transaction.categoryId) ||
      !normalizeCategoryText(transaction.description).includes(merchantKey)
    ) {
      continue;
    }

    counts.set(transaction.categoryId, (counts.get(transaction.categoryId) ?? 0) + 1);
  }

  const [categoryId, count] =
    [...counts.entries()].sort((left, right) => right[1] - left[1])[0] ?? [];

  if (categoryId === undefined || count === undefined) {
    return undefined;
  }

  return {
    status: "suggested",
    source: "history",
    categoryId,
    confidence: Math.min(0.82, 0.62 + count * 0.08),
    reason:
      "Historico do mesmo contexto financeiro usa esta categoria para lancamentos semelhantes.",
  };
}

function suggestFromAi(
  suggestion: AiCategorySuggestion,
  activeCategories: readonly Category[],
  minConfidence: number,
): CategorySuggestionResult {
  const category = activeCategories.find((item) => item.id === suggestion.categoryId);
  const result: CategorySuggestionResult = {
    status:
      category === undefined || suggestion.confidence < minConfidence
        ? "needs_review"
        : "suggested",
    source: "ai",
    confidence: suggestion.confidence,
    reason: suggestion.reason,
  };

  if (result.status === "suggested") {
    result.categoryId = suggestion.categoryId;
  }

  if (suggestion.provider !== undefined) {
    result.provider = suggestion.provider;
  }

  if (suggestion.model !== undefined) {
    result.model = suggestion.model;
  }

  return result;
}

function compareLearningEntries(left: CategoryLearningEntry, right: CategoryLearningEntry): number {
  if (left.correctionCount !== right.correctionCount) {
    return right.correctionCount - left.correctionCount;
  }

  return right.updatedAt.localeCompare(left.updatedAt);
}

function assertUsableCategory(
  context: TenantContext,
  category: Category | undefined,
  transactionKind: TransactionKind,
): Category {
  const scopedCategory = getTenantScopedResource(context, category);

  if (scopedCategory.status !== "active" || scopedCategory.kind !== transactionKind) {
    throw new Error("Corrected category must be active and compatible with the transaction kind.");
  }

  return scopedCategory;
}

function normalizeCategoryText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
