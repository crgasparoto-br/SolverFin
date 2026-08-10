import { createHash, randomUUID } from "node:crypto";

import {
  detectDuplicateTransactions,
  previewReconciliation,
  type TenantContext,
  type Transaction,
} from "@solverfin/domain";
import { buildAiSuggestionPayload } from "@solverfin/domain/ai-suggestion-payloads";

import { withSharedTransaction, type QueryExecutor } from "./db.js";
import {
  buildExistingTransactionCandidates,
  buildGeneralizedReconciliationSource,
  buildGeneralizedSourceState,
  deterministicCandidateKey,
  GENERALIZED_AI_SUGGESTION_COLUMNS,
  listPendingExtractionRows,
  listReviewableTransactionRows,
  mapGeneralizedTransaction,
  parseStoredDeterministicPayload,
  sameDeterministicEvidence,
  type GeneralizedAiSuggestionRow,
  type GeneralizedSourceState,
} from "./generalized-deterministic-review-shared.js";
import { insertAuditLogEntry } from "./repositories/audit.js";

export interface GeneralizedDeterministicScanResult {
  scannedSources: number;
  createdCandidates: number;
  expiredCandidates: number;
}

export interface GeneralizedDeterministicScanFilter {
  sourceEntityId?: string;
}

interface DesiredCandidate {
  kind: "deduplication" | "reconciliation";
  target: Transaction;
  confidence: number;
  reasons: readonly string[];
  conflicts: readonly string[];
  explanation: string;
}

export async function scanPendingDeterministicReviewSuggestionsForContext(
  context: TenantContext,
  filter: GeneralizedDeterministicScanFilter = {},
): Promise<GeneralizedDeterministicScanResult> {
  return withSharedTransaction(async (executeQuery) => {
    const sourceRows = await listPendingExtractionRows(context, executeQuery, filter.sourceEntityId);
    const transactionRows = await listReviewableTransactionRows(context, executeQuery);
    const transactions = transactionRows.map(mapGeneralizedTransaction);
    const existingCandidates = buildExistingTransactionCandidates(transactionRows);
    let createdCandidates = 0;
    let expiredCandidates = await expireCandidatesWithResolvedSources(
      context,
      executeQuery,
      filter.sourceEntityId,
    );

    for (const row of sourceRows) {
      const source = buildGeneralizedSourceState(row);
      if (source === undefined) continue;
      const desired = buildDesiredCandidates(context, source, transactions, existingCandidates);
      const existing = await listPendingChildren(context, row.id, executeQuery);
      const covered = new Set<string>();

      for (const candidateRow of existing) {
        const stored = parseStoredDeterministicPayload(candidateRow);
        const key =
          stored === undefined
            ? undefined
            : deterministicCandidateKey(candidateRow.kind, stored.targetTransactionId);
        const currentDesired = key === undefined ? undefined : desired.get(key);
        const current =
          stored !== undefined &&
          currentDesired !== undefined &&
          source.fingerprints.has(stored.sourcePayloadFingerprint) &&
          currentDesired.target.updatedAt <= candidateRow.createdAt.toISOString() &&
          sameDeterministicEvidence(stored.reasons, currentDesired.reasons) &&
          sameDeterministicEvidence(stored.conflicts, currentDesired.conflicts);
        if (current && key !== undefined) {
          covered.add(key);
          continue;
        }
        expiredCandidates += await expireCandidate(
          context,
          candidateRow.id,
          "Candidatura expirada porque a origem ou o lançamento comparado mudou.",
          executeQuery,
        );
      }

      for (const [key, candidate] of desired) {
        if (covered.has(key)) continue;
        createdCandidates += await insertDesiredCandidate(context, source, candidate, executeQuery);
      }
    }

    return {
      scannedSources: sourceRows.length,
      createdCandidates,
      expiredCandidates,
    };
  });
}

