import {
  buildImportPayloadFingerprint,
  deriveImportLineDirection,
  parseTransactionExtractionPayload,
  type EntityId,
  type TenantContext,
  type TransactionExtractionPayload,
} from "@solverfin/domain";

import { withSharedTransaction, type QueryExecutor } from "./db.js";
import {
  createImportedTransferAfterRejectedCandidate,
  finalizeTransferApprovalAfterRejectedCandidates,
  reconcileConcurrentTransferAfterRejectedCandidate,
  type CanonicalTransferAccounts,
} from "./import-transfer-approval-persistence.js";
import {
  ImportReviewError,
  refreshImportBatchStatusForContext,
} from "./repositories/imports.js";

interface LockedSuggestionRow {
  status: string;
  targetEntityId: string | null;
  payload: unknown;
}

interface AccountRow {
  id: string;
  status: string;
  currency: string;
}

interface CategoryRow {
  status: string;
  kind: string;
}

interface CanonicalTransferRow {
  id: string;
  status: string;
}

export interface RejectedCandidateTransferApprovalResolution {
  delegate: false;
  transactionId: EntityId;
  outcome: "created" | "reconciled" | "idempotent";
  idempotent: boolean;
}

interface DelegateApproval {
  delegate: true;
}

export async function approveTransferAfterRejectedCandidates(
  context: TenantContext,
  importBatchId: EntityId,
  suggestionId: EntityId,
): Promise<RejectedCandidateTransferApprovalResolution | DelegateApproval> {
  return withSharedTransaction(async (executeQuery) => {
    await requireMutableBatch(context, importBatchId, executeQuery);
    const suggestion = await requireLockedSuggestion(
      context,
      importBatchId,
      suggestionId,
      executeQuery,
    );

    const idempotent = await resolveIdempotentApproval(
      context,
      importBatchId,
      suggestionId,
      suggestion,
      executeQuery,
    );
    if (idempotent !== undefined) return idempotent;

    if (suggestion.status !== "PENDING_REVIEW") {
      throw new ImportReviewError(
        "IMPORT_REVIEW_INVALID_TRANSITION",
        `A linha ja foi resolvida com status ${suggestion.status.toLowerCase()} e nao pode receber esta acao.`,
        409,
      );
    }

    const payload = parseTransactionExtractionPayload(suggestion.payload);
    if (payload === undefined) {
      throw new ImportReviewError(
        "IMPORT_SUGGESTION_PAYLOAD_INVALID",
        "Linha de importacao nao possui dados estruturados validos.",
      );
    }
    if (payload.kind !== "transfer") return { delegate: true };
    if (await hasPendingCandidate(context, suggestionId, payload, executeQuery)) {
      return { delegate: true };
    }

    const accounts = await validateTransferReferences(context, payload, executeQuery);
    await lockCanonicalTransfer(context, payload, accounts, executeQuery);
    const rejectedTargetIds = await listRejectedTargetIds(
      context,
      suggestionId,
      payload,
      executeQuery,
    );
    const existingTransfer = await findCanonicalTransfer(
      context,
      payload,
      accounts,
      rejectedTargetIds,
      executeQuery,
    );
    const now = new Date().toISOString();

    let transactionId: EntityId;
    let outcome: "created" | "reconciled";
    if (existingTransfer !== undefined) {
      transactionId = existingTransfer.id;
      outcome = "reconciled";
      await reconcileConcurrentTransferAfterRejectedCandidate(
        context,
        transactionId,
        existingTransfer.status,
        now,
        executeQuery,
      );
    } else {
      const transaction = await createImportedTransferAfterRejectedCandidate(
        context,
        importBatchId,
        suggestionId,
        payload,
        accounts,
        now,
        executeQuery,
      );
      transactionId = transaction.id;
      outcome = "created";
    }

    await finalizeTransferApprovalAfterRejectedCandidates(
      context,
      suggestionId,
      transactionId,
      outcome,
      now,
      executeQuery,
    );
    await refreshImportBatchStatusForContext(context, importBatchId, executeQuery);

    return { delegate: false, transactionId, outcome, idempotent: false };
  });
}

async function requireMutableBatch(
  context: TenantContext,
  importBatchId: EntityId,
  executeQuery: QueryExecutor,
): Promise<void> {
  const rows = await executeQuery<{ status: string }>(
    `select "status" from "ImportBatch"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
     for update`,
    [importBatchId, context.organizationId, context.financialProfileId],
  );
  const batch = rows[0];
  if (batch === undefined) throw tenantResourceNotFound();
  if (batch.status === "DISCARDED") {
    throw new ImportReviewError(
      "IMPORT_BATCH_DISCARDED",
      "Lote descartado nao pode receber novas decisoes.",
      409,
    );
  }
}

async function requireLockedSuggestion(
  context: TenantContext,
  importBatchId: EntityId,
  suggestionId: EntityId,
  executeQuery: QueryExecutor,
): Promise<LockedSuggestionRow> {
  const rows = await executeQuery<LockedSuggestionRow>(
    `select "status", "targetEntityId", "payload" from "AiSuggestion"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
       and "sourceEntityId" = $4 and "kind" = 'TRANSACTION_EXTRACTION'
     for update`,
    [suggestionId, context.organizationId, context.financialProfileId, importBatchId],
  );
  const suggestion = rows[0];
  if (suggestion === undefined) throw tenantResourceNotFound();
  return suggestion;
}

