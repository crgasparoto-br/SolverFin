import { randomUUID } from "node:crypto";

import {
  archiveCategory as archiveCategoryDomain,
  createCategory as createCategoryDomain,
  DEFAULT_CATEGORY_TREE,
  getCategory as getCategoryDomain,
  listCategories as listCategoriesDomain,
  normalizeCategoryNameForUniqueness,
  restoreCategory as restoreCategoryDomain,
  updateCategory as updateCategoryDomain,
  type Category,
  type CategoryKind,
  type CategoryStatus,
  type CreateCategoryPayload,
  type EntityId,
  type ListCategoriesFilters,
  type TenantContext,
  type UpdateCategoryPayload,
} from "@solverfin/domain";

import { query, withTransaction } from "../db.js";

interface CategoryRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  parentCategoryId: string | null;
  name: string;
  normalizedName: string;
  kind: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

interface CategoryDeleteBlockers {
  children: number;
  transactions: number;
  recurrences: number;
  budgets: number;
  payablesReceivables: number;
}

type ExecuteQuery = typeof query;

const SELECT_COLUMNS = `"id", "organizationId", "financialProfileId", "parentCategoryId", "name",
  "normalizedName", "kind", "status", "createdAt", "updatedAt", "createdByUserId", "updatedByUserId"`;

const ROOT_PARENT_KEY = "__root__";

export async function listCategoriesForContext(
  context: TenantContext,
  filters: ListCategoriesFilters = {},
): Promise<Category[]> {
  await ensureDefaultCategoriesForContext(context);

  const rows = await query<CategoryRow>(
    `select ${SELECT_COLUMNS} from "Category"
     where "organizationId" = $1 and "financialProfileId" = $2
     order by "kind" asc, "parentCategoryId" asc nulls first, "name" asc`,
    [context.organizationId, context.financialProfileId],
  );

  return listCategoriesDomain(context, rows.map(mapCategoryRow), filters);
}

export async function getCategoryForContext(
  context: TenantContext,
  categoryId: EntityId,
): Promise<Category> {
  const category = await findCategoryRow(context, categoryId);

  return getCategoryDomain(context, category);
}

