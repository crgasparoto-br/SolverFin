import type {
  Account,
  AuditLogEntryDraft,
  Category,
  EntityId,
  ISODate,
  ISODateTime,
  TenantScoped,
  Traceable,
  Transaction,
  TransactionKind,
} from "./index.js";
import type { TenantContext } from "./tenant.js";
import {
  applyTenantScope,
  getTenantScopedResource,
  listTenantScopedResources,
  updateTenantScopedResource,
} from "./tenant-authorization.js";
import { assertCategorySupportsTransactionKind } from "./categories.js";

export type PayableReceivableKind = "payable" | "receivable";
export type PayableReceivableStatus = "pending" | "settled" | "cancelled";

export interface PayableReceivable extends Traceable, TenantScoped {
  kind: PayableReceivableKind;
  status: PayableReceivableStatus;
  amountMinor: number;
  currency: string;
  dueOn: ISODate;
  description: string;
  accountId?: EntityId;
  categoryId?: EntityId;
  settledAt?: ISODateTime;
  settlementTransactionId?: EntityId;
  cancelledAt?: ISODateTime;
}

export type PayableReceivableErrorCode =
  | "PAYABLE_RECEIVABLE_KIND_REQUIRED"
  | "PAYABLE_RECEIVABLE_KIND_INVALID"
  | "PAYABLE_RECEIVABLE_STATUS_INVALID"
  | "PAYABLE_RECEIVABLE_AMOUNT_INVALID"
  | "PAYABLE_RECEIVABLE_CURRENCY_INVALID"
  | "PAYABLE_RECEIVABLE_DUE_DATE_REQUIRED"
  | "PAYABLE_RECEIVABLE_DESCRIPTION_REQUIRED"
  | "PAYABLE_RECEIVABLE_ACCOUNT_REQUIRED"
  | "PAYABLE_RECEIVABLE_ACCOUNT_INVALID"
  | "PAYABLE_RECEIVABLE_ACCOUNT_ARCHIVED"
  | "PAYABLE_RECEIVABLE_CATEGORY_INVALID"
  | "PAYABLE_RECEIVABLE_CATEGORY_ARCHIVED"
  | "PAYABLE_RECEIVABLE_ALREADY_SETTLED"
  | "PAYABLE_RECEIVABLE_CANCELLED"
  | "PAYABLE_RECEIVABLE_SETTLED_CANNOT_CANCEL"
  | "PAYABLE_RECEIVABLE_PARTIAL_UNSUPPORTED"
  | "PAYABLE_RECEIVABLE_TRANSACTION_ID_REQUIRED"
  | "PAYABLE_RECEIVABLE_TRANSACTION_INVALID";

export class PayableReceivableError extends Error {
  readonly code: PayableReceivableErrorCode;
  readonly statusCode = 400;

  constructor(code: PayableReceivableErrorCode, message: string) {
    super(message);
    this.name = "PayableReceivableError";
    this.code = code;
  }
}

export interface PayableReceivableMutationResult {
  payableReceivable: PayableReceivable;
  auditEntry: AuditLogEntryDraft;
}

export interface PayableReceivableSettlementResult {
  payableReceivable: PayableReceivable;
  transaction: Transaction;
  auditEntries: readonly AuditLogEntryDraft[];
}

export interface CreatePayableReceivableInput {
  id: EntityId;
  context: TenantContext;
  now: ISODateTime;
  payload: CreatePayableReceivablePayload;
  account?: Account;
  category?: Category;
}

export interface CreatePayableReceivablePayload {
  kind: PayableReceivableKind;
  amountMinor: number;
  dueOn: ISODate;
  description: string;
  currency?: string;
  accountId?: EntityId;
  categoryId?: EntityId;
  organizationId?: EntityId;
  financialProfileId?: EntityId;
}

export interface UpdatePayableReceivableInput {
  context: TenantContext;
  payableReceivable: PayableReceivable | undefined;
  now: ISODateTime;
  payload: UpdatePayableReceivablePayload;
  account?: Account;
  category?: Category;
}

export interface UpdatePayableReceivablePayload {
  kind?: PayableReceivableKind;
  status?: PayableReceivableStatus;
  amountMinor?: number;
  dueOn?: ISODate;
  description?: string;
  currency?: string;
  accountId?: EntityId;
  categoryId?: EntityId;
  organizationId?: EntityId;
  financialProfileId?: EntityId;
}

