import { randomUUID } from "node:crypto";

import {
  TransactionGroupError,
  validateTransactionGroupMembers,
  type TenantContext,
  type Transaction,
  type TransactionKind,
  type TransactionSource,
  type TransactionStatus,
} from "@solverfin/domain";

import { query, withTransaction, type QueryExecutor } from "../db.js";
import { toDateOnly } from "./repository-date-utils.js";

interface GroupRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  accountId: string;
  description: string;
  displayOn: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface MemberRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  accountId: string | null;
  categoryId: string | null;
  cardId: string | null;
  invoiceId: string | null;
  recurrenceId: string | null;
  installmentId: string | null;
  importBatchId: string | null;
  transferGroupId: string | null;
  transactionGroupId: string | null;
  kind: string;
  status: string;
  source: string;
  amountMinor: number;
  currency: string;
  occurredOn: Date;
  plannedOn: Date;
  effectiveOn: Date | null;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  categoryName: string | null;
}

export interface TransactionGroupRecord {
  id: string;
  organizationId: string;
  financialProfileId: string;
  accountId: string;
  description: string;
  displayOn: string;
  kind: "income" | "expense";
  status: TransactionStatus;
  currency: string;
  totalAmountMinor: number;
  members: Array<Transaction & { categoryName?: string; transactionGroupId?: string }>;
}

