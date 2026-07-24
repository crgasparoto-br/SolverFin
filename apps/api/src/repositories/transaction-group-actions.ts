import { randomUUID } from "node:crypto";

import { TransactionGroupError, type TenantContext } from "@solverfin/domain";

import { withTransaction, type QueryExecutor } from "../db.js";
import { getTransactionGroupForContext } from "./transaction-groups.js";

interface GroupRow {
  id: string;
  accountId: string;
}

interface GroupMemberRow {
  id: string;
  accountId: string | null;
  categoryId: string | null;
  installmentId: string | null;
  kind: string;
  status: string;
  amountMinor: number;
  currency: string;
  occurredOn: Date;
  plannedOn: Date;
  effectiveOn: Date | null;
  description: string;
  note: string | null;
}

export interface UpdateTransactionGroupMemberInput {
  amountMinor?: number;
  date?: string;
  description?: string;
  categoryId?: string | null;
}

export type CloneTransactionGroupMemberInput = UpdateTransactionGroupMemberInput;

interface ResolvedMemberValues {
  amountMinor: number;
  date: string;
  description: string;
  categoryId: string | null;
}

export async function updateTransactionGroupMemberForContext(
  context: TenantContext,
  groupId: string,
  memberId: string,
  input: UpdateTransactionGroupMemberInput,
) {
  await withTransaction(async (executeQuery) => {
    const { members } = await loadLockedGroup(executeQuery, context, groupId);
    const member = requireMember(members, memberId);
    const values = await resolveMemberValues(executeQuery, context, member, input);
    const effectiveOn = member.status === "PLANNED" ? null : values.date;

    await executeQuery(
      `update "Transaction"
          set "amountMinor"=$1, "occurredOn"=$2, "plannedOn"=$2, "effectiveOn"=$3,
              "description"=$4, "categoryId"=$5, "updatedByUserId"=$6, "updatedAt"=now()
        where "id"=$7 and "organizationId"=$8 and "financialProfileId"=$9 and "transactionGroupId"=$10`,
      [
        values.amountMinor,
        values.date,
        effectiveOn,
        values.description,
        values.categoryId,
        context.userId,
        memberId,
        context.organizationId,
        context.financialProfileId,
        groupId,
      ],
    );
    await syncInstallmentForMember(
      executeQuery,
      context,
      member.installmentId,
      values.date,
      values.amountMinor,
      member.currency,
    );
    await insertGroupAudit(executeQuery, context, groupId, "UPDATE", {
      groupMember: "updated",
      changedFields: Object.keys(input).sort(),
    });
  });

  return getTransactionGroupForContext(context, groupId);
}

export async function setTransactionGroupStatusForContext(
  context: TenantContext,
  groupId: string,
  status: "posted" | "reconciled",
) {
  await withTransaction(async (executeQuery) => {
    const { members } = await loadLockedGroup(executeQuery, context, groupId);
    const targetStatus = status.toUpperCase();
    if (members.every((member) => member.status === targetStatus)) return;

    if (
      status === "reconciled" &&
      members.some((member) => member.effectiveOn === null || member.status !== "POSTED")
    ) {
      throw groupError(
        "TRANSACTION_GROUP_RECONCILE_REQUIRES_EFFECTIVE",
        "Efetive os lançamentos previstos antes de conciliá-los.",
        409,
      );
    }
    if (status === "posted" && members.some((member) => member.status !== "RECONCILED")) {
      throw groupError(
        "TRANSACTION_GROUP_UNRECONCILE_REQUIRES_RECONCILED",
        "Somente grupos conciliados podem ser desconciliados.",
        409,
      );
    }

    await detachGroupMembers(executeQuery, context, groupId);
    await executeQuery(
      `update "Transaction"
          set "status"=$1, "reconciledAt"=$2, "updatedByUserId"=$3, "updatedAt"=now()
        where "organizationId"=$4 and "financialProfileId"=$5 and "id"=any($6::uuid[])`,
      [
        targetStatus,
        status === "reconciled" ? new Date() : null,
        context.userId,
        context.organizationId,
        context.financialProfileId,
        members.map((member) => member.id),
      ],
    );
    await attachGroupMembers(
      executeQuery,
      context,
      groupId,
      members.map((member) => member.id),
    );
    await insertGroupAudit(
      executeQuery,
      context,
      groupId,
      status === "reconciled" ? "RECONCILE" : "UNRECONCILE",
      { groupStatus: status, memberCount: members.length },
    );
  });

  return getTransactionGroupForContext(context, groupId);
}

