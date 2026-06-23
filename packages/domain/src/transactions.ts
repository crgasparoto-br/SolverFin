import type {
  Account,
  AuditLogEntryDraft,
  Category,
  EntityId,
  ISODate,
  ISODateTime,
  Transaction,
  TransactionKind,
  TransactionSource,
  TransactionStatus,
} from "./index.js";
import type { TenantContext } from "./tenant.js";
import {
  applyTenantScope,
  getTenantScopedResource,
  listTenantScopedResources,
  updateTenantScopedResource,
} from "./tenant-authorization.js";
import { assertCategorySupportsTransactionKind } from "./categories.js";

export type TransactionErrorCode =
  | "TRANSACTION_KIND_REQUIRED"
  | "TRANSACTION_KIND_INVALID"
  | "TRANSACTION_STATUS_INVALID"
  | "TRANSACTION_SOURCE_INVALID"
  | "TRANSACTION_AMOUNT_INVALID"
  | "TRANSACTION_DATE_REQUIRED"
  | "TRANSACTION_ACCOUNT_REQUIRED"
  | "TRANSACTION_ACCOUNT_INVALID"
  | "TRANSACTION_ACCOUNT_ARCHIVED"
  | "TRANSACTION_DESTINATION_ACCOUNT_REQUIRED"
  | "TRANSACTION_DESTINATION_ACCOUNT_INVALID"
  | "TRANSACTION_TRANSFER_SAME_ACCOUNT"
  | "TRANSACTION_CATEGORY_INVALID"
  | "TRANSACTION_CATEGORY_ARCHIVED";

export class TransactionError extends Error {
  readonly code: TransactionErrorCode;
  readonly statusCode = 400;

  constructor(code: TransactionErrorCode, message: string) {
    super(message);
    this.name = "TransactionError";
    this.code = code;
  }
}

export type TransactionMovementDirection = "debit" | "credit";

export interface TransactionMovement {
  transactionId: EntityId;
  accountId: EntityId;
  direction: TransactionMovementDirection;
  amountMinor: number;
}

export interface TransactionMutationResult {
  transaction: Transaction;
  movements: readonly TransactionMovement[];
  auditEntry: AuditLogEntryDraft;
}

export interface CreateTransactionInput {
  id: EntityId;
  context: TenantContext;
  now: ISODateTime;
  payload: CreateTransactionPayload;
  account?: Account;
  destinationAccount?: Account;
  category?: Category;
  transferGroupId?: EntityId;
}

export interface CreateTransactionPayload {
  kind: TransactionKind;
  amountMinor: number;
  occurredOn: ISODate;
  accountId: EntityId;
  plannedOn?: ISODate;
  effectiveOn?: ISODate | null;
  description?: string;
  status?: TransactionStatus;
  source?: TransactionSource;
  currency?: string;
  destinationAccountId?: EntityId;
  categoryId?: EntityId;
  organizationId?: EntityId;
  financialProfileId?: EntityId;
}

export interface UpdateTransactionInput {
  context: TenantContext;
  transaction: Transaction | undefined;
  now: ISODateTime;
  payload: UpdateTransactionPayload;
  account?: Account;
  destinationAccount?: Account;
  category?: Category;
}

export interface UpdateTransactionPayload {
  kind?: TransactionKind;
  status?: TransactionStatus;
  source?: TransactionSource;
  amountMinor?: number;
  currency?: string;
  occurredOn?: ISODate;
  plannedOn?: ISODate;
  effectiveOn?: ISODate | null;
  description?: string;
  accountId?: EntityId;
  destinationAccountId?: EntityId;
  categoryId?: EntityId;
  organizationId?: EntityId;
  financialProfileId?: EntityId;
}

export interface ListTransactionsFilters {
  status?: TransactionStatus | "all";
  kind?: TransactionKind;
  accountId?: EntityId;
  categoryId?: EntityId;
  occurredFrom?: ISODate;
  occurredTo?: ISODate;
  plannedFrom?: ISODate;
  plannedTo?: ISODate;
  effectiveFrom?: ISODate;
  effectiveTo?: ISODate;
}

