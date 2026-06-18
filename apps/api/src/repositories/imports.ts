import { randomUUID } from "node:crypto";

import {
  ImportFileError,
  TenantAuthorizationError,
  previewImportedStatement,
  type AiSuggestion,
  type CsvImportMapping,
  type ImportBatch,
  type ImportProblem,
  type ImportSourceKind,
  type ImportStatus,
  type ImportTransactionSuggestion,
  type TenantContext,
} from "@solverfin/domain";

import { query, withTransaction } from "../db.js";

export interface CreateCsvImportBatchPayload {
  originalFileName: string;
  content: string;
  csvMapping?: CsvImportMapping;
}

export interface ListImportBatchesFilters {
  status?: ImportStatus | "all";
  sourceKind?: ImportSourceKind;
}

export interface ImportBatchDetail {
  importBatch: ImportBatch;
  suggestions: AiSuggestion[];
  problems: readonly ImportProblem[];
  duplicateBatch?: boolean;
}

interface ImportBatchRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  sourceKind: string;
  status: string;
  originalFileName: string | null;
  sourceHash: string;
  receivedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AiSuggestionRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  kind: string;
  status: string;
  sourceEntityId: string | null;
  targetEntityId: string | null;
  confidence: string | number;
  explanation: string;
  provider: string | null;
  model: string | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const IMPORT_BATCH_SELECT_COLUMNS = `"id", "organizationId", "financialProfileId", "sourceKind", "status",
  "originalFileName", "sourceHash", "receivedAt", "completedAt", "createdAt", "updatedAt"`;
const AI_SUGGESTION_SELECT_COLUMNS = `"id", "organizationId", "financialProfileId", "kind", "status",
  "sourceEntityId", "targetEntityId", "confidence", "explanation", "provider", "model", "reviewedByUserId",
  "reviewedAt", "createdAt", "updatedAt"`;

export async function listImportBatchesForContext(
  context: TenantContext,
  filters: ListImportBatchesFilters = {},
): Promise<ImportBatch[]> {
  const rows = await query<ImportBatchRow>(
    `select ${IMPORT_BATCH_SELECT_COLUMNS} from "ImportBatch"
     where "organizationId" = $1 and "financialProfileId" = $2
     order by "receivedAt" desc, "createdAt" desc`,
    [context.organizationId, context.financialProfileId],
  );

  return rows.map(mapImportBatchRow).filter((batch) => matchesImportBatchFilters(batch, filters));
}

export async function getImportBatchDetailForContext(
  context: TenantContext,
  importBatchId: string,
): Promise<ImportBatchDetail> {
  const importBatch = await findImportBatchForContext(context, importBatchId);

  if (!importBatch) {
    throw importBatchNotFoundError();
  }

  return {
    importBatch,
    suggestions: await listImportSuggestionsForBatch(context, importBatch.id),
    problems: [],
  };
}

export async function createCsvImportBatchForContext(
  context: TenantContext,
  payload: CreateCsvImportBatchPayload,
): Promise<ImportBatchDetail> {
  const now = new Date().toISOString();
  const originalFileName = normalizeCsvFileName(payload.originalFileName);
  const preview = previewImportedStatement(
    payload.csvMapping === undefined
      ? {
          context,
          now,
          originalFileName,
          content: payload.content,
          kind: "csv",
        }
      : {
          context,
          now,
          originalFileName,
          content: payload.content,
          kind: "csv",
          csvMapping: payload.csvMapping,
        },
  );
  const existingImportBatch = await findImportBatchBySourceHash(context, preview.batch.sourceHash);

  if (existingImportBatch) {
    return {
      importBatch: existingImportBatch,
      suggestions: await listImportSuggestionsForBatch(context, existingImportBatch.id),
      problems: [
        {
          rowNumber: 0,
          severity: "warning",
          code: "IMPORT_BATCH_DUPLICATE",
          message: "Este CSV ja foi recebido neste perfil financeiro e nao foi importado novamente.",
        },
      ],
      duplicateBatch: true,
    };
  }

  const importBatch = buildImportBatch(preview.batch, now);
  const uniqueSuggestions = filterDuplicateSuggestionsWithinBatch(preview.suggestions);
  const suggestions = uniqueSuggestions.map((suggestion) =>
    buildAiSuggestionFromImportSuggestion(context, importBatch.id, suggestion, now),
  );

  await withTransaction(async (executeQuery) => {
    await executeQuery(buildInsertImportBatchSql(), buildImportBatchParams(importBatch));

    for (const suggestion of suggestions) {
      await executeQuery(buildInsertAiSuggestionSql(), buildAiSuggestionParams(suggestion));
    }
  });

  return {
    importBatch,
    suggestions,
    problems: preview.problems,
  };
}