export interface ListPayableReceivablesFilters {
  kind?: PayableReceivableKind;
  status?: PayableReceivableStatus | "all";
  accountId?: EntityId;
  categoryId?: EntityId;
  dueFrom?: ISODate;
  dueTo?: ISODate;
}

export interface SettlePayableReceivableInput {
  transactionId?: EntityId;
  context: TenantContext;
  payableReceivable: PayableReceivable | undefined;
  now: ISODateTime;
  payload: SettlePayableReceivablePayload;
  account?: Account;
  category?: Category;
  existingTransaction?: Transaction;
}

export interface SettlePayableReceivablePayload {
  settledOn: ISODate;
  amountMinor?: number;
  description?: string;
  accountId?: EntityId;
  categoryId?: EntityId;
  existingTransactionId?: EntityId;
}

const ALLOWED_KINDS: readonly PayableReceivableKind[] = ["payable", "receivable"];
const ALLOWED_STATUSES: readonly PayableReceivableStatus[] = [
  "pending",
  "settled",
  "cancelled",
];

export function createPayableReceivable(
  input: CreatePayableReceivableInput,
): PayableReceivableMutationResult {
  const payload = applyTenantScope(input.context, input.payload);
  const kind = validateKind(payload.kind);
  const account = assertOptionalAccount(input.context, input.account, payload.accountId);
  const category = assertOptionalCategory(input.context, input.category, payload.categoryId, kind);
  const payableReceivable: PayableReceivable = {
    id: input.id,
    organizationId: payload.organizationId,
    financialProfileId: payload.financialProfileId,
    kind,
    status: "pending",
    amountMinor: validateAmount(payload.amountMinor),
    currency: normalizeCurrency(payload.currency ?? account?.currency),
    dueOn: validateDate(payload.dueOn, "PAYABLE_RECEIVABLE_DUE_DATE_REQUIRED"),
    description: normalizeDescription(payload.description),
    createdAt: input.now,
    updatedAt: input.now,
    createdByUserId: input.context.userId,
    updatedByUserId: input.context.userId,
  };

  if (account !== undefined) {
    payableReceivable.accountId = account.id;
  }

  if (category !== undefined) {
    payableReceivable.categoryId = category.id;
  }

  return {
    payableReceivable,
    auditEntry: buildPayableReceivableAuditEntry(
      "create",
      input.context.userId,
      input.now,
      undefined,
      payableReceivable,
    ),
  };
}

export function listPayableReceivables(
  context: TenantContext,
  payablesReceivables: readonly PayableReceivable[],
  filters: ListPayableReceivablesFilters = {},
): PayableReceivable[] {
  return listTenantScopedResources(context, payablesReceivables).filter((payableReceivable) => {
    const kindMatches = filters.kind === undefined || payableReceivable.kind === filters.kind;
    const statusMatches =
      filters.status === undefined ||
      filters.status === "all" ||
      payableReceivable.status === filters.status;
    const accountMatches =
      filters.accountId === undefined || payableReceivable.accountId === filters.accountId;
    const categoryMatches =
      filters.categoryId === undefined || payableReceivable.categoryId === filters.categoryId;
    const dueFromMatches =
      filters.dueFrom === undefined || payableReceivable.dueOn >= filters.dueFrom;
    const dueToMatches = filters.dueTo === undefined || payableReceivable.dueOn <= filters.dueTo;

    return (
      kindMatches &&
      statusMatches &&
      accountMatches &&
      categoryMatches &&
      dueFromMatches &&
      dueToMatches
    );
  });
}

export function getPayableReceivable(
  context: TenantContext,
  payableReceivable: PayableReceivable | undefined,
): PayableReceivable {
  return getTenantScopedResource(context, payableReceivable);
}

