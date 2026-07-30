import { randomUUID } from "node:crypto";

import {
  buildTransactionExtractionPayload,
  type AiSuggestion,
  type ImportBatch,
  type ImportPreview,
  type ImportProblem,
  type TenantContext,
  type TransactionExtractionPayload,
} from "@solverfin/domain";

import { query, withSharedTransaction, type QueryExecutor } from "../db.js";
import { buildInsertAiSuggestionSql } from "./ai-suggestion-sql.js";
import { insertAuditLogEntry } from "./audit.js";
import { getImportBatchDetailForContext, type CreateImportBatchResult } from "./imports.js";
import {
  buildOfxBatchAuditEntry,
  buildOfxConsentAuditEntry,
  buildOfxSuggestionAuditEntry,
} from "./ofx-import-audit.js";
import {
  buildInsertOfxImportBatchSql,
  buildOfxAiSuggestionParams,
  buildOfxImportBatchParams,
} from "./ofx-import-sql.js";
import type { OfxImportPayload } from "./ofx-import-types.js";

interface ImportBatchIdRow {
  id: string;
}

const OFX_PROVIDER = "solverfin-import-ofx";
const OFX_MODEL = "ofx-parser-v1";
const OFX_CONFIGURATION_WARNING: ImportProblem = {
  rowNumber: 0,
  severity: "warning",
  code: "IMPORT_BATCH_CONFIGURATION_CHANGED",
  message: "O mesmo conteudo OFX ja foi usado em outra importacao ou conta.",
};

export async function persistOfxImportBatchForContext(
  context: TenantContext,
  payload: OfxImportPayload,
  preview: ImportPreview,
): Promise<CreateImportBatchResult> {
  const duplicateId = await findImportBatchIdBySourceHash(context, preview.batch.sourceHash, query);
  if (duplicateId !== undefined) return duplicateResult(context, duplicateId);

  const now = preview.batch.receivedAt;
  const batch: ImportBatch = {
    id: randomUUID(),
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    sourceKind: "ofx",
    status: "reviewing",
    originalFileName: payload.originalFileName,
    sourceHash: preview.batch.sourceHash,
    contentHash: preview.batch.contentHash,
    defaultAccountId: payload.accountId,
    totalRows: preview.batch.totalRows,
    validRows: preview.batch.validRows,
    duplicateRows: 0,
    problemRows: preview.batch.problemRows,
    problems: [...preview.problems],
    receivedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  const suggestions = preview.suggestions.map((suggestion) => {
    const extractionPayload = buildTransactionExtractionPayload(suggestion);
    const aiSuggestion: AiSuggestion = {
      id: randomUUID(),
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      kind: "transaction_extraction",
      status: "pending_review",
      sourceEntityId: batch.id,
      confidence: 1,
      explanation: `Linha OFX ${suggestion.sourceRowNumber} importada e pronta para revisao humana.`,
      payload: extractionPayload,
      provider: OFX_PROVIDER,
      model: OFX_MODEL,
      createdAt: now,
      updatedAt: now,
    };
    return aiSuggestion;
  });

  const insertedBatch = await withSharedTransaction(async (executeQuery) => {
    await lockOfxContentConfiguration(context, preview.batch.contentHash, executeQuery);
    const sameContentId = await findImportBatchIdByContentHash(
      context,
      preview.batch.contentHash,
      executeQuery,
    );
    const batchToPersist: ImportBatch =
      sameContentId === undefined
        ? batch
        : {
            ...batch,
            problems: [...(batch.problems ?? []), OFX_CONFIGURATION_WARNING],
          };

    const insertedRows = await executeQuery<ImportBatchIdRow>(
      buildInsertOfxImportBatchSql(),
      buildOfxImportBatchParams(batchToPersist),
    );
    if (insertedRows.length === 0) return undefined;

    await insertAuditLogEntry(executeQuery, buildOfxBatchAuditEntry(batchToPersist));
    await insertAuditLogEntry(executeQuery, buildOfxConsentAuditEntry(context, batchToPersist));
    for (const suggestion of suggestions) {
      await executeQuery(buildInsertAiSuggestionSql(), buildOfxAiSuggestionParams(suggestion));
      await insertAuditLogEntry(executeQuery, buildOfxSuggestionAuditEntry(suggestion));
    }
    return batchToPersist;
  });

  if (insertedBatch === undefined) {
    const concurrentId = await findImportBatchIdBySourceHash(
      context,
      preview.batch.sourceHash,
      query,
    );
    if (concurrentId === undefined) {
      throw new Error("OFX import conflict did not converge to an existing batch.");
    }
    return duplicateResult(context, concurrentId);
  }

  return {
    importBatch: insertedBatch,
    suggestions: suggestions.map((suggestion) => ({
      ...suggestion,
      payload: suggestion.payload as TransactionExtractionPayload,
      candidates: [],
    })),
    problems: insertedBatch.problems ?? [],
    duplicateBatch: false,
  };
}

async function lockOfxContentConfiguration(
  context: TenantContext,
  contentHash: string,
  executeQuery: QueryExecutor,
): Promise<void> {
  await executeQuery("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `ofx:${context.organizationId}:${context.financialProfileId}:${contentHash}`,
  ]);
}

async function findImportBatchIdBySourceHash(
  context: TenantContext,
  sourceHash: string,
  executeQuery: QueryExecutor,
): Promise<string | undefined> {
  const rows = await executeQuery<ImportBatchIdRow>(
    `select "id" from "ImportBatch"
     where "organizationId" = $1 and "financialProfileId" = $2 and "sourceHash" = $3
     order by "createdAt" asc limit 1`,
    [context.organizationId, context.financialProfileId, sourceHash],
  );
  return rows[0]?.id;
}

async function findImportBatchIdByContentHash(
  context: TenantContext,
  contentHash: string,
  executeQuery: QueryExecutor,
): Promise<string | undefined> {
  const rows = await executeQuery<ImportBatchIdRow>(
    `select "id" from "ImportBatch"
     where "organizationId" = $1 and "financialProfileId" = $2 and "contentHash" = $3
     order by "createdAt" asc limit 1`,
    [context.organizationId, context.financialProfileId, contentHash],
  );
  return rows[0]?.id;
}

async function duplicateResult(
  context: TenantContext,
  importBatchId: string,
): Promise<CreateImportBatchResult> {
  const detail = await getImportBatchDetailForContext(context, importBatchId);
  return {
    ...detail,
    problems: [
      ...detail.problems,
      {
        rowNumber: 0,
        severity: "warning",
        code: "IMPORT_BATCH_DUPLICATE",
        message: "Este arquivo OFX ja foi importado para a mesma conta.",
      },
    ],
    duplicateBatch: true,
  };
}
