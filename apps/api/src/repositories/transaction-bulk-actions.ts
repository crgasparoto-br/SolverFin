import { randomUUID } from "node:crypto";

import { TransactionGroupError, type TenantContext } from "@solverfin/domain";

import { withTransaction, type QueryExecutor } from "../db.js";

export type TransactionBulkAction = "reconcile" | "unreconcile" | "void";

export interface TransactionBulkActionInput {
  action: TransactionBulkAction;
  transactionIds?: string[];
  groupIds?: string[];
}

interface LockedGroupRow {
  id: string;
}

interface LockedTransactionRow {
  id: string;
  status: string;
  effectiveOn: Date | null;
  transactionGroupId: string | null;
}

interface SelectedTransaction extends LockedTransactionRow {
  selectedGroupId?: string | undefined;
}

export interface TransactionBulkActionResult {
  action: TransactionBulkAction;
  affectedTransactionIds: string[];
  unchangedTransactionIds: string[];
  removedGroupIds: string[];
}

export async function executeTransactionBulkActionForContext(
  context: TenantContext,
  input: TransactionBulkActionInput,
): Promise<TransactionBulkActionResult> {
  const transactionIds = normalizeIds(input.transactionIds ?? []);
  const groupIds = normalizeIds(input.groupIds ?? []);

  if (transactionIds.length === 0 && groupIds.length === 0) {
    throw bulkError("TRANSACTION_BULK_SELECTION_REQUIRED", "Selecione ao menos um lançamento.");
  }

  return withTransaction(async (executeQuery) => {
    const groups = await loadGroups(executeQuery, context, groupIds);
    const groupMembers = await loadGroupMembers(executeQuery, context, groupIds);
    validateGroupMembership(groups, groupMembers);

    const directTransactions = await loadTransactions(executeQuery, context, transactionIds);
    if (directTransactions.length !== transactionIds.length) {
      throw bulkError(
        "TENANT_RESOURCE_NOT_FOUND",
        "Um ou mais lançamentos não foram encontrados para este perfil.",
        404,
      );
    }

    const selectedGroupIds = new Set(groupIds);
    for (const transaction of directTransactions) {
      if (transaction.transactionGroupId && !selectedGroupIds.has(transaction.transactionGroupId)) {
        throw bulkError(
          "TRANSACTION_BULK_GROUP_REQUIRED",
          "Selecione a linha agrupada para alterar todos os lançamentos do grupo.",
          409,
        );
      }
    }

    const selected = deduplicateTransactions(groupMembers, directTransactions);
    validateAction(input.action, selected);

    if (groupIds.length > 0) {
      await detachSelectedGroups(executeQuery, context, groupIds);
    }

    const targetIds = selected.map((transaction) => transaction.id);
    const changedIds = await applyAction(executeQuery, context, input.action, targetIds);

    if (input.action === "void") {
      await deleteSelectedGroups(executeQuery, context, groupIds);
    } else {
      await restoreSelectedGroups(executeQuery, context, groupMembers);
    }

    await insertAudits(executeQuery, context, input.action, selected, groupIds, transactionIds);

    const changed = new Set(changedIds);
    return {
      action: input.action,
      affectedTransactionIds: targetIds.filter((id) => changed.has(id)),
      unchangedTransactionIds: targetIds.filter((id) => !changed.has(id)),
      removedGroupIds: input.action === "void" ? groupIds : [],
    };
  });
}

async function loadGroups(
  executeQuery: QueryExecutor,
  context: TenantContext,
  groupIds: string[],
): Promise<LockedGroupRow[]> {
  if (groupIds.length === 0) return [];
  const groups = await executeQuery<LockedGroupRow>(
    `select "id" from "TransactionGroup"
      where "organizationId"=$1 and "financialProfileId"=$2 and "id"=any($3::uuid[])
      order by "id" for update`,
    [context.organizationId, context.financialProfileId, groupIds],
  );
  if (groups.length !== groupIds.length) {
    throw bulkError(
      "TENANT_RESOURCE_NOT_FOUND",
      "Um ou mais agrupamentos não foram encontrados para este perfil.",
      404,
    );
  }
  return groups;
}

