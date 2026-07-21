import {
  buildImportPayloadFingerprint,
  parseTransactionExtractionPayload,
  type EntityId,
  type TenantContext,
  type TransactionExtractionPayload,
} from "@solverfin/domain";

import { query } from "./db.js";
import {
  approveTransferAfterRejectedCandidates,
  type RejectedCandidateTransferApprovalResolution,
} from "./import-transfer-rejected-candidate-approval.js";
import {
  ImportReviewError,
  approveImportSuggestionForContext,
  getImportBatchDetailForContext,
  type BulkImportReviewResult,
  type ImportReviewDecisionResult,
} from "./repositories/imports.js";

interface SourceSuggestionProbeRow {
  status: string;
  payload: unknown;
}

interface QueueSuggestionProbeRow extends SourceSuggestionProbeRow {
  kind: string;
  sourceEntityId: string | null;
  provider: string | null;
}

export async function approveImportSuggestionFromQueueRespectingRejectedCandidatesForContext(
  context: TenantContext,
  suggestionId: EntityId,
): Promise<Pick<ImportReviewDecisionResult, "suggestion" | "transaction"> | undefined> {
  const rows = await query<QueueSuggestionProbeRow>(
    `select "kind", "status", "sourceEntityId", "provider", "payload" from "AiSuggestion"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [suggestionId, context.organizationId, context.financialProfileId],
  );
  const suggestion = rows[0];
  if (
    suggestion?.kind !== "TRANSACTION_EXTRACTION" ||
    suggestion.sourceEntityId === null ||
    suggestion.provider?.startsWith("solverfin-import") !== true ||
    parseTransactionExtractionPayload(suggestion.payload) === undefined
  ) {
    return undefined;
  }

  const decision = await approveImportSuggestionRespectingRejectedCandidatesForContext(
    context,
    suggestion.sourceEntityId,
    suggestionId,
  );
  return decision.transaction === undefined
    ? { suggestion: decision.suggestion }
    : { suggestion: decision.suggestion, transaction: decision.transaction };
}

export async function approveSelectedImportSuggestionsRespectingRejectedCandidatesForContext(
  context: TenantContext,
  importBatchId: EntityId,
  suggestionIds: readonly EntityId[],
): Promise<BulkImportReviewResult> {
  validateSelection(suggestionIds);

  const results: BulkImportReviewResult["results"][number][] = [];
  const failures: BulkImportReviewResult["failures"][number][] = [];
  const summary = {
    requested: suggestionIds.length,
    approved: 0,
    failed: 0,
    created: 0,
    reconciled: 0,
    idempotent: 0,
    blocked: 0,
    transferCount: 0,
    transferTotalMinor: 0,
  };

  for (const suggestionId of suggestionIds) {
    try {
      const decision =
        await approveImportSuggestionRespectingRejectedCandidatesForContext(
          context,
          importBatchId,
          suggestionId,
        );
      summary.approved += 1;
      if (decision.outcome === "created") summary.created += 1;
      if (decision.outcome === "reconciled") summary.reconciled += 1;
      if (decision.outcome === "idempotent") summary.idempotent += 1;
      if (decision.suggestion.payload?.kind === "transfer") {
        summary.transferCount += 1;
        summary.transferTotalMinor += decision.suggestion.payload.amountMinor;
      }
      results.push({
        suggestionId,
        status: "approved",
        outcome: decision.outcome,
        decision,
      });
    } catch (error) {
      if (error instanceof ImportReviewError && error.statusCode < 500) {
        const failure = { suggestionId, code: error.code, message: error.message };
        const outcome =
          error.code === "IMPORT_REVIEW_CANDIDATE_PENDING" ? "blocked" : "failed";
        if (outcome === "blocked") summary.blocked += 1;
        failures.push(failure);
        results.push({
          suggestionId,
          status: "failed",
          outcome,
          error: { code: error.code, message: error.message },
        });
        continue;
      }
      throw error;
    }
  }

  summary.failed = failures.length;
  const detail = await getImportBatchDetailForContext(context, importBatchId);
  return { importBatch: detail.importBatch, summary, results, failures };
}

export async function approveImportSuggestionRespectingRejectedCandidatesForContext(
  context: TenantContext,
  importBatchId: EntityId,
  suggestionId: EntityId,
): Promise<ImportReviewDecisionResult> {
  const probeRows = await query<SourceSuggestionProbeRow>(
    `select "status", "payload" from "AiSuggestion"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
       and "sourceEntityId" = $4 and "kind" = 'TRANSACTION_EXTRACTION'`,
    [suggestionId, context.organizationId, context.financialProfileId, importBatchId],
  );
  const probe = probeRows[0];
  const payload = probe ? parseTransactionExtractionPayload(probe.payload) : undefined;

  if (
    probe?.status !== "PENDING_REVIEW" ||
    payload?.kind !== "transfer" ||
    !(await hasRejectedCandidateWithoutPendingDecision(context, suggestionId, payload))
  ) {
    return approveImportSuggestionForContext(context, importBatchId, suggestionId);
  }

  const resolution = await approveTransferAfterRejectedCandidates(
    context,
    importBatchId,
    suggestionId,
  );
  if (resolution.delegate) {
    return approveImportSuggestionForContext(context, importBatchId, suggestionId);
  }
  return loadResolvedDecision(context, importBatchId, suggestionId, resolution);
}

async function loadResolvedDecision(
  context: TenantContext,
  importBatchId: EntityId,
  suggestionId: EntityId,
  resolution: RejectedCandidateTransferApprovalResolution,
): Promise<ImportReviewDecisionResult> {
  const detail = await getImportBatchDetailForContext(context, importBatchId);
  const suggestion = detail.suggestions.find((candidate) => candidate.id === suggestionId);
  const transaction = suggestion?.transaction;

  if (
    suggestion === undefined ||
    transaction === undefined ||
    transaction.id !== resolution.transactionId
  ) {
    throw new ImportReviewError(
      "IMPORT_APPROVED_TRANSACTION_MISSING",
      "O lancamento confirmado nao foi encontrado. Atualize a importacao antes de tentar novamente.",
      409,
      { importBatchId, suggestionId },
    );
  }

  return {
    suggestion,
    transaction,
    importBatch: detail.importBatch,
    idempotent: resolution.idempotent,
    outcome: resolution.outcome,
  };
}

async function hasRejectedCandidateWithoutPendingDecision(
  context: TenantContext,
  suggestionId: EntityId,
  payload: TransactionExtractionPayload,
): Promise<boolean> {
  const rows = await query<{ rejected: boolean; pending: boolean }>(
    `select
       exists(
         select 1 from "AiSuggestion"
         where "organizationId" = $1 and "financialProfileId" = $2
           and "sourceSuggestionId" = $3 and "payloadFingerprint" = $4
           and "kind" in ('DEDUPLICATION', 'RECONCILIATION') and "status" = 'REJECTED'
           and "targetEntityId" is not null
       ) as "rejected",
       exists(
         select 1 from "AiSuggestion"
         where "organizationId" = $1 and "financialProfileId" = $2
           and "sourceSuggestionId" = $3 and "payloadFingerprint" = $4
           and "kind" in ('DEDUPLICATION', 'RECONCILIATION') and "status" = 'PENDING_REVIEW'
       ) as "pending"`,
    [
      context.organizationId,
      context.financialProfileId,
      suggestionId,
      buildImportPayloadFingerprint(payload),
    ],
  );
  return (rows[0]?.rejected ?? false) && !(rows[0]?.pending ?? false);
}

function validateSelection(suggestionIds: readonly EntityId[]): void {
  if (suggestionIds.length === 0) {
    throw new ImportReviewError(
      "IMPORT_REVIEW_SELECTION_REQUIRED",
      "Selecione ao menos uma linha valida para confirmar.",
    );
  }
  if (new Set(suggestionIds).size !== suggestionIds.length) {
    throw new ImportReviewError(
      "IMPORT_REVIEW_DUPLICATE_SELECTION",
      "A selecao nao pode repetir a mesma linha.",
    );
  }
}