export async function cloneTransactionGroupMemberForContext(
  context: TenantContext,
  groupId: string,
  memberId: string,
  input: CloneTransactionGroupMemberInput = {},
) {
  return withTransaction(async (executeQuery) => {
    const { members } = await loadLockedGroup(executeQuery, context, groupId);
    const member = requireMember(members, memberId);
    const values = await resolveCloneValues(executeQuery, context, member, input);
    const clone = await insertClone(executeQuery, context, member, values);
    await insertGroupAudit(executeQuery, context, groupId, "CREATE", {
      groupClone: "single_member",
      cloneCount: 1,
    });
    return clone;
  });
}

export async function cloneTransactionGroupForContext(context: TenantContext, groupId: string) {
  return withTransaction(async (executeQuery) => {
    const { members } = await loadLockedGroup(executeQuery, context, groupId);
    const preparedMembers: Array<{ member: GroupMemberRow; values: ResolvedMemberValues }> = [];

    for (const member of members) {
      preparedMembers.push({
        member,
        values: await resolveCloneValues(executeQuery, context, member),
      });
    }

    const clones = [];
    for (const prepared of preparedMembers) {
      clones.push(await insertClone(executeQuery, context, prepared.member, prepared.values));
    }

    await insertGroupAudit(executeQuery, context, groupId, "CREATE", {
      groupClone: "all_members",
      cloneCount: clones.length,
    });
    return clones;
  });
}

export async function voidTransactionGroupMemberForContext(
  context: TenantContext,
  groupId: string,
  memberId: string,
) {
  const result = await withTransaction(async (executeQuery) => {
    const { members } = await loadLockedGroup(executeQuery, context, groupId);
    requireMember(members, memberId);
    const remainingIds = members
      .filter((member) => member.id !== memberId)
      .map((member) => member.id);

    await executeQuery(
      `update "Transaction"
          set "transactionGroupId"=null, "updatedByUserId"=$1, "updatedAt"=now()
        where "id"=$2 and "organizationId"=$3 and "financialProfileId"=$4 and "transactionGroupId"=$5`,
      [context.userId, memberId, context.organizationId, context.financialProfileId, groupId],
    );
    await executeQuery(
      `update "Transaction"
          set "status"='VOIDED', "voidedAt"=now(), "updatedByUserId"=$1, "updatedAt"=now()
        where "id"=$2 and "organizationId"=$3 and "financialProfileId"=$4 and "transactionGroupId" is null`,
      [context.userId, memberId, context.organizationId, context.financialProfileId],
    );

    let groupRemoved = false;
    if (remainingIds.length < 2) {
      await executeQuery(
        `update "Transaction" set "transactionGroupId"=null, "updatedAt"=now(), "updatedByUserId"=$1
          where "organizationId"=$2 and "financialProfileId"=$3 and "transactionGroupId"=$4`,
        [context.userId, context.organizationId, context.financialProfileId, groupId],
      );
      await deleteGroup(executeQuery, context, groupId);
      groupRemoved = true;
    }

    await insertGroupAudit(executeQuery, context, groupId, "SOFT_DELETE", {
      groupMember: "voided",
      groupRemoved,
      remainingMemberCount: remainingIds.length,
    });
    return { groupRemoved, voidedMemberId: memberId, remainingMemberIds: remainingIds };
  });

  if (result.groupRemoved) return result;
  return { ...result, group: await getTransactionGroupForContext(context, groupId) };
}

export async function voidTransactionGroupForContext(context: TenantContext, groupId: string) {
  return withTransaction(async (executeQuery) => {
    const { members } = await loadLockedGroup(executeQuery, context, groupId);
    await detachGroupMembers(executeQuery, context, groupId);
    await executeQuery(
      `update "Transaction"
          set "status"='VOIDED', "voidedAt"=now(), "updatedByUserId"=$1, "updatedAt"=now()
        where "organizationId"=$2 and "financialProfileId"=$3 and "id"=any($4::uuid[])`,
      [
        context.userId,
        context.organizationId,
        context.financialProfileId,
        members.map((member) => member.id),
      ],
    );
    await deleteGroup(executeQuery, context, groupId);
    await insertGroupAudit(executeQuery, context, groupId, "SOFT_DELETE", {
      group: "voided_with_members",
      memberCount: members.length,
    });
    return { voidedMemberIds: members.map((member) => member.id) };
  });
}

