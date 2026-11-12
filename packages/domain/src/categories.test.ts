import type { Category } from "./index.js";
import type { TenantContext } from "./tenant.js";
import { TenantAuthorizationError } from "./tenant-authorization.js";
import {
  archiveCategory,
  assertCategorySupportsTransactionKind,
  CategoryError,
  createCategory,
  DEFAULT_CATEGORY_TREE,
  getDefaultCategorySuggestions,
  listCategories,
  normalizeCategoryNameForUniqueness,
  replaceCategory,
  restoreCategory,
  updateCategory,
} from "./categories.js";

const tenantA: TenantContext = {
  userId: "user-demo-a",
  organizationId: "org-demo-a",
  financialProfileId: "profile-demo-a",
  financialProfileKind: "personal",
};

const tenantB: TenantContext = {
  userId: "user-demo-b",
  organizationId: "org-demo-b",
  financialProfileId: "profile-demo-b",
  financialProfileKind: "business",
};

const now = "2026-06-15T10:00:00.000Z";

testCanonicalDefaultTreeContainsExpectedGroups();
testDefaultSuggestionsAreEditablePayloads();
testCategoryNameUniquenessNormalization();
testCreateAndEditCategory();
testCreateSubcategory();
testRejectParentKindMismatch();
testRejectHierarchyCycleOnUpdate();
testCanClearParentCategory();
testArchiveAndRestoreCategory();
testReplaceCategoryWithHistory();
testCategoryInUseRequiresReplacement();
testOtherTenantAccessIsRejected();
testCategoryKindValidation();

function testCanonicalDefaultTreeContainsExpectedGroups(): void {
  const expenseGroup = DEFAULT_CATEGORY_TREE.find((group) => group.kind === "expense");
  const incomeGroup = DEFAULT_CATEGORY_TREE.find((group) => group.kind === "income");
  const transferGroup = DEFAULT_CATEGORY_TREE.find((group) => group.kind === "transfer");
  const housing = expenseGroup?.roots.find((category) => category.name === "Moradia");
  const work = incomeGroup?.roots.find((category) => category.name === "Trabalho");
  const transfers = transferGroup?.roots.find((category) => category.name === "Transferências");

  assertEqual(
    housing?.children?.some((category) => category.name === "Gás"),
    true,
    "housing gas",
  );
  assertEqual(
    housing?.children?.some((category) => category.name === "Manutenção residencial"),
    true,
    "housing maintenance",
  );
  assertEqual(
    work?.children?.some((category) => category.name === "13º salário"),
    true,
    "work thirteenth salary",
  );
  assertEqual(
    transfers?.children?.some((category) => category.name === "Pagamento de cartão"),
    true,
    "transfer payment category",
  );
}

function testDefaultSuggestionsAreEditablePayloads(): void {
  const suggestions = getDefaultCategorySuggestions();
  const expenseSuggestion = suggestions.find((suggestion) => suggestion.kind === "expense");
  const detailedSuggestion = suggestions.find((suggestion) => suggestion.parentName === "Moradia");
  const transferSuggestion = suggestions.find((suggestion) => suggestion.kind === "transfer");

  assertEqual(Boolean(expenseSuggestion), true, "expense suggestion exists");
  assertEqual(expenseSuggestion?.source, "system_default", "suggestion source");
  assertEqual(Boolean(detailedSuggestion), true, "hierarchical suggestion exists");
  assertEqual(transferSuggestion?.name, "Transferências", "transfer suggestion exists");
}

function testCategoryNameUniquenessNormalization(): void {
  assertEqual(
    normalizeCategoryNameForUniqueness(" Alimentação "),
    normalizeCategoryNameForUniqueness("alimentacao"),
    "accent and case normalization",
  );
  assertEqual(
    normalizeCategoryNameForUniqueness(" Energia   Elétrica "),
    normalizeCategoryNameForUniqueness("energia eletrica"),
    "space normalization",
  );
}

function testCreateAndEditCategory(): void {
  const category = createCategory({
    id: "category-demo-a",
    context: tenantA,
    now,
    payload: {
      name: " Alimentacao ",
      kind: "expense",
    },
  });
  const updatedCategory = updateCategory({
    context: tenantA,
    category,
    now: "2026-06-15T11:00:00.000Z",
    payload: {
      name: "Mercado",
    },
  });

  assertEqual(category.organizationId, tenantA.organizationId, "category org scope");
  assertEqual(category.financialProfileId, tenantA.financialProfileId, "category profile scope");
  assertEqual(category.name, "Alimentacao", "category name");
  assertEqual(updatedCategory.name, "Mercado", "updated category name");
}

function testCreateSubcategory(): void {
  const parentCategory = createCategoryFixture(tenantA, "category-parent", "expense", "active");
  const subcategory = createCategory({
    id: "category-child",
    context: tenantA,
    now,
    parentCategory,
    payload: {
      name: "Supermercado",
      kind: "expense",
      parentCategoryId: parentCategory.id,
    },
  });

  assertEqual(subcategory.parentCategoryId, parentCategory.id, "subcategory parent");
}