async function findImportBatchForContext(
  context: TenantContext,
  importBatchId: string,
): Promise<ImportBatch | undefined> {
  const rows = await query<ImportBatchRow>(
    `select ${IMPORT_BATCH_SELECT_COLUMNS} from "ImportBatch"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [importBatchId, context.organizationId, context.financialProfileId],
  );

  return rows[0] ? mapImportBatchRow(rows[0]) : undefined;
}

async function findImportBatchBySourceHash(
  context: TenantContext,
  sourceHash: string,
): Promise<ImportBatch | undefined> {
  const rows = await query<ImportBatchRow>(
    `select ${IMPORT_BATCH_SELECT_COLUMNS} from "ImportBatch"
     where "organizationId" = $1 and "financialProfileId" = $2 and "sourceHash" = $3`,
    [context.organizationId, context.financialProfileId, sourceHash],
  );

  return rows[0] ? mapImportBatchRow(rows[0]) : undefined;
}

async function listImportSuggestionsForBatch(
  context: TenantContext,
  importBatchId: string,
): Promise<AiSuggestion[]> {
  const rows = await query<AiSuggestionRow>(
    `select ${AI_SUGGESTION_SELECT_COLUMNS} from "AiSuggestion"
     where "organizationId" = $1 and "financialProfileId" = $2 and "sourceEntityId" = $3
       and "kind" = 'TRANSACTION_EXTRACTION'
     order by "createdAt" asc`,
    [context.organizationId, context.financialProfileId, importBatchId],
  );

  return rows.map(mapAiSuggestionRow);
}

function buildImportBatch(draft: Omit<ImportBatch, "id" | "createdAt" | "updatedAt">, now: string): ImportBatch {
  const importBatch: ImportBatch = {
    id: randomUUID(),
    organizationId: draft.organizationId,
    financialProfileId: draft.financialProfileId,
    sourceKind: draft.sourceKind,
    status: draft.status,
    sourceHash: draft.sourceHash,
    receivedAt: draft.receivedAt,
    createdAt: now,
    updatedAt: now,
  };

  if (draft.originalFileName !== undefined) {
    importBatch.originalFileName = draft.originalFileName;
  }

  if (draft.completedAt !== undefined) {
    importBatch.completedAt = draft.completedAt;
  }

  return importBatch;
}

function buildAiSuggestionFromImportSuggestion(
  context: TenantContext,
  importBatchId: string,
  suggestion: ImportTransactionSuggestion,
  now: string,
): AiSuggestion {
  return {
    id: randomUUID(),
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    kind: "transaction_extraction",
    status: "pending_review",
    sourceEntityId: importBatchId,
    confidence: suggestion.status === "duplicate" ? 0.35 : 0.75,
    explanation: buildImportSuggestionExplanation(suggestion),
    provider: "solverfin-import",
    model: "csv-mvp-v1",
    createdAt: now,
    updatedAt: now,
  };
}

function buildImportSuggestionExplanation(suggestion: ImportTransactionSuggestion): string {
  const accountText = suggestion.accountId ? `; conta ${suggestion.accountId}` : "";
  const categoryText = suggestion.categoryId ? `; categoria ${suggestion.categoryId}` : "";

  return (
    `CSV linha ${suggestion.sourceRowNumber}: ${suggestion.occurredOn}; ${suggestion.kind}; ` +
    `${suggestion.amountMinor} centavos; ${suggestion.description}${accountText}${categoryText}. ` +
    "Revise antes de criar o lancamento final."
  ).slice(0, 500);
}

function filterDuplicateSuggestionsWithinBatch(
  suggestions: readonly ImportTransactionSuggestion[],
): ImportTransactionSuggestion[] {
  const seenSourceHashes = new Set<string>();
  const uniqueSuggestions: ImportTransactionSuggestion[] = [];

  for (const suggestion of suggestions) {
    if (seenSourceHashes.has(suggestion.sourceHash)) {
      continue;
    }

    seenSourceHashes.add(suggestion.sourceHash);
    uniqueSuggestions.push(suggestion);
  }

  return uniqueSuggestions;
}

function buildInsertImportBatchSql(): string {
  return `insert into "ImportBatch"
    ("id", "organizationId", "financialProfileId", "sourceKind", "status", "originalFileName", "sourceHash",
     "receivedAt", "completedAt", "createdAt", "updatedAt")
   values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`;
}

function buildImportBatchParams(importBatch: ImportBatch): unknown[] {
  return [
    importBatch.id,
    importBatch.organizationId,
    importBatch.financialProfileId,
    importBatch.sourceKind.toUpperCase(),
    importBatch.status.toUpperCase(),
    importBatch.originalFileName ?? null,
    importBatch.sourceHash,
    importBatch.receivedAt,
    importBatch.completedAt ?? null,
    importBatch.createdAt,
    importBatch.updatedAt,
  ];
}

function buildInsertAiSuggestionSql(): string {
  return `insert into "AiSuggestion"
    ("id", "organizationId", "financialProfileId", "kind", "status", "sourceEntityId", "targetEntityId",
     "confidence", "explanation", "provider", "model", "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt")
   values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`;
}

function buildAiSuggestionParams(suggestion: AiSuggestion): unknown[] {
  return [
    suggestion.id,
    suggestion.organizationId,
    suggestion.financialProfileId,
    suggestion.kind.toUpperCase(),
    suggestion.status.toUpperCase(),
    suggestion.sourceEntityId ?? null,
    suggestion.targetEntityId ?? null,
    suggestion.confidence,
    suggestion.explanation,
    suggestion.provider ?? null,
    suggestion.model ?? null,
    suggestion.reviewedByUserId ?? null,
    suggestion.reviewedAt ?? null,
    suggestion.createdAt,
    suggestion.updatedAt,
  ];
}

function matchesImportBatchFilters(
  importBatch: ImportBatch,
  filters: ListImportBatchesFilters,
): boolean {
  if (filters.status && filters.status !== "all" && importBatch.status !== filters.status) {
    return false;
  }

  if (filters.sourceKind && importBatch.sourceKind !== filters.sourceKind) {
    return false;
  }

  return true;
}

function normalizeCsvFileName(originalFileName: string): string {
  const normalizedFileName = originalFileName.trim() || "importacao.csv";

  if (!normalizedFileName.toLowerCase().endsWith(".csv")) {
    throw new ImportFileError(
      "IMPORT_FILE_KIND_UNSUPPORTED",
      "A importacao inicial do MVP aceita apenas arquivos .csv.",
    );
  }

  return normalizedFileName;
}

function mapImportBatchRow(row: ImportBatchRow): ImportBatch {
  const importBatch: ImportBatch = {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    sourceKind: row.sourceKind.toLowerCase() as ImportSourceKind,
    status: row.status.toLowerCase() as ImportStatus,
    sourceHash: row.sourceHash,
    receivedAt: row.receivedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  if (row.originalFileName !== null) {
    importBatch.originalFileName = row.originalFileName;
  }

  if (row.completedAt !== null) {
    importBatch.completedAt = row.completedAt.toISOString();
  }

  return importBatch;
}

function mapAiSuggestionRow(row: AiSuggestionRow): AiSuggestion {
  const suggestion: AiSuggestion = {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    kind: row.kind.toLowerCase() as AiSuggestion["kind"],
    status: row.status.toLowerCase() as AiSuggestion["status"],
    confidence: Number(row.confidence),
    explanation: row.explanation,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  if (row.sourceEntityId !== null) {
    suggestion.sourceEntityId = row.sourceEntityId;
  }

  if (row.targetEntityId !== null) {
    suggestion.targetEntityId = row.targetEntityId;
  }

  if (row.provider !== null) {
    suggestion.provider = row.provider;
  }

  if (row.model !== null) {
    suggestion.model = row.model;
  }

  if (row.reviewedByUserId !== null) {
    suggestion.reviewedByUserId = row.reviewedByUserId;
  }

  if (row.reviewedAt !== null) {
    suggestion.reviewedAt = row.reviewedAt.toISOString();
  }

  return suggestion;
}

function importBatchNotFoundError(): TenantAuthorizationError {
  return new TenantAuthorizationError(
    "TENANT_RESOURCE_NOT_FOUND",
    "Lote de importacao nao encontrado no perfil financeiro ativo.",
    404,
  );
}
