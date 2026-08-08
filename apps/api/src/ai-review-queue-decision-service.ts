import {
  AiSuggestionPayloadError,
  buildAiSuggestionPayload,
  mutateAiSuggestionPayload,
  readAiSuggestionPayload,
  type CategorizationSuggestionPayloadV1,
  type TransactionExtractionSuggestionPayload,
} from "@solverfin/domain/ai-suggestion-payloads";
import type {
  AiSuggestion,
  AuditLogEntryDraft,
  EntityId,
  TenantContext,
  TransactionKind,
} from "@solverfin/domain";

import { withSharedTransaction, type QueryExecutor } from "./db.js";
import {
  AiReviewQueueError,
  approveAiReviewSuggestionForContext,
  editAiReviewSuggestionForContext,
  rejectAiReviewSuggestionForContext,
  type AiSuggestedTransactionDraft,
  type PersistedAiSuggestion,
  type ReviewMutationResult,
} from "./repositories/ai-review-queue.js";
import { insertAuditLogEntry } from "./repositories/audit.js";
import {
  approveDeterministicReviewSuggestionForContext,
  rejectDeterministicReviewSuggestionForContext,
  type ReviewSuggestionResult,
} from "./repositories/review-suggestions.js";
import { updateTransactionForContext } from "./repositories/transactions.js";

export interface AiReviewDecisionInput {
  expectedFingerprint?: string;
  payload?: Readonly<Record<string, unknown>>;
  reason?: string;
  correlationId?: string;
}

export type AiReviewDecisionResult =
  | (ReviewMutationResult & { idempotent?: boolean })
  | ReviewSuggestionResult;

interface DecisionSuggestionRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  kind: string;
  status: string;
  sourceEntityId: string | null;
  targetEntityId: string | null;
  confidence: string | number;
  explanation: string;
  payload: unknown;
  payloadFingerprint: string | null;
  provider: string | null;
  model: string | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CategoryRow {
  id: string;
  kind: string;
  status: string;
}

interface TransactionRow {
  id: string;
  kind: string;
  status: string;
  categoryId: string | null;
}

const DECISION_SELECT_COLUMNS = `"id", "organizationId", "financialProfileId", "kind", "status",
  "sourceEntityId", "targetEntityId", "confidence", "explanation", "payload", "payloadFingerprint", "provider", "model",
  "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt"`;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRANSACTION_EDIT_FIELDS = new Set([
  "kind",
  "amountMinor",
  "occurredOn",
  "accountId",
  "description",
  "currency",
  "categoryId",
  "otherAccountId",
  "destinationAccountId",
]);
const CATEGORIZATION_EDIT_FIELDS = new Set(["proposedCategoryId"]);

export async function approveAiReviewDecisionForContext(
  context: TenantContext,
  suggestionId: EntityId,
  input: AiReviewDecisionInput = {},
): Promise<AiReviewDecisionResult> {
  return withSharedTransaction(async (executeQuery) => {
    const suggestion = await lockSuggestionForContext(executeQuery, context, suggestionId);

    if (suggestion.status === "approved") {
      if (suggestion.kind === "deduplication" || suggestion.kind === "reconciliation") {
        return approveDeterministicReviewSuggestionForContext(context, suggestionId);
      }
      if (
        suggestion.kind === "transaction_extraction" &&
        suggestion.provider?.startsWith("solverfin-import") === true
      ) {
        const persisted = await approveAiReviewSuggestionForContext(context, suggestionId);
        return { ...persisted, idempotent: true };
      }
      return { suggestion: mapPersistedSuggestion(suggestion), idempotent: true };
    }

    assertPending(suggestion);
    assertExpectedFingerprint(suggestion, input.expectedFingerprint);

    switch (suggestion.kind) {
      case "categorization":
        return approveCategorizationSuggestion(executeQuery, context, suggestion, input);
      case "deduplication":
      case "reconciliation": {
        assertNoPayloadMutation(input.payload, suggestion.kind);
        const result = await approveDeterministicReviewSuggestionForContext(context, suggestionId);
        await correlateLatestAudit(
          executeQuery,
          context,
          "AI_SUGGESTION",
          suggestionId,
          "APPROVE",
          input.correlationId,
          { previousState: "changed", nextState: "changed" },
        );
        return result;
      }
      case "insight":
        assertNoPayloadMutation(input.payload, suggestion.kind);
        break;
      case "transaction_extraction":
        break;
      default:
        throw new AiReviewQueueError(
          "AI_REVIEW_KIND_UNSUPPORTED",
          "Este tipo de sugestao nao pode ser aprovado pela fila de revisao.",
          422,
        );
    }

    const payloadOverride =
      suggestion.kind === "transaction_extraction"
        ? readTransactionPayload(input.payload, false)
        : undefined;
    const result = await approveAiReviewSuggestionForContext(context, suggestionId, payloadOverride);
    await correlateLatestAudit(
      executeQuery,
      context,
      "AI_SUGGESTION",
      suggestionId,
      "APPROVE",
      input.correlationId,
      payloadOverride && Object.keys(payloadOverride).length > 0
        ? { previousProposal: "changed", nextProposal: "changed" }
        : { previousState: "changed", nextState: "changed" },
    );
    return { ...result, idempotent: false };
  });
}

