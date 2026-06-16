import type {
  AuditLogEntryDraft,
  EntityId,
  ISODate,
  ISODateTime,
  TenantScoped,
  Traceable,
  Transaction,
  TransactionKind,
} from "./index.js";
import type { TenantContext } from "./tenant.js";
import { getTenantScopedResource } from "./tenant-authorization.js";
import { buildTransactionMovements, type TransactionMovement } from "./transactions.js";

export type ReconciliationSourceKind =
  | "planned_transaction"
  | "imported_transaction"
  | "posted_transaction"
  | "payable_receivable"
  | "recurrence"
  | "invoice";
export type ReconciliationLinkStatus = "active" | "undone";
export type ReconciliationPreviewStatus = "ready" | "conflict";
export type ReconciliationConflictCode =
  | "RECONCILIATION_AMOUNT_CONFLICT"
  | "RECONCILIATION_DATE_CONFLICT"
  | "RECONCILIATION_ACCOUNT_CONFLICT"
  | "RECONCILIATION_CATEGORY_CONFLICT"
  | "RECONCILIATION_KIND_CONFLICT";

export interface ReconciliationSource extends TenantScoped {
  entityKind: ReconciliationSourceKind;
  entityId: EntityId;
  amountMinor: number;
  currency: string;
  occurredOn: ISODate;
  kind: TransactionKind;
  accountId?: EntityId;
  categoryId?: EntityId;
}

export interface ReconciliationConflict {
  code: ReconciliationConflictCode;
  message: string;
}

export interface ReconciliationPreview extends TenantScoped {
  status: ReconciliationPreviewStatus;
  source: ReconciliationSource;
  transactionId: EntityId;
  conflicts: readonly ReconciliationConflict[];
}

export interface ReconciliationLink extends Traceable, TenantScoped {
  status: ReconciliationLinkStatus;
  sourceKind: ReconciliationSourceKind;
  sourceEntityId: EntityId;
  transactionId: EntityId;
  reconciledAt: ISODateTime;
  reconciledByUserId: EntityId;
  undoneAt?: ISODateTime;
  undoneByUserId?: EntityId;
}

export interface ReconciliationMutationResult {
  link: ReconciliationLink;
  transaction: Transaction;
  movements: readonly TransactionMovement[];
  auditEntries: readonly AuditLogEntryDraft[];
}

export interface PreviewReconciliationInput {
  context: TenantContext;
  source: ReconciliationSource;
  transaction: Transaction | undefined;
  dateToleranceDays?: number;
}

export interface ReconcileTransactionInput extends PreviewReconciliationInput {
  linkId: EntityId;
  now: ISODateTime;
  allowConflicts?: boolean;
}

export interface UndoReconciliationInput {
  context: TenantContext;
  link: ReconciliationLink | undefined;
  transaction: Transaction | undefined;
  now: ISODateTime;
}

export type ReconciliationErrorCode =
  | "RECONCILIATION_CONFLICT_REQUIRES_REVIEW"
  | "RECONCILIATION_TRANSACTION_ALREADY_RECONCILED"
  | "RECONCILIATION_LINK_ALREADY_UNDONE";

export class ReconciliationError extends Error {
  readonly code: ReconciliationErrorCode;
  readonly statusCode = 400;

  constructor(code: ReconciliationErrorCode, message: string) {
    super(message);
    this.name = "ReconciliationError";
    this.code = code;
  }
}

const defaultDateToleranceDays = 2;
const oneDayInMs = 24 * 60 * 60 * 1000;

export function previewReconciliation(input: PreviewReconciliationInput): ReconciliationPreview {
  const source = getTenantScopedResource(input.context, input.source);
  const transaction = getTenantScopedResource(input.context, input.transaction);
  const conflicts = buildConflicts(source, transaction, input.dateToleranceDays ?? defaultDateToleranceDays);

  return {
    organizationId: input.context.organizationId,
    financialProfileId: input.context.financialProfileId,
    status: conflicts.length > 0 ? "conflict" : "ready",
    source,
    transactionId: transaction.id,
    conflicts,
  };
}

