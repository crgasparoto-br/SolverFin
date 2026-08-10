import {
  buildTransactionDeduplicationCandidate,
  detectDuplicateTransactions,
  previewReconciliation,
  type AiSuggestion,
  type ImportBatch,
  type TenantContext,
  type Transaction,
} from "@solverfin/domain";

import { withSharedTransaction, type QueryExecutor } from "./db.js";
import {
  buildGeneralizedReconciliationSource,
  buildGeneralizedSourceState,
  GENERALIZED_AI_SUGGESTION_COLUMNS,
  GENERALIZED_TRANSACTION_COLUMNS,
  mapGeneralizedSuggestion,
  mapGeneralizedTransaction,
  parseGeneralizedDeterministicKind,
  parseStoredDeterministicPayload,
  requireGeneralizedDeterministicPayload,
  sameDeterministicEvidence,
  type GeneralizedAiSuggestionRow,
  type GeneralizedTransactionRow,
} from "./generalized-deterministic-review-shared.js";
import { insertAuditLogEntry } from "./repositories/audit.js";
import { refreshImportBatchStatusForContext } from "./repositories/imports.js";

export type GeneralizedDeterministicDecisionAction = "approve" | "reject";

export interface GeneralizedDeterministicDecisionInput {
  expectedFingerprint?: string;
  reason?: string;
  correlationId?: string;
}

export interface GeneralizedDeterministicDecisionResult {
  suggestion: AiSuggestion;
  sourceSuggestion?: AiSuggestion;
  transaction?: Transaction;
  importBatch?: ImportBatch;
  idempotent: boolean;
}

interface ImportBatchStateRow {
  id: string;
  status: string;
}