function buildDesiredCandidates(
  context: TenantContext,
  source: GeneralizedSourceState,
  transactions: readonly Transaction[],
  existingCandidates: ReturnType<typeof buildExistingTransactionCandidates>,
): Map<string, DesiredCandidate> {
  const matches = detectDuplicateTransactions({
    context,
    now: new Date().toISOString(),
    candidate: source.candidate,
    existingCandidates,
  });
  const desired = new Map<string, DesiredCandidate>();
  for (const match of matches) {
    const target = transactions.find((item) => item.id === match.possibleDuplicateId);
    if (target === undefined) continue;
    const reasons = match.reasons.map((reason) => reason.message);
    desired.set(deterministicCandidateKey("deduplication", target.id), {
      kind: "deduplication",
      target,
      confidence: match.score / 100,
      reasons,
      conflicts: [],
      explanation: `Possível duplicidade. Evidências: ${reasons.join(" ")} Revise antes de decidir.`,
    });
    if (target.status === "reconciled") continue;
    const preview = previewReconciliation({
      context,
      source: buildGeneralizedReconciliationSource(source),
      transaction: target,
    });
    const conflicts = preview.conflicts.map((conflict) => conflict.message);
    desired.set(deterministicCandidateKey("reconciliation", target.id), {
      kind: "reconciliation",
      target,
      confidence:
        preview.status === "ready"
          ? Math.max(0.8, match.score / 100)
          : Math.min(0.69, match.score / 100),
      reasons,
      conflicts,
      explanation:
        conflicts.length === 0
          ? `Possível conciliação. Evidências: ${reasons.join(" ")} Nenhum conflito estrutural adicional foi encontrado.`
          : `Possível conciliação com conflitos para revisar: ${conflicts.join(" ")}`,
    });
  }
  return desired;
}

async function listPendingChildren(
  context: TenantContext,
  sourceSuggestionId: string,
  executeQuery: QueryExecutor,
): Promise<GeneralizedAiSuggestionRow[]> {
  return executeQuery<GeneralizedAiSuggestionRow>(
    `select ${GENERALIZED_AI_SUGGESTION_COLUMNS} from "AiSuggestion"
     where "organizationId" = $1 and "financialProfileId" = $2
       and "sourceSuggestionId" = $3 and "kind" in ('DEDUPLICATION', 'RECONCILIATION')
       and "status" = 'PENDING_REVIEW'
     order by "createdAt" asc, "id" asc`,
    [context.organizationId, context.financialProfileId, sourceSuggestionId],
  );
}

async function expireCandidatesWithResolvedSources(
  context: TenantContext,
  executeQuery: QueryExecutor,
  sourceEntityId?: string,
): Promise<number> {
  const now = new Date().toISOString();
  const rows = await executeQuery<{ id: string }>(
    `update "AiSuggestion" candidate set "status" = 'EXPIRED', "reviewedAt" = $3, "updatedAt" = $3
     where candidate."organizationId" = $1 and candidate."financialProfileId" = $2
       and candidate."kind" in ('DEDUPLICATION', 'RECONCILIATION')
       and candidate."status" = 'PENDING_REVIEW'
       and ($4::uuid is null or candidate."sourceEntityId" = $4)
       and not exists (
         select 1 from "AiSuggestion" source
          where source."id" = candidate."sourceSuggestionId"
            and source."organizationId" = candidate."organizationId"
            and source."financialProfileId" = candidate."financialProfileId"
            and source."kind" = 'TRANSACTION_EXTRACTION'
            and source."status" = 'PENDING_REVIEW'
       ) returning candidate."id"`,
    [context.organizationId, context.financialProfileId, now, sourceEntityId ?? null],
  );
  for (const row of rows) {
    await auditExpiration(
      context,
      row.id,
      now,
      "Candidatura expirada porque a origem foi resolvida ou removida.",
      executeQuery,
    );
  }
  return rows.length;
}

async function expireCandidate(
  context: TenantContext,
  suggestionId: string,
  reason: string,
  executeQuery: QueryExecutor,
): Promise<number> {
  const now = new Date().toISOString();
  const expiredFingerprint = buildExpiredPersistenceFingerprint(suggestionId, now);
  const rows = await executeQuery<{ id: string }>(
    `update "AiSuggestion" set "status" = 'EXPIRED', "payloadFingerprint" = $5,
       "reviewedAt" = $4, "updatedAt" = $4
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
       and "status" = 'PENDING_REVIEW' returning "id"`,
    [suggestionId, context.organizationId, context.financialProfileId, now, expiredFingerprint],
  );
  if (rows[0] === undefined) return 0;
  await auditExpiration(context, suggestionId, now, reason, executeQuery);
  return 1;
}

