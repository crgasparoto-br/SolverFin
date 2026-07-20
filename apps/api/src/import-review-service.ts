import type {
  CreateCsvImportBatchPayload,
  CreateImportBatchResult,
  ImportBatchDetail,
  ImportReviewDecisionResult,
  BulkImportReviewResult,
} from "./repositories/imports.js";
import {
  ImportReviewError,
  approveImportSuggestionForContext,
  approveSelectedImportSuggestionsForContext,
  createCsvImportBatchForContext,
  getImportBatchDetailForContext,
} from "./repositories/imports.js";
import type { TenantContext } from "@solverfin/domain";

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
    const result = await approveImportSuggestionForContext(
      context,
      importBatchId,
      suggestionId,
    );
    assertDecisionConsistency(result, importBatchId, suggestionId);
    return result;
  } catch (error) {
    if (
      error instanceof ImportReviewError &&
      error.code === "IMPORT_REVIEW_INVALID_TRANSITION"
    ) {
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
  const before = await getImportBatchDetailForContext(context, importBatchId);
  assertImportBatchConsistency(before);

  const result = await approveSelectedImportSuggestionsForContext(
    context,
    importBatchId,
    suggestionIds,
  );
  for (const item of result.results) {
    if (item.status === "approved" && item.decision !== undefined) {
      assertDecisionConsistency(item.decision, importBatchId, item.suggestionId);
    }
  }

  const after = await getImportBatchDetailForContext(context, importBatchId);
  assertImportBatchConsistency(after);
  return result;
}

function assertImportBatchConsistency(
  detail: ImportBatchDetail,
  onlySuggestionId?: string,
): void {
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
    throw new ImportReviewError(
      "IMPORT_APPROVED_TRANSACTION_MISSING",
      "O lançamento confirmado não foi encontrado. Atualize a importação antes de tentar novamente.",
      409,
      { importBatchId, suggestionId },
    );
  }
}