export async function editAiReviewDecisionForContext(
  context: TenantContext,
  suggestionId: EntityId,
  input: AiReviewDecisionInput,
): Promise<AiReviewDecisionResult> {
  return withSharedTransaction(async (executeQuery) => {
    const suggestion = await lockSuggestionForContext(executeQuery, context, suggestionId);
    assertPending(suggestion);
    assertExpectedFingerprint(suggestion, input.expectedFingerprint);

    if (suggestion.kind === "categorization") {
      return editCategorizationSuggestion(executeQuery, context, suggestion, input);
    }
    if (suggestion.kind !== "transaction_extraction") {
      throw new AiReviewQueueError(
        "AI_REVIEW_EDIT_NOT_SUPPORTED",
        "Este tipo de sugestao nao possui campos editaveis na fila de revisao.",
        422,
      );
    }

    const payload = readTransactionPayload(input.payload, true);
    if (payload === undefined) {
      throw new AiReviewQueueError(
        "AI_REVIEW_EDIT_PAYLOAD_REQUIRED",
        "Edicao de sugestao precisa informar os campos revisados.",
      );
    }

    if (suggestion.provider?.startsWith("solverfin-import") === true) {
      const result = await editAiReviewSuggestionForContext(
        context,
        suggestionId,
        payload,
        input.reason,
      );
      await correlateLatestAudit(
        executeQuery,
        context,
        "AI_SUGGESTION",
        suggestionId,
        "UPDATE",
        input.correlationId,
        { previousProposal: "changed", nextProposal: "changed" },
      );
      return { ...result, idempotent: false };
    }

    const current = requireCurrentTransactionPayload(suggestion);
    const next = buildEditedTransactionPayload(current, payload);
    const now = new Date().toISOString();
    await executeQuery(
      `update "AiSuggestion"
       set "payload" = $4::jsonb, "updatedAt" = $5
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
      [
        suggestion.id,
        context.organizationId,
        context.financialProfileId,
        JSON.stringify(next),
        now,
      ],
    );
    await expireDependentSuggestions(executeQuery, context, suggestion.id, suggestion.id, now);
    await insertAuditLogEntry(
      executeQuery,
      buildSuggestionAuditEntry(
        context,
        suggestion.id,
        "update",
        now,
        input.correlationId,
        input.reason,
        true,
      ),
    );
    return {
      suggestion: mapPersistedSuggestion({
        ...suggestion,
        payload: next,
        updatedAt: new Date(now),
      }),
      idempotent: false,
    };
  });
}

export async function rejectAiReviewDecisionForContext(
  context: TenantContext,
  suggestionId: EntityId,
  input: AiReviewDecisionInput = {},
): Promise<AiReviewDecisionResult> {
  return withSharedTransaction(async (executeQuery) => {
    const suggestion = await lockSuggestionForContext(executeQuery, context, suggestionId);
    if (suggestion.status === "rejected") {
      return { suggestion: mapPersistedSuggestion(suggestion), idempotent: true };
    }

    assertPending(suggestion);
    assertExpectedFingerprint(suggestion, input.expectedFingerprint);
    assertNoPayloadMutation(input.payload, suggestion.kind);

    if (suggestion.kind === "deduplication" || suggestion.kind === "reconciliation") {
      const result = await rejectDeterministicReviewSuggestionForContext(
        context,
        suggestionId,
        input.reason,
      );
      await correlateLatestAudit(
        executeQuery,
        context,
        "AI_SUGGESTION",
        suggestionId,
        "REJECT",
        input.correlationId,
        { previousState: "changed", nextState: "changed" },
      );
      return result;
    }

    const result = await rejectAiReviewSuggestionForContext(context, suggestionId, input.reason);
    await correlateLatestAudit(
      executeQuery,
      context,
      "AI_SUGGESTION",
      suggestionId,
      "REJECT",
      input.correlationId,
      { previousState: "changed", nextState: "changed" },
    );
    return { ...result, idempotent: false };
  });
}

async function approveCategorizationSuggestion(
  executeQuery: QueryExecutor,
  context: TenantContext,
  suggestion: DecisionSuggestionRow,
  input: AiReviewDecisionInput,
): Promise<AiReviewDecisionResult> {
  const current = requireCurrentCategorizationPayload(suggestion);
  const requestedCategoryId = readCategorizationCategoryId(input.payload, false);
  const categoryId = requestedCategoryId ?? current.proposedCategoryId;
  if (!categoryId) {
    throw new AiReviewQueueError(
      "AI_REVIEW_CATEGORY_REQUIRED",
      "Escolha uma categoria valida antes de aprovar esta sugestao.",
      422,
    );
  }

  const target = await resolveCategorizationTarget(executeQuery, context, current);
  const category = await requireEligibleCategory(
    executeQuery,
    context,
    categoryId,
    target.transactionKind,
  );
  const reviewedPayload =
    requestedCategoryId === undefined || requestedCategoryId === current.proposedCategoryId
      ? current
      : mutateAiSuggestionPayload({
          payload: current,
          status: "pending_review",
          expectedFingerprint: current.fingerprint,
          mutation: (draft) => ({ ...draft, proposedCategoryId: category.id }),
          audit: current.audit,
        });
  const now = new Date().toISOString();

  await executeQuery(
    `update "AiSuggestion"
     set "status" = 'APPROVED', "payload" = $4::jsonb, "reviewedByUserId" = $5,
         "reviewedAt" = $6, "updatedAt" = $6
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [suggestion.id, context.organizationId, context.financialProfileId, JSON.stringify(reviewedPayload), context.userId, now],
  );

  if (target.kind === "transaction_extraction") {
    const source = target.suggestion;
    await assertSourceBatchReviewable(executeQuery, context, source);
    const nextSourcePayload = mutateAiSuggestionPayload({
      payload: target.payload,
      status: "pending_review",
      expectedFingerprint: target.payload.fingerprint,
      mutation: (draft) => ({ ...draft, categoryId: category.id }),
      audit: target.payload.audit,
    });
    await executeQuery(
      `update "AiSuggestion"
       set "payload" = $4::jsonb, "updatedAt" = $5
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
      [
        source.id,
        context.organizationId,
        context.financialProfileId,
        JSON.stringify(nextSourcePayload),
        now,
      ],
    );
    await expireDependentSuggestions(executeQuery, context, source.id, suggestion.id, now);
    await insertAuditLogEntry(
      executeQuery,
      buildSuggestionAuditEntry(
        context,
        source.id,
        "update",
        now,
        input.correlationId,
        "Categoria incorporada a sugestao de lancamento pendente.",
        true,
      ),
    );
  } else {
    await updateTransactionForContext(context, target.transaction.id, {
      categoryId: category.id,
    });
    await correlateLatestAudit(
      executeQuery,
      context,
      "TRANSACTION",
      target.transaction.id,
      "UPDATE",
      input.correlationId,
      { categoryId: "changed" },
    );
  }

  await insertAuditLogEntry(
    executeQuery,
    buildSuggestionAuditEntry(
      context,
      suggestion.id,
      "approve",
      now,
      input.correlationId,
      "Sugestao de categorizacao aprovada e aplicada ao alvo elegivel.",
      requestedCategoryId !== undefined,
    ),
  );

  return {
    suggestion: mapPersistedSuggestion({
      ...suggestion,
      status: "approved",
      payload: reviewedPayload,
      reviewedByUserId: context.userId,
      reviewedAt: new Date(now),
      updatedAt: new Date(now),
    }),
    idempotent: false,
  };
}

async function editCategorizationSuggestion(
  executeQuery: QueryExecutor,
  context: TenantContext,
  suggestion: DecisionSuggestionRow,
  input: AiReviewDecisionInput,
): Promise<AiReviewDecisionResult> {
  const current = requireCurrentCategorizationPayload(suggestion);
  const categoryId = readCategorizationCategoryId(input.payload, true);
  if (!categoryId) {
    throw new AiReviewQueueError(
      "AI_REVIEW_CATEGORY_REQUIRED",
      "Escolha uma categoria valida antes de salvar a correcao.",
      422,
    );
  }

  const target = await resolveCategorizationTarget(executeQuery, context, current);
  const category = await requireEligibleCategory(
    executeQuery,
    context,
    categoryId,
    target.transactionKind,
  );
  const next = mutateAiSuggestionPayload({
    payload: current,
    status: "pending_review",
    expectedFingerprint: current.fingerprint,
    mutation: (draft) => ({ ...draft, proposedCategoryId: category.id }),
    audit: current.audit,
  });
  const now = new Date().toISOString();
  await executeQuery(
    `update "AiSuggestion"
     set "payload" = $4::jsonb, "updatedAt" = $5
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [suggestion.id, context.organizationId, context.financialProfileId, JSON.stringify(next), now],
  );
  await insertAuditLogEntry(
    executeQuery,
    buildSuggestionAuditEntry(
      context,
      suggestion.id,
      "update",
      now,
      input.correlationId,
      input.reason,
      true,
    ),
  );
  return {
    suggestion: mapPersistedSuggestion({
      ...suggestion,
      payload: next,
      updatedAt: new Date(now),
    }),
    idempotent: false,
  };
}

type CategorizationTarget =
  | {
      kind: "transaction_extraction";
      transactionKind: TransactionKind;
      suggestion: DecisionSuggestionRow;
      payload: TransactionExtractionSuggestionPayload;
    }
  | {
      kind: "transaction";
      transactionKind: TransactionKind;
      transaction: TransactionRow;
    };

async function resolveCategorizationTarget(
  executeQuery: QueryExecutor,
  context: TenantContext,
  payload: CategorizationSuggestionPayloadV1,
): Promise<CategorizationTarget> {
  const sourceSuggestionId =
    payload.sourceSuggestionId ??
    (payload.target.entityKind === "import_suggestion" ? payload.targetEntityId : undefined);

  if (sourceSuggestionId !== undefined) {
    const source = await lockSuggestionForContext(executeQuery, context, sourceSuggestionId);
    if (source.kind !== "transaction_extraction" || source.status !== "pending_review") {
      throw new AiReviewQueueError(
        "AI_REVIEW_TARGET_NOT_ELIGIBLE",
        "O lancamento de origem nao esta mais disponivel para categorizacao.",
        409,
      );
    }
    const sourcePayload = requireCurrentTransactionPayload(source);
    const expectedSourceFingerprint = payload.audit.sourceFingerprint;
    if (
      expectedSourceFingerprint !== undefined &&
      expectedSourceFingerprint !== sourcePayload.fingerprint
    ) {
      throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_OBSOLETE");
    }
    return {
      kind: "transaction_extraction",
      transactionKind: sourcePayload.kind,
      suggestion: source,
      payload: sourcePayload,
    };
  }

  const transactionId =
    payload.targetTransactionId ??
    (payload.target.entityKind === "transaction" ? payload.target.entityId : undefined);
  if (transactionId === undefined) {
    throw new AiReviewQueueError(
      "AI_REVIEW_TARGET_NOT_ELIGIBLE",
      "Esta sugestao de categorizacao nao possui um alvo elegivel.",
      422,
    );
  }

  const rows = await executeQuery<TransactionRow>(
    `select "id", "kind", "status", "categoryId" from "Transaction"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3 for update`,
    [transactionId, context.organizationId, context.financialProfileId],
  );
  const transaction = rows[0];
  if (transaction === undefined || transaction.status === "VOIDED") {
    throw new AiReviewQueueError(
      "AI_REVIEW_TARGET_NOT_ELIGIBLE",
      "O lancamento alvo nao esta mais disponivel para categorizacao.",
      409,
    );
  }
  if (
    payload.previousCategoryId !== undefined &&
    transaction.categoryId !== payload.previousCategoryId
  ) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_OBSOLETE");
  }

  return {
    kind: "transaction",
    transactionKind: transaction.kind.toLowerCase() as TransactionKind,
    transaction,
  };
}

async function requireEligibleCategory(
  executeQuery: QueryExecutor,
  context: TenantContext,
  categoryId: string,
  targetKind: TransactionKind,
): Promise<CategoryRow> {
  if (!UUID_PATTERN.test(categoryId)) {
    throw new AiReviewQueueError(
      "AI_REVIEW_CATEGORY_INVALID",
      "A categoria informada nao e valida.",
      400,
    );
  }
  const rows = await executeQuery<CategoryRow>(
    `select "id", "kind", "status" from "Category"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3 for share`,
    [categoryId, context.organizationId, context.financialProfileId],
  );
  const category = rows[0];
  if (category === undefined || category.status !== "ACTIVE") {
    throw new AiReviewQueueError(
      "AI_REVIEW_CATEGORY_UNAVAILABLE",
      "A categoria selecionada nao esta disponivel neste perfil.",
      409,
    );
  }
  if (category.kind.toLowerCase() !== targetKind) {
    throw new AiReviewQueueError(
      "AI_REVIEW_CATEGORY_INCOMPATIBLE",
      "A categoria selecionada nao e compativel com o tipo do lancamento.",
      409,
    );
  }
  return category;
}

async function assertSourceBatchReviewable(
  executeQuery: QueryExecutor,
  context: TenantContext,
  source: DecisionSuggestionRow,
): Promise<void> {
  if (!source.provider?.startsWith("solverfin-import") || source.sourceEntityId === null) return;

  const rows = await executeQuery<{ status: string }>(
    `select "status" from "ImportBatch"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3 for share`,
    [source.sourceEntityId, context.organizationId, context.financialProfileId],
  );
  if (rows[0]?.status !== "REVIEWING") {
    throw new AiReviewQueueError(
      "AI_REVIEW_SOURCE_DISCARDED",
      "A origem desta sugestao nao esta mais em revisao.",
      409,
    );
  }
}

async function expireDependentSuggestions(
  executeQuery: QueryExecutor,
  context: TenantContext,
  sourceSuggestionId: string,
  exceptSuggestionId: string,
  now: string,
): Promise<void> {
  await executeQuery(
    `update "AiSuggestion"
     set "status" = 'EXPIRED', "reviewedAt" = $5, "reviewedByUserId" = $4, "updatedAt" = $5
     where "organizationId" = $1 and "financialProfileId" = $2 and "sourceSuggestionId" = $3
       and "id" <> $6 and "status" = 'PENDING_REVIEW'
       and "kind" in ('CATEGORIZATION', 'DEDUPLICATION', 'RECONCILIATION')`,
    [
      context.organizationId,
      context.financialProfileId,
      sourceSuggestionId,
      context.userId,
      now,
      exceptSuggestionId,
    ],
  );
}

function buildEditedTransactionPayload(
  current: TransactionExtractionSuggestionPayload,
  changes: Partial<AiSuggestedTransactionDraft>,
): TransactionExtractionSuggestionPayload {
  const kind = changes.kind ?? current.kind;
  const amountMinor = changes.amountMinor ?? current.amountMinor;
  const occurredOn = changes.occurredOn ?? current.occurredOn;
  const description = (changes.description ?? current.description).trim();
  const currency = changes.currency ?? current.currency;
  const accountId = changes.accountId ?? current.accountId;
  const categoryId = changes.categoryId ?? current.categoryId;
  const requestedOtherAccountId =
    changes.otherAccountId ??
    changes.destinationAccountId ??
    (current.payloadVersion === 2 ? current.otherAccountId : undefined);
  const otherAccountId = kind === "transfer" ? requestedOtherAccountId : undefined;

  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new AiReviewQueueError(
      "AI_REVIEW_AMOUNT_INVALID",
      "Valor informado na revisao precisa ser um inteiro positivo em centavos.",
    );
  }
  if (!description) {
    throw new AiReviewQueueError(
      "AI_REVIEW_DESCRIPTION_REQUIRED",
      "Sugestao precisa de uma descricao antes da aprovacao.",
    );
  }

  const common = {
    contractVersion: 1 as const,
    suggestionKind: "transaction_extraction" as const,
    origin: current.origin,
    target: current.target,
    ...(current.confidence === undefined ? {} : { confidence: current.confidence }),
    reasons: current.reasons,
    audit: current.audit,
    sourceRowNumber: current.sourceRowNumber,
    sourceHash: current.sourceHash,
    occurredOn,
    amountMinor,
    currency,
    description,
    ...(accountId === undefined ? {} : { accountId }),
    ...(categoryId === undefined ? {} : { categoryId }),
    ...(current.externalId === undefined ? {} : { externalId: current.externalId }),
  };

  if (current.payloadVersion === 1 && kind !== "transfer" && otherAccountId === undefined) {
    return buildAiSuggestionPayload({ payload: { ...common, payloadVersion: 1, kind } });
  }

  const direction =
    kind === "income"
      ? "inflow"
      : kind === "expense"
        ? "outflow"
        : current.payloadVersion === 2
          ? current.direction
          : "outflow";
  if (kind === "transfer" && otherAccountId === undefined) {
    throw new AiReviewQueueError(
      "AI_REVIEW_TRANSFER_ACCOUNT_REQUIRED",
      "Transferencia precisa informar a outra conta antes de salvar.",
      422,
    );
  }

  return buildAiSuggestionPayload({
    payload: {
      ...common,
      payloadVersion: 2,
      kind,
      direction,
      ...(otherAccountId === undefined ? {} : { otherAccountId }),
    },
  });
}

function readTransactionPayload(
  value: Readonly<Record<string, unknown>> | undefined,
  required: boolean,
): Partial<AiSuggestedTransactionDraft> | undefined {
  if (value === undefined) {
    if (required) {
      throw new AiReviewQueueError(
        "AI_REVIEW_EDIT_PAYLOAD_REQUIRED",
        "Edicao de sugestao precisa informar os campos revisados.",
      );
    }
    return undefined;
  }

  assertAllowedFields(value, TRANSACTION_EDIT_FIELDS);
  const payload: Partial<AiSuggestedTransactionDraft> = {};
  if (value.kind !== undefined) {
    const kind = String(value.kind);
    if (kind !== "income" && kind !== "expense" && kind !== "transfer") {
      throw new AiReviewQueueError(
        "AI_REVIEW_KIND_INVALID",
        "Tipo de lancamento informado na revisao nao e valido.",
      );
    }
    payload.kind = kind;
  }
  if (value.amountMinor !== undefined) {
    const amountMinor = Number(value.amountMinor);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
      throw new AiReviewQueueError(
        "AI_REVIEW_AMOUNT_INVALID",
        "Valor informado na revisao precisa ser um inteiro positivo em centavos.",
      );
    }
    payload.amountMinor = amountMinor;
  }
  if (value.occurredOn !== undefined) payload.occurredOn = String(value.occurredOn);
  if (value.accountId !== undefined) payload.accountId = String(value.accountId);
  if (value.description !== undefined) payload.description = String(value.description);
  if (value.currency !== undefined) payload.currency = String(value.currency);
  if (value.categoryId !== undefined) payload.categoryId = String(value.categoryId);
  if (value.otherAccountId !== undefined) payload.otherAccountId = String(value.otherAccountId);
  if (value.destinationAccountId !== undefined) {
    payload.destinationAccountId = String(value.destinationAccountId);
  }
  if (required && Object.keys(payload).length === 0) {
    throw new AiReviewQueueError(
      "AI_REVIEW_EDIT_PAYLOAD_REQUIRED",
      "Informe ao menos um campo compativel com esta sugestao.",
    );
  }
  return payload;
}

