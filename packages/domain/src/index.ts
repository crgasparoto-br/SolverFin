export * from "./accounts.js";
export * from "./tenant.js";
export * from "./tenant-authorization.js";

export type EntityId = string;
export type ISODate = string;
export type ISODateTime = string;

export type FinancialContextKind = "personal" | "family" | "mei" | "business";

export type AuditActorKind = "user" | "system" | "ai" | "import";
export type AuditAction =
  | "create"
  | "update"
  | "archive"
  | "restore"
  | "soft_delete"
  | "reconcile"
  | "unreconcile"
  | "approve"
  | "reject";

export type AuditEntityKind =
  | "account"
  | "card"
  | "category"
  | "transaction"
  | "recurrence"
  | "installment"
  | "invoice"
  | "budget"
  | "import_batch"
  | "ai_suggestion"
  | "attachment";

export type AuditChangeMarker = "changed" | "added" | "removed";
export type RedactedAuditChanges = Record<string, AuditChangeMarker>;

export type AccountKind = "checking" | "savings" | "cash" | "investment" | "other";
export type AccountStatus = "active" | "archived";

export type CardStatus = "active" | "archived" | "blocked";

export type CategoryKind = "income" | "expense" | "transfer";
export type CategoryStatus = "active" | "archived";

export type TransactionKind = "income" | "expense" | "transfer";
export type TransactionStatus = "planned" | "posted" | "reconciled" | "suggested" | "voided";
export type TransactionSource =
  | "manual"
  | "recurrence"
  | "installment"
  | "import"
  | "ai_suggestion";

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";
export type RecurrenceStatus = "active" | "paused" | "cancelled" | "completed";
export type InstallmentStatus = "planned" | "posted" | "reconciled" | "cancelled";

export type InvoiceStatus = "open" | "closed" | "paid" | "overdue" | "cancelled";
export type BudgetStatus = "active" | "archived";

export type ImportSourceKind = "csv" | "ofx" | "bank_message" | "manual";
export type ImportStatus =
  | "received"
  | "parsed"
  | "reviewing"
  | "completed"
  | "failed"
  | "discarded";

export type AiSuggestionKind =
  | "transaction_extraction"
  | "categorization"
  | "deduplication"
  | "reconciliation"
  | "insight";
export type AiSuggestionStatus = "pending_review" | "approved" | "edited" | "rejected" | "expired";

export type AttachmentKind = "receipt" | "invoice" | "statement" | "message" | "other";
export type AttachmentStatus = "active" | "redacted" | "deleted";

export interface TenantScoped {
  organizationId: EntityId;
  financialProfileId: EntityId;
}

export interface Traceable {
  id: EntityId;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  createdByUserId?: EntityId;
  updatedByUserId?: EntityId;
}

export interface User extends Traceable {
  email: string;
  displayName: string;
  status: "active" | "disabled";
}

export interface Organization extends Traceable {
  name: string;
  ownerUserId: EntityId;
}

export interface FinancialProfile extends Traceable {
  organizationId: EntityId;
  ownerUserId: EntityId;
  name: string;
  kind: FinancialContextKind;
  status: "active" | "archived";
}

export interface Account extends Traceable, TenantScoped {
  name: string;
  kind: AccountKind;
  status: AccountStatus;
  currency: string;
  openingBalanceMinor: number;
  maskedIdentifier?: string;
}

export interface Card extends Traceable, TenantScoped {
  name: string;
  status: CardStatus;
  closingDay: number;
  dueDay: number;
  creditLimitMinor?: number;
  maskedIdentifier?: string;
  paymentAccountId?: EntityId;
}

export interface Category extends Traceable, TenantScoped {
  name: string;
  kind: CategoryKind;
  status: CategoryStatus;
  parentCategoryId?: EntityId;
}

export interface Transaction extends Traceable, TenantScoped {
  kind: TransactionKind;
  status: TransactionStatus;
  source: TransactionSource;
  amountMinor: number;
  currency: string;
  occurredOn: ISODate;
  description: string;
  accountId?: EntityId;
  destinationAccountId?: EntityId;
  categoryId?: EntityId;
  cardId?: EntityId;
  invoiceId?: EntityId;
  recurrenceId?: EntityId;
  installmentId?: EntityId;
  importBatchId?: EntityId;
  aiSuggestionId?: EntityId;
  transferGroupId?: EntityId;
  reconciledAt?: ISODateTime;
  voidedAt?: ISODateTime;
}

export interface Recurrence extends Traceable, TenantScoped {
  status: RecurrenceStatus;
  frequency: RecurrenceFrequency;
  startOn: ISODate;
  endOn?: ISODate;
  amountMinor: number;
  currency: string;
  description: string;
  accountId: EntityId;
  categoryId?: EntityId;
}

export interface Installment extends Traceable, TenantScoped {
  status: InstallmentStatus;
  sequenceNumber: number;
  totalInstallments: number;
  dueOn: ISODate;
  amountMinor: number;
  currency: string;
  transactionId?: EntityId;
  recurrenceId?: EntityId;
  cardId?: EntityId;
}

export interface Invoice extends Traceable, TenantScoped {
  cardId: EntityId;
  status: InvoiceStatus;
  periodStartOn: ISODate;
  periodEndOn: ISODate;
  dueOn: ISODate;
  totalAmountMinor: number;
  currency: string;
  paidAt?: ISODateTime;
  paymentTransactionId?: EntityId;
}