async function loadLockedGroup(
  executeQuery: QueryExecutor,
  context: TenantContext,
  groupId: string,
): Promise<{ group: GroupRow; members: GroupMemberRow[] }> {
  const groups = await executeQuery<GroupRow>(
    `select "id", "accountId" from "TransactionGroup"
      where "id"=$1 and "organizationId"=$2 and "financialProfileId"=$3 for update`,
    [groupId, context.organizationId, context.financialProfileId],
  );
  const group = groups[0];
  if (!group) {
    throw groupError("TENANT_RESOURCE_NOT_FOUND", "Grupo não encontrado para este perfil.", 404);
  }

  const members = await executeQuery<GroupMemberRow>(
    `select "id", "accountId", "categoryId", "installmentId", "kind", "status", "amountMinor", "currency",
            "occurredOn", "plannedOn", "effectiveOn", "description", "note"
       from "Transaction"
      where "organizationId"=$1 and "financialProfileId"=$2 and "transactionGroupId"=$3
      order by "occurredOn", "createdAt" for update`,
    [context.organizationId, context.financialProfileId, groupId],
  );
  if (members.length < 2) {
    throw groupError(
      "TRANSACTION_GROUP_INVALID_MEMBERSHIP",
      "O agrupamento não possui lançamentos suficientes.",
      409,
    );
  }
  return { group, members };
}

function requireMember(members: GroupMemberRow[], memberId: string): GroupMemberRow {
  const member = members.find((candidate) => candidate.id === memberId);
  if (!member) {
    throw groupError(
      "TENANT_RESOURCE_NOT_FOUND",
      "Lançamento não encontrado neste agrupamento.",
      404,
    );
  }
  return member;
}

async function resolveCloneValues(
  executeQuery: QueryExecutor,
  context: TenantContext,
  member: GroupMemberRow,
  input: CloneTransactionGroupMemberInput = {},
): Promise<ResolvedMemberValues> {
  return resolveMemberValues(executeQuery, context, member, {
    ...input,
    description: input.description ?? `Cópia de ${member.description}`.slice(0, 240),
  });
}

async function resolveMemberValues(
  executeQuery: QueryExecutor,
  context: TenantContext,
  member: GroupMemberRow,
  input: UpdateTransactionGroupMemberInput,
): Promise<ResolvedMemberValues> {
  const amountMinor = input.amountMinor ?? member.amountMinor;
  const description = input.description?.trim() ?? member.description;
  const date = input.date ?? toDateOnly(member.effectiveOn ?? member.plannedOn);
  const categoryId = input.categoryId === undefined ? member.categoryId : input.categoryId;

  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw groupError("TRANSACTION_AMOUNT_INVALID", "Informe um valor positivo válido.");
  }
  if (!description || description.length > 240) {
    throw groupError(
      "TRANSACTION_DESCRIPTION_INVALID",
      "Informe uma descrição de até 240 caracteres.",
    );
  }
  if (!isDateOnly(date)) {
    throw groupError("TRANSACTION_DATE_REQUIRED", "Informe uma data válida.");
  }

  await validateCategory(executeQuery, context, categoryId, member.kind);
  return { amountMinor, date, description, categoryId };
}

async function validateCategory(
  executeQuery: QueryExecutor,
  context: TenantContext,
  categoryId: string | null,
  memberKind: string,
): Promise<void> {
  if (!categoryId) return;
  const rows = await executeQuery<{ kind: string; status: string }>(
    `select "kind", "status" from "Category"
      where "id"=$1 and "organizationId"=$2 and "financialProfileId"=$3`,
    [categoryId, context.organizationId, context.financialProfileId],
  );
  const category = rows[0];
  if (!category) {
    throw groupError("TRANSACTION_CATEGORY_INVALID", "Categoria não encontrada.", 404);
  }
  if (category.status !== "ACTIVE") {
    throw groupError("TRANSACTION_CATEGORY_ARCHIVED", "A categoria está arquivada.", 409);
  }
  if (category.kind !== memberKind) {
    throw groupError(
      "CATEGORY_TRANSACTION_KIND_INVALID",
      "A categoria não é compatível com o tipo do lançamento.",
      409,
    );
  }
}

