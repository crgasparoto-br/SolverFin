import { createHash, randomUUID } from "node:crypto";

import {
  createTransaction as createTransactionDomain,
  type Account,
  type AuditLogEntryDraft,
  type Category,
  type EntityId,
  type TenantContext,
  type Transaction,
  type TransactionKind,
  type TransactionStatus,
} from "@solverfin/domain";

import { type QueryExecutor, withSharedTransaction } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";

export type ManualInstallmentAmountMode = "per_installment" | "total";

export interface CreateManualInstallmentsPayload {
  accountId: EntityId;
  destinationAccountId?: EntityId | null;
  categoryId?: EntityId | null;
  kind: TransactionKind;
  status: Extract<TransactionStatus, "planned" | "posted" | "reconciled">;
  description: string;
  note?: string | null;
  plannedOn: string;
  effectiveOn?: string | null;
  amountMinor: number;
  amountMode: ManualInstallmentAmountMode;
  totalInstallments: number;
  initialSequenceNumber: number;
  idempotencyKey: string;
}

export interface ManualInstallmentCreationItem {
  id: EntityId;
  organizationId: EntityId;
  financialProfileId: EntityId;
  status: string;
  sequenceNumber: number;
  totalInstallments: number;
  dueOn: string;
  amountMinor: number;
  currency: string;
  transaction: {
    id: EntityId;
    installmentId: EntityId;
    accountId: EntityId;
    destinationAccountId?: EntityId;
    categoryId?: EntityId;
    kind: TransactionKind;
    status: TransactionStatus;
    source: "installment";
    amountMinor: number;
    currency: string;
    occurredOn: string;
    plannedOn: string;
    effectiveOn?: string;
    description: string;
    note?: string;
    reconciledAt?: string;
  };
}

export interface ManualInstallmentCreationResponse {
  installments: ManualInstallmentCreationItem[];
  idempotentReplay: boolean;
}

interface NormalizedPayload {
  accountId: EntityId;
  destinationAccountId: EntityId | null;
  categoryId: EntityId | null;
  kind: TransactionKind;
  status: Extract<TransactionStatus, "planned" | "posted" | "reconciled">;
  description: string;
  note: string | null;
  plannedOn: string;
  effectiveOn: string | null;
  amountMinor: number;
  amountMode: ManualInstallmentAmountMode;
  totalInstallments: number;
  initialSequenceNumber: number;
  idempotencyKey: string;
}

interface IdempotencyRow {
  requestFingerprint: string;
  response: ManualInstallmentCreationResponse;
}

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

