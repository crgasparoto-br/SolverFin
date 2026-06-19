import type {
  Account,
  AccountKind,
  AccountStatus,
  EntityId,
  FinancialInstitutionKey,
  ISODateTime,
} from "./index.js";
import type { TenantContext } from "./tenant.js";
import {
  isFinancialInstitutionKey,
  normalizeOptionalCatalogKey,
} from "./visual-identities.js";
import {
  applyTenantScope,
  getTenantScopedResource,
  listTenantScopedResources,
  updateTenantScopedResource,
} from "./tenant-authorization.js";

export type AccountErrorCode =
  | "ACCOUNT_NAME_REQUIRED"
  | "ACCOUNT_KIND_REQUIRED"
  | "ACCOUNT_KIND_INVALID"
  | "ACCOUNT_CURRENCY_INVALID"
  | "ACCOUNT_OPENING_BALANCE_INVALID"
  | "ACCOUNT_OPENING_BALANCE_LOCKED"
  | "ACCOUNT_INSTITUTION_KEY_INVALID";

export class AccountError extends Error {
  readonly code: AccountErrorCode;
  readonly statusCode = 400;

  constructor(code: AccountErrorCode, message: string) {
    super(message);
    this.name = "AccountError";
    this.code = code;
  }
}

export interface CreateAccountInput {
  id: EntityId;
  context: TenantContext;
  now: ISODateTime;
  payload: CreateAccountPayload;
}

export interface CreateAccountPayload {
  name: string;
  kind: AccountKind;
  openingBalanceMinor?: number;
  currency?: string;
  maskedIdentifier?: string;
  institutionKey?: string;
}

export interface UpdateAccountInput {
  context: TenantContext;
  account: Account | undefined;
  now: ISODateTime;
  payload: UpdateAccountPayload;
  hasTransactions?: boolean;
}

export interface UpdateAccountPayload {
  name?: string;
  kind?: AccountKind;
  status?: AccountStatus;
  openingBalanceMinor?: number;
  currency?: string;
  maskedIdentifier?: string;
  institutionKey?: string;
  organizationId?: EntityId;
  financialProfileId?: EntityId;
}

export interface ListAccountsFilters {
  status?: AccountStatus | "all";
}

const ALLOWED_ACCOUNT_KINDS: readonly AccountKind[] = [
  "checking",
  "savings",
  "cash",
  "investment",
  "other",
];

export function createAccount(input: CreateAccountInput): Account {
  const payload = applyTenantScope(input.context, input.payload);
  const account: Account = {
    id: input.id,
    organizationId: payload.organizationId,
    financialProfileId: payload.financialProfileId,
    name: normalizeAccountName(payload.name),
    kind: validateAccountKind(payload.kind),
    status: "active",
    currency: normalizeCurrency(payload.currency),
    openingBalanceMinor: validateOpeningBalance(payload.openingBalanceMinor ?? 0),
    createdAt: input.now,
    updatedAt: input.now,
    createdByUserId: input.context.userId,
    updatedByUserId: input.context.userId,
    ...(payload.maskedIdentifier ? { maskedIdentifier: payload.maskedIdentifier.trim() } : {}),
  };
  const institutionKey = validateOptionalInstitutionKey(payload.institutionKey);

  if (institutionKey !== undefined) {
    account.institutionKey = institutionKey;
  }

  return account;
}

export function listAccounts(
  context: TenantContext,
  accounts: readonly Account[],
  filters: ListAccountsFilters = {},
): Account[] {
  const scopedAccounts = listTenantScopedResources(context, accounts);

  if (filters.status === "all") {
    return scopedAccounts;
  }

  return scopedAccounts.filter((account) => account.status === (filters.status ?? "active"));
}

export function getAccount(context: TenantContext, account: Account | undefined): Account {
  return getTenantScopedResource(context, account);
}

export function updateAccount(input: UpdateAccountInput): Account {
  const currentAccount = updateTenantScopedResource(input.context, input.account, input.payload);
  const nextOpeningBalance = getNextOpeningBalance(
    currentAccount,
    input.payload,
    input.hasTransactions,
  );

  return {
    ...currentAccount,
    ...buildOptionalAccountUpdate(input.payload),
    openingBalanceMinor: nextOpeningBalance,
    updatedAt: input.now,
    updatedByUserId: input.context.userId,
  };
}

export function archiveAccount(
  context: TenantContext,
  account: Account | undefined,
  now: ISODateTime,
): Account {
  const currentAccount = getTenantScopedResource(context, account);

  return {
    ...currentAccount,
    status: "archived",
    updatedAt: now,
    updatedByUserId: context.userId,
  };
}

function buildOptionalAccountUpdate(payload: UpdateAccountPayload): Partial<Account> {
  const update: Partial<Account> = {};

  if (payload.name !== undefined) {
    update.name = normalizeAccountName(payload.name);
  }

  if (payload.kind !== undefined) {
    update.kind = validateAccountKind(payload.kind);
  }

  if (payload.status !== undefined) {
    update.status = payload.status;
  }

  if (payload.currency !== undefined) {
    update.currency = normalizeCurrency(payload.currency);
  }

  if (payload.maskedIdentifier !== undefined) {
    update.maskedIdentifier = payload.maskedIdentifier.trim();
  }

  if (payload.institutionKey !== undefined) {
    update.institutionKey = validateOptionalInstitutionKey(payload.institutionKey);
  }

  return update;
}

function getNextOpeningBalance(
  account: Account,
  payload: UpdateAccountPayload,
  hasTransactions = false,
): number {
  if (payload.openingBalanceMinor === undefined) {
    return account.openingBalanceMinor;
  }

  if (hasTransactions) {
    throw new AccountError(
      "ACCOUNT_OPENING_BALANCE_LOCKED",
      "Opening balance cannot be changed after account transactions exist.",
    );
  }

  return validateOpeningBalance(payload.openingBalanceMinor);
}

function normalizeAccountName(name: string): string {
  const normalizedName = name.trim();

  if (!normalizedName) {
    throw new AccountError("ACCOUNT_NAME_REQUIRED", "Account name is required.");
  }

  return normalizedName;
}

function validateAccountKind(kind: AccountKind | undefined): AccountKind {
  if (!kind) {
    throw new AccountError("ACCOUNT_KIND_REQUIRED", "Account kind is required.");
  }

  if (!ALLOWED_ACCOUNT_KINDS.includes(kind)) {
    throw new AccountError("ACCOUNT_KIND_INVALID", "Account kind is not supported.");
  }

  return kind;
}

function normalizeCurrency(currency = "BRL"): string {
  const normalizedCurrency = currency.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    throw new AccountError(
      "ACCOUNT_CURRENCY_INVALID",
      "Account currency must use ISO 4217 format.",
    );
  }

  return normalizedCurrency;
}

function validateOpeningBalance(openingBalanceMinor: number): number {
  if (!Number.isInteger(openingBalanceMinor)) {
    throw new AccountError(
      "ACCOUNT_OPENING_BALANCE_INVALID",
      "Opening balance must be an integer minor-unit amount.",
    );
  }

  return openingBalanceMinor;
}

function validateOptionalInstitutionKey(value: string | undefined): FinancialInstitutionKey | undefined {
  const normalizedValue = normalizeOptionalCatalogKey(value);

  if (normalizedValue === undefined) {
    return undefined;
  }

  if (!isFinancialInstitutionKey(normalizedValue)) {
    throw new AccountError(
      "ACCOUNT_INSTITUTION_KEY_INVALID",
      "Account institution key is not supported.",
    );
  }

  return normalizedValue;
}