export function updatePayableReceivable(
  input: UpdatePayableReceivableInput,
): PayableReceivableMutationResult {
  const currentPayableReceivable = updateTenantScopedResource(
    input.context,
    input.payableReceivable,
    input.payload,
  );
  const nextKind = validateKind(input.payload.kind ?? currentPayableReceivable.kind);
  const nextAccountId = input.payload.accountId ?? currentPayableReceivable.accountId;
  const nextCategoryId = input.payload.categoryId ?? currentPayableReceivable.categoryId;
  const account = assertOptionalAccount(input.context, input.account, nextAccountId);
  const category = assertOptionalCategory(input.context, input.category, nextCategoryId, nextKind);
  const updatedPayableReceivable: PayableReceivable = {
    ...currentPayableReceivable,
    ...buildOptionalUpdate(input.payload),
    kind: nextKind,
    updatedAt: input.now,
    updatedByUserId: input.context.userId,
  };

  if (account !== undefined) {
    updatedPayableReceivable.accountId = account.id;
  }

  if (category !== undefined) {
    updatedPayableReceivable.categoryId = category.id;
  }

  return {
    payableReceivable: updatedPayableReceivable,
    auditEntry: buildPayableReceivableAuditEntry(
      "update",
      input.context.userId,
      input.now,
      currentPayableReceivable,
      updatedPayableReceivable,
    ),
  };
}

export function cancelPayableReceivable(
  context: TenantContext,
  payableReceivable: PayableReceivable | undefined,
  now: ISODateTime,
): PayableReceivableMutationResult {
  const currentPayableReceivable = getTenantScopedResource(context, payableReceivable);

  if (currentPayableReceivable.status === "settled") {
    throw new PayableReceivableError(
      "PAYABLE_RECEIVABLE_SETTLED_CANNOT_CANCEL",
      "Settled payable or receivable cannot be cancelled in the MVP.",
    );
  }

  if (currentPayableReceivable.status === "cancelled") {
    throw new PayableReceivableError(
      "PAYABLE_RECEIVABLE_CANCELLED",
      "Payable or receivable is already cancelled.",
    );
  }

  const cancelledPayableReceivable: PayableReceivable = {
    ...currentPayableReceivable,
    status: "cancelled",
    cancelledAt: now,
    updatedAt: now,
    updatedByUserId: context.userId,
  };

  return {
    payableReceivable: cancelledPayableReceivable,
    auditEntry: buildPayableReceivableAuditEntry(
      "update",
      context.userId,
      now,
      currentPayableReceivable,
      cancelledPayableReceivable,
    ),
  };
}

export function settlePayableReceivable(
  input: SettlePayableReceivableInput,
): PayableReceivableSettlementResult {
  const currentPayableReceivable = getTenantScopedResource(input.context, input.payableReceivable);

  assertCanSettle(currentPayableReceivable);

  const amountMinor = input.payload.amountMinor ?? currentPayableReceivable.amountMinor;

  if (amountMinor !== currentPayableReceivable.amountMinor) {
    throw new PayableReceivableError(
      "PAYABLE_RECEIVABLE_PARTIAL_UNSUPPORTED",
      "Partial payments are not supported in the MVP.",
    );
  }

  const transaction =
    input.payload.existingTransactionId !== undefined
      ? assertExistingSettlementTransaction(
          input.context,
          input.existingTransaction,
          input.payload.existingTransactionId,
          currentPayableReceivable,
          amountMinor,
        )
      : buildSettlementTransaction(input, currentPayableReceivable, amountMinor);
  const settledPayableReceivable: PayableReceivable = {
    ...currentPayableReceivable,
    status: "settled",
    settledAt: input.now,
    settlementTransactionId: transaction.id,
    updatedAt: input.now,
    updatedByUserId: input.context.userId,
  };

  return {
    payableReceivable: settledPayableReceivable,
    transaction,
    auditEntries: [
      buildPayableReceivableAuditEntry(
        "update",
        input.context.userId,
        input.now,
        currentPayableReceivable,
        settledPayableReceivable,
      ),
      buildTransactionAuditEntry(input.context.userId, input.now, transaction),
    ],
  };
}

function buildSettlementTransaction(
  input: SettlePayableReceivableInput,
  payableReceivable: PayableReceivable,
  amountMinor: number,
): Transaction {
  if (input.transactionId === undefined || !input.transactionId.trim()) {
    throw new PayableReceivableError(
      "PAYABLE_RECEIVABLE_TRANSACTION_ID_REQUIRED",
      "Settlement transaction id is required when no existing transaction is linked.",
    );
  }

  const accountId = input.payload.accountId ?? payableReceivable.accountId;
  const categoryId = input.payload.categoryId ?? payableReceivable.categoryId;
  const account = assertRequiredAccount(input.context, input.account, accountId);
  const category = assertOptionalCategory(input.context, input.category, categoryId, payableReceivable.kind);
  const transaction: Transaction = {
    id: input.transactionId,
    organizationId: input.context.organizationId,
    financialProfileId: input.context.financialProfileId,
    kind: toTransactionKind(payableReceivable.kind),
    status: "posted",
    source: "manual",
    amountMinor,
    currency: payableReceivable.currency,
    occurredOn: validateDate(input.payload.settledOn, "PAYABLE_RECEIVABLE_DUE_DATE_REQUIRED"),
    description: input.payload.description?.trim() || payableReceivable.description,
    accountId: account.id,
    createdAt: input.now,
    updatedAt: input.now,
    createdByUserId: input.context.userId,
    updatedByUserId: input.context.userId,
  };

  if (category !== undefined) {
    transaction.categoryId = category.id;
  }

  return transaction;
}

