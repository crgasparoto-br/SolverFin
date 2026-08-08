import { createHash, randomUUID } from "node:crypto";

import {
  ignoreCategoryLearning,
  recordCategoryCorrection,
  revertCategoryLearning,
  type Category,
  type CategoryLearningEntry,
  type CategoryLearningStatus,
  type CategorySuggestionTarget,
  type TenantContext,
  type TransactionKind,
} from "@solverfin/domain";
import {
  readAiSuggestionPayload,
  type TransactionExtractionSuggestionPayload,
} from "@solverfin/domain/ai-suggestion-payloads";

import { query, withTransaction, type QueryExecutor } from "../db.js";

export interface CategoryCorrectionInput {
  target: CategorySuggestionTarget;
  categoryId: string;
  correlationId?: string;
  sourceSuggestionId?: string;
  sourceFingerprint?: string;
}

interface CategoryLearningRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  merchantKey: string;
  transactionKind: string;
  categoryId: string;
  status: string;
  confidence: string | number;
  correctionCount: number;
  lastCorrectedAt: Date;
  lastSourceSuggestionId: string | null;
  lastSourceFingerprint: string | null;
  ignoredAt: Date | null;
  revertedAt: Date | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CategoryRow {
  id: string;
  name: string;
  kind: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

interface SuggestionRow {
  payload: unknown;
}

const SELECT_COLUMNS = `"id", "organizationId", "financialProfileId", "merchantKey", "transactionKind",
  "categoryId", "status", "confidence", "correctionCount", "lastCorrectedAt", "lastSourceSuggestionId",
  "lastSourceFingerprint", "ignoredAt", "revertedAt", "createdByUserId", "updatedByUserId", "createdAt", "updatedAt"`;

export class CategoryLearningRepositoryError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = "CategoryLearningRepositoryError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export async function listCategoryLearningForContext(
  context: TenantContext,
  status: CategoryLearningStatus | "all" = "all",
): Promise<CategoryLearningEntry[]> {
  const rows = await query<CategoryLearningRow>(
    `select ${SELECT_COLUMNS} from "CategoryLearningEntry"
     where "organizationId" = $1 and "financialProfileId" = $2
     order by "updatedAt" desc, "createdAt" desc`,
    [context.organizationId, context.financialProfileId],
  );

  return rows
    .map(mapCategoryLearningRow)
    .filter((entry) => status === "all" || entry.status === status);
}

export async function recordCategoryCorrectionFromSuggestionForContext(
  context: TenantContext,
  suggestionId: string,
  categoryId: string,
  correlationId?: string,
): Promise<CategoryLearningEntry> {
  const rows = await query<SuggestionRow>(
    `select "payload" from "AiSuggestion"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
       and "kind" = 'TRANSACTION_EXTRACTION'`,
    [suggestionId, context.organizationId, context.financialProfileId],
  );
  const payload = rows[0] ? readCurrentTransactionExtractionPayload(rows[0].payload) : undefined;

  if (payload === undefined) {
    throw new CategoryLearningRepositoryError(
      "CATEGORY_LEARNING_SOURCE_NOT_FOUND",
      "A sugestao usada como origem da correcao nao esta disponivel neste perfil.",
      404,
    );
  }

  return recordCategoryCorrectionForContext(context, {
    target: {
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      transactionKind: payload.kind,
      description: payload.description,
      amountMinor: payload.amountMinor,
    },
    categoryId,
    sourceSuggestionId: suggestionId,
    sourceFingerprint: payload.fingerprint,
    ...(correlationId === undefined ? {} : { correlationId }),
  });
}