export async function createManualInstallmentsForContext(
  context: TenantContext,
  payload: CreateManualInstallmentsPayload,
): Promise<ManualInstallmentCreationResponse> {
  const normalized = normalizePayload(payload);
  const requestFingerprint = fingerprintPayload(normalized);

  return withSharedTransaction(async (executeQuery) => {
    await executeQuery(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `manual-installments:${context.organizationId}:${context.financialProfileId}:${normalized.idempotencyKey}`,
    ]);

    const existing = await findIdempotencyRequest(executeQuery, context, normalized.idempotencyKey);
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throwInstallmentIdempotencyConflict();
      }

      return {
        ...existing.response,
        idempotentReplay: true,
      };
    }

    const account = await findAccountForUpdate(executeQuery, context, normalized.accountId);
    const destinationAccount = normalized.destinationAccountId
      ? await findAccountForUpdate(executeQuery, context, normalized.destinationAccountId)
      : undefined;
    const category = normalized.categoryId
      ? await findCategoryForUpdate(executeQuery, context, normalized.categoryId)
      : undefined;

    if (
      destinationAccount &&
      account &&
      destinationAccount.currency.toUpperCase() !== account.currency.toUpperCase()
    ) {
      throw Object.assign(
        new Error("A conta de destino deve usar a mesma moeda da conta de origem."),
        {
          code: "TRANSACTION_DESTINATION_ACCOUNT_INVALID",
          statusCode: 400,
        },
      );
    }

    const now = new Date().toISOString();
    const installments: ManualInstallmentCreationItem[] = [];

    for (
      let sequenceNumber = normalized.initialSequenceNumber;
      sequenceNumber <= normalized.totalInstallments;
      sequenceNumber += 1
    ) {
      const monthOffset = sequenceNumber - normalized.initialSequenceNumber;
      const plannedOn = addMonthsAnchored(normalized.plannedOn, monthOffset);
      const effectiveOn =
        normalized.status === "planned"
          ? null
          : addMonthsAnchored(normalized.effectiveOn ?? normalized.plannedOn, monthOffset);
      const amountMinor = allocateInstallmentAmount(
        normalized.amountMinor,
        normalized.amountMode,
        normalized.totalInstallments,
        sequenceNumber,
      );
      const installmentId = randomUUID();
      const transactionId = randomUUID();
      const mutation = createTransactionDomain({
        id: transactionId,
        context,
        now,
        payload: {
          kind: normalized.kind,
          status: normalized.status,
          source: "installment",
          amountMinor,
          currency: account?.currency ?? "BRL",
          occurredOn: effectiveOn ?? plannedOn,
          plannedOn,
          effectiveOn,
          description: normalized.description,
          accountId: normalized.accountId,
          ...(normalized.destinationAccountId
            ? { destinationAccountId: normalized.destinationAccountId }
            : {}),
          ...(normalized.categoryId ? { categoryId: normalized.categoryId } : {}),
        },
        account,
        destinationAccount,
        category,
      });

      await insertInstallment(executeQuery, {
        id: installmentId,
        context,
        status: normalized.status,
        sequenceNumber,
        totalInstallments: normalized.totalInstallments,
        dueOn: plannedOn,
        amountMinor,
        currency: mutation.transaction.currency,
        now,
      });
      await insertLinkedTransaction(
        executeQuery,
        mutation.transaction,
        installmentId,
        normalized.note,
      );
      await insertAuditLogEntry(executeQuery, mutation.auditEntry);
      await insertAuditLogEntry(
        executeQuery,
        buildInstallmentAuditEntry({
          context,
          installmentId,
          sequenceNumber,
          totalInstallments: normalized.totalInstallments,
          amountMode: normalized.amountMode,
          actorId: context.userId,
          now,
        }),
      );

      installments.push(
        buildResponseItem({
          context,
          installmentId,
          sequenceNumber,
          totalInstallments: normalized.totalInstallments,
          dueOn: plannedOn,
          amountMinor,
          transaction: mutation.transaction,
          note: normalized.note,
        }),
      );
    }

    const response: ManualInstallmentCreationResponse = {
      installments,
      idempotentReplay: false,
    };

    await executeQuery(
      `insert into "InstallmentCreationRequest"
        ("id", "organizationId", "financialProfileId", "idempotencyKey", "requestFingerprint", "response", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6::jsonb, $7, $7)`,
      [
        randomUUID(),
        context.organizationId,
        context.financialProfileId,
        normalized.idempotencyKey,
        requestFingerprint,
        JSON.stringify(response),
        now,
      ],
    );

    return response;
  });
}