async function loadGroupMembers(
  executeQuery: QueryExecutor,
  context: TenantContext,
  groupIds: string[],
): Promise<SelectedTransaction[]> {
  if (groupIds.length === 0) return [];
  const rows = await executeQuery<LockedTransactionRow>(
    `select "id", "status", "effectiveOn", "transactionGroupId"
       from "Transaction"
      where "organizationId"=$1 and "financialProfileId"=$2
        and "transactionGroupId"=any($3::uuid[])
      order by "transactionGroupId", "id" for update`,
    [context.organizationId, context.financialProfileId, groupIds],
  );
  return rows.map((row) => ({ ...row, selectedGroupId: row.transactionGroupId ?? undefined }));
}

async function loadTransactions(
  executeQuery: QueryExecutor,
  context: TenantContext,
  transactionIds: string[],
): Promise<LockedTransactionRow[]> {
  if (transactionIds.length === 0) return [];
  return executeQuery<LockedTransactionRow>(
    `select "id", "status", "effectiveOn", "transactionGroupId"
       from "Transaction"
      where "organizationId"=$1 and "financialProfileId"=$2 and "id"=any($3::uuid[])
      order by "id" for update`,
    [context.organizationId, context.financialProfileId, transactionIds],
  );
}

function validateGroupMembership(groups: LockedGroupRow[], members: SelectedTransaction[]): void {
  for (const group of groups) {
    const count = members.filter((member) => member.selectedGroupId === group.id).length;
    if (count < 2) {
      throw bulkError(
        "TRANSACTION_GROUP_INVALID_MEMBERSHIP",
        "Um agrupamento selecionado não possui lançamentos suficientes.",
        409,
      );
    }
  }
}

function deduplicateTransactions(
  groupMembers: SelectedTransaction[],
  directTransactions: LockedTransactionRow[],
): SelectedTransaction[] {
  const selected = new Map<string, SelectedTransaction>();
  groupMembers.forEach((transaction) => selected.set(transaction.id, transaction));
  directTransactions.forEach((transaction) => {
    const existing = selected.get(transaction.id);
    selected.set(transaction.id, existing ?? transaction);
  });
  return [...selected.values()];
}

function validateAction(action: TransactionBulkAction, selected: SelectedTransaction[]): void {
  if (action === "void") return;

  const invalid = selected.find(
    (transaction) => transaction.status !== "POSTED" && transaction.status !== "RECONCILED",
  );
  if (invalid) {
    throw bulkError(
      "TRANSACTION_BULK_STATUS_INVALID",
      "Efetive os lançamentos previstos antes de alterar a conciliação.",
      409,
    );
  }

  if (
    action === "reconcile" &&
    selected.some((transaction) => transaction.status === "POSTED" && !transaction.effectiveOn)
  ) {
    throw bulkError(
      "TRANSACTION_BULK_RECONCILE_REQUIRES_EFFECTIVE",
      "Efetive os lançamentos previstos antes de conciliá-los.",
      409,
    );
  }
}

async function detachSelectedGroups(
  executeQuery: QueryExecutor,
  context: TenantContext,
  groupIds: string[],
): Promise<void> {
  await executeQuery(
    `update "Transaction"
        set "transactionGroupId"=null, "updatedByUserId"=$1, "updatedAt"=now()
      where "organizationId"=$2 and "financialProfileId"=$3
        and "transactionGroupId"=any($4::uuid[])`,
    [context.userId, context.organizationId, context.financialProfileId, groupIds],
  );
}