async function resolveIdempotentApproval(
  context: TenantContext,
  importBatchId: EntityId,
  suggestionId: EntityId,
  suggestion: LockedSuggestionRow,
  executeQuery: QueryExecutor,
): Promise<RejectedCandidateTransferApprovalResolution | undefined> {
  const bySuggestion = await findTransactionBySuggestion(context, suggestionId, executeQuery);
  if (bySuggestion !== undefined) {
    return {
      delegate: false,
      transactionId: bySuggestion,
      outcome: "idempotent",
      idempotent: true,
    };
  }

  if (suggestion.status !== "APPROVED" || suggestion.targetEntityId === null) {
    return undefined;
  }
  if (!(await transactionExists(context, suggestion.targetEntityId, executeQuery))) {
    throw approvedTransactionMissing(importBatchId, suggestionId);
  }
  return {
    delegate: false,
    transactionId: suggestion.targetEntityId,
    outcome: "idempotent",
    idempotent: true,
  };
}

async function hasPendingCandidate(
  context: TenantContext,
  suggestionId: EntityId,
  payload: TransactionExtractionPayload,
  executeQuery: QueryExecutor,
): Promise<boolean> {
  const rows = await executeQuery<{ exists: boolean }>(
    `select exists(
       select 1 from "AiSuggestion"
       where "organizationId" = $1 and "financialProfileId" = $2
         and "sourceSuggestionId" = $3 and "payloadFingerprint" = $4
         and "kind" in ('DEDUPLICATION', 'RECONCILIATION') and "status" = 'PENDING_REVIEW'
     ) as "exists"`,
    [
      context.organizationId,
      context.financialProfileId,
      suggestionId,
      buildImportPayloadFingerprint(payload),
    ],
  );
  return rows[0]?.exists ?? false;
}

async function validateTransferReferences(
  context: TenantContext,
  payload: TransactionExtractionPayload,
  executeQuery: QueryExecutor,
): Promise<CanonicalTransferAccounts> {
  if (payload.accountId === undefined) {
    throw new ImportReviewError(
      "IMPORT_ACCOUNT_REQUIRED",
      "Selecione uma conta valida antes de confirmar a linha.",
    );
  }
  const reference = await requireActiveAccount(
    context,
    payload.accountId,
    "reference",
    executeQuery,
  );
  if (reference.currency.toUpperCase() !== payload.currency.toUpperCase()) {
    throw new ImportReviewError(
      "IMPORT_ACCOUNT_CURRENCY_MISMATCH",
      "A moeda da linha importada precisa ser a mesma moeda da conta selecionada.",
    );
  }

  const direction = deriveImportLineDirection(payload);
  if (direction === undefined) {
    throw new ImportReviewError(
      "IMPORT_TRANSFER_DIRECTION_INVALID",
      "Nao foi possivel determinar se a transferencia entra ou sai da conta de referencia.",
    );
  }
  if (payload.payloadVersion !== 2 || payload.otherAccountId === undefined) {
    throw new ImportReviewError(
      "IMPORT_TRANSFER_OTHER_ACCOUNT_REQUIRED",
      "Selecione a outra conta da transferencia antes de confirmar.",
    );
  }
  if (payload.otherAccountId === payload.accountId) {
    throw new ImportReviewError(
      "IMPORT_TRANSFER_SAME_ACCOUNT",
      "A outra conta precisa ser diferente da conta de referencia.",
    );
  }

  const other = await requireActiveAccount(
    context,
    payload.otherAccountId,
    "other",
    executeQuery,
  );
  if (
    other.currency.toUpperCase() !== payload.currency.toUpperCase() ||
    other.currency.toUpperCase() !== reference.currency.toUpperCase()
  ) {
    throw new ImportReviewError(
      "IMPORT_TRANSFER_CURRENCY_MISMATCH",
      "As duas contas da transferencia precisam usar a mesma moeda da linha importada.",
    );
  }
  await validateTransferCategory(context, payload, executeQuery);

  return direction === "outflow"
    ? { sourceAccountId: payload.accountId, destinationAccountId: payload.otherAccountId }
    : { sourceAccountId: payload.otherAccountId, destinationAccountId: payload.accountId };
}

