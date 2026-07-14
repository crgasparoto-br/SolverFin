import type { CardBrandKey, FinancialInstitutionKey } from "./visual-identities.js";

export * from "./accounts.js";
export * from "./categories.js";
export * from "./category-learning.js";
export * from "./ai-review-queue.js";
export * from "./transactions.js";
export * from "./recurrences.js";
export * from "./recurrence-calendar.js";
export * from "./cards.js";
export * from "./card-instruments.js";
export * from "./budgets.js";
export * from "./payables-receivables.js";
export * from "./payables-receivables-transition.js";
export * from "./imports.js";
export * from "./bank-message-inbox.js";
export * from "./deduplication.js";
export * from "./reconciliation.js";
export * from "./automation-rules.js";
export * from "./tenant.js";
export * from "./tenant-authorization.js";
export * from "./privacy-consent.js";
export * from "./soft-delete.js";
export * from "./accountant-export.js";
export * from "./visual-identities.js";
export * from "./financial-indexes.js";

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
  | "card_instrument"
  | "category"
  | "transaction"
  | "recurrence"
  | "installment"
  | "invoice"
  | "budget"
  | "import_batch"
  | "bank_message"
  | "deduplication_review"
  | "reconciliation_link"
  | "ai_suggestion"
  | "privacy_consent"
  | "attachment";

export type AuditChangeMarker = "changed" | "added" | "removed";
export type RedactedAuditChanges = Record<string, AuditChangeMarker>;

export type AccountKind = "checking" | "savings" | "cash" | "investment" | "other";
export type AccountStatus = "active" | "archived";

export type CardStatus = "active" | "archived" | "blocked";
export type CardInstrumentType = "physical" | "virtual";
export type CardInstrumentHolder = "primary" | "additional";
export type CardInstrumentStatus = "active" | "archived";

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
  institutionKey?: FinancialInstitutionKey | undefined;
}

export interface Card extends Traceable, TenantScoped {
  name: string;
  status: CardStatus;
  closingDay: number;
  dueDay: number;
  creditLimitMinor?: number;
  maskedIdentifier?: string;
  institutionKey?: FinancialInstitutionKey | undefined;
  brandKey?: CardBrandKey | undefined;
  paymentAccountId?: EntityId;
}

export interface CardInstrument extends Traceable, TenantScoped {
  cardId: EntityId;
  type: CardInstrumentType;
  holder: CardInstrumentHolder;
  status: CardInstrumentStatus;
  isDefault: boolean;
  name?: string;
  maskedIdentifier?: string;
  creditLimitMinor?: number;
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
  plannedOn: ISODate;
  effectiveOn?: ISODate;
  description: string;
  accountId?: EntityId;
  destinationAccountId?: EntityId;
  categoryId?: EntityId;
  cardId?: EntityId;
  cardInstrumentId?: EntityId;
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
  kind: TransactionKind;
  frequency: RecurrenceFrequency;
  interval: number;
  startOn: ISODate;
  endOn?: ISODate;
  amountMinor: number;
  currency: string;
  description: string;
  accountId?: EntityId;
  cardId?: EntityId;
  cardInstrumentId?: EntityId;
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
  cardInstrumentId?: EntityId;
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
