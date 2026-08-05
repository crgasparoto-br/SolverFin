import { randomUUID } from "node:crypto";

import {
  createTransaction as createTransactionDomain,
  type Account,
  type Category,
  type TenantContext,
  type Transaction,
  type TransactionKind,
} from "@solverfin/domain";

import type { QueryExecutor } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";

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
}

interface CategoryRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  parentCategoryId: string | null;
  name: string;
  kind: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AiSuggestionTransactionDraft {
  kind: TransactionKind;
  amountMinor: number;
  occurredOn: string;
  accountId: string;
  description: string;
  currency?: string;
  categoryId?: string;
  otherAccountId?: string;
  destinationAccountId?: string;
}

export async function createAiSuggestionTransaction(
  executeQuery: QueryExecutor,
  context: TenantContext,
  suggestionId: string,
  draft: AiSuggestionTransactionDraft,
  now: string,
): Promise<Transaction> {
  const destinationAccountId = draft.destinationAccountId ?? draft.otherAccountId;
  const account = await findAccount(executeQuery, context, draft.accountId);
  const destinationAccount = destinationAccountId
    ? await findAccount(executeQuery, context, destinationAccountId)
    : undefined;
  const category = draft.categoryId
    ? await findCategory(executeQuery, context, draft.categoryId)
    : undefined;

  const result = createTransactionDomain({
    id: randomUUID(),
    context,
    now,
    payload: {
      kind: draft.kind,
      amountMinor: draft.amountMinor,
      occurredOn: draft.occurredOn,
      accountId: draft.accountId,
      description: draft.description,
      status: "posted",
      source: "ai_suggestion",
      ...(draft.currency === undefined ? {} : { currency: draft.currency }),
      ...(destinationAccountId === undefined ? {} : { destinationAccountId }),
      ...(draft.categoryId === undefined ? {} : { categoryId: draft.categoryId }),
    },
    ...(account === undefined ? {} : { account }),
    ...(destinationAccount === undefined ? {} : { destinationAccount }),
    ...(category === undefined ? {} : { category }),
  });
  const transaction: Transaction = {
    ...result.transaction,
    aiSuggestionId: suggestionId,
  };

  await executeQuery(buildInsertSql(), buildParams(transaction));
  await insertAuditLogEntry(executeQuery, result.auditEntry);
  return transaction;
}

async function findAccount(
  executeQuery: QueryExecutor,
  context: TenantContext,
  accountId: string,
): Promise<Account | undefined> {
  const rows = await executeQuery<AccountRow>(
    `select "id", "organizationId", "financialProfileId", "name", "kind", "status", "currency",
            "openingBalanceMinor", "maskedIdentifier", "createdAt", "updatedAt"
       from "Account"
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [accountId, context.organizationId, context.financialProfileId],
  );
  const row = rows[0];
  return row === undefined
    ? undefined
    : {
        id: row.id,
        organizationId: row.organizationId,
        financialProfileId: row.financialProfileId,
        name: row.name,
        kind: row.kind.toLowerCase() as Account["kind"],
        status: row.status.toLowerCase() as Account["status"],
        currency: row.currency,
        openingBalanceMinor: row.openingBalanceMinor,
        ...(row.maskedIdentifier === null ? {} : { maskedIdentifier: row.maskedIdentifier }),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
}

async function findCategory(
  executeQuery: QueryExecutor,
  context: TenantContext,
  categoryId: string,
): Promise<Category | undefined> {
  const rows = await executeQuery<CategoryRow>(
    `select "id", "organizationId", "financialProfileId", "parentCategoryId", "name", "kind", "status",
            "createdAt", "updatedAt"
       from "Category"
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [categoryId, context.organizationId, context.financialProfileId],
  );
  const row = rows[0];
  return row === undefined
    ? undefined
    : {
        id: row.id,
        organizationId: row.organizationId,
        financialProfileId: row.financialProfileId,
        name: row.name,
        kind: row.kind.toLowerCase() as Category["kind"],
        status: row.status.toLowerCase() as Category["status"],
        ...(row.parentCategoryId === null ? {} : { parentCategoryId: row.parentCategoryId }),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
}

function buildInsertSql(): string {
  return `insert into "Transaction"
    ("id", "organizationId", "financialProfileId", "accountId", "destinationAccountId", "categoryId",
     "aiSuggestionId", "transferGroupId", "kind", "status", "source", "amountMinor", "currency",
     "occurredOn", "plannedOn", "effectiveOn", "description", "reconciledAt", "voidedAt", "createdAt",
     "updatedAt", "createdByUserId", "updatedByUserId")
   values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
           $19, $20, $21, $22, $23)`;
}

function buildParams(transaction: Transaction): unknown[] {
  return [
    transaction.id,
    transaction.organizationId,
    transaction.financialProfileId,
    transaction.accountId ?? null,
    transaction.destinationAccountId ?? null,
    transaction.categoryId ?? null,
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
    transaction.createdAt,
    transaction.updatedAt,
    transaction.createdByUserId ?? null,
    transaction.updatedByUserId ?? null,
  ];
}
