import { randomUUID } from "node:crypto";

import {
  buildTransactionMovements,
  type AuditLogEntryDraft,
  type EntityId,
  type TenantContext,
  type Transaction,
  type TransactionExtractionPayload,
} from "@solverfin/domain";

import type { QueryExecutor } from "./db.js";
import { insertAuditLogEntry } from "./repositories/audit.js";

export interface CanonicalTransferAccounts {
  sourceAccountId: EntityId;
  destinationAccountId: EntityId;
}

export async function createImportedTransferAfterRejectedCandidate(
  context: TenantContext,
  importBatchId: EntityId,
  suggestionId: EntityId,
  payload: TransactionExtractionPayload,
  accounts: CanonicalTransferAccounts,
  now: string,
  executeQuery: QueryExecutor,
): Promise<Transaction> {
  const transaction = buildImportedTransfer(
    context,
    importBatchId,
    suggestionId,
    payload,
    accounts,
    now,
  );
  await executeQuery(buildInsertTransactionSql(), buildTransactionParams(transaction));
  await insertAuditLogEntry(executeQuery, buildImportedTransactionAuditEntry(context, transaction));
  return transaction;
}

export async function reconcileConcurrentTransferAfterRejectedCandidate(
  context: TenantContext,
  transactionId: EntityId,
  currentStatus: string,
  now: string,
  executeQuery: QueryExecutor,
): Promise<void> {
  if (currentStatus === "RECONCILED") return;

  await executeQuery(
    `update "Transaction" set "status" = 'RECONCILED', "reconciledAt" = $4,
       "updatedAt" = $4, "updatedByUserId" = $5
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [transactionId, context.organizationId, context.financialProfileId, now, context.userId],
  );
  await insertAuditLogEntry(
    executeQuery,
    buildTransferReconciliationAuditEntry(context, transactionId, now),
  );
}

export async function finalizeTransferApprovalAfterRejectedCandidates(
  context: TenantContext,
  suggestionId: EntityId,
  transactionId: EntityId,
  outcome: "created" | "reconciled",
  now: string,
  executeQuery: QueryExecutor,
): Promise<void> {
  await executeQuery(
    `update "AiSuggestion" set "status" = 'APPROVED', "targetEntityId" = $4,
       "reviewedByUserId" = $5, "reviewedAt" = $6, "updatedAt" = $6
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [
      suggestionId,
      context.organizationId,
      context.financialProfileId,
      transactionId,
      context.userId,
      now,
    ],
  );
  await expirePendingCandidates(context, suggestionId, now, executeQuery);
  await insertAuditLogEntry(
    executeQuery,
    buildSuggestionApprovalAuditEntry(context, suggestionId, now, outcome),
  );
}

function buildImportedTransfer(
  context: TenantContext,
  importBatchId: EntityId,
  suggestionId: EntityId,
  payload: TransactionExtractionPayload,
  accounts: CanonicalTransferAccounts,
  now: string,
): Transaction {
  const id = randomUUID();
  const transaction: Transaction = {
    id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    kind: "transfer",
    status: "posted",
    source: "import",
    amountMinor: payload.amountMinor,
    currency: payload.currency,
    occurredOn: payload.occurredOn,
    plannedOn: payload.occurredOn,
    effectiveOn: payload.occurredOn,
    description: payload.description,
    accountId: accounts.sourceAccountId,
    destinationAccountId: accounts.destinationAccountId,
    transferGroupId: id,
    ...(payload.categoryId === undefined ? {} : { categoryId: payload.categoryId }),
    importBatchId,
    aiSuggestionId: suggestionId,
    createdByUserId: context.userId,
    updatedByUserId: context.userId,
    createdAt: now,
    updatedAt: now,
  };
  buildTransactionMovements(transaction);
  return transaction;
}

async function expirePendingCandidates(
  context: TenantContext,
  sourceSuggestionId: EntityId,
  now: string,
  executeQuery: QueryExecutor,
): Promise<void> {
  const rows = await executeQuery<{ id: string }>(
    `update "AiSuggestion" set "status" = 'EXPIRED', "reviewedAt" = $4,
       "reviewedByUserId" = $5, "updatedAt" = $4
     where "organizationId" = $1 and "financialProfileId" = $2
       and "sourceSuggestionId" = $3 and "status" = 'PENDING_REVIEW'
     returning "id"`,
    [context.organizationId, context.financialProfileId, sourceSuggestionId, now, context.userId],
  );
  for (const row of rows) {
    await insertAuditLogEntry(executeQuery, buildExpiredCandidateAuditEntry(context, row.id, now));
  }
}