function readCategorizationCategoryId(
  value: Readonly<Record<string, unknown>> | undefined,
  required: boolean,
): string | undefined {
  if (value === undefined) {
    if (required) {
      throw new AiReviewQueueError(
        "AI_REVIEW_EDIT_PAYLOAD_REQUIRED",
        "Escolha uma categoria antes de salvar a correcao.",
      );
    }
    return undefined;
  }

  assertAllowedFields(value, CATEGORIZATION_EDIT_FIELDS);
  const categoryId =
    value.proposedCategoryId === undefined ? undefined : String(value.proposedCategoryId).trim();
  if (required && !categoryId) {
    throw new AiReviewQueueError(
      "AI_REVIEW_CATEGORY_REQUIRED",
      "Escolha uma categoria valida antes de salvar a correcao.",
      422,
    );
  }
  return categoryId || undefined;
}

function assertNoPayloadMutation(
  value: Readonly<Record<string, unknown>> | undefined,
  kind: string,
): void {
  if (value !== undefined && Object.keys(value).length > 0) {
    throw new AiReviewQueueError(
      "AI_REVIEW_EDIT_NOT_SUPPORTED",
      `O tipo ${kind} nao aceita alteracoes de payload nesta decisao.`,
      422,
    );
  }
}

function assertAllowedFields(
  value: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
): void {
  const unsupported = Object.keys(value).find((key) => !allowed.has(key));
  if (unsupported !== undefined) {
    throw new AiReviewQueueError(
      "AI_REVIEW_EDIT_FIELD_UNSUPPORTED",
      "A alteracao informada nao faz parte do contrato editavel desta sugestao.",
      422,
    );
  }
}

