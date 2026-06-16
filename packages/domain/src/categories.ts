import type { Category, CategoryKind, CategoryStatus, EntityId, ISODateTime } from "./index.js";
import type { TenantContext } from "./tenant.js";
import {
  applyTenantScope,
  getTenantScopedResource,
  listTenantScopedResources,
  updateTenantScopedResource,
} from "./tenant-authorization.js";

export type CategoryErrorCode =
  | "CATEGORY_NAME_REQUIRED"
  | "CATEGORY_KIND_REQUIRED"
  | "CATEGORY_KIND_INVALID"
  | "CATEGORY_PARENT_INVALID"
  | "CATEGORY_PARENT_KIND_MISMATCH"
  | "CATEGORY_REPLACEMENT_REQUIRED"
  | "CATEGORY_REPLACEMENT_INVALID"
  | "CATEGORY_TRANSACTION_KIND_INVALID";

export class CategoryError extends Error {
  readonly code: CategoryErrorCode;
  readonly statusCode = 400;

  constructor(code: CategoryErrorCode, message: string) {
    super(message);
    this.name = "CategoryError";
    this.code = code;
  }
}

export type CategorySuggestionSource = "system_default" | "user_created" | "ai_suggested" | "imported";

export interface DefaultCategorySuggestion {
  name: string;
  kind: CategoryKind;
  source: Extract<CategorySuggestionSource, "system_default">;
}

export interface CreateCategoryInput {
  id: EntityId;
  context: TenantContext;
  now: ISODateTime;
  payload: CreateCategoryPayload;
  parentCategory?: Category;
}

export interface CreateCategoryPayload {
  name: string;
  kind: CategoryKind;
  parentCategoryId?: EntityId;
  organizationId?: EntityId;
  financialProfileId?: EntityId;
}

export interface UpdateCategoryInput {
  context: TenantContext;
  category: Category | undefined;
  now: ISODateTime;
  payload: UpdateCategoryPayload;
  parentCategory?: Category;
}

export interface UpdateCategoryPayload {
  name?: string;
  kind?: CategoryKind;
  status?: CategoryStatus;
  parentCategoryId?: EntityId;
  organizationId?: EntityId;
  financialProfileId?: EntityId;
}

export interface ReplaceCategoryInput {
  context: TenantContext;
  category: Category | undefined;
  replacementCategory: Category | undefined;
  now: ISODateTime;
  hasHistory: boolean;
}

export interface CategoryReplacementResult {
  archivedCategory: Category;
  replacementCategoryId: EntityId;
}

export interface ListCategoriesFilters {
  status?: CategoryStatus | "all";
  kind?: CategoryKind;
  parentCategoryId?: EntityId | null;
}

const ALLOWED_CATEGORY_KINDS: readonly CategoryKind[] = ["income", "expense", "transfer"];

const DEFAULT_CATEGORY_SUGGESTIONS: readonly DefaultCategorySuggestion[] = [
  { name: "Receitas", kind: "income", source: "system_default" },
  { name: "Moradia", kind: "expense", source: "system_default" },
  { name: "Alimentacao", kind: "expense", source: "system_default" },
  { name: "Transporte", kind: "expense", source: "system_default" },
  { name: "Transferencias", kind: "transfer", source: "system_default" },
];

export function getDefaultCategorySuggestions(): readonly DefaultCategorySuggestion[] {
  return DEFAULT_CATEGORY_SUGGESTIONS;
}

export function createCategory(input: CreateCategoryInput): Category {
  const payload = applyTenantScope(input.context, input.payload);
  const kind = validateCategoryKind(payload.kind);

  assertParentCategory(input.context, input.parentCategory, payload.parentCategoryId, kind);

  return {
    id: input.id,
    organizationId: payload.organizationId,
    financialProfileId: payload.financialProfileId,
    name: normalizeCategoryName(payload.name),
    kind,
    status: "active",
    ...(payload.parentCategoryId ? { parentCategoryId: payload.parentCategoryId } : {}),
    createdAt: input.now,
    updatedAt: input.now,
    createdByUserId: input.context.userId,
    updatedByUserId: input.context.userId,
  };
}

export function listCategories(
  context: TenantContext,
  categories: readonly Category[],
  filters: ListCategoriesFilters = {},
): Category[] {
  const scopedCategories = listTenantScopedResources(context, categories);

  return scopedCategories.filter((category) => {
    const statusMatches = filters.status === "all" || category.status === (filters.status ?? "active");
    const kindMatches = filters.kind === undefined || category.kind === filters.kind;
    const parentMatches =
      filters.parentCategoryId === undefined || category.parentCategoryId === filters.parentCategoryId;

    return statusMatches && kindMatches && parentMatches;
  });
}