export async function createCategoryForContext(
  context: TenantContext,
  payload: CreateCategoryPayload,
): Promise<Category> {
  const normalizedPayload = normalizeCategoryParentPayload(payload);
  const parentCategory = normalizedPayload.parentCategoryId
    ? await findCategoryRow(context, normalizedPayload.parentCategoryId)
    : undefined;
  const ancestorCategories = parentCategory
    ? await listCategoryAncestors(context, parentCategory)
    : [];
  const category = createCategoryDomain({
    id: randomUUID(),
    context,
    now: new Date().toISOString(),
    payload: normalizedPayload,
    ancestorCategories,
    ...(parentCategory ? { parentCategory } : {}),
  });

  await assertCategoryNameAvailable(query, context, {
    kind: category.kind,
    parentCategoryId: category.parentCategoryId ?? null,
    name: category.name,
  });

  try {
    await query(
      `insert into "Category"
        ("id", "organizationId", "financialProfileId", "parentCategoryId", "name", "normalizedName",
         "kind", "status", "createdAt", "updatedAt", "createdByUserId", "updatedByUserId")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        category.id,
        category.organizationId,
        category.financialProfileId,
        category.parentCategoryId ?? null,
        category.name,
        normalizeCategoryNameForUniqueness(category.name),
        category.kind.toUpperCase(),
        category.status.toUpperCase(),
        category.createdAt,
        category.updatedAt,
        category.createdByUserId ?? null,
        category.updatedByUserId ?? null,
      ],
    );
  } catch (error) {
    if (isCategoryUniqueViolation(error)) {
      throwCategoryDuplicate();
    }

    throw error;
  }

  return category;
}

export async function updateCategoryForContext(
  context: TenantContext,
  categoryId: EntityId,
  payload: UpdateCategoryPayload,
): Promise<Category> {
  const normalizedPayload = normalizeCategoryParentPayload(payload);
  const currentCategory = await findCategoryRow(context, categoryId);
  const nextParentCategoryId =
    normalizedPayload.parentCategoryId === undefined
      ? currentCategory?.parentCategoryId
      : normalizedPayload.parentCategoryId;
  const parentCategory = nextParentCategoryId
    ? await findCategoryRow(context, nextParentCategoryId)
    : undefined;
  const ancestorCategories = parentCategory
    ? await listCategoryAncestors(context, parentCategory)
    : [];
  const updatedCategory = updateCategoryDomain({
    context,
    category: currentCategory,
    now: new Date().toISOString(),
    payload: normalizedPayload,
    ancestorCategories,
    ...(parentCategory ? { parentCategory } : {}),
  });

  await assertCategoryNameAvailable(query, context, {
    kind: updatedCategory.kind,
    parentCategoryId: updatedCategory.parentCategoryId ?? null,
    name: updatedCategory.name,
    excludingCategoryId: updatedCategory.id,
  });
  await persistCategoryUpdate(updatedCategory);

  return updatedCategory;
}

export async function archiveCategoryForContext(
  context: TenantContext,
  categoryId: EntityId,
): Promise<Category> {
  const currentCategory = await findCategoryRow(context, categoryId);
  const archivedCategory = archiveCategoryDomain(
    context,
    currentCategory,
    new Date().toISOString(),
  );

  await persistCategoryUpdate(archivedCategory);

  return archivedCategory;
}

export async function restoreCategoryForContext(
  context: TenantContext,
  categoryId: EntityId,
): Promise<Category> {
  const currentCategory = await findCategoryRow(context, categoryId);
  const restoredCategory = restoreCategoryDomain(
    context,
    currentCategory,
    new Date().toISOString(),
  );

  await assertCategoryNameAvailable(query, context, {
    kind: restoredCategory.kind,
    parentCategoryId: restoredCategory.parentCategoryId ?? null,
    name: restoredCategory.name,
    excludingCategoryId: restoredCategory.id,
  });
  await persistCategoryUpdate(restoredCategory);

  return restoredCategory;
}

export async function deleteCategoryForContext(
  context: TenantContext,
  categoryId: EntityId,
): Promise<void> {
  const currentCategory = getCategoryDomain(
    context,
    await findCategoryRow(context, categoryId),
  );

  await withTransaction(async (executeQuery) => {
    const blockers = await countCategoryDeleteBlockers(
      executeQuery,
      context,
      currentCategory.id,
    );

    if (blockers.children > 0) {
      throwCategoryDeleteBlocked(
        "CATEGORY_DELETE_HAS_CHILDREN",
        "Mova ou exclua as subcategorias antes de excluir esta categoria.",
      );
    }

    if (hasLinkedCategoryHistory(blockers)) {
      throwCategoryDeleteBlocked(
        "CATEGORY_DELETE_HAS_HISTORY",
        "Esta categoria possui lançamentos ou registros vinculados. Arquive a categoria para manter o histórico.",
      );
    }

    await executeQuery(
      `delete from "Category"
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
      [currentCategory.id, context.organizationId, context.financialProfileId],
    );
  });
}

async function ensureDefaultCategoriesForContext(
  context: TenantContext,
): Promise<void> {
  await withTransaction(async (executeQuery) => {
    const now = new Date().toISOString();
    let categoryIndex = indexCategories(
      await listCategoryRowsForContext(executeQuery, context),
    );

    for (const group of DEFAULT_CATEGORY_TREE) {
      for (const root of group.roots) {
        const rootCategory = await findOrCreateDefaultCategory(executeQuery, {
          context,
          index: categoryIndex,
          kind: group.kind,
          parentCategoryId: null,
          name: root.name,
          now,
        });

        categoryIndex = rootCategory.index;

        if (rootCategory.category.status === "archived") {
          continue;
        }

        for (const child of root.children ?? []) {
          const childCategory = await findOrCreateDefaultCategory(executeQuery, {
            context,
            index: categoryIndex,
            kind: group.kind,
            parentCategoryId: rootCategory.category.id,
            name: child.name,
            now,
          });
          categoryIndex = childCategory.index;
        }
      }
    }
  });
}

