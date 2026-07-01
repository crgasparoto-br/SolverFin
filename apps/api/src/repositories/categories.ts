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

import { query, withTransaction } from "../db.js";

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

interface DefaultCategoryDefinition {
  name: string;
  kind: CategoryKind;
  children?: readonly string[];
}

interface CategoryDeleteBlockers {
  children: number;
  transactions: number;
  recurrences: number;
  budgets: number;
  payablesReceivables: number;
}

const SELECT_COLUMNS = `"id", "organizationId", "financialProfileId", "parentCategoryId", "name",
  "kind", "status", "createdAt", "updatedAt", "createdByUserId", "updatedByUserId"`;

const DEFAULT_CATEGORIES: readonly DefaultCategoryDefinition[] = [
  {
    name: "Moradia",
    kind: "expense",
    children: ["Aluguel", "Condomínio", "Energia elétrica", "Água", "Internet"],
  },
  {
    name: "Alimentação",
    kind: "expense",
    children: ["Mercado", "Restaurantes", "Lanches"],
  },
  {
    name: "Transporte",
    kind: "expense",
    children: ["Combustível", "Aplicativos e táxi", "Manutenção"],
  },
  { name: "Saúde", kind: "expense", children: ["Consultas", "Medicamentos", "Plano de saúde"] },
  { name: "Educação", kind: "expense" },
  { name: "Lazer", kind: "expense" },
  { name: "Serviços", kind: "expense" },
  { name: "Impostos e taxas", kind: "expense" },
  { name: "Outros gastos", kind: "expense" },
  { name: "Salário", kind: "income" },
  { name: "Pró-labore", kind: "income" },
  { name: "Vendas", kind: "income" },
  { name: "Rendimentos", kind: "income" },
  { name: "Reembolsos", kind: "income" },
  { name: "Outros recebimentos", kind: "income" },
  { name: "Transferências entre contas", kind: "transfer" },
  { name: "Investimentos", kind: "transfer" },
  { name: "Resgate de investimentos", kind: "transfer" },
  { name: "Pagamento de cartão", kind: "transfer" },
];

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

export async function deleteCategoryForContext(
  context: TenantContext,
  categoryId: EntityId,
): Promise<void> {
  const currentCategory = getCategoryDomain(context, await findCategoryRow(context, categoryId));

  await withTransaction(async (executeQuery) => {
    const blockers = await countCategoryDeleteBlockers(executeQuery, context, currentCategory.id);

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

async function ensureDefaultCategoriesForContext(context: TenantContext): Promise<void> {
  await withTransaction(async (executeQuery) => {
    const existingRows = await executeQuery<{ count: string }>(
      `select count(*)::text as "count" from "Category"
       where "organizationId" = $1 and "financialProfileId" = $2`,
      [context.organizationId, context.financialProfileId],
    );
    const existingCount = Number(existingRows[0]?.count ?? 0);

    if (existingCount > 0) {
      return;
    }

    const now = new Date().toISOString();

    for (const category of DEFAULT_CATEGORIES) {
      const parentCategoryId = randomUUID();

      await insertCategorySeed(executeQuery, context, {
        id: parentCategoryId,
        parentCategoryId: null,
        name: category.name,
        kind: category.kind,
        now,
      });

      for (const childName of category.children ?? []) {
        await insertCategorySeed(executeQuery, context, {
          id: randomUUID(),
          parentCategoryId,
          name: childName,
          kind: category.kind,
          now,
        });
      }
    }
  });
}

async function insertCategorySeed(
  executeQuery: typeof query,
  context: TenantContext,
  input: {
    id: EntityId;
    parentCategoryId: EntityId | null;
    name: string;
    kind: CategoryKind;
    now: string;
  },
): Promise<void> {
  await executeQuery(
    `insert into "Category"
      ("id", "organizationId", "financialProfileId", "parentCategoryId", "name", "kind", "status",
       "createdAt", "updatedAt", "createdByUserId", "updatedByUserId")
     values ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7, $7, $8, $8)`,
    [
      input.id,
      context.organizationId,
      context.financialProfileId,
      input.parentCategoryId,
      input.name,
      input.kind.toUpperCase(),
      input.now,
      context.userId,
    ],
  );
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

async function countCategoryDeleteBlockers(
  executeQuery: typeof query,
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