export function getCategory(context: TenantContext, category: Category | undefined): Category {
  return getTenantScopedResource(context, category);
}

export function updateCategory(input: UpdateCategoryInput): Category {
  const currentCategory = updateTenantScopedResource(input.context, input.category, input.payload);
  const nextKind = input.payload.kind ? validateCategoryKind(input.payload.kind) : currentCategory.kind;

  assertParentCategory(input.context, input.parentCategory, input.payload.parentCategoryId, nextKind);

  return {
    ...currentCategory,
    ...buildOptionalCategoryUpdate(input.payload),
    updatedAt: input.now,
    updatedByUserId: input.context.userId,
  };
}

export function archiveCategory(
  context: TenantContext,
  category: Category | undefined,
  now: ISODateTime,
): Category {
  const currentCategory = getTenantScopedResource(context, category);

  return {
    ...currentCategory,
    status: "archived",
    updatedAt: now,
    updatedByUserId: context.userId,
  };
}

export function restoreCategory(
  context: TenantContext,
  category: Category | undefined,
  now: ISODateTime,
): Category {
  const currentCategory = getTenantScopedResource(context, category);

  return {
    ...currentCategory,
    status: "active",
    updatedAt: now,
    updatedByUserId: context.userId,
  };
}

export function replaceCategory(input: ReplaceCategoryInput): CategoryReplacementResult {
  const currentCategory = getTenantScopedResource(input.context, input.category);
  const replacementCategory = getTenantScopedResource(input.context, input.replacementCategory);

  if (!input.hasHistory) {
    throw new CategoryError(
      "CATEGORY_REPLACEMENT_REQUIRED",
      "Category replacement is only required when history must be preserved.",
    );
  }

  if (currentCategory.id === replacementCategory.id || currentCategory.kind !== replacementCategory.kind) {
    throw new CategoryError(
      "CATEGORY_REPLACEMENT_INVALID",
      "Replacement category must be a different category with the same kind.",
    );
  }

  return {
    archivedCategory: archiveCategory(input.context, currentCategory, input.now),
    replacementCategoryId: replacementCategory.id,
  };
}

export function assertCategorySupportsTransactionKind(
  category: Pick<Category, "kind">,
  transactionKind: CategoryKind,
): void {
  if (category.kind !== transactionKind) {
    throw new CategoryError(
      "CATEGORY_TRANSACTION_KIND_INVALID",
      "Category kind is not compatible with the transaction kind.",
    );
  }
}

function buildOptionalCategoryUpdate(payload: UpdateCategoryPayload): Partial<Category> {
  const update: Partial<Category> = {};

  if (payload.name !== undefined) {
    update.name = normalizeCategoryName(payload.name);
  }

  if (payload.kind !== undefined) {
    update.kind = validateCategoryKind(payload.kind);
  }

  if (payload.status !== undefined) {
    update.status = payload.status;
  }

  if (payload.parentCategoryId !== undefined) {
    update.parentCategoryId = payload.parentCategoryId;
  }

  return update;
}

function assertParentCategory(
  context: TenantContext,
  parentCategory: Category | undefined,
  parentCategoryId: EntityId | undefined,
  kind: CategoryKind,
): void {
  if (!parentCategoryId) {
    return;
  }

  if (!parentCategory) {
    throw new CategoryError("CATEGORY_PARENT_INVALID", "Parent category was not found.");
  }

  const scopedParentCategory = getTenantScopedResource(context, parentCategory);

  if (scopedParentCategory.id !== parentCategoryId) {
    throw new CategoryError("CATEGORY_PARENT_INVALID", "Parent category id does not match.");
  }

  if (scopedParentCategory.kind !== kind) {
    throw new CategoryError(
      "CATEGORY_PARENT_KIND_MISMATCH",
      "Subcategory must use the same kind as its parent category.",
    );
  }
}

function normalizeCategoryName(name: string): string {
  const normalizedName = name.trim();

  if (!normalizedName) {
    throw new CategoryError("CATEGORY_NAME_REQUIRED", "Category name is required.");
  }

  return normalizedName;
}

function validateCategoryKind(kind: CategoryKind | undefined): CategoryKind {
  if (!kind) {
    throw new CategoryError("CATEGORY_KIND_REQUIRED", "Category kind is required.");
  }

  if (!ALLOWED_CATEGORY_KINDS.includes(kind)) {
    throw new CategoryError("CATEGORY_KIND_INVALID", "Category kind is not supported.");
  }

  return kind;
}