export async function recordCategoryCorrectionForContext(
  context: TenantContext,
  input: CategoryCorrectionInput,
): Promise<CategoryLearningEntry> {
  if (
    input.target.organizationId !== context.organizationId ||
    input.target.financialProfileId !== context.financialProfileId
  ) {
    throw new CategoryLearningRepositoryError(
      "CATEGORY_LEARNING_SCOPE_INVALID",
      "A correcao precisa pertencer ao perfil financeiro ativo.",
      403,
    );
  }

  if ((input.sourceSuggestionId === undefined) !== (input.sourceFingerprint === undefined)) {
    throw new CategoryLearningRepositoryError(
      "CATEGORY_LEARNING_PROVENANCE_INVALID",
      "A proveniencia da correcao precisa estar completa.",
    );
  }

  return withTransaction(async (executeQuery) => {
    const category = await requireActiveCategory(
      executeQuery,
      context,
      input.categoryId,
      input.target.transactionKind,
    );
    const merchantKey = normalizeLearningKey(input.target);
    const merchantKeyHash = hashLearningKey(merchantKey);

    await executeQuery(`select pg_advisory_xact_lock(hashtext($1), hashtext($2))`, [
      `${context.organizationId}:${context.financialProfileId}`,
      `${merchantKeyHash}:${input.target.transactionKind}:${input.categoryId}`,
    ]);

    const existingRows = await executeQuery<CategoryLearningRow>(
      `select ${SELECT_COLUMNS} from "CategoryLearningEntry"
       where "organizationId" = $1 and "financialProfileId" = $2
         and "merchantKeyHash" = $3 and "merchantKey" = $4
         and "transactionKind" = $5 and "categoryId" = $6
       for update`,
      [
        context.organizationId,
        context.financialProfileId,
        merchantKeyHash,
        merchantKey,
        input.target.transactionKind,
        input.categoryId,
      ],
    );
    const existing = existingRows[0] ? mapCategoryLearningRow(existingRows[0]) : undefined;
    const now = new Date().toISOString();
    const entry = recordCategoryCorrection({
      id: existing?.id ?? randomUUID(),
      context,
      now,
      target: input.target,
      correctedCategory: category,
      ...(existing === undefined ? {} : { existingLearning: existing }),
    });

    await persistCategoryLearningEntry(
      executeQuery,
      entry,
      existing !== undefined,
      input.sourceSuggestionId,
      input.sourceFingerprint,
    );
    await insertLearningAuditEvent(
      executeQuery,
      context,
      entry.id,
      "recorded",
      input.correlationId,
      input.sourceSuggestionId,
      input.sourceFingerprint,
    );
    return entry;
  });
}

export async function ignoreCategoryLearningForContext(
  context: TenantContext,
  entryId: string,
  correlationId?: string,
): Promise<CategoryLearningEntry> {
  return mutateLearningEntry(context, entryId, "ignored", correlationId);
}

export async function revertCategoryLearningForContext(
  context: TenantContext,
  entryId: string,
  correlationId?: string,
): Promise<CategoryLearningEntry> {
  return mutateLearningEntry(context, entryId, "reverted", correlationId);
}