async function findOrCreateDefaultCategory(
  executeQuery: ExecuteQuery,
  input: {
    context: TenantContext;
    index: CategoryIndex;
    kind: CategoryKind;
    parentCategoryId: EntityId | null;
    name: string;
    now: string;
  },
): Promise<{ category: Category; index: CategoryIndex }> {
  const existingCategory = input.index.get(
    buildCategoryIndexKey(input.kind, input.parentCategoryId, input.name),
  );

  if (existingCategory) {
    return { category: existingCategory, index: input.index };
  }

  const category = mapCategoryRow(
    await insertCategorySeed(executeQuery, input.context, {
      id: randomUUID(),
      parentCategoryId: input.parentCategoryId,
      name: input.name,
      kind: input.kind,
      now: input.now,
    }),
  );
  const nextIndex = new Map(input.index);

  nextIndex.set(
    buildCategoryIndexKey(category.kind, category.parentCategoryId ?? null, category.name),
    category,
  );

  return { category, index: nextIndex };
}

async function listCategoryRowsForContext(
  executeQuery: ExecuteQuery,
  context: TenantContext,
): Promise<CategoryRow[]> {
  return executeQuery<CategoryRow>(
    `select ${SELECT_COLUMNS} from "Category"
     where "organizationId" = $1 and "financialProfileId" = $2`,
    [context.organizationId, context.financialProfileId],
  );
}

async function insertCategorySeed(
  executeQuery: ExecuteQuery,
  context: TenantContext,
  input: {
    id: EntityId;
    parentCategoryId: EntityId | null;
    name: string;
    kind: CategoryKind;
    now: string;
  },
): Promise<CategoryRow> {
  const rows = await executeQuery<CategoryRow>(
    `insert into "Category"
      ("id", "organizationId", "financialProfileId", "parentCategoryId", "name", "normalizedName",
       "kind", "status", "createdAt", "updatedAt", "createdByUserId", "updatedByUserId")
     values ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8, $8, $9, $9)
     returning ${SELECT_COLUMNS}`,
    [
      input.id,
      context.organizationId,
      context.financialProfileId,
      input.parentCategoryId,
      input.name,
      normalizeCategoryNameForUniqueness(input.name),
      input.kind.toUpperCase(),
      input.now,
      context.userId,
    ],
  );

  return rows[0] ?? throwUnexpectedCategoryInsert();
}

async function persistCategoryUpdate(category: Category): Promise<void> {
  try {
    await query(
      `update "Category" set
        "name" = $2, "normalizedName" = $3, "kind" = $4, "status" = $5,
        "parentCategoryId" = $6, "updatedAt" = $7, "updatedByUserId" = $8
       where "id" = $1`,
      [
        category.id,
        category.name,
        normalizeCategoryNameForUniqueness(category.name),
        category.kind.toUpperCase(),
        category.status.toUpperCase(),
        category.parentCategoryId ?? null,
        category.updatedAt,
        category.updatedByUserId ?? null,
      ],
    );
  } catch (error) {
    if (isCategoryUniqueViolation(error)) {
      throwCategoryDuplicate();
    }

    throw error;
  }
}

async function countCategoryDeleteBlockers(
  executeQuery: ExecuteQuery,
  context: TenantContext,
  categoryId: EntityId,
): Promise<CategoryDeleteBlockers> {
  const rows = await executeQuery<CategoryDeleteBlockers>(
    `select
       (select count(*)::int from "Category" where "organizationId" = $1 and "financialProfileId" = $2 and "parentCategoryId" = $3) as "children",
       (select count(*)::int from "Transaction" where "organizationId" = $1 and "financialProfileId" = $2 and "categoryId" = $3) as "transactions",
       (select count(*)::int from "Recurrence" where "organizationId" = $1 and "financialProfileId" = $2 and "categoryId" = $3) as "recurrences",
       (select count(*)::int from "Budget" where "organizationId" = $1 and "financialProfileId" = $2 and "categoryId" = $3) as "budgets",
       (select count(*)::int from "PayableReceivable" where "organizationId" = $1 and "financialProfileId" = $2 and "categoryId" = $3) as "payablesReceivables"`,
    [context.organizationId, context.financialProfileId, categoryId],
  );

  return (
    rows[0] ?? {
      children: 0,
      transactions: 0,
      recurrences: 0,
      budgets: 0,
      payablesReceivables: 0,
    }
  );
}

function hasLinkedCategoryHistory(blockers: CategoryDeleteBlockers): boolean {
  return (
    blockers.transactions > 0 ||
    blockers.recurrences > 0 ||
    blockers.budgets > 0 ||
    blockers.payablesReceivables > 0
  );
}

function throwCategoryDeleteBlocked(code: string, message: string): never {
  throw Object.assign(new Error(message), {
    code,
    statusCode: 409,
  });
}