export class GeneralizedDeterministicReviewError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = "GeneralizedDeterministicReviewError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export async function tryHandleGeneralizedDeterministicDecisionForContext(
  context: TenantContext,
  suggestionId: string,
  action: GeneralizedDeterministicDecisionAction,
  input: GeneralizedDeterministicDecisionInput,
): Promise<GeneralizedDeterministicDecisionResult | undefined> {
  return withSharedTransaction(async (executeQuery) => {
    const candidate = await findSuggestion(
      context,
      suggestionId,
      executeQuery,
      true,
    );
    if (candidate === undefined) {
      throw reviewError(
        "AI_REVIEW_SUGGESTION_NOT_FOUND",
        "Sugestão não encontrada no perfil financeiro ativo.",
        404,
      );
    }
    const kind = parseGeneralizedDeterministicKind(candidate.kind);
    if (kind === undefined) return undefined;
    const candidatePayload = requireGeneralizedDeterministicPayload(
      candidate,
      kind,
    );
    if (candidatePayload === undefined) {
      throw reviewError(
        "AI_SUGGESTION_PAYLOAD_INVALID",
        "A sugestão não possui vínculo estruturado válido para esta decisão.",
        422,
      );
    }
    assertExpectedFingerprint(
      candidatePayload.fingerprint,
      input.expectedFingerprint,
    );
    if (isIdempotent(candidate.status, action)) {
      return {
        suggestion: mapGeneralizedSuggestion(candidate),
        idempotent: true,
      };
    }
    assertPending(candidate.status);

    const stored = parseStoredDeterministicPayload(candidate);
    if (stored === undefined) {
      throw reviewError(
        "AI_SUGGESTION_PAYLOAD_INVALID",
        "A sugestão não possui vínculo estruturado válido para esta decisão.",
        422,
      );
    }
    const source = await findSource(
      context,
      stored.sourceSuggestionId,
      executeQuery,
    );
    if (source === undefined) {
      throw reviewError(
        "AI_REVIEW_SOURCE_NOT_FOUND",
        "A origem desta sugestão não está mais disponível.",
        404,
      );
    }
    const sourceState = buildGeneralizedSourceState(source);
    if (sourceState === undefined) {
      throw reviewError(
        "AI_REVIEW_SOURCE_PAYLOAD_UNSUPPORTED",
        "A origem desta sugestão não possui dados estruturados compatíveis para revisão.",
        422,
      );
    }
    if (!sourceState.fingerprints.has(stored.sourcePayloadFingerprint)) {
      throw reviewError(
        "AI_SUGGESTION_PAYLOAD_OBSOLETE",
        "A origem foi alterada. Atualize a fila antes de decidir.",
        409,
      );
    }
    if (source.status !== "PENDING_REVIEW") {
      throw reviewError(
        "AI_REVIEW_INVALID_TRANSITION",
        "A origem já foi resolvida por outra decisão.",
        409,
      );
    }
    const importBatchId = await requireReviewableSourceBatch(
      context,
      source,
      executeQuery,
    );

    if (action === "reject") {
      const now = new Date().toISOString();
      const rejected = await setSuggestionStatus(
        context,
        candidate,
        "REJECTED",
        now,
        executeQuery,
      );
      await auditSuggestionDecision(
        context,
        rejected,
        "reject",
        input.reason?.trim() ||
          "Sugestão determinística rejeitada pelo usuário.",
        now,
        candidatePayload.fingerprint,
        input.correlationId,
        executeQuery,
      );
      return {
        suggestion: rejected,
        ...(await refreshBatchResult(context, importBatchId, executeQuery)),
        idempotent: false,
      };
    }

    const target = await findTarget(
      context,
      stored.targetTransactionId,
      executeQuery,
    );
    if (target === undefined || target.status === "VOIDED") {
      throw reviewError(
        "AI_REVIEW_TARGET_UNAVAILABLE",
        "O lançamento comparado não está mais disponível para esta decisão.",
        409,
      );
    }
    if (kind === "reconciliation" && target.status === "RECONCILED") {
      throw reviewError(
        "AI_REVIEW_TARGET_UNAVAILABLE",
        "O lançamento já foi conciliado por outra decisão.",
        409,
      );
    }
    if (target.updatedAt > candidate.createdAt) {
      throw reviewError(
        "AI_SUGGESTION_PAYLOAD_OBSOLETE",
        "O lançamento comparado foi alterado. Atualize a fila antes de decidir.",
        409,
      );
    }
    const targetTransaction = mapGeneralizedTransaction(target);
    assertCandidateStillMatches(
      context,
      sourceState,
      targetTransaction,
      kind,
      stored,
    );

    const now = new Date().toISOString();
    let transaction: Transaction | undefined;
    let resolvedSource: AiSuggestion;
    if (kind === "deduplication") {
      resolvedSource = await setSuggestionStatus(
        context,
        source,
        "REJECTED",
        now,
        executeQuery,
      );
      await auditSourceDecision(
        context,
        resolvedSource,
        "reject",
        "Origem resolvida como duplicidade de um lançamento existente.",
        now,
        sourceState.preferredFingerprint,
        input.correlationId,
        executeQuery,
      );
    } else {
      transaction = await reconcileTarget(context, target, now, executeQuery);
      resolvedSource = await setSuggestionStatus(
        context,
        source,
        "APPROVED",
        now,
        executeQuery,
        target.id,
      );
      await auditSourceDecision(
        context,
        resolvedSource,
        "approve",
        "Origem vinculada ao lançamento conciliado.",
        now,
        sourceState.preferredFingerprint,
        input.correlationId,
        executeQuery,
      );
      await insertAuditLogEntry(executeQuery, {
        organizationId: context.organizationId,
        financialProfileId: context.financialProfileId,
        occurredAt: now,
        actorKind: "user",
        actorId: context.userId,
        action: "update",
        entityKind: "transaction",
        entityId: target.id,
        ...(input.correlationId === undefined
          ? {}
          : { correlationId: input.correlationId }),
        reason: "Lançamento conciliado a partir de sugestão estruturada revisada.",
        redactedChanges: { status: "changed", reconciledAt: "added" },
      });
    }

    await expireSiblingCandidates(
      context,
      source.id,
      candidate.id,
      now,
      input.correlationId,
      executeQuery,
    );
    const approved = await setSuggestionStatus(
      context,
      candidate,
      "APPROVED",
      now,
      executeQuery,
    );
    await auditSuggestionDecision(
      context,
      approved,
      "approve",
      kind === "deduplication"
        ? "Possível duplicidade confirmada sem criar ou alterar lançamento financeiro."
        : "Conciliação confirmada após revalidar origem e lançamento alvo.",
      now,
      candidatePayload.fingerprint,
      input.correlationId,
      executeQuery,
    );

    return {
      suggestion: approved,
      sourceSuggestion: resolvedSource,
      ...(transaction === undefined ? {} : { transaction }),
      ...(await refreshBatchResult(context, importBatchId, executeQuery)),
      idempotent: false,
    };
  });
}