async function mutateLearningEntry(
  context: TenantContext,
  entryId: string,
  action: "ignored" | "reverted",
  correlationId?: string,
): Promise<CategoryLearningEntry> {
  return withTransaction(async (executeQuery) => {
    const rows = await executeQuery<CategoryLearningRow>(
      `select ${SELECT_COLUMNS} from "CategoryLearningEntry"
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
       for update`,
      [entryId, context.organizationId, context.financialProfileId],
    );
    const current = rows[0] ? mapCategoryLearningRow(rows[0]) : undefined;

    if (current === undefined) {
      throw new CategoryLearningRepositoryError(
        "CATEGORY_LEARNING_NOT_FOUND",
        "Aprendizado nao encontrado no perfil financeiro ativo.",
        404,
      );
    }

    const now = new Date().toISOString();
    const updated =
      action === "ignored"
        ? ignoreCategoryLearning(context, current, now)
        : revertCategoryLearning(context, current, now);

    await executeQuery(
      `update "CategoryLearningEntry"
       set "status" = $4, "ignoredAt" = $5, "revertedAt" = $6,
           "updatedByUserId" = $7, "updatedAt" = $8
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
      [
        updated.id,
        context.organizationId,
        context.financialProfileId,
        updated.status,
        updated.ignoredAt ?? null,
        updated.revertedAt ?? null,
        context.userId,
        updated.updatedAt,
      ],
    );
    await insertLearningAuditEvent(executeQuery, context, updated.id, action, correlationId);
    return updated;
  });
}

async function requireActiveCategory(
  executeQuery: QueryExecutor,
  context: TenantContext,
  categoryId: string,
  transactionKind: TransactionKind,
): Promise<Category> {
  const rows = await executeQuery<CategoryRow>(
    `select "id", "name", "kind", "status", "createdAt", "updatedAt"
     from "Category"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
     for share`,
    [categoryId, context.organizationId, context.financialProfileId],
  );
  const row = rows[0];
  const kind = row?.kind.toLowerCase();

  if (row === undefined || row.status.toLowerCase() !== "active" || kind !== transactionKind) {
    throw new CategoryLearningRepositoryError(
      "CATEGORY_LEARNING_CATEGORY_UNAVAILABLE",
      "A categoria escolhida nao esta disponivel para este tipo de lancamento.",
      422,
    );
  }

  return {
    id: row.id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    name: row.name,
    kind: kind as Category["kind"],
    status: "active",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function persistCategoryLearningEntry(
  executeQuery: QueryExecutor,
  entry: CategoryLearningEntry,
  exists: boolean,
  sourceSuggestionId?: string,
  sourceFingerprint?: string,
): Promise<void> {
  if (!exists) {
    const merchantKeyHash = hashLearningKey(entry.merchantKey);
    await executeQuery(
      `insert into "CategoryLearningEntry"
        ("id", "organizationId", "financialProfileId", "merchantKey", "merchantKeyHash", "transactionKind", "categoryId",
         "status", "confidence", "correctionCount", "lastCorrectedAt", "lastSourceSuggestionId",
         "lastSourceFingerprint", "ignoredAt", "revertedAt", "createdByUserId", "updatedByUserId", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, null, null, $14, $15, $16, $17)`,
      [
        entry.id,
        entry.organizationId,
        entry.financialProfileId,
        entry.merchantKey,
        merchantKeyHash,
        entry.transactionKind,
        entry.categoryId,
        entry.status,
        entry.confidence,
        entry.correctionCount,
        entry.lastCorrectedAt,
        sourceSuggestionId ?? null,
        sourceFingerprint ?? null,
        entry.createdByUserId ?? null,
        entry.updatedByUserId ?? null,
        entry.createdAt,
        entry.updatedAt,
      ],
    );
    return;
  }

  await executeQuery(
    `update "CategoryLearningEntry"
     set "status" = $4, "confidence" = $5, "correctionCount" = $6, "lastCorrectedAt" = $7,
         "lastSourceSuggestionId" = coalesce($8, "lastSourceSuggestionId"),
         "lastSourceFingerprint" = coalesce($9, "lastSourceFingerprint"),
         "ignoredAt" = null, "revertedAt" = null, "updatedByUserId" = $10, "updatedAt" = $11
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [
      entry.id,
      entry.organizationId,
      entry.financialProfileId,
      entry.status,
      entry.confidence,
      entry.correctionCount,
      entry.lastCorrectedAt,
      sourceSuggestionId ?? null,
      sourceFingerprint ?? null,
      entry.updatedByUserId ?? null,
      entry.updatedAt,
    ],
  );
}

async function insertLearningAuditEvent(
  executeQuery: QueryExecutor,
  context: TenantContext,
  entryId: string,
  action: "recorded" | "ignored" | "reverted",
  correlationId?: string,
  sourceSuggestionId?: string,
  sourceFingerprint?: string,
): Promise<void> {
  await executeQuery(
    `insert into "SecurityAuditEvent"
      ("id", "userId", "sessionId", "occurredAt", "action", "result", "correlationId", "metadata")
     values ($1, $2, null, clock_timestamp(), 'CATEGORY_LEARNING_UPDATED', $3, $4, $5::jsonb)`,
    [
      randomUUID(),
      context.userId,
      action.toUpperCase(),
      correlationId ?? null,
      JSON.stringify({
        organizationId: context.organizationId,
        financialProfileId: context.financialProfileId,
        entryId,
        action,
        ...(sourceSuggestionId === undefined ? {} : { sourceSuggestionId }),
        ...(sourceFingerprint === undefined ? {} : { sourceFingerprint }),
      }),
    ],
  );
}

function normalizeLearningKey(target: CategorySuggestionTarget): string {
  const value = target.merchant ?? target.description;
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function hashLearningKey(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function mapCategoryLearningRow(row: CategoryLearningRow): CategoryLearningEntry {
  const status = row.status.toLowerCase() as CategoryLearningStatus;
  return {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    merchantKey: row.merchantKey,
    transactionKind: row.transactionKind.toLowerCase() as TransactionKind,
    categoryId: row.categoryId,
    status,
    confidence: Number(row.confidence),
    correctionCount: row.correctionCount,
    lastCorrectedAt: row.lastCorrectedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.ignoredAt === null ? {} : { ignoredAt: row.ignoredAt.toISOString() }),
    ...(row.revertedAt === null ? {} : { revertedAt: row.revertedAt.toISOString() }),
    ...(row.createdByUserId === null ? {} : { createdByUserId: row.createdByUserId }),
    ...(row.updatedByUserId === null ? {} : { updatedByUserId: row.updatedByUserId }),
  };
}

function readCurrentTransactionExtractionPayload(
  value: unknown,
): TransactionExtractionSuggestionPayload | undefined {
  const result = readAiSuggestionPayload(value, "transaction_extraction");
  if (result.state !== "current") return undefined;
  return result.payload.suggestionKind === "transaction_extraction" ? result.payload : undefined;
}