const ALLOWED_TRANSACTION_KINDS: readonly TransactionKind[] = ["income", "expense", "transfer"];
const ALLOWED_TRANSACTION_STATUSES: readonly TransactionStatus[] = [
  "planned",
  "posted",
  "reconciled",
  "suggested",
  "voided",
];
const ALLOWED_TRANSACTION_SOURCES: readonly TransactionSource[] = [
  "manual",
  "recurrence",
  "installment",
  "import",
  "ai_suggestion",
];

export function createTransaction(input: CreateTransactionInput): TransactionMutationResult {
  const payload = applyTenantScope(input.context, input.payload);
  const kind = validateTransactionKind(payload.kind);
  const transaction = buildTransaction({
    id: input.id,
    context: input.context,
    now: input.now,
    payload,
    kind,
    existingTransaction: undefined,
    account: input.account,
    destinationAccount: input.destinationAccount,
    category: input.category,
    transferGroupId: input.transferGroupId,
  });

  return {
    transaction,
    movements: buildTransactionMovements(transaction),
    auditEntry: buildTransactionMutationAuditEntry({
      action: "create",
      actorId: input.context.userId,
      after: transaction,
      occurredAt: input.now,
    }),
  };
}

export function listTransactions(
  context: TenantContext,
  transactions: readonly Transaction[],
  filters: ListTransactionsFilters = {},
): Transaction[] {
  return listTenantScopedResources(context, transactions).filter((transaction) => {
    const statusMatches =
      filters.status === undefined ||
      filters.status === "all" ||
      transaction.status === filters.status;
    const kindMatches = filters.kind === undefined || transaction.kind === filters.kind;
    const accountMatches =
      filters.accountId === undefined ||
      transaction.accountId === filters.accountId ||
      transaction.destinationAccountId === filters.accountId;
    const categoryMatches =
      filters.categoryId === undefined || transaction.categoryId === filters.categoryId;
    const fromMatches =
      filters.occurredFrom === undefined || transaction.occurredOn >= filters.occurredFrom;
    const toMatches =
      filters.occurredTo === undefined || transaction.occurredOn <= filters.occurredTo;
    const plannedFromMatches =
      filters.plannedFrom === undefined || transaction.plannedOn >= filters.plannedFrom;
    const plannedToMatches =
      filters.plannedTo === undefined || transaction.plannedOn <= filters.plannedTo;
    const effectiveFromMatches =
      filters.effectiveFrom === undefined ||
      (transaction.effectiveOn !== undefined && transaction.effectiveOn >= filters.effectiveFrom);
    const effectiveToMatches =
      filters.effectiveTo === undefined ||
      (transaction.effectiveOn !== undefined && transaction.effectiveOn <= filters.effectiveTo);

    return (
      statusMatches &&
      kindMatches &&
      accountMatches &&
      categoryMatches &&
      fromMatches &&
      toMatches &&
      plannedFromMatches &&
      plannedToMatches &&
      effectiveFromMatches &&
      effectiveToMatches
    );
  });
}

export function getTransaction(
  context: TenantContext,
  transaction: Transaction | undefined,
): Transaction {
  return getTenantScopedResource(context, transaction);
}