function requireCurrentTransactionPayload(
  suggestion: DecisionSuggestionRow,
): TransactionExtractionSuggestionPayload {
  const read = readAiSuggestionPayload(suggestion.payload, "transaction_extraction");
  if (read.state === "current" && read.payload.suggestionKind === "transaction_extraction") {
    return read.payload;
  }
  throw new AiReviewQueueError(
    "AI_REVIEW_SUGGESTION_PAYLOAD_UNSUPPORTED",
    "Esta sugestao nao possui payload estruturado compativel para revisao.",
    422,
  );
}

function requireCurrentCategorizationPayload(
  suggestion: DecisionSuggestionRow,
): CategorizationSuggestionPayloadV1 {
  const read = readAiSuggestionPayload(suggestion.payload, "categorization");
  if (read.state === "current" && read.payload.suggestionKind === "categorization") {
    return read.payload;
  }
  throw new AiReviewQueueError(
    "AI_REVIEW_SUGGESTION_PAYLOAD_UNSUPPORTED",
    "Esta sugestao nao possui payload de categorizacao compativel para revisao.",
    422,
  );
}

function assertExpectedFingerprint(
  suggestion: DecisionSuggestionRow,
  expectedFingerprint: string | undefined,
): void {
  if (expectedFingerprint === undefined) return;
  const read = readAiSuggestionPayload(
    suggestion.payload,
    suggestion.kind as
      | "transaction_extraction"
      | "categorization"
      | "deduplication"
      | "reconciliation"
      | "insight",
  );
  if (read.state !== "current" || read.payload.fingerprint !== expectedFingerprint) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_CONFLICT");
  }
}