export interface Budget extends Traceable, TenantScoped {
  status: BudgetStatus;
  categoryId: EntityId;
  periodStartOn: ISODate;
  periodEndOn: ISODate;
  plannedAmountMinor: number;
  currency: string;
  alertThresholdPercent?: number;
}

export interface ImportBatch extends Traceable, TenantScoped {
  sourceKind: ImportSourceKind;
  status: ImportStatus;
  originalFileName?: string;
  sourceHash: string;
  receivedAt: ISODateTime;
  completedAt?: ISODateTime;
}

export interface AiSuggestion extends Traceable, TenantScoped {
  kind: AiSuggestionKind;
  status: AiSuggestionStatus;
  sourceEntityId?: EntityId;
  targetEntityId?: EntityId;
  confidence: number;
  explanation: string;
  provider?: string;
  model?: string;
  reviewedByUserId?: EntityId;
  reviewedAt?: ISODateTime;
}

export interface Attachment extends Traceable, TenantScoped {
  kind: AttachmentKind;
  status: AttachmentStatus;
  fileName: string;
  mimeType: string;
  storageKey: string;
  linkedEntityId: EntityId;
  linkedEntityKind: "transaction" | "invoice" | "import_batch" | "ai_suggestion";
  redactedAt?: ISODateTime;
}

export interface AuditLogEntry extends TenantScoped {
  id: EntityId;
  occurredAt: ISODateTime;
  actorKind: AuditActorKind;
  actorId?: EntityId;
  action: AuditAction;
  entityKind: AuditEntityKind;
  entityId: EntityId;
  correlationId?: string;
  reason?: string;
  redactedChanges?: RedactedAuditChanges;
}

export type AuditLogEntryDraft = Omit<AuditLogEntry, "id">;

export interface TransactionAuditInput {
  action: Extract<AuditAction, "create" | "update" | "soft_delete" | "reconcile" | "unreconcile">;
  actorKind: AuditActorKind;
  actorId?: EntityId;
  before?: Transaction;
  after?: Transaction;
  occurredAt: ISODateTime;
  correlationId?: string;
  reason?: string;
}

const AUDITED_TRANSACTION_FIELDS = [
  "kind",
  "status",
  "source",
  "amountMinor",
  "currency",
  "occurredOn",
  "description",
  "accountId",
  "destinationAccountId",
  "categoryId",
  "cardId",
  "invoiceId",
  "recurrenceId",
  "installmentId",
  "importBatchId",
  "aiSuggestionId",
  "transferGroupId",
  "reconciledAt",
  "voidedAt",
] as const satisfies readonly (keyof Transaction)[];

export function isTransfer(transaction: Pick<Transaction, "kind">): boolean {
  return transaction.kind === "transfer";
}

export function assertTransactionInvariant(transaction: Transaction): void {
  if (transaction.amountMinor <= 0) {
    throw new Error("Transaction amount must be positive.");
  }

  if (transaction.kind === "transfer") {
    if (!transaction.accountId || !transaction.destinationAccountId) {
      throw new Error("Transfer transactions require source and destination accounts.");
    }

    if (transaction.accountId === transaction.destinationAccountId) {
      throw new Error("Transfer transactions require different source and destination accounts.");
    }

    return;
  }

  if (!transaction.accountId && !transaction.cardId) {
    throw new Error("Income and expense transactions require an account or card.");
  }

  if (transaction.destinationAccountId) {
    throw new Error("Only transfer transactions can define a destination account.");
  }
}

export function buildRedactedTransactionChanges(
  before: Transaction | undefined,
  after: Transaction | undefined,
): RedactedAuditChanges | undefined {
  if (!before && !after) {
    return undefined;
  }

  const changes: RedactedAuditChanges = {};

  for (const field of AUDITED_TRANSACTION_FIELDS) {
    const beforeValue = before?.[field];
    const afterValue = after?.[field];

    if (beforeValue === afterValue) {
      continue;
    }

    if (beforeValue === undefined) {
      changes[field] = "added";
      continue;
    }

    if (afterValue === undefined) {
      changes[field] = "removed";
      continue;
    }

    changes[field] = "changed";
  }

  return Object.keys(changes).length > 0 ? changes : undefined;
}

export function buildTransactionAuditEntry(input: TransactionAuditInput): AuditLogEntryDraft {
  const transaction = input.after ?? input.before;

  if (!transaction) {
    throw new Error("Transaction audit requires a before or after transaction snapshot.");
  }

  if (input.before && input.after) {
    assertSameTenant(input.before, input.after);

    if (input.before.id !== input.after.id) {
      throw new Error("Transaction audit snapshots must reference the same transaction.");
    }
  }

  const entry: AuditLogEntryDraft = {
    organizationId: transaction.organizationId,
    financialProfileId: transaction.financialProfileId,
    occurredAt: input.occurredAt,
    actorKind: input.actorKind,
    action: input.action,
    entityKind: "transaction",
    entityId: transaction.id,
  };

  if (input.actorId !== undefined) {
    entry.actorId = input.actorId;
  }

  if (input.correlationId !== undefined) {
    entry.correlationId = input.correlationId;
  }

  if (input.reason !== undefined) {
    entry.reason = input.reason;
  }

  const redactedChanges = buildRedactedTransactionChanges(input.before, input.after);

  if (redactedChanges !== undefined) {
    entry.redactedChanges = redactedChanges;
  }

  return entry;
}

function assertSameTenant(before: TenantScoped, after: TenantScoped): void {
  if (
    before.organizationId !== after.organizationId ||
    before.financialProfileId !== after.financialProfileId
  ) {
    throw new Error("Audit snapshots must belong to the same tenant and financial profile.");
  }
}