export function updateTransaction(input: UpdateTransactionInput): TransactionMutationResult {
  const currentTransaction = updateTenantScopedResource(
    input.context,
    input.transaction,
    input.payload,
  );
  const kind = validateTransactionKind(input.payload.kind ?? currentTransaction.kind);
  const nextStatus = input.payload.status ?? currentTransaction.status;
  const nextEffectiveOn =
    input.payload.effectiveOn !== undefined
      ? input.payload.effectiveOn
      : nextStatus === "planned" || nextStatus === "suggested"
        ? null
        : currentTransaction.effectiveOn;
  const payload: CreateTransactionPayload = {
    kind,
    status: nextStatus,
    source: input.payload.source ?? currentTransaction.source,
    amountMinor: input.payload.amountMinor ?? currentTransaction.amountMinor,
    currency: input.payload.currency ?? currentTransaction.currency,
    occurredOn:
      input.payload.occurredOn ??
      input.payload.effectiveOn ??
      input.payload.plannedOn ??
      currentTransaction.occurredOn,
    plannedOn: input.payload.plannedOn ?? currentTransaction.plannedOn,
    effectiveOn: nextEffectiveOn,
    description: input.payload.description ?? currentTransaction.description,
    accountId: input.payload.accountId ?? requireAccountId(currentTransaction.accountId),
    organizationId: currentTransaction.organizationId,
    financialProfileId: currentTransaction.financialProfileId,
  };

  const nextDestinationAccountId =
    input.payload.destinationAccountId ??
    (kind === "transfer" ? currentTransaction.destinationAccountId : undefined);
  const nextCategoryId = input.payload.categoryId ?? currentTransaction.categoryId;

  if (nextDestinationAccountId !== undefined) {
    payload.destinationAccountId = nextDestinationAccountId;
  }

  if (nextCategoryId !== undefined) {
    payload.categoryId = nextCategoryId;
  }

  const transaction = buildTransaction({
    id: currentTransaction.id,
    context: input.context,
    now: input.now,
    payload,
    kind,
    existingTransaction: currentTransaction,
    account: input.account,
    destinationAccount: input.destinationAccount,
    category: input.category,
    transferGroupId: currentTransaction.transferGroupId,
  });

  return {
    transaction,
    movements: buildTransactionMovements(transaction),
    auditEntry: buildTransactionMutationAuditEntry({
      action: "update",
      actorId: input.context.userId,
      before: currentTransaction,
      after: transaction,
      occurredAt: input.now,
    }),
  };
}

export function voidTransaction(
  context: TenantContext,
  transaction: Transaction | undefined,
  now: ISODateTime,
): TransactionMutationResult {
  const currentTransaction = getTenantScopedResource(context, transaction);
  const voidedTransaction = {
    ...currentTransaction,
    status: "voided",
    updatedAt: now,
    updatedByUserId: context.userId,
    voidedAt: now,
  } satisfies Transaction;

  return {
    transaction: voidedTransaction,
    movements: [],
    auditEntry: buildTransactionMutationAuditEntry({
      action: "soft_delete",
      actorId: context.userId,
      before: currentTransaction,
      after: voidedTransaction,
      occurredAt: now,
    }),
  };
}

export function buildTransactionMovements(
  transaction: Pick<
    Transaction,
    "id" | "kind" | "amountMinor" | "accountId" | "destinationAccountId" | "status"
  >,
): TransactionMovement[] {
  if (transaction.status === "voided") {
    return [];
  }

  if (transaction.kind === "income") {
    return [
      {
        transactionId: transaction.id,
        accountId: requireAccountId(transaction.accountId),
        direction: "credit",
        amountMinor: transaction.amountMinor,
      },
    ];
  }

  if (transaction.kind === "expense") {
    return [
      {
        transactionId: transaction.id,
        accountId: requireAccountId(transaction.accountId),
        direction: "debit",
        amountMinor: transaction.amountMinor,
      },
    ];
  }

  return [
    {
      transactionId: transaction.id,
      accountId: requireAccountId(transaction.accountId),
      direction: "debit",
      amountMinor: transaction.amountMinor,
    },
    {
      transactionId: transaction.id,
      accountId: requireDestinationAccountId(transaction.destinationAccountId),
      direction: "credit",
      amountMinor: transaction.amountMinor,
    },
  ];
}

interface BuildTransactionInput {
  id: EntityId;
  context: TenantContext;
  now: ISODateTime;
  payload: CreateTransactionPayload;
  kind: TransactionKind;
  existingTransaction: Transaction | undefined;
  account: Account | undefined;
  destinationAccount: Account | undefined;
  category: Category | undefined;
  transferGroupId: EntityId | undefined;
}

