import type { TenantContext } from "@solverfin/domain";

import {
  approveImportSuggestionRespectingRejectedCandidatesForContext,
  approveSelectedImportSuggestionsRespectingRejectedCandidatesForContext,
} from "./import-transfer-approval.js";
import {
  ImportReviewError,
  createCsvImportBatchForContext,
  getImportBatchDetailForContext,
  type BulkImportReviewResult,
  type CreateCsvImportBatchPayload,
  type CreateImportBatchResult,
  type ImportBatchDetail,
  type ImportReviewDecisionResult,
} from "./repositories/imports.js";

export async function createConsistentCsvImportBatchForContext(
  context: TenantContext,
  payload: CreateCsvImportBatchPayload,
): Promise<CreateImportBatchResult> {
  const result = await createCsvImportBatchForContext(context, payload);
  assertImportBatchConsistency(result);
  return result;
}

export async function getConsistentImportBatchDetailForContext(
  context: TenantContext,
  importBatchId: string,
): Promise<ImportBatchDetail> {
  const detail = await getImportBatchDetailForContext(context, importBatchId);
  assertImportBatchConsistency(detail);
  return detail;
}

export async function approveConsistentImportSuggestionForContext(
  context: TenantContext,
  importBatchId: string,
  suggestionId: string,
): Promise<ImportReviewDecisionResult> {
  try {
    const result = await approveImportSuggestionRespectingRejectedCandidatesForContext(
      context,
      importBatchId,
      suggestionId,
    );
    assertDecisionConsistency(result, importBatchId, suggestionId);
    return result;
  } catch (error) {
    if (error instanceof ImportReviewError && error.statusCode < 500) {
      const detail = await getImportBatchDetailForContext(context, importBatchId);
      assertImportBatchConsistency(detail, suggestionId);
    }
    throw error;
  }
}

export async function approveConsistentSelectedImportSuggestionsForContext(
  context: TenantContext,
  importBatchId: string,
  suggestionIds: readonly string[],
): Promise<BulkImportReviewResult> {
  const result = await approveSelectedImportSuggestionsRespectingRejectedCandidatesForContext(
    context,
    importBatchId,
    suggestionIds,
  );
  for (const item of result.results) {
    if (item.status === "approved" && item.decision !== undefined) {
      assertDecisionConsistency(item.decision, importBatchId, item.suggestionId);
    }
  }

  const failedIds = new Set(
    result.results.filter((item) => item.status === "failed").map((item) => item.suggestionId),
  );
  if (failedIds.size === 0) return result;

  const detail = await getImportBatchDetailForContext(context, importBatchId);
  const missingBySuggestion = new Map<string, ImportReviewError>();
  for (const suggestion of detail.suggestions) {
    if (!failedIds.has(suggestion.id) || suggestion.status !== "approved") continue;
    if (
      suggestion.transaction === undefined ||
      suggestion.targetEntityId !== suggestion.transaction.id
    ) {
      missingBySuggestion.set(
        suggestion.id,
        approvedTransactionMissing(importBatchId, suggestion.id),
      );
    }
  }
  if (missingBySuggestion.size === 0) return result;

  return {
    ...result,
    results: result.results.map((item) => {
      const missing = missingBySuggestion.get(item.suggestionId);
      return missing === undefined
        ? item
        : { ...item, error: { code: missing.code, message: missing.message } };
    }),
    failures: result.failures.map((failure) => {
      const missing = missingBySuggestion.get(failure.suggestionId);
      return missing === undefined
        ? failure
        : { ...failure, code: missing.code, message: missing.message };
    }),
  };
}

function assertImportBatchConsistency(detail: ImportBatchDetail, onlySuggestionId?: string): void {
  for (const suggestion of detail.suggestions) {
    if (onlySuggestionId !== undefined && suggestion.id !== onlySuggestionId) continue;
    if (suggestion.status !== "approved") continue;
    assertApprovedSuggestionConsistency(
      detail.importBatch.id,
      suggestion.id,
      suggestion.targetEntityId,
      suggestion.transaction,
    );
  }
}

function assertDecisionConsistency(
  result: ImportReviewDecisionResult,
  importBatchId: string,
  suggestionId: string,
): void {
  if (result.suggestion.status !== "approved") return;
  assertApprovedSuggestionConsistency(
    importBatchId,
    suggestionId,
    result.suggestion.targetEntityId,
    result.transaction,
  );
}

function assertApprovedSuggestionConsistency(
  importBatchId: string,
  suggestionId: string,
  targetEntityId: string | undefined,
  transaction: ImportReviewDecisionResult["transaction"],
): void {
  if (transaction === undefined || targetEntityId !== transaction.id) {
    throw approvedTransactionMissing(importBatchId, suggestionId);
  }
}

function approvedTransactionMissing(
  importBatchId: string,
  suggestionId: string,
): ImportReviewError {
  return new ImportReviewError(
    "IMPORT_APPROVED_TRANSACTION_MISSING",
    "O lançamento confirmado não foi encontrado. Atualize a importação antes de tentar novamente.",
    409,
    { importBatchId, suggestionId },
  );
}