async function syncInstallmentForMember(
  executeQuery: QueryExecutor,
  context: TenantContext,
  installmentId: string | null,
  dueOn: string,
  amountMinor: number,
  currency: string,
): Promise<void> {
  if (!installmentId) return;
  await executeQuery(
    `update "Installment"
        set "dueOn"=$1, "amountMinor"=$2, "currency"=$3,
            "updatedByUserId"=$4, "updatedAt"=now()
      where "id"=$5 and "organizationId"=$6 and "financialProfileId"=$7`,
    [
      dueOn,
      amountMinor,
      currency,
      context.userId,
      installmentId,
      context.organizationId,
      context.financialProfileId,
    ],
  );
}

async function insertClone(
  executeQuery: QueryExecutor,
  context: TenantContext,
  member: GroupMemberRow,
  values: ResolvedMemberValues,
): Promise<{ id: string; status: string; description: string }> {
  const id = randomUUID();
  const status = member.effectiveOn ? "POSTED" : "PLANNED";
  const effectiveOn = status === "POSTED" ? values.date : null;
  const rows = await executeQuery<{ id: string; status: string; description: string }>(
    `insert into "Transaction"
      ("id", "organizationId", "financialProfileId", "accountId", "categoryId", "kind", "status",
       "source", "amountMinor", "currency", "occurredOn", "plannedOn", "effectiveOn", "description",
       "note", "createdByUserId", "updatedByUserId", "createdAt", "updatedAt")
     values ($1,$2,$3,$4,$5,$6,$7,'MANUAL',$8,$9,$10,$11,$12,$13,$14,$15,$15,now(),now())
     returning "id", "status", "description"`,
    [
      id,
      context.organizationId,
      context.financialProfileId,
      member.accountId,
      values.categoryId,
      member.kind,
      status,
      values.amountMinor,
      member.currency,
      values.date,
      values.date,
      effectiveOn,
      values.description,
      member.note,
      context.userId,
    ],
  );
  return rows[0] ?? { id, status, description: values.description };
}

async function detachGroupMembers(
  executeQuery: QueryExecutor,
  context: TenantContext,
  groupId: string,
): Promise<void> {
  await executeQuery(
    `update "Transaction"
        set "transactionGroupId"=null, "updatedByUserId"=$1, "updatedAt"=now()
      where "organizationId"=$2 and "financialProfileId"=$3 and "transactionGroupId"=$4`,
    [context.userId, context.organizationId, context.financialProfileId, groupId],
  );
}

async function attachGroupMembers(
  executeQuery: QueryExecutor,
  context: TenantContext,
  groupId: string,
  memberIds: string[],
): Promise<void> {
  await executeQuery(
    `update "Transaction"
        set "transactionGroupId"=$1, "updatedByUserId"=$2, "updatedAt"=now()
      where "organizationId"=$3 and "financialProfileId"=$4 and "id"=any($5::uuid[])`,
    [groupId, context.userId, context.organizationId, context.financialProfileId, memberIds],
  );
}

async function deleteGroup(
  executeQuery: QueryExecutor,
  context: TenantContext,
  groupId: string,
): Promise<void> {
  await executeQuery(
    `delete from "TransactionGroup"
      where "id"=$1 and "organizationId"=$2 and "financialProfileId"=$3`,
    [groupId, context.organizationId, context.financialProfileId],
  );
}

async function insertGroupAudit(
  executeQuery: QueryExecutor,
  context: TenantContext,
  groupId: string,
  action: "CREATE" | "UPDATE" | "SOFT_DELETE" | "RECONCILE" | "UNRECONCILE",
  redactedChanges: Record<string, unknown>,
): Promise<void> {
  await executeQuery(
    `insert into "AuditLogEntry"
      ("id","organizationId","financialProfileId","occurredAt","actorKind","actorId","action","entityKind","entityId","redactedChanges")
     values ($1,$2,$3,now(),'USER',$4,$5,'TRANSACTION',$6,$7)`,
    [
      randomUUID(),
      context.organizationId,
      context.financialProfileId,
      context.userId,
      action,
      groupId,
      JSON.stringify(redactedChanges),
    ],
  );
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function groupError(code: string, message: string, statusCode = 400): TransactionGroupError {
  return new TransactionGroupError(code, message, statusCode);
}