function buildTransaction(input: BuildTransactionInput): Transaction {
  const account = assertAccount(input.context, input.account, input.payload.accountId);
  const destinationAccount = assertDestinationAccount(input);
  assertCategory(input.context, input.category, input.payload.categoryId, input.kind);

  const status = validateTransactionStatus(input.payload.status ?? "posted");
  const plannedOn = validateTransactionDate(input.payload.plannedOn ?? input.payload.occurredOn);
  const effectiveOn = resolveEffectiveOn(status, input.payload.effectiveOn, input.payload.occurredOn);
  const transaction: Transaction = {
    id: input.id,
    organizationId: input.context.organizationId,
    financialProfileId: input.context.financialProfileId,
    kind: input.kind,
    status,
    source: validateTransactionSource(input.payload.source ?? "manual"),
    amountMinor: validateAmount(input.payload.amountMinor),
    currency: normalizeCurrency(input.payload.currency ?? account.currency),
    occurredOn: effectiveOn ?? plannedOn,
    plannedOn,
    description: normalizeDescription(input.payload.description),
    accountId: account.id,
    createdAt: input.existingTransaction?.createdAt ?? input.now,
    updatedAt: input.now,
    createdByUserId: input.existingTransaction?.createdByUserId ?? input.context.userId,
    updatedByUserId: input.context.userId,
  };

  if (effectiveOn !== undefined) {
    transaction.effectiveOn = effectiveOn;
  }

  if (input.kind === "transfer") {
    transaction.destinationAccountId = destinationAccount.id;
    transaction.transferGroupId =
      input.transferGroupId ?? input.existingTransaction?.transferGroupId ?? input.id;
  }

  if (input.payload.categoryId !== undefined) {
    transaction.categoryId = input.payload.categoryId;
  }

  if (status === "reconciled") {
    transaction.reconciledAt = input.existingTransaction?.reconciledAt ?? input.now;
  }

  if (status === "voided") {
    transaction.voidedAt = input.existingTransaction?.voidedAt ?? input.now;
  }

  return transaction;
}

function assertAccount(
  context: TenantContext,
  account: Account | undefined,
  accountId: EntityId,
): Account {
  const scopedAccount = getTenantScopedResource(context, account);

  if (scopedAccount.id !== accountId) {
    throw new TransactionError(
      "TRANSACTION_ACCOUNT_INVALID",
      "Transaction account id does not match.",
    );
  }

  if (scopedAccount.status !== "active") {
    throw new TransactionError(
      "TRANSACTION_ACCOUNT_ARCHIVED",
      "Transaction account must be active.",
    );
  }

  return scopedAccount;
}

function assertDestinationAccount(input: BuildTransactionInput): Account {
  if (input.kind !== "transfer") {
    if (input.payload.destinationAccountId !== undefined) {
      throw new TransactionError(
        "TRANSACTION_DESTINATION_ACCOUNT_INVALID",
        "Only transfer transactions can define a destination account.",
      );
    }

    return input.account as Account;
  }

  const destinationAccountId = input.payload.destinationAccountId;

  if (!destinationAccountId) {
    throw new TransactionError(
      "TRANSACTION_DESTINATION_ACCOUNT_REQUIRED",
      "Transfer transactions require a destination account.",
    );
  }

  const destinationAccount = getTenantScopedResource(input.context, input.destinationAccount);

  if (destinationAccount.id !== destinationAccountId) {
    throw new TransactionError(
      "TRANSACTION_DESTINATION_ACCOUNT_INVALID",
      "Transfer destination account id does not match.",
    );
  }

  if (input.payload.accountId === destinationAccount.id) {
    throw new TransactionError(
      "TRANSACTION_TRANSFER_SAME_ACCOUNT",
      "Transfer transactions require different source and destination accounts.",
    );
  }

  if (destinationAccount.status !== "active") {
    throw new TransactionError(
      "TRANSACTION_ACCOUNT_ARCHIVED",
      "Transfer destination account must be active.",
    );
  }

  return destinationAccount;
}

function assertCategory(
  context: TenantContext,
  category: Category | undefined,
  categoryId: EntityId | undefined,
  kind: TransactionKind,
): void {
  if (!categoryId) {
    return;
  }

  const scopedCategory = getTenantScopedResource(context, category);

  if (scopedCategory.id !== categoryId) {
    throw new TransactionError(
      "TRANSACTION_CATEGORY_INVALID",
      "Transaction category id does not match.",
    );
  }

  if (scopedCategory.status !== "active") {
    throw new TransactionError(
      "TRANSACTION_CATEGORY_ARCHIVED",
      "Transaction category must be active.",
    );
  }

  assertCategorySupportsTransactionKind(scopedCategory, kind);
}