async function requireActiveAccount(
  context: TenantContext,
  accountId: EntityId,
  role: "reference" | "other",
  executeQuery: QueryExecutor,
): Promise<AccountRow> {
  const rows = await executeQuery<AccountRow>(
    `select "id", "status", "currency" from "Account"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [accountId, context.organizationId, context.financialProfileId],
  );
  const account = rows[0];
  if (account === undefined) throw tenantResourceNotFound();
  if (account.status !== "ACTIVE") {
    throw new ImportReviewError(
      role === "other" ? "IMPORT_TRANSFER_OTHER_ACCOUNT_INVALID" : "IMPORT_ACCOUNT_INVALID",
      role === "other"
        ? "A outra conta da transferencia precisa estar ativa neste perfil financeiro."
        : "Conta selecionada nao esta disponivel neste perfil financeiro.",
    );
  }
  return account;
}

async function validateTransferCategory(
  context: TenantContext,
  payload: TransactionExtractionPayload,
  executeQuery: QueryExecutor,
): Promise<void> {
  if (payload.categoryId === undefined) return;
  const rows = await executeQuery<CategoryRow>(
    `select "status", "kind" from "Category"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [payload.categoryId, context.organizationId, context.financialProfileId],
  );
  const category = rows[0];
  if (category === undefined || category.status !== "ACTIVE") {
    throw new ImportReviewError(
      "IMPORT_CATEGORY_INVALID",
      "Categoria selecionada nao esta disponivel neste perfil financeiro.",
    );
  }
  if (category.kind !== "TRANSFER") {
    throw new ImportReviewError(
      "IMPORT_CATEGORY_KIND_MISMATCH",
      "A categoria precisa ter o mesmo tipo da linha importada.",
    );
  }
}

async function listRejectedTargetIds(
  context: TenantContext,
  suggestionId: EntityId,
  payload: TransactionExtractionPayload,
  executeQuery: QueryExecutor,
): Promise<EntityId[]> {
  const rows = await executeQuery<{ targetEntityId: string }>(
    `select distinct "targetEntityId" from "AiSuggestion"
     where "organizationId" = $1 and "financialProfileId" = $2
       and "sourceSuggestionId" = $3 and "payloadFingerprint" = $4
       and "kind" in ('DEDUPLICATION', 'RECONCILIATION') and "status" = 'REJECTED'
       and "targetEntityId" is not null`,
    [
      context.organizationId,
      context.financialProfileId,
      suggestionId,
      buildImportPayloadFingerprint(payload),
    ],
  );
  return rows.map((row) => row.targetEntityId);
}

async function lockCanonicalTransfer(
  context: TenantContext,
  payload: TransactionExtractionPayload,
  accounts: CanonicalTransferAccounts,
  executeQuery: QueryExecutor,
): Promise<void> {
  const key = [
    accounts.sourceAccountId,
    accounts.destinationAccountId,
    payload.amountMinor,
    payload.currency.toUpperCase(),
  ].join(":");
  await executeQuery(`select pg_advisory_xact_lock(hashtext($1), hashtext($2))`, [
    `${context.organizationId}:${context.financialProfileId}`,
    key,
  ]);
}

async function findCanonicalTransfer(
  context: TenantContext,
  payload: TransactionExtractionPayload,
  accounts: CanonicalTransferAccounts,
  rejectedTargetIds: readonly EntityId[],
  executeQuery: QueryExecutor,
): Promise<CanonicalTransferRow | undefined> {
  const rows = await executeQuery<CanonicalTransferRow>(
    `select "id", "status" from "Transaction"
     where "organizationId" = $1 and "financialProfileId" = $2
       and "kind" = 'TRANSFER' and "status" <> 'VOIDED'
       and "accountId" = $3 and "destinationAccountId" = $4
       and "amountMinor" = $5 and upper("currency") = upper($6)
       and "occurredOn" between ($7::date - interval '2 days') and ($7::date + interval '2 days')
       and not ("id" = any($8::uuid[]))
     order by abs("occurredOn" - $7::date), "createdAt" asc
     limit 1
     for update`,
    [
      context.organizationId,
      context.financialProfileId,
      accounts.sourceAccountId,
      accounts.destinationAccountId,
      payload.amountMinor,
      payload.currency,
      payload.occurredOn,
      [...rejectedTargetIds],
    ],
  );
  return rows[0];
}

async function findTransactionBySuggestion(
  context: TenantContext,
  suggestionId: EntityId,
  executeQuery: QueryExecutor,
): Promise<EntityId | undefined> {
  const rows = await executeQuery<{ id: string }>(
    `select "id" from "Transaction"
     where "organizationId" = $1 and "financialProfileId" = $2 and "aiSuggestionId" = $3`,
    [context.organizationId, context.financialProfileId, suggestionId],
  );
  return rows[0]?.id;
}

async function transactionExists(
  context: TenantContext,
  transactionId: EntityId,
  executeQuery: QueryExecutor,
): Promise<boolean> {
  const rows = await executeQuery<{ exists: boolean }>(
    `select exists(
       select 1 from "Transaction"
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
     ) as "exists"`,
    [transactionId, context.organizationId, context.financialProfileId],
  );
  return rows[0]?.exists ?? false;
}

function tenantResourceNotFound(): ImportReviewError {
  return new ImportReviewError(
    "TENANT_RESOURCE_NOT_FOUND",
    "Recurso nao encontrado no perfil financeiro ativo.",
    404,
  );
}

function approvedTransactionMissing(
  importBatchId: EntityId,
  suggestionId: EntityId,
): ImportReviewError {
  return new ImportReviewError(
    "IMPORT_APPROVED_TRANSACTION_MISSING",
    "O lancamento vinculado a esta linha nao foi encontrado.",
    409,
    { importBatchId, suggestionId },
  );
}