async function assertCategoryNameAvailable(
  executeQuery: ExecuteQuery,
  context: TenantContext,
  input: {
    kind: CategoryKind;
    parentCategoryId: EntityId | null;
    name: string;
    excludingCategoryId?: EntityId;
  },
): Promise<void> {
  const duplicateRows = await executeQuery<{ id: string }>(
    `select "id" from "Category"
     where "organizationId" = $1
       and "financialProfileId" = $2
       and "kind" = $3
       and "normalizedName" = $4
       and (($5::uuid is null and "parentCategoryId" is null) or "parentCategoryId" = $5::uuid)
       and ($6::uuid is null or "id" <> $6::uuid)
     limit 1`,
    [
      context.organizationId,
      context.financialProfileId,
      input.kind.toUpperCase(),
      normalizeCategoryNameForUniqueness(input.name),
      input.parentCategoryId,
      input.excludingCategoryId ?? null,
    ],
  );

  if (duplicateRows.length > 0) {
    throwCategoryDuplicate();
  }
}

async function findCategoryRow(
  context: TenantContext,
  categoryId: EntityId,
): Promise<Category | undefined> {
  const rows = await query<CategoryRow>(
    `select ${SELECT_COLUMNS} from "Category"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [categoryId, context.organizationId, context.financialProfileId],
  );

  return rows[0] ? mapCategoryRow(rows[0]) : undefined;
}

async function listCategoryAncestors(
  context: TenantContext,
  category: Category,
): Promise<Category[]> {
  const ancestors: Category[] = [category];
  let nextParentCategoryId = category.parentCategoryId;

  while (nextParentCategoryId) {
    const parentCategory = await findCategoryRow(context, nextParentCategoryId);

    if (!parentCategory) {
      break;
    }

    ancestors.push(parentCategory);
    nextParentCategoryId = parentCategory.parentCategoryId;
  }

  return ancestors;
}

function normalizeCategoryParentPayload<
  T extends CreateCategoryPayload | UpdateCategoryPayload,
>(payload: T): T {
  if (payload.parentCategoryId === undefined) {
    return payload;
  }

  const parentCategoryId = normalizeParentCategoryId(payload.parentCategoryId);

  return {
    ...payload,
    parentCategoryId,
  };
}

function normalizeParentCategoryId(
  parentCategoryId: EntityId | null | undefined,
): EntityId | null {
  if (parentCategoryId === null || parentCategoryId === undefined) {
    return null;
  }

  const normalizedParentCategoryId = parentCategoryId.trim();

  if (!normalizedParentCategoryId || normalizedParentCategoryId === "null") {
    return null;
  }

  return normalizedParentCategoryId;
}

type CategoryIndex = ReadonlyMap<string, Category>;

function indexCategories(rows: readonly CategoryRow[]): CategoryIndex {
  return new Map(
    rows
      .map(mapCategoryRow)
      .map((category) => [
        buildCategoryIndexKey(category.kind, category.parentCategoryId ?? null, category.name),
        category,
      ]),
  );
}

function buildCategoryIndexKey(
  kind: CategoryKind,
  parentCategoryId: EntityId | null,
  name: string,
): string {
  return [
    kind,
    parentCategoryId ?? ROOT_PARENT_KEY,
    normalizeCategoryNameForUniqueness(name),
  ].join("|");
}

function mapCategoryRow(row: CategoryRow): Category {
  const category: Category = {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    name: row.name,
    kind: row.kind.toLowerCase() as CategoryKind,
    status: row.status.toLowerCase() as CategoryStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  if (row.parentCategoryId !== null) {
    category.parentCategoryId = row.parentCategoryId;
  }

  if (row.createdByUserId !== null) {
    category.createdByUserId = row.createdByUserId;
  }

  if (row.updatedByUserId !== null) {
    category.updatedByUserId = row.updatedByUserId;
  }

  return category;
}

function throwUnexpectedCategoryInsert(): never {
  throw Object.assign(new Error("Could not create default category."), {
    code: "CATEGORY_DEFAULT_CREATE_FAILED",
    statusCode: 500,
  });
}

function throwCategoryDuplicate(): never {
  throw Object.assign(new Error("Já existe uma categoria com este nome neste grupo."), {
    code: "CATEGORY_DUPLICATE",
    statusCode: 409,
  });
}

function isCategoryUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}