export function addMonthsAnchored(dateOnly: string, monthOffset: number): string {
  const [yearText, monthText, dayText] = dateOnly.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const monthIndex = year * 12 + (month - 1) + monthOffset;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonthIndex = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);

  return `${String(targetYear).padStart(4, "0")}-${String(targetMonthIndex + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

export function allocateInstallmentAmount(
  amountMinor: number,
  amountMode: ManualInstallmentAmountMode,
  totalInstallments: number,
  sequenceNumber: number,
): number {
  if (amountMode === "per_installment") {
    return amountMinor;
  }

  const baseAmount = Math.floor(amountMinor / totalInstallments);
  const remainder = amountMinor - baseAmount * totalInstallments;

  return sequenceNumber > totalInstallments - remainder ? baseAmount + 1 : baseAmount;
}

function normalizePayload(payload: CreateManualInstallmentsPayload): NormalizedPayload {
  return {
    accountId: payload.accountId,
    destinationAccountId: payload.destinationAccountId ?? null,
    categoryId: payload.categoryId ?? null,
    kind: payload.kind,
    status: payload.status,
    description: payload.description.trim(),
    note: normalizeOptionalText(payload.note),
    plannedOn: payload.plannedOn,
    effectiveOn: payload.status === "planned" ? null : (payload.effectiveOn ?? payload.plannedOn),
    amountMinor: payload.amountMinor,
    amountMode: payload.amountMode,
    totalInstallments: payload.totalInstallments,
    initialSequenceNumber: payload.initialSequenceNumber,
    idempotencyKey: payload.idempotencyKey.toLowerCase(),
  };
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  return normalized || null;
}

function fingerprintPayload(payload: NormalizedPayload): string {
  const { idempotencyKey: _idempotencyKey, ...businessPayload } = payload;
  return createHash("sha256").update(JSON.stringify(businessPayload)).digest("hex");
}

async function findIdempotencyRequest(
  executeQuery: QueryExecutor,
  context: TenantContext,
  idempotencyKey: string,
): Promise<IdempotencyRow | undefined> {
  const rows = await executeQuery<IdempotencyRow>(
    `select "requestFingerprint", "response"
       from "InstallmentCreationRequest"
      where "organizationId" = $1
        and "financialProfileId" = $2
        and "idempotencyKey" = $3
      for update`,
    [context.organizationId, context.financialProfileId, idempotencyKey],
  );
  return rows[0];
}

async function findAccountForUpdate(
  executeQuery: QueryExecutor,
  context: TenantContext,
  accountId: EntityId,
): Promise<Account | undefined> {
  const rows = await executeQuery<AccountRow>(
    `select "id", "organizationId", "financialProfileId", "name", "kind", "status", "currency",
            "openingBalanceMinor", "maskedIdentifier", "createdAt", "updatedAt"
       from "Account"
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
      for update`,
    [accountId, context.organizationId, context.financialProfileId],
  );
  const row = rows[0];
  if (!row) return undefined;

  const account: Account = {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    name: row.name,
    kind: row.kind.toLowerCase() as Account["kind"],
    status: row.status.toLowerCase() as Account["status"],
    currency: row.currency,
    openingBalanceMinor: row.openingBalanceMinor,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (row.maskedIdentifier !== null) account.maskedIdentifier = row.maskedIdentifier;
  return account;
}

async function findCategoryForUpdate(
  executeQuery: QueryExecutor,
  context: TenantContext,
  categoryId: EntityId,
): Promise<Category | undefined> {
  const rows = await executeQuery<CategoryRow>(
    `select "id", "organizationId", "financialProfileId", "parentCategoryId", "name", "kind", "status",
            "createdAt", "updatedAt"
       from "Category"
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
      for update`,
    [categoryId, context.organizationId, context.financialProfileId],
  );
  const row = rows[0];
  if (!row) return undefined;

  const category: Category = {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    name: row.name,
    kind: row.kind.toLowerCase() as Category["kind"],
    status: row.status.toLowerCase() as Category["status"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (row.parentCategoryId !== null) category.parentCategoryId = row.parentCategoryId;
  return category;
}

async function insertInstallment(
  executeQuery: QueryExecutor,
  input: {
    id: EntityId;
    context: TenantContext;
    status: TransactionStatus;
    sequenceNumber: number;
    totalInstallments: number;
    dueOn: string;
    amountMinor: number;
    currency: string;
    now: string;
  },
): Promise<void> {
  await executeQuery(
    `insert into "Installment"
      ("id", "organizationId", "financialProfileId", "status", "sequenceNumber", "totalInstallments",
       "dueOn", "amountMinor", "currency", "createdByUserId", "updatedByUserId", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11, $11)`,
    [
      input.id,
      input.context.organizationId,
      input.context.financialProfileId,
      input.status.toUpperCase(),
      input.sequenceNumber,
      input.totalInstallments,
      input.dueOn,
      input.amountMinor,
      input.currency,
      input.context.userId,
      input.now,
    ],
  );
}

async function insertLinkedTransaction(
  executeQuery: QueryExecutor,
  transaction: Transaction,
  installmentId: EntityId,
  note: string | null,
): Promise<void> {
  await executeQuery(
    `insert into "Transaction"
      ("id", "organizationId", "financialProfileId", "accountId", "destinationAccountId", "categoryId",
       "installmentId", "transferGroupId", "kind", "status", "source", "amountMinor", "currency",
       "occurredOn", "plannedOn", "effectiveOn", "description", "note", "reconciledAt", "voidedAt",
       "createdByUserId", "updatedByUserId", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
             $19, $20, $21, $22, $23, $24)`,
    [
      transaction.id,
      transaction.organizationId,
      transaction.financialProfileId,
      transaction.accountId ?? null,
      transaction.destinationAccountId ?? null,
      transaction.categoryId ?? null,
      installmentId,
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
      note,
      transaction.reconciledAt ?? null,
      transaction.voidedAt ?? null,
      transaction.createdByUserId ?? null,
      transaction.updatedByUserId ?? null,
      transaction.createdAt,
      transaction.updatedAt,
    ],
  );
}

function buildInstallmentAuditEntry(input: {
  context: TenantContext;
  installmentId: EntityId;
  sequenceNumber: number;
  totalInstallments: number;
  amountMode: ManualInstallmentAmountMode;
  actorId: EntityId;
  now: string;
}): AuditLogEntryDraft {
  return {
    organizationId: input.context.organizationId,
    financialProfileId: input.context.financialProfileId,
    occurredAt: input.now,
    actorKind: "user",
    actorId: input.actorId,
    action: "create",
    entityKind: "installment",
    entityId: input.installmentId,
    redactedChanges: {
      sequenceNumber: input.sequenceNumber,
      totalInstallments: input.totalInstallments,
      amountMode: input.amountMode,
      origin: "manual_statement",
    },
  };
}

function buildResponseItem(input: {
  context: TenantContext;
  installmentId: EntityId;
  sequenceNumber: number;
  totalInstallments: number;
  dueOn: string;
  amountMinor: number;
  transaction: Transaction;
  note: string | null;
}): ManualInstallmentCreationItem {
  const transaction: ManualInstallmentCreationItem["transaction"] = {
    id: input.transaction.id,
    installmentId: input.installmentId,
    accountId: input.transaction.accountId as EntityId,
    kind: input.transaction.kind,
    status: input.transaction.status,
    source: "installment",
    amountMinor: input.transaction.amountMinor,
    currency: input.transaction.currency,
    occurredOn: input.transaction.occurredOn,
    plannedOn: input.transaction.plannedOn,
    description: input.transaction.description,
  };
  if (input.transaction.destinationAccountId) {
    transaction.destinationAccountId = input.transaction.destinationAccountId;
  }
  if (input.transaction.categoryId) transaction.categoryId = input.transaction.categoryId;
  if (input.transaction.effectiveOn) transaction.effectiveOn = input.transaction.effectiveOn;
  if (input.note) transaction.note = input.note;
  if (input.transaction.reconciledAt) transaction.reconciledAt = input.transaction.reconciledAt;

  return {
    id: input.installmentId,
    organizationId: input.context.organizationId,
    financialProfileId: input.context.financialProfileId,
    status: input.transaction.status,
    sequenceNumber: input.sequenceNumber,
    totalInstallments: input.totalInstallments,
    dueOn: input.dueOn,
    amountMinor: input.amountMinor,
    currency: input.transaction.currency,
    transaction,
  };
}

function throwInstallmentIdempotencyConflict(): never {
  throw Object.assign(new Error("A chave de idempotencia ja foi usada com outro parcelamento."), {
    code: "INSTALLMENT_IDEMPOTENCY_CONFLICT",
    statusCode: 409,
  });
}
