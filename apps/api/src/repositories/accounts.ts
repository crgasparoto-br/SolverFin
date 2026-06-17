import { randomUUID } from "node:crypto";

import {
  archiveAccount as archiveAccountDomain,
  createAccount as createAccountDomain,
  getAccount as getAccountDomain,
  listAccounts as listAccountsDomain,
  updateAccount as updateAccountDomain,
  type Account,
  type AccountKind,
  type AccountStatus,
  type CreateAccountPayload,
  type EntityId,
  type ListAccountsFilters,
  type TenantContext,
  type UpdateAccountPayload,
} from "@solverfin/domain";

import { query } from "../db.js";

interface AccountRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  name: string;
  kind: string;
  status: string;
  currency: string;
  openingBalanceMinor: number;
  maskedIdentifier: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

const SELECT_COLUMNS = `"id", "organizationId", "financialProfileId", "name", "kind", "status",
  "currency", "openingBalanceMinor", "maskedIdentifier", "createdAt", "updatedAt",
  "createdByUserId", "updatedByUserId"`;

export async function listAccountsForContext(
  context: TenantContext,
  filters: ListAccountsFilters = {},
): Promise<Account[]> {
  const rows = await query<AccountRow>(
    `select ${SELECT_COLUMNS} from "Account"
     where "organizationId" = $1 and "financialProfileId" = $2
     order by "name" asc`,
    [context.organizationId, context.financialProfileId],
  );

  return listAccountsDomain(context, rows.map(mapAccountRow), filters);
}

export async function getAccountForContext(
  context: TenantContext,
  accountId: EntityId,
): Promise<Account> {
  const account = await findAccountRow(context, accountId);

  return getAccountDomain(context, account);
}

export async function createAccountForContext(
  context: TenantContext,
  payload: CreateAccountPayload,
): Promise<Account> {
  const account = createAccountDomain({
    id: randomUUID(),
    context,
    now: new Date().toISOString(),
    payload,
  });

  await query(
    `insert into "Account"
      ("id", "organizationId", "financialProfileId", "name", "kind", "status", "currency",
       "openingBalanceMinor", "maskedIdentifier", "createdAt", "updatedAt", "createdByUserId", "updatedByUserId")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      account.id,
      account.organizationId,
      account.financialProfileId,
      account.name,
      account.kind.toUpperCase(),
      account.status.toUpperCase(),
      account.currency,
      account.openingBalanceMinor,
      account.maskedIdentifier ?? null,
      account.createdAt,
      account.updatedAt,
      account.createdByUserId ?? null,
      account.updatedByUserId ?? null,
    ],
  );

  return account;
}

export async function updateAccountForContext(
  context: TenantContext,
  accountId: EntityId,
  payload: UpdateAccountPayload,
): Promise<Account> {
  const currentAccount = await findAccountRow(context, accountId);
  const hasTransactions = await accountHasTransactions(context, accountId);
  const updatedAccount = updateAccountDomain({
    context,
    account: currentAccount,
    now: new Date().toISOString(),
    payload,
    hasTransactions,
  });

  await persistAccountUpdate(updatedAccount);

  return updatedAccount;
}

export async function archiveAccountForContext(
  context: TenantContext,
  accountId: EntityId,
): Promise<Account> {
  const currentAccount = await findAccountRow(context, accountId);
  const archivedAccount = archiveAccountDomain(context, currentAccount, new Date().toISOString());

  await persistAccountUpdate(archivedAccount);

  return archivedAccount;
}

async function persistAccountUpdate(account: Account): Promise<void> {
  await query(
    `update "Account" set
      "name" = $2, "kind" = $3, "status" = $4, "currency" = $5, "openingBalanceMinor" = $6,
      "maskedIdentifier" = $7, "updatedAt" = $8, "updatedByUserId" = $9
     where "id" = $1`,
    [
      account.id,
      account.name,
      account.kind.toUpperCase(),
      account.status.toUpperCase(),
      account.currency,
      account.openingBalanceMinor,
      account.maskedIdentifier ?? null,
      account.updatedAt,
      account.updatedByUserId ?? null,
    ],
  );
}

async function findAccountRow(
  context: TenantContext,
  accountId: EntityId,
): Promise<Account | undefined> {
  const rows = await query<AccountRow>(
    `select ${SELECT_COLUMNS} from "Account"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [accountId, context.organizationId, context.financialProfileId],
  );

  return rows[0] ? mapAccountRow(rows[0]) : undefined;
}

async function accountHasTransactions(
  context: TenantContext,
  accountId: EntityId,
): Promise<boolean> {
  const rows = await query<{ exists: boolean }>(
    `select exists(
       select 1 from "Transaction"
       where "organizationId" = $1 and "financialProfileId" = $2
         and ("accountId" = $3 or "destinationAccountId" = $3)
     ) as "exists"`,
    [context.organizationId, context.financialProfileId, accountId],
  );

  return rows[0]?.exists ?? false;
}

function mapAccountRow(row: AccountRow): Account {
  const account: Account = {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    name: row.name,
    kind: row.kind.toLowerCase() as AccountKind,
    status: row.status.toLowerCase() as AccountStatus,
    currency: row.currency,
    openingBalanceMinor: row.openingBalanceMinor,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  if (row.maskedIdentifier !== null) {
    account.maskedIdentifier = row.maskedIdentifier;
  }

  if (row.createdByUserId !== null) {
    account.createdByUserId = row.createdByUserId;
  }

  if (row.updatedByUserId !== null) {
    account.updatedByUserId = row.updatedByUserId;
  }

  return account;
}
