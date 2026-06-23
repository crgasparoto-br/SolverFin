import { randomUUID } from "node:crypto";

import {
  archiveCategory as archiveCategoryDomain,
  createCategory as createCategoryDomain,
  getCategory as getCategoryDomain,
  listCategories as listCategoriesDomain,
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

import { query } from "../db.js";

interface CategoryRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  parentCategoryId: string | null;
  name: string;
  kind: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

const SELECT_COLUMNS = `"id", "organizationId", "financialProfileId", "parentCategoryId", "name",
  "kind", "status", "createdAt", "updatedAt", "createdByUserId", "updatedByUserId"`;

export async function listCategoriesForContext(
  context: TenantContext,
  filters: ListCategoriesFilters = {},
): Promise<Category[]> {
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

  await query(
    `insert into "Category"
      ("id", "organizationId", "financialProfileId", "parentCategoryId", "name", "kind", "status",
       "createdAt", "updatedAt", "createdByUserId", "updatedByUserId")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      category.id,
      category.organizationId,
      category.financialProfileId,
      category.parentCategoryId ?? null,
      category.name,
      category.kind.toUpperCase(),
      category.status.toUpperCase(),
      category.createdAt,
      category.updatedAt,
      category.createdByUserId ?? null,
      category.updatedByUserId ?? null,
    ],
  );

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

  await persistCategoryUpdate(restoredCategory);

  return restoredCategory;
}

async function persistCategoryUpdate(category: Category): Promise<void> {
  await query(
    `update "Category" set
      "name" = $2, "kind" = $3, "status" = $4, "parentCategoryId" = $5, "updatedAt" = $6, "updatedByUserId" = $7
     where "id" = $1`,
    [
      category.id,
      category.name,
      category.kind.toUpperCase(),
      category.status.toUpperCase(),
      category.parentCategoryId ?? null,
      category.updatedAt,
      category.updatedByUserId ?? null,
    ],
  );
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

function normalizeCategoryParentPayload<T extends CreateCategoryPayload | UpdateCategoryPayload>(
  payload: T,
): T {
  if (payload.parentCategoryId === undefined) {
    return payload;
  }

  const parentCategoryId = normalizeParentCategoryId(payload.parentCategoryId);

  return {
    ...payload,
    parentCategoryId,
  };
}

function normalizeParentCategoryId(parentCategoryId: EntityId | null | undefined): EntityId | null {
  if (parentCategoryId === null || parentCategoryId === undefined) {
    return null;
  }

  const normalizedParentCategoryId = parentCategoryId.trim();

  if (!normalizedParentCategoryId || normalizedParentCategoryId === "null") {
    return null;
  }

  return normalizedParentCategoryId;
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