async function lockSuggestionForContext(
  executeQuery: QueryExecutor,
  context: TenantContext,
  suggestionId: string,
): Promise<DecisionSuggestionRow> {
  const rows = await executeQuery<DecisionSuggestionRow>(
    `select ${DECISION_SELECT_COLUMNS} from "AiSuggestion"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3 for update`,
    [suggestionId, context.organizationId, context.financialProfileId],
  );
  const suggestion = rows[0];
  if (suggestion === undefined) {
    throw new AiReviewQueueError(
      "AI_REVIEW_SUGGESTION_NOT_FOUND",
      "Sugestao nao encontrada no perfil financeiro ativo.",
      404,
    );
  }
  suggestion.kind = suggestion.kind.toLowerCase();
  suggestion.status = suggestion.status.toLowerCase();
  return suggestion;
}

function assertPending(suggestion: DecisionSuggestionRow): void {
  if (suggestion.status !== "pending_review") {
    throw new AiReviewQueueError(
      suggestion.kind === "transaction_extraction" &&
        suggestion.provider?.startsWith("solverfin-import") === true
        ? "IMPORT_REVIEW_INVALID_TRANSITION"
        : "AI_REVIEW_INVALID_TRANSITION",
      "A sugestao ja foi resolvida ou nao esta mais disponivel para revisao.",
      409,
    );
  }
}