export async function createTransactionGroupForContext(
  context: TenantContext,
  input: { memberIds: string[]; description: string; displayOn: string },
): Promise<TransactionGroupRecord> {
  const memberIds = [...new Set(input.memberIds)];
  const description = input.description.trim();
  if (!description || description.length > 240) {
    throw new TransactionGroupError(
      "TRANSACTION_GROUP_DESCRIPTION_INVALID",
      "Informe uma descrição de até 240 caracteres.",
      400,
    );
  }
  if (!isDateOnly(input.displayOn)) {
    throw new TransactionGroupError(
      "TRANSACTION_GROUP_DISPLAY_DATE_INVALID",
      "Informe uma data de exibição válida.",
      400,
    );
  }

  return withTransaction(async (executeQuery) => {
    const members = await loadMembers(executeQuery, context, memberIds, true);
    if (members.length !== memberIds.length) {
      throw new TransactionGroupError(
        "TENANT_RESOURCE_NOT_FOUND",
        "Lançamento não encontrado para este perfil.",
        404,
      );
    }
    validateTransactionGroupMembers(context, members);
    const groupId = randomUUID();
    await executeQuery(
      `insert into "TransactionGroup" ("id", "organizationId", "financialProfileId", "accountId", "description", "displayOn", "createdByUserId", "updatedAt")
       values ($1,$2,$3,$4,$5,$6,$7,now())`,
      [
        groupId,
        context.organizationId,
        context.financialProfileId,
        members[0]?.accountId,
        description,
        input.displayOn,
        context.userId,
      ],
    );
    const updated = await executeQuery<{ id: string }>(
      `update "Transaction" set "transactionGroupId"=$1, "updatedAt"=now()
       where "organizationId"=$2 and "financialProfileId"=$3 and "id"=any($4::uuid[]) and "transactionGroupId" is null
       returning "id"`,
      [groupId, context.organizationId, context.financialProfileId, memberIds],
    );
    if (updated.length !== memberIds.length) {
      throw new TransactionGroupError(
        "TRANSACTION_GROUP_CONFLICT",
        "Os lançamentos foram alterados por outra operação. Recarregue o extrato.",
        409,
      );
    }
    await insertAudit(executeQuery, context, groupId, "create", memberIds.length);
    return getGroup(executeQuery, context, groupId);
  });
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export async function listTransactionGroupsForContext(
  context: TenantContext,
  filters: { accountId: string; startsOn: string; endsOn: string },
): Promise<TransactionGroupRecord[]> {
  const rows = await query<GroupRow>(
    `select * from "TransactionGroup" where "organizationId"=$1 and "financialProfileId"=$2 and "accountId"=$3 and "displayOn" between $4 and $5 order by "displayOn"`,
    [
      context.organizationId,
      context.financialProfileId,
      filters.accountId,
      filters.startsOn,
      filters.endsOn,
    ],
  );
  const groups = await Promise.all(rows.map((row) => hydrateGroup(query, context, row)));
  return groups.filter((group) => {
    if (group.members.length >= 2) return true;
    reportInvalidLegacyGroup(group.id, group.members.length);
    return false;
  });
}

function reportInvalidLegacyGroup(groupId: string, memberCount: number): void {
  console.warn(
    JSON.stringify({
      code: "TRANSACTION_GROUP_INVALID_LEGACY_MEMBERSHIP",
      groupId,
      memberCount,
    }),
  );
}

export async function getTransactionGroupForContext(context: TenantContext, groupId: string) {
  return getGroup(query, context, groupId);
}

export async function ungroupTransactionsForContext(context: TenantContext, groupId: string) {
  return withTransaction(async (executeQuery) => {
    const group = await getGroup(executeQuery, context, groupId);
    await executeQuery(
      `update "Transaction" set "transactionGroupId"=null, "updatedAt"=now() where "organizationId"=$1 and "financialProfileId"=$2 and "transactionGroupId"=$3`,
      [context.organizationId, context.financialProfileId, groupId],
    );
    await executeQuery(
      `delete from "TransactionGroup" where "organizationId"=$1 and "financialProfileId"=$2 and "id"=$3`,
      [context.organizationId, context.financialProfileId, groupId],
    );
    await insertAudit(executeQuery, context, groupId, "update", group.members.length);
    return { ungroupedMemberIds: group.members.map((member) => member.id) };
  });
}

async function getGroup(executeQuery: QueryExecutor, context: TenantContext, groupId: string) {
  const rows = await executeQuery<GroupRow>(
    `select * from "TransactionGroup" where "organizationId"=$1 and "financialProfileId"=$2 and "id"=$3`,
    [context.organizationId, context.financialProfileId, groupId],
  );
  if (!rows[0])
    throw new TransactionGroupError(
      "TENANT_RESOURCE_NOT_FOUND",
      "Grupo não encontrado para este perfil.",
      404,
    );
  return hydrateGroup(executeQuery, context, rows[0]);
}

async function hydrateGroup(
  executeQuery: QueryExecutor,
  context: TenantContext,
  row: GroupRow,
): Promise<TransactionGroupRecord> {
  const members = await loadMembers(executeQuery, context, undefined, false, row.id);
  const valid =
    members.length >= 2
      ? validateTransactionGroupMembers(
          context,
          members.map(({ transactionGroupId: _groupId, ...member }) => member),
        )
      : undefined;
  return {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    accountId: row.accountId,
    description: row.description,
    displayOn: toDateOnly(row.displayOn),
    kind: valid?.kind ?? "expense",
    status: valid?.status ?? "posted",
    currency: valid?.currency ?? "BRL",
    totalAmountMinor: valid?.totalAmountMinor ?? 0,
    members,
  };
}

async function loadMembers(
  executeQuery: QueryExecutor,
  context: TenantContext,
  ids?: string[],
  lock = false,
  groupId?: string,
) {
  if (ids && ids.length === 0) return [];
  const params: unknown[] = [context.organizationId, context.financialProfileId, groupId ?? ids];
  const predicate = groupId ? `t."transactionGroupId"=$3` : `t."id"=any($3::uuid[])`;
  const rows = await executeQuery<MemberRow>(
    `select t.*, c."name" as "categoryName" from "Transaction" t left join "Category" c on c."id"=t."categoryId" and c."organizationId"=t."organizationId" and c."financialProfileId"=t."financialProfileId"
     where t."organizationId"=$1 and t."financialProfileId"=$2 and ${predicate} order by t."occurredOn", t."createdAt" ${lock ? "for update of t" : ""}`,
    params,
  );
  return rows.map(mapMember);
}

function mapMember(
  row: MemberRow,
): Transaction & { categoryName?: string; transactionGroupId?: string } {
  return {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    kind: row.kind.toLowerCase() as TransactionKind,
    status: row.status.toLowerCase() as TransactionStatus,
    source: row.source.toLowerCase() as TransactionSource,
    amountMinor: row.amountMinor,
    currency: row.currency,
    occurredOn: toDateOnly(row.occurredOn),
    plannedOn: toDateOnly(row.plannedOn),
    ...(row.effectiveOn ? { effectiveOn: toDateOnly(row.effectiveOn) } : {}),
    description: row.description,
    ...(row.accountId ? { accountId: row.accountId } : {}),
    ...(row.categoryId ? { categoryId: row.categoryId } : {}),
    ...(row.cardId ? { cardId: row.cardId } : {}),
    ...(row.invoiceId ? { invoiceId: row.invoiceId } : {}),
    ...(row.recurrenceId ? { recurrenceId: row.recurrenceId } : {}),
    ...(row.installmentId ? { installmentId: row.installmentId } : {}),
    ...(row.importBatchId ? { importBatchId: row.importBatchId } : {}),
    ...(row.transferGroupId ? { transferGroupId: row.transferGroupId } : {}),
    ...(row.transactionGroupId ? { transactionGroupId: row.transactionGroupId } : {}),
    ...(row.categoryName ? { categoryName: row.categoryName } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function insertAudit(
  executeQuery: QueryExecutor,
  context: TenantContext,
  groupId: string,
  action: "create" | "update",
  memberCount: number,
) {
  await executeQuery(
    `insert into "AuditLogEntry" ("id","organizationId","financialProfileId","occurredAt","actorKind","actorId","action","entityKind","entityId","redactedChanges") values ($1,$2,$3,now(),$4,$5,$6,'TRANSACTION',$7,$8)`,
    [
      randomUUID(),
      context.organizationId,
      context.financialProfileId,
      "USER",
      context.userId,
      action.toUpperCase(),
      groupId,
      JSON.stringify({ grouping: action === "create" ? "added" : "removed", memberCount }),
    ],
  );
}