async function applyAction(
  executeQuery: QueryExecutor,
  context: TenantContext,
  action: TransactionBulkAction,
  transactionIds: string[],
): Promise<string[]> {
  if (action === "reconcile") {
    const rows = await executeQuery<{ id: string }>(
      `update "Transaction"
          set "status"='RECONCILED', "reconciledAt"=coalesce("reconciledAt",now()),
              "updatedByUserId"=$1, "updatedAt"=now()
        where "organizationId"=$2 and "financialProfileId"=$3
          and "id"=any($4::uuid[]) and "status"='POSTED'
        returning "id"`,
      [context.userId, context.organizationId, context.financialProfileId, transactionIds],
    );
    return rows.map((row) => row.id);
  }

  if (action === "unreconcile") {
    const rows = await executeQuery<{ id: string }>(
      `update "Transaction"
          set "status"='POSTED', "reconciledAt"=null,
              "updatedByUserId"=$1, "updatedAt"=now()
        where "organizationId"=$2 and "financialProfileId"=$3
          and "id"=any($4::uuid[]) and "status"='RECONCILED'
        returning "id"`,
      [context.userId, context.organizationId, context.financialProfileId, transactionIds],
    );
    return rows.map((row) => row.id);
  }

  const rows = await executeQuery<{ id: string }>(
    `update "Transaction"
        set "status"='VOIDED', "voidedAt"=coalesce("voidedAt",now()), "reconciledAt"=null,
            "updatedByUserId"=$1, "updatedAt"=now()
      where "organizationId"=$2 and "financialProfileId"=$3
        and "id"=any($4::uuid[]) and "status"<>'VOIDED'
      returning "id"`,
    [context.userId, context.organizationId, context.financialProfileId, transactionIds],
  );
  return rows.map((row) => row.id);
}

async function restoreSelectedGroups(
  executeQuery: QueryExecutor,
  context: TenantContext,
  members: SelectedTransaction[],
): Promise<void> {
  const membersByGroup = new Map<string, string[]>();
  for (const member of members) {
    if (!member.selectedGroupId) continue;
    const ids = membersByGroup.get(member.selectedGroupId) ?? [];
    ids.push(member.id);
    membersByGroup.set(member.selectedGroupId, ids);
  }

  for (const [groupId, memberIds] of membersByGroup) {
    await executeQuery(
      `update "Transaction"
          set "transactionGroupId"=$1, "updatedByUserId"=$2, "updatedAt"=now()
        where "organizationId"=$3 and "financialProfileId"=$4 and "id"=any($5::uuid[])`,
      [groupId, context.userId, context.organizationId, context.financialProfileId, memberIds],
    );
  }
}

async function deleteSelectedGroups(
  executeQuery: QueryExecutor,
  context: TenantContext,
  groupIds: string[],
): Promise<void> {
  if (groupIds.length === 0) return;
  await executeQuery(
    `delete from "TransactionGroup"
      where "organizationId"=$1 and "financialProfileId"=$2 and "id"=any($3::uuid[])`,
    [context.organizationId, context.financialProfileId, groupIds],
  );
}

async function insertAudits(
  executeQuery: QueryExecutor,
  context: TenantContext,
  action: TransactionBulkAction,
  selected: SelectedTransaction[],
  groupIds: string[],
  directTransactionIds: string[],
): Promise<void> {
  const auditAction =
    action === "reconcile" ? "RECONCILE" : action === "unreconcile" ? "UNRECONCILE" : "SOFT_DELETE";
  const groupSet = new Set(groupIds);
  const directSet = new Set(directTransactionIds);
  const entityIds = [
    ...groupIds,
    ...selected
      .filter(
        (transaction) =>
          directSet.has(transaction.id) &&
          (!transaction.transactionGroupId || !groupSet.has(transaction.transactionGroupId)),
      )
      .map((transaction) => transaction.id),
  ];
  const redactedChanges = JSON.stringify({
    bulkSelection: true,
    action,
    selectedGroupCount: groupIds.length,
    selectedDirectCount: directTransactionIds.length,
    affectedTransactionCount: selected.length,
  });

  for (const entityId of entityIds) {
    await executeQuery(
      `insert into "AuditLogEntry"
        ("id","organizationId","financialProfileId","occurredAt","actorKind","actorId","action","entityKind","entityId","redactedChanges")
       values ($1,$2,$3,now(),'USER',$4,$5,'TRANSACTION',$6,$7)`,
      [
        randomUUID(),
        context.organizationId,
        context.financialProfileId,
        context.userId,
        auditAction,
        entityId,
        redactedChanges,
      ],
    );
  }
}

function normalizeIds(values: string[]): string[] {
  const ids = [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
  if (ids.length > 500 || ids.some((value) => !isUuid(value))) {
    throw bulkError("TRANSACTION_BULK_SELECTION_INVALID", "A seleção de lançamentos é inválida.");
  }
  return ids;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function bulkError(code: string, message: string, statusCode = 400): TransactionGroupError {
  return new TransactionGroupError(code, message, statusCode);
}