export function reconcileTransaction(input: ReconcileTransactionInput): ReconciliationMutationResult {
  const preview = previewReconciliation(input);

  if (preview.status === "conflict" && input.allowConflicts !== true) {
    throw new ReconciliationError(
      "RECONCILIATION_CONFLICT_REQUIRES_REVIEW",
      "Conciliacao possui conflitos e precisa de revisao antes de confirmar.",
    );
  }

  const currentTransaction = getTenantScopedResource(input.context, input.transaction);

  if (currentTransaction.status === "reconciled") {
    throw new ReconciliationError(
      "RECONCILIATION_TRANSACTION_ALREADY_RECONCILED",
      "Transacao ja esta conciliada.",
    );
  }

  const transaction: Transaction = {
    ...currentTransaction,
    status: "reconciled",
    reconciledAt: input.now,
    updatedAt: input.now,
    updatedByUserId: input.context.userId,
  };
  const link: ReconciliationLink = {
    id: input.linkId,
    organizationId: input.context.organizationId,
    financialProfileId: input.context.financialProfileId,
    status: "active",
    sourceKind: input.source.entityKind,
    sourceEntityId: input.source.entityId,
    transactionId: currentTransaction.id,
    reconciledAt: input.now,
    reconciledByUserId: input.context.userId,
    createdAt: input.now,
    updatedAt: input.now,
    createdByUserId: input.context.userId,
    updatedByUserId: input.context.userId,
  };

  return {
    link,
    transaction,
    movements: buildTransactionMovements(transaction),
    auditEntries: [
      buildReconciliationAuditEntry(input.context, "reconcile", link.id, input.now),
      buildTransactionReconciliationAuditEntry(input.context, "reconcile", transaction.id, input.now),
    ],
  };
}

export function undoReconciliation(input: UndoReconciliationInput): ReconciliationMutationResult {
  const currentLink = getTenantScopedResource(input.context, input.link);
  const currentTransaction = getTenantScopedResource(input.context, input.transaction);

  if (currentLink.status === "undone") {
    throw new ReconciliationError(
      "RECONCILIATION_LINK_ALREADY_UNDONE",
      "Conciliacao ja foi desfeita.",
    );
  }

  const transaction: Transaction = {
    ...currentTransaction,
    status: "posted",
    updatedAt: input.now,
    updatedByUserId: input.context.userId,
  };
  delete transaction.reconciledAt;

  const link: ReconciliationLink = {
    ...currentLink,
    status: "undone",
    undoneAt: input.now,
    undoneByUserId: input.context.userId,
    updatedAt: input.now,
    updatedByUserId: input.context.userId,
  };

  return {
    link,
    transaction,
    movements: buildTransactionMovements(transaction),
    auditEntries: [
      buildReconciliationAuditEntry(input.context, "unreconcile", link.id, input.now),
      buildTransactionReconciliationAuditEntry(input.context, "unreconcile", transaction.id, input.now),
    ],
  };
}

function buildConflicts(
  source: ReconciliationSource,
  transaction: Transaction,
  dateToleranceDays: number,
): ReconciliationConflict[] {
  const conflicts: ReconciliationConflict[] = [];

  if (source.amountMinor !== transaction.amountMinor || source.currency !== transaction.currency) {
    conflicts.push({
      code: "RECONCILIATION_AMOUNT_CONFLICT",
      message: "Valor ou moeda divergem entre origem e transacao.",
    });
  }

  if (dateDistanceInDays(source.occurredOn, transaction.occurredOn) > dateToleranceDays) {
    conflicts.push({
      code: "RECONCILIATION_DATE_CONFLICT",
      message: "As datas estao fora da tolerancia configurada.",
    });
  }

  if (source.accountId !== undefined && source.accountId !== transaction.accountId) {
    conflicts.push({
      code: "RECONCILIATION_ACCOUNT_CONFLICT",
      message: "A conta financeira diverge.",
    });
  }

  if (source.categoryId !== undefined && source.categoryId !== transaction.categoryId) {
    conflicts.push({
      code: "RECONCILIATION_CATEGORY_CONFLICT",
      message: "A categoria diverge.",
    });
  }

  if (source.kind !== transaction.kind) {
    conflicts.push({
      code: "RECONCILIATION_KIND_CONFLICT",
      message: "O tipo da movimentacao diverge.",
    });
  }

  return conflicts;
}

function buildReconciliationAuditEntry(
  context: TenantContext,
  action: "reconcile" | "unreconcile",
  entityId: EntityId,
  occurredAt: ISODateTime,
): AuditLogEntryDraft {
  return {
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    occurredAt,
    actorKind: "user",
    actorId: context.userId,
    action,
    entityKind: "reconciliation_link",
    entityId,
    redactedChanges: {
      status: "changed",
    },
  };
}

function buildTransactionReconciliationAuditEntry(
  context: TenantContext,
  action: "reconcile" | "unreconcile",
  entityId: EntityId,
  occurredAt: ISODateTime,
): AuditLogEntryDraft {
  return {
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    occurredAt,
    actorKind: "user",
    actorId: context.userId,
    action,
    entityKind: "transaction",
    entityId,
    redactedChanges: {
      status: "changed",
      reconciledAt: "changed",
    },
  };
}

function dateDistanceInDays(left: ISODate, right: ISODate): number {
  const leftTime = Date.parse(`${left}T00:00:00.000Z`);
  const rightTime = Date.parse(`${right}T00:00:00.000Z`);

  return Math.abs(leftTime - rightTime) / oneDayInMs;
}