async function findSuggestion(
  context: TenantContext,
  suggestionId: string,
  executeQuery: QueryExecutor,
  lock: boolean,
): Promise<GeneralizedAiSuggestionRow | undefined> {
  const rows = await executeQuery<GeneralizedAiSuggestionRow>(
    `select ${GENERALIZED_AI_SUGGESTION_COLUMNS} from "AiSuggestion"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3${lock ? " for update" : ""}`,
    [suggestionId, context.organizationId, context.financialProfileId],
  );
  return rows[0];
}

async function findSource(
  context: TenantContext,
  sourceSuggestionId: string,
  executeQuery: QueryExecutor,
): Promise<GeneralizedAiSuggestionRow | undefined> {
  const rows = await executeQuery<GeneralizedAiSuggestionRow>(
    `select ${GENERALIZED_AI_SUGGESTION_COLUMNS} from "AiSuggestion"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
       and "kind" = 'TRANSACTION_EXTRACTION' for update`,
    [sourceSuggestionId, context.organizationId, context.financialProfileId],
  );
  return rows[0];
}

async function findTarget(
  context: TenantContext,
  targetTransactionId: string,
  executeQuery: QueryExecutor,
): Promise<GeneralizedTransactionRow | undefined> {
  const rows = await executeQuery<GeneralizedTransactionRow>(
    `select ${GENERALIZED_TRANSACTION_COLUMNS} from "Transaction"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3 for update`,
    [targetTransactionId, context.organizationId, context.financialProfileId],
  );
  return rows[0];
}

async function requireReviewableSourceBatch(
  context: TenantContext,
  source: GeneralizedAiSuggestionRow,
  executeQuery: QueryExecutor,
): Promise<string | undefined> {
  if (source.sourceEntityId === null) return undefined;
  const rows = await executeQuery<ImportBatchStateRow>(
    `select "id", "status" from "ImportBatch"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3 for update`,
    [source.sourceEntityId, context.organizationId, context.financialProfileId],
  );
  const batch = rows[0];
  if (batch === undefined || batch.status !== "REVIEWING") {
    throw reviewError(
      "AI_REVIEW_SOURCE_DISCARDED",
      "A origem desta sugestão não está mais em revisão.",
      409,
    );
  }
  return batch.id;
}

function assertCandidateStillMatches(
  context: TenantContext,
  source: NonNullable<ReturnType<typeof buildGeneralizedSourceState>>,
  target: Transaction,
  kind: "deduplication" | "reconciliation",
  stored: NonNullable<ReturnType<typeof parseStoredDeterministicPayload>>,
): void {
  const matches = detectDuplicateTransactions({
    context,
    now: new Date().toISOString(),
    candidate: source.candidate,
    existingCandidates: [buildTransactionDeduplicationCandidate(target)],
  });
  const match = matches[0];
  const reasons = match?.reasons.map((reason) => reason.message) ?? [];
  if (
    match === undefined ||
    match.possibleDuplicateId !== target.id ||
    !sameDeterministicEvidence(stored.reasons, reasons)
  ) {
    throw reviewError(
      "AI_SUGGESTION_PAYLOAD_OBSOLETE",
      "As evidências da comparação mudaram. Atualize a fila antes de decidir.",
      409,
    );
  }
  if (kind === "deduplication") return;
  const preview = previewReconciliation({
    context,
    source: buildGeneralizedReconciliationSource(source),
    transaction: target,
  });
  const conflicts = preview.conflicts.map((conflict) => conflict.message);
  if (!sameDeterministicEvidence(stored.conflicts, conflicts)) {
    throw reviewError(
      "AI_SUGGESTION_PAYLOAD_OBSOLETE",
      "Os conflitos da conciliação mudaram. Atualize a fila antes de decidir.",
      409,
    );
  }
}