function assertExistingSettlementTransaction(
  context: TenantContext,
  transaction: Transaction | undefined,
  transactionId: EntityId,
  payableReceivable: PayableReceivable,
  amountMinor: number,
): Transaction {
  const scopedTransaction = getTenantScopedResource(context, transaction);
  const transactionKind = toTransactionKind(payableReceivable.kind);

  if (
    scopedTransaction.id !== transactionId ||
    scopedTransaction.kind !== transactionKind ||
    scopedTransaction.amountMinor !== amountMinor ||
    scopedTransaction.currency !== payableReceivable.currency ||
    scopedTransaction.status === "voided"
  ) {
    throw new PayableReceivableError(
      "PAYABLE_RECEIVABLE_TRANSACTION_INVALID",
      "Existing settlement transaction does not match this payable or receivable.",
    );
  }

  return scopedTransaction;
}

function assertCanSettle(payableReceivable: PayableReceivable): void {
  if (payableReceivable.status === "settled") {
    throw new PayableReceivableError(
      "PAYABLE_RECEIVABLE_ALREADY_SETTLED",
      "Payable or receivable is already settled.",
    );
  }

  if (payableReceivable.status === "cancelled") {
    throw new PayableReceivableError(
      "PAYABLE_RECEIVABLE_CANCELLED",
      "Cancelled payable or receivable cannot be settled.",
    );
  }
}

function buildOptionalUpdate(payload: UpdatePayableReceivablePayload): Partial<PayableReceivable> {
  const update: Partial<PayableReceivable> = {};

  if (payload.status !== undefined) {
    update.status = validateStatus(payload.status);
  }

  if (payload.amountMinor !== undefined) {
    update.amountMinor = validateAmount(payload.amountMinor);
  }

  if (payload.currency !== undefined) {
    update.currency = normalizeCurrency(payload.currency);
  }

  if (payload.dueOn !== undefined) {
    update.dueOn = validateDate(payload.dueOn, "PAYABLE_RECEIVABLE_DUE_DATE_REQUIRED");
  }

  if (payload.description !== undefined) {
    update.description = normalizeDescription(payload.description);
  }

  return update;
}

function assertOptionalAccount(
  context: TenantContext,
  account: Account | undefined,
  accountId: EntityId | undefined,
): Account | undefined {
  if (accountId === undefined) {
    return undefined;
  }

  return assertRequiredAccount(context, account, accountId);
}

function assertRequiredAccount(
  context: TenantContext,
  account: Account | undefined,
  accountId: EntityId | undefined,
): Account {
  if (accountId === undefined || !accountId.trim()) {
    throw new PayableReceivableError(
      "PAYABLE_RECEIVABLE_ACCOUNT_REQUIRED",
      "Settlement account is required.",
    );
  }

  const scopedAccount = getTenantScopedResource(context, account);

  if (scopedAccount.id !== accountId) {
    throw new PayableReceivableError(
      "PAYABLE_RECEIVABLE_ACCOUNT_INVALID",
      "Payable or receivable account id does not match.",
    );
  }

  if (scopedAccount.status !== "active") {
    throw new PayableReceivableError(
      "PAYABLE_RECEIVABLE_ACCOUNT_ARCHIVED",
      "Payable or receivable account must be active.",
    );
  }

  return scopedAccount;
}

function assertOptionalCategory(
  context: TenantContext,
  category: Category | undefined,
  categoryId: EntityId | undefined,
  kind: PayableReceivableKind,
): Category | undefined {
  if (categoryId === undefined) {
    return undefined;
  }

  const scopedCategory = getTenantScopedResource(context, category);

  if (scopedCategory.id !== categoryId) {
    throw new PayableReceivableError(
      "PAYABLE_RECEIVABLE_CATEGORY_INVALID",
      "Payable or receivable category id does not match.",
    );
  }

  if (scopedCategory.status !== "active") {
    throw new PayableReceivableError(
      "PAYABLE_RECEIVABLE_CATEGORY_ARCHIVED",
      "Payable or receivable category must be active.",
    );
  }

  assertCategorySupportsTransactionKind(scopedCategory, toTransactionKind(kind));

  return scopedCategory;
}