async function auditExpiration(
  context: TenantContext,
  suggestionId: string,
  now: string,
  reason: string,
  executeQuery: QueryExecutor,
): Promise<void> {
  await insertAuditLogEntry(executeQuery, {
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    occurredAt: now,
    actorKind: "system",
    action: "update",
    entityKind: "ai_suggestion",
    entityId: suggestionId,
    reason,
    redactedChanges: { status: "changed" },
  });
}

async function insertDesiredCandidate(
  context: TenantContext,
  source: GeneralizedSourceState,
  desired: DesiredCandidate,
  executeQuery: QueryExecutor,
): Promise<number> {
  const now = new Date().toISOString();
  const payload = buildCandidatePayload(source, desired, now);
  const persistenceFingerprint = buildPersistenceFingerprint(source);
  const rows = await executeQuery<{ id: string }>(
    `insert into "AiSuggestion"
      ("id", "organizationId", "financialProfileId", "kind", "status", "sourceEntityId", "targetEntityId",
       "confidence", "explanation", "payload", "sourceSuggestionId", "payloadFingerprint", "provider", "model",
       "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, 'PENDING_REVIEW', $5, $6, $7, $8, $9::jsonb, $10, $11,
             'solverfin-rule', $12, null, null, $13, $13)
     on conflict ("organizationId", "financialProfileId", "kind", "sourceSuggestionId", "payloadFingerprint", "targetEntityId")
     do nothing returning "id"`,
    [
      randomUUID(),
      context.organizationId,
      context.financialProfileId,
      desired.kind.toUpperCase(),
      source.row.sourceEntityId,
      desired.target.id,
      Number(desired.confidence.toFixed(4)),
      desired.explanation.slice(0, 500),
      JSON.stringify(payload),
      source.row.id,
      persistenceFingerprint,
      desired.kind === "deduplication" ? "deduplication-v3" : "reconciliation-v3",
      now,
    ],
  );
  const id = rows[0]?.id;
  if (id === undefined) return 0;
  await insertAuditLogEntry(executeQuery, {
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    occurredAt: now,
    actorKind: "system",
    action: "create",
    entityKind: "ai_suggestion",
    entityId: id,
    reason: "Candidatura determinística criada para revisão.",
    redactedChanges: { status: "added", payload: "added" },
  });
  return 1;
}

function buildCandidatePayload(
  source: GeneralizedSourceState,
  desired: DesiredCandidate,
  now: string,
) {
  const common = {
    contractVersion: 1 as const,
    payloadVersion: 1 as const,
    origin: { kind: "rule" as const, ruleId: "deterministic-review-v3" },
    target: { entityKind: "transaction" as const, entityId: desired.target.id },
    confidence: Number(desired.confidence.toFixed(4)),
    reasons: desired.reasons,
    audit: {
      createdAt: now,
      sourceFingerprint: source.preferredFingerprint,
    },
    sourceSuggestionId: source.row.id,
    sourcePayloadFingerprint: source.preferredFingerprint,
    targetTransactionId: desired.target.id,
    conflicts: desired.conflicts,
  };
  return desired.kind === "deduplication"
    ? buildAiSuggestionPayload({
        payload: { ...common, suggestionKind: "deduplication" },
      })
    : buildAiSuggestionPayload({
        payload: { ...common, suggestionKind: "reconciliation" },
      });
}

function buildPersistenceFingerprint(source: GeneralizedSourceState): string {
  return source.preferredFingerprint;
}

function buildExpiredPersistenceFingerprint(suggestionId: string, now: string): string {
  const identity = ["expired", suggestionId, now].join(":");
  return `sha256-${createHash("sha256").update(identity).digest("hex")}`;
}