function validateTransactionKind(kind: TransactionKind | undefined): TransactionKind {
  if (!kind) {
    throw new TransactionError("TRANSACTION_KIND_REQUIRED", "Transaction kind is required.");
  }

  if (!ALLOWED_TRANSACTION_KINDS.includes(kind)) {
    throw new TransactionError("TRANSACTION_KIND_INVALID", "Transaction kind is not supported.");
  }

  return kind;
}

function validateTransactionStatus(status: TransactionStatus): TransactionStatus {
  if (!ALLOWED_TRANSACTION_STATUSES.includes(status)) {
    throw new TransactionError(
      "TRANSACTION_STATUS_INVALID",
      "Transaction status is not supported.",
    );
  }

  return status;
}

function validateTransactionSource(source: TransactionSource): TransactionSource {
  if (!ALLOWED_TRANSACTION_SOURCES.includes(source)) {
    throw new TransactionError(
      "TRANSACTION_SOURCE_INVALID",
      "Transaction source is not supported.",
    );
  }

  return source;
}

function validateAmount(amountMinor: number): number {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new TransactionError(
      "TRANSACTION_AMOUNT_INVALID",
      "Transaction amount must be a positive integer minor-unit amount.",
    );
  }

  return amountMinor;
}

function validateTransactionDate(value: ISODate): ISODate {
  if (!value.trim()) {
    throw new TransactionError("TRANSACTION_DATE_REQUIRED", "Transaction date is required.");
  }

  return value;
}

function resolveEffectiveOn(
  status: TransactionStatus,
  effectiveOn: ISODate | null | undefined,
  fallbackOccurredOn: ISODate,
): ISODate | undefined {
  if (effectiveOn === null) {
    return undefined;
  }

  if (effectiveOn !== undefined) {
    return validateTransactionDate(effectiveOn);
  }

  if (status === "planned" || status === "suggested") {
    return undefined;
  }

  return validateTransactionDate(fallbackOccurredOn);
}

function normalizeDescription(description = ""): string {
  return description.trim();
}

function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

function requireAccountId(accountId: EntityId | undefined): EntityId {
  if (!accountId) {
    throw new TransactionError("TRANSACTION_ACCOUNT_REQUIRED", "Transaction account is required.");
  }

  return accountId;
}

function requireDestinationAccountId(destinationAccountId: EntityId | undefined): EntityId {
  if (!destinationAccountId) {
    throw new TransactionError(
      "TRANSACTION_DESTINATION_ACCOUNT_REQUIRED",
      "Transfer transactions require a destination account.",
    );
  }

  return destinationAccountId;
}

function buildTransactionMutationAuditEntry(input: {
  action: "create" | "update" | "soft_delete";
  actorId: EntityId;
  before?: Transaction;
  after?: Transaction;
  occurredAt: ISODateTime;
}): AuditLogEntryDraft {
  const transaction = input.after ?? input.before;

  if (!transaction) {
    throw new Error("Transaction audit requires a before or after transaction snapshot.");
  }

  const entry: AuditLogEntryDraft = {
    organizationId: transaction.organizationId,
    financialProfileId: transaction.financialProfileId,
    occurredAt: input.occurredAt,
    actorKind: "user",
    actorId: input.actorId,
    action: input.action,
    entityKind: "transaction",
    entityId: transaction.id,
  };

  const redactedChanges = buildRedactedTransactionChanges(input.before, input.after);

  if (redactedChanges !== undefined) {
    entry.redactedChanges = redactedChanges;
  }

  return entry;
}

function buildRedactedTransactionChanges(
  before: Transaction | undefined,
  after: Transaction | undefined,
): Record<string, "changed" | "added" | "removed"> | undefined {
  const fields = [
    "kind",
    "status",
    "source",
    "amountMinor",
    "currency",
    "occurredOn",
    "plannedOn",
    "effectiveOn",
    "description",
    "accountId",
    "destinationAccountId",
    "categoryId",
    "transferGroupId",
    "reconciledAt",
    "voidedAt",
  ] as const satisfies readonly (keyof Transaction)[];
  const changes: Record<string, "changed" | "added" | "removed"> = {};

  for (const field of fields) {
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