function validateKind(kind: PayableReceivableKind | undefined): PayableReceivableKind {
  if (kind === undefined) {
    throw new PayableReceivableError(
      "PAYABLE_RECEIVABLE_KIND_REQUIRED",
      "Payable or receivable kind is required.",
    );
  }

  if (!ALLOWED_KINDS.includes(kind)) {
    throw new PayableReceivableError(
      "PAYABLE_RECEIVABLE_KIND_INVALID",
      "Payable or receivable kind is not supported.",
    );
  }

  return kind;
}

function validateStatus(status: PayableReceivableStatus): PayableReceivableStatus {
  if (!ALLOWED_STATUSES.includes(status)) {
    throw new PayableReceivableError(
      "PAYABLE_RECEIVABLE_STATUS_INVALID",
      "Payable or receivable status is not supported.",
    );
  }

  return status;
}

function validateAmount(amountMinor: number): number {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new PayableReceivableError(
      "PAYABLE_RECEIVABLE_AMOUNT_INVALID",
      "Payable or receivable amount must be a positive integer minor-unit amount.",
    );
  }

  return amountMinor;
}

function validateDate(date: ISODate, code: PayableReceivableErrorCode): ISODate {
  if (!date.trim()) {
    throw new PayableReceivableError(code, "Date is required.");
  }

  return date;
}

function normalizeDescription(description: string): string {
  const normalizedDescription = description.trim();

  if (!normalizedDescription) {
    throw new PayableReceivableError(
      "PAYABLE_RECEIVABLE_DESCRIPTION_REQUIRED",
      "Payable or receivable description is required.",
    );
  }

  return normalizedDescription;
}

function normalizeCurrency(currency = "BRL"): string {
  const normalizedCurrency = currency.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    throw new PayableReceivableError(
      "PAYABLE_RECEIVABLE_CURRENCY_INVALID",
      "Payable or receivable currency must use ISO 4217 format.",
    );
  }

  return normalizedCurrency;
}

function toTransactionKind(kind: PayableReceivableKind): Extract<TransactionKind, "income" | "expense"> {
  return kind === "receivable" ? "income" : "expense";
}

function buildPayableReceivableAuditEntry(
  action: "create" | "update",
  actorId: EntityId,
  occurredAt: ISODateTime,
  before: PayableReceivable | undefined,
  after: PayableReceivable,
): AuditLogEntryDraft {
  const auditEntry: AuditLogEntryDraft = {
    organizationId: after.organizationId,
    financialProfileId: after.financialProfileId,
    occurredAt,
    actorKind: "user",
    actorId,
    action,
    entityKind: "payable_receivable" as AuditLogEntryDraft["entityKind"],
    entityId: after.id,
  };
  const redactedChanges = buildRedactedPayableReceivableChanges(before, after);

  if (redactedChanges !== undefined) {
    auditEntry.redactedChanges = redactedChanges;
  }

  return auditEntry;
}

function buildTransactionAuditEntry(
  actorId: EntityId,
  occurredAt: ISODateTime,
  transaction: Transaction,
): AuditLogEntryDraft {
  return {
    organizationId: transaction.organizationId,
    financialProfileId: transaction.financialProfileId,
    occurredAt,
    actorKind: "user",
    actorId,
    action: "create",
    entityKind: "transaction",
    entityId: transaction.id,
  };
}

function buildRedactedPayableReceivableChanges(
  before: PayableReceivable | undefined,
  after: PayableReceivable,
): Record<string, "changed" | "added" | "removed"> | undefined {
  const fields = [
    "kind",
    "status",
    "amountMinor",
    "currency",
    "dueOn",
    "description",
    "accountId",
    "categoryId",
    "settledAt",
    "settlementTransactionId",
    "cancelledAt",
  ] as const satisfies readonly (keyof PayableReceivable)[];
  const changes: Record<string, "changed" | "added" | "removed"> = {};

  for (const field of fields) {
    const beforeValue = before?.[field];
    const afterValue = after[field];

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