function testRejectParentKindMismatch(): void {
  const parentCategory = createCategoryFixture(
    tenantA,
    "category-income-parent",
    "income",
    "active",
  );

  assertCategoryError(
    () =>
      createCategory({
        id: "category-expense-child",
        context: tenantA,
        now,
        parentCategory,
        payload: {
          name: "Mercado",
          kind: "expense",
          parentCategoryId: parentCategory.id,
        },
      }),
    "CATEGORY_PARENT_KIND_MISMATCH",
  );
}

function testRejectHierarchyCycleOnUpdate(): void {
  const parentCategory = createCategoryFixture(
    tenantA,
    "category-parent-cycle",
    "expense",
    "active",
  );
  const childCategory = createCategoryFixture(
    tenantA,
    "category-child-cycle",
    "expense",
    "active",
    parentCategory.id,
  );

  assertCategoryError(
    () =>
      updateCategory({
        context: tenantA,
        category: parentCategory,
        now,
        parentCategory: childCategory,
        ancestorCategories: [childCategory, parentCategory],
        payload: {
          parentCategoryId: childCategory.id,
        },
      }),
    "CATEGORY_PARENT_CYCLE",
  );
}

function testCanClearParentCategory(): void {
  const parentCategory = createCategoryFixture(
    tenantA,
    "category-parent-clear",
    "expense",
    "active",
  );
  const childCategory = createCategoryFixture(
    tenantA,
    "category-child-clear",
    "expense",
    "active",
    parentCategory.id,
  );
  const updatedCategory = updateCategory({
    context: tenantA,
    category: childCategory,
    now,
    payload: {
      parentCategoryId: null,
    },
  });

  assertEqual(updatedCategory.parentCategoryId, undefined, "parent category cleared");
}

function testArchiveAndRestoreCategory(): void {
  const category = createCategoryFixture(tenantA, "category-archive", "expense", "active");
  const archivedCategory = archiveCategory(tenantA, category, "2026-06-15T12:00:00.000Z");
  const restoredCategory = restoreCategory(tenantA, archivedCategory, "2026-06-15T13:00:00.000Z");

  assertEqual(archivedCategory.status, "archived", "archived status");
  assertEqual(restoredCategory.status, "active", "restored status");
}

function testReplaceCategoryWithHistory(): void {
  const oldCategory = createCategoryFixture(tenantA, "category-old", "expense", "active");
  const newCategory = createCategoryFixture(tenantA, "category-new", "expense", "active");
  const replacement = replaceCategory({
    context: tenantA,
    category: oldCategory,
    replacementCategory: newCategory,
    now: "2026-06-15T14:00:00.000Z",
    hasHistory: true,
  });

  assertEqual(replacement.archivedCategory.status, "archived", "replacement archives old category");
  assertEqual(replacement.replacementCategoryId, newCategory.id, "replacement id");
}

function testCategoryInUseRequiresReplacement(): void {
  const category = createCategoryFixture(tenantA, "category-used", "expense", "active");

  assertCategoryError(
    () =>
      replaceCategory({
        context: tenantA,
        category,
        replacementCategory: category,
        now,
        hasHistory: true,
      }),
    "CATEGORY_REPLACEMENT_INVALID",
  );
}

function testOtherTenantAccessIsRejected(): void {
  const otherCategory = createCategoryFixture(tenantB, "category-other", "expense", "active");

  assertTenantAuthorizationError(
    () => archiveCategory(tenantA, otherCategory, now),
    "TENANT_RESOURCE_NOT_FOUND",
  );
}

function testCategoryKindValidation(): void {
  const expenseCategory = createCategoryFixture(tenantA, "category-expense", "expense", "active");

  assertCategoryError(
    () => assertCategorySupportsTransactionKind(expenseCategory, "income"),
    "CATEGORY_TRANSACTION_KIND_INVALID",
  );

  const categories = listCategories(
    tenantA,
    [
      expenseCategory,
      createCategoryFixture(tenantA, "category-income", "income", "active"),
      createCategoryFixture(tenantA, "category-archived", "expense", "archived"),
      createCategoryFixture(tenantB, "category-other-tenant", "expense", "active"),
    ],
    {
      kind: "expense",
    },
  );

  assertEqual(categories.length, 1, "category list filters kind tenant and active status");
  assertEqual(categories[0]?.id, expenseCategory.id, "filtered category id");
}

function createCategoryFixture(
  context: TenantContext,
  id: string,
  kind: Category["kind"],
  status: Category["status"],
  parentCategoryId?: string,
): Category {
  return {
    id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    name: `Categoria ${id}`,
    kind,
    status,
    ...(parentCategoryId ? { parentCategoryId } : {}),
    createdAt: now,
    updatedAt: now,
    createdByUserId: context.userId,
    updatedByUserId: context.userId,
  };
}

function assertCategoryError(action: () => void, expectedCode: CategoryError["code"]): void {
  try {
    action();
  } catch (error) {
    if (error instanceof CategoryError && error.code === expectedCode) {
      return;
    }

    throw error;
  }

  throw new Error(`Expected category error ${expectedCode}.`);
}

function assertTenantAuthorizationError(
  action: () => void,
  expectedCode: TenantAuthorizationError["code"],
): void {
  try {
    action();
  } catch (error) {
    if (error instanceof TenantAuthorizationError && error.code === expectedCode) {
      return;
    }

    throw error;
  }

  throw new Error(`Expected tenant authorization error ${expectedCode}.`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