function buildInsertTransactionSql(): string {
  return `insert into "Transaction"
    ("id", "organizationId", "financialProfileId", "accountId", "destinationAccountId", "categoryId",
     "cardId", "cardInstrumentId", "invoiceId", "recurrenceId", "installmentId", "importBatchId",
     "aiSuggestionId", "transferGroupId", "kind", "status", "source", "amountMinor", "currency",
     "occurredOn", "plannedOn", "effectiveOn", "description", "reconciledAt", "voidedAt",
     "createdByUserId", "updatedByUserId", "createdAt", "updatedAt")
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
      $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)`;
}

function buildTransactionParams(transaction: Transaction): unknown[] {
  return [
    transaction.id,
    transaction.organizationId,
    transaction.financialProfileId,
    transaction.accountId ?? null,
    transaction.destinationAccountId ?? null,
    transaction.categoryId ?? null,
    transaction.cardId ?? null,
    transaction.cardInstrumentId ?? null,
    transaction.invoiceId ?? null,
    transaction.recurrenceId ?? null,
    transaction.installmentId ?? null,
    transaction.importBatchId ?? null,
    transaction.aiSuggestionId ?? null,
    transaction.transferGroupId ?? null,
    transaction.kind.toUpperCase(),
    transaction.status.toUpperCase(),
    transaction.source.toUpperCase(),
    transaction.amountMinor,
    transaction.currency,
    transaction.occurredOn,
    transaction.plannedOn,
    transaction.effectiveOn ?? null,
    transaction.description,
    transaction.reconciledAt ?? null,
    transaction.voidedAt ?? null,
    transaction.createdByUserId ?? null,
    transaction.updatedByUserId ?? null,
    transaction.createdAt,
    transaction.updatedAt,
  ];
}

function buildImportedTransactionAuditEntry(
  context: TenantContext,
  transaction: Transaction,
): AuditLogEntryDraft {
  return {
    organizationId: transaction.organizationId,
    financialProfileId: transaction.financialProfileId,
    occurredAt: transaction.createdAt,
    actorKind: "user",
    actorId: context.userId,
    action: "create",
    entityKind: "transaction",
    entityId: transaction.id,
    reason: "Lancamento criado pela aprovacao de uma linha CSV revisada.",
    redactedChanges: {
      status: "added",
      source: "added",
      amountMinor: "added",
      occurredOn: "added",
      accountId: "added",
      importBatchId: "added",
      aiSuggestionId: "added",
    },
  };
}

function buildTransferReconciliationAuditEntry(
  context: TenantContext,
  transactionId: EntityId,
  now: string,
): AuditLogEntryDraft {
  return {
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    occurredAt: now,
    actorKind: "user",
    actorId: context.userId,
    action: "reconcile",
    entityKind: "transaction",
    entityId: transactionId,
    reason: "Segunda ponta importada conciliada com transferencia concorrente nao rejeitada.",
    redactedChanges: { status: "changed", reconciledAt: "added" },
  };
}

function buildSuggestionApprovalAuditEntry(
  context: TenantContext,
  suggestionId: EntityId,
  now: string,
  outcome: "created" | "reconciled",
): AuditLogEntryDraft {
  return {
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    occurredAt: now,
    actorKind: "user",
    actorId: context.userId,
    action: "approve",
    entityKind: "ai_suggestion",
    entityId: suggestionId,
    reason:
      outcome === "created"
        ? "Linha de importacao confirmada como transferencia independente apos rejeicao dos candidatos."
        : "Linha de importacao conciliada com transferencia concorrente nao rejeitada.",
    redactedChanges: { status: "changed", payload: "changed", reviewedAt: "changed" },
  };
}

function buildExpiredCandidateAuditEntry(
  context: TenantContext,
  suggestionId: EntityId,
  now: string,
): AuditLogEntryDraft {
  return {
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    occurredAt: now,
    actorKind: "user",
    actorId: context.userId,
    action: "update",
    entityKind: "ai_suggestion",
    entityId: suggestionId,
    reason: "Candidatura expirada porque a linha de origem foi confirmada.",
    redactedChanges: { status: "changed", reviewedAt: "changed" },
  };
}