async function reconcileTarget(
  context: TenantContext,
  row: GeneralizedTransactionRow,
  now: string,
  executeQuery: QueryExecutor,
): Promise<Transaction> {
  await executeQuery(
    `update "Transaction" set "status" = 'RECONCILED', "reconciledAt" = $4,
       "updatedAt" = $4, "updatedByUserId" = $5
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [
      row.id,
      context.organizationId,
      context.financialProfileId,
      now,
      context.userId,
    ],
  );
  return {
    ...mapGeneralizedTransaction(row),
    status: "reconciled",
    reconciledAt: now,
    updatedAt: now,
    updatedByUserId: context.userId,
  };
}

async function setSuggestionStatus(
  context: TenantContext,
  row: GeneralizedAiSuggestionRow,
  status: "APPROVED" | "REJECTED",
  now: string,
  executeQuery: QueryExecutor,
  targetEntityId?: string,
): Promise<AiSuggestion> {
  const rows = await executeQuery<GeneralizedAiSuggestionRow>(
    `update "AiSuggestion" set "status" = $4,
       "targetEntityId" = coalesce($5::uuid, "targetEntityId"),
       "reviewedByUserId" = $6, "reviewedAt" = $7, "updatedAt" = $7
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
     returning ${GENERALIZED_AI_SUGGESTION_COLUMNS}`,
    [
      row.id,
      context.organizationId,
      context.financialProfileId,
      status,
      targetEntityId ?? null,
      context.userId,
      now,
    ],
  );
  if (rows[0] === undefined) {
    throw reviewError(
      "AI_REVIEW_SUGGESTION_NOT_FOUND",
      "Sugestão não encontrada no perfil financeiro ativo.",
      404,
    );
  }
  return mapGeneralizedSuggestion(rows[0]);
}

async function expireSiblingCandidates(
  context: TenantContext,
  sourceSuggestionId: string,
  keepSuggestionId: string,
  now: string,
  correlationId: string | undefined,
  executeQuery: QueryExecutor,
): Promise<void> {
  const rows = await executeQuery<{ id: string }>(
    `update "AiSuggestion" set "status" = 'EXPIRED', "reviewedAt" = $5, "updatedAt" = $5
     where "organizationId" = $1 and "financialProfileId" = $2
       and "sourceSuggestionId" = $3 and "id" <> $4
       and "kind" in ('DEDUPLICATION', 'RECONCILIATION') and "status" = 'PENDING_REVIEW'
     returning "id"`,
    [
      context.organizationId,
      context.financialProfileId,
      sourceSuggestionId,
      keepSuggestionId,
      now,
    ],
  );
  for (const row of rows) {
    await insertAuditLogEntry(executeQuery, {
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      occurredAt: now,
      actorKind: "system",
      action: "update",
      entityKind: "ai_suggestion",
      entityId: row.id,
      ...(correlationId === undefined ? {} : { correlationId }),
      reason: "Candidatura expirada porque outra decisão resolveu a mesma origem.",
      redactedChanges: { status: "changed" },
    });
  }
}

async function auditSuggestionDecision(
  context: TenantContext,
  suggestion: AiSuggestion,
  action: "approve" | "reject",
  reason: string,
  now: string,
  fingerprint: string,
  correlationId: string | undefined,
  executeQuery: QueryExecutor,
): Promise<void> {
  await insertAuditLogEntry(executeQuery, {
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    occurredAt: now,
    actorKind: "user",
    actorId: context.userId,
    action,
    entityKind: "ai_suggestion",
    entityId: suggestion.id,
    ...(correlationId === undefined ? {} : { correlationId }),
    reason,
    redactedChanges: {
      status: "changed",
      reviewedAt: "changed",
    },
  });
  await persistDecisionAuditVersionRefs(
    context,
    suggestion,
    action,
    fingerprint,
    executeQuery,
  );
}

async function persistDecisionAuditVersionRefs(
  context: TenantContext,
  suggestion: AiSuggestion,
  action: "approve" | "reject",
  fingerprint: string,
  executeQuery: QueryExecutor,
): Promise<void> {
  const previousVersionRef = `pending_review@${fingerprint}`;
  const nextVersionRef = `${suggestion.status}@${fingerprint}`;
  const auditAction = action === "approve" ? "APPROVE" : "REJECT";
  const rows = await executeQuery<{ id: string }>(
    `update "AuditLogEntry"
        set "redactedChanges" = coalesce("redactedChanges", '{}'::jsonb)
          || jsonb_build_object(
            'previousVersionRef', $5::text,
            'nextVersionRef', $6::text
          )
      where "id" = (
        select "id" from "AuditLogEntry"
         where "organizationId" = $1 and "financialProfileId" = $2
           and "entityKind" = 'AI_SUGGESTION' and "entityId" = $3 and "action" = $4
         order by "occurredAt" desc, "id" desc limit 1
      )
      returning "id"`,
    [
      context.organizationId,
      context.financialProfileId,
      suggestion.id,
      auditAction,
      previousVersionRef,
      nextVersionRef,
    ],
  );
  if (rows.length !== 1) {
    throw new Error(
      "Generalized deterministic review audit version references could not be persisted atomically.",
    );
  }
}

async function auditSourceDecision(
  context: TenantContext,
  suggestion: AiSuggestion,
  action: "approve" | "reject",
  reason: string,
  now: string,
  fingerprint: string,
  correlationId: string | undefined,
  executeQuery: QueryExecutor,
): Promise<void> {
  await auditSuggestionDecision(
    context,
    suggestion,
    action,
    reason,
    now,
    fingerprint,
    correlationId,
    executeQuery,
  );
}

async function refreshBatchResult(
  context: TenantContext,
  importBatchId: string | undefined,
  executeQuery: QueryExecutor,
): Promise<{ importBatch?: ImportBatch }> {
  if (importBatchId === undefined) return {};
  return {
    importBatch: await refreshImportBatchStatusForContext(
      context,
      importBatchId,
      executeQuery,
    ),
  };
}

function assertExpectedFingerprint(
  actual: string,
  expected: string | undefined,
): void {
  if (expected === undefined || expected.trim().length === 0) {
    throw reviewError(
      "AI_REVIEW_EXPECTED_FINGERPRINT_REQUIRED",
      "Informe a versão observada da sugestão antes de concluir a decisão.",
      428,
    );
  }
  if (actual !== expected) {
    throw reviewError(
      "AI_SUGGESTION_PAYLOAD_CONFLICT",
      "A sugestão foi alterada por outra operação. Atualize a fila e tente novamente.",
      409,
    );
  }
}

function assertPending(status: string): void {
  if (status !== "PENDING_REVIEW") {
    throw reviewError(
      "AI_REVIEW_INVALID_TRANSITION",
      "Esta sugestão já foi resolvida por outra decisão.",
      409,
    );
  }
}

function isIdempotent(
  status: string,
  action: GeneralizedDeterministicDecisionAction,
): boolean {
  return (
    (action === "approve" && status === "APPROVED") ||
    (action === "reject" && status === "REJECTED")
  );
}

function reviewError(
  code: string,
  message: string,
  statusCode: number,
): GeneralizedDeterministicReviewError {
  return new GeneralizedDeterministicReviewError(code, message, statusCode);
}