async function correlateLatestAudit(
  executeQuery: QueryExecutor,
  context: TenantContext,
  entityKind: "AI_SUGGESTION" | "TRANSACTION",
  entityId: string,
  action: "APPROVE" | "REJECT" | "UPDATE",
  correlationId: string | undefined,
  changes: Readonly<Record<string, string>>,
): Promise<void> {
  if (correlationId === undefined) return;
  await executeQuery(
    `update "AuditLogEntry"
     set "correlationId" = $6,
         "redactedChanges" = coalesce("redactedChanges", '{}'::jsonb) || $7::jsonb
     where "id" = (
       select "id" from "AuditLogEntry"
       where "organizationId" = $1 and "financialProfileId" = $2
         and "entityKind" = $3 and "entityId" = $4 and "action" = $5
       order by "occurredAt" desc, "id" desc limit 1
     )`,
    [
      context.organizationId,
      context.financialProfileId,
      entityKind,
      entityId,
      action,
      correlationId,
      JSON.stringify(changes),
    ],
  );
}

function buildSuggestionAuditEntry(
  context: TenantContext,
  suggestionId: string,
  action: Extract<AuditLogEntryDraft["action"], "approve" | "reject" | "update">,
  occurredAt: string,
  correlationId: string | undefined,
  reason: string | undefined,
  payloadChanged: boolean,
): AuditLogEntryDraft {
  return {
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    occurredAt,
    actorKind: "user",
    actorId: context.userId,
    action,
    entityKind: "ai_suggestion",
    entityId: suggestionId,
    ...(correlationId === undefined ? {} : { correlationId }),
    ...(reason === undefined ? {} : { reason }),
    redactedChanges: payloadChanged
      ? { previousProposal: "changed", nextProposal: "changed", status: "changed" }
      : { status: "changed" },
  };
}

function mapPersistedSuggestion(row: DecisionSuggestionRow): PersistedAiSuggestion {
  return {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    kind: row.kind as AiSuggestion["kind"],
    status: row.status as AiSuggestion["status"],
    confidence: Number(row.confidence),
    explanation: row.explanation,
    ...(row.payload === null ? {} : { payload: row.payload }),
    ...(row.sourceEntityId === null ? {} : { sourceEntityId: row.sourceEntityId }),
    ...(row.targetEntityId === null ? {} : { targetEntityId: row.targetEntityId }),
    ...(row.provider === null ? {} : { provider: row.provider }),
    ...(row.model === null ? {} : { model: row.model }),
    ...(row.reviewedByUserId === null
      ? {}
      : { reviewedByUserId: row.reviewedByUserId }),
    ...(row.reviewedAt === null ? {} : { reviewedAt: row.reviewedAt.toISOString() }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
