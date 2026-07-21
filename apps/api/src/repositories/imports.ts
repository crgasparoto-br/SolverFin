import { randomUUID } from "node:crypto";

import {
  buildLegacyImportBatchHash,
  buildImportPayloadFingerprint,
  buildTransactionExtractionPayload,
  buildTransactionMovements,
  deriveImportLineDirection,
  parseDeterministicReviewPayload,
  parseTransactionExtractionPayload,
  previewImportedStatement,
  type AiSuggestion,
  type AuditLogEntryDraft,
  type CsvDelimiter,
  type CsvImportMapping,
  type EntityId,
  type ImportBatch,
  type ImportPreview,
  type ImportProblem,
  type ImportSourceKind,
  type ImportStatus,
  type ImportLineDirection,
  type TenantContext,
  type Transaction,
  type TransactionExtractionPayload,
  type TransactionExtractionPayloadV1,
  type TransactionExtractionPayloadV2,
} from "@solverfin/domain";

import { query, withSharedTransaction, type QueryExecutor } from "../db.js";
import { buildInsertAiSuggestionSql, buildUpdateAiSuggestionSql } from "./ai-suggestion-sql.js";
import { insertAuditLogEntry } from "./audit.js";

export interface CreateCsvImportBatchPayload {
  originalFileName: string;
  content: string;
  accountId: EntityId;
  consentAccepted: true;
  csvMapping?: CsvImportMapping;
  csvDelimiter?: CsvDelimiter;
}

export interface PreviewCsvImportPayload {
  originalFileName: string;
  content: string;
  accountId: EntityId;
  consentAccepted: true;
  csvMapping?: CsvImportMapping;
  csvDelimiter?: CsvDelimiter;
}

export interface ListImportBatchFilters {
  status?: ImportStatus | "all";
  sourceKind?: ImportSourceKind;
}

export interface ImportSuggestionCandidate {
  id: EntityId;
  kind: "deduplication" | "reconciliation";
  status: AiSuggestion["status"];
  targetTransactionId: EntityId;
  confidence: number;
  explanation: string;
  reasons: readonly string[];
  conflicts: readonly string[];
  createdAt: string;
}

export interface ImportReviewSuggestion extends AiSuggestion {
  payload?: TransactionExtractionPayload;
  candidates: readonly ImportSuggestionCandidate[];
  transaction?: Transaction;
}

export interface ImportBatchDetail {
  importBatch: ImportBatch;
  suggestions: ImportReviewSuggestion[];
  problems: readonly ImportProblem[];
}

export interface CreateImportBatchResult extends ImportBatchDetail {
  duplicateBatch: boolean;
}

export interface ImportSuggestionUpdatePayload {
  occurredOn?: string;
  kind?: "income" | "expense" | "transfer";
  amountMinor?: number;
  description?: string;
  accountId?: EntityId;
  otherAccountId?: EntityId | null;
  categoryId?: EntityId | null;
}

export type ImportReviewOutcome = "updated" | "created" | "reconciled" | "rejected" | "idempotent";

export interface ImportReviewDecisionResult {
  suggestion: ImportReviewSuggestion;
  transaction?: Transaction;
  importBatch: ImportBatch;
  idempotent: boolean;
  outcome: ImportReviewOutcome;
}

export interface BulkImportReviewItemResult {
  suggestionId: EntityId;
  status: "approved" | "failed";
  outcome: ImportReviewOutcome | "blocked" | "failed";
  decision?: ImportReviewDecisionResult;
  error?: { code: string; message: string };
}

export interface BulkImportReviewResult {
  importBatch: ImportBatch;
  summary: {
    requested: number;
    approved: number;
    failed: number;
    created: number;
    reconciled: number;
    idempotent: number;
    blocked: number;
    transferCount: number;
    transferTotalMinor: number;
  };
  results: readonly BulkImportReviewItemResult[];
  failures: readonly { suggestionId: EntityId; code: string; message: string }[];
}

interface ImportBatchRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  defaultAccountId: string | null;
  sourceKind: string;
  status: string;
  originalFileName: string | null;
  sourceHash: string;
  contentHash: string | null;
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  problemRows: number;
  problems: unknown;
  csvDelimiter: string | null;
  csvMapping: unknown;
  receivedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AiSuggestionRow {
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
  sourceSuggestionId: string | null;
  payloadFingerprint: string | null;
  provider: string | null;
  model: string | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TransactionRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  accountId: string | null;
  destinationAccountId: string | null;
  categoryId: string | null;
  cardId: string | null;
  cardInstrumentId: string | null;
  invoiceId: string | null;
  recurrenceId: string | null;
  installmentId: string | null;
  importBatchId: string | null;
  aiSuggestionId: string | null;
  transferGroupId: string | null;
  kind: string;
  status: string;
  source: string;
  amountMinor: number;
  currency: string;
  occurredOn: Date;
  plannedOn: Date;
  effectiveOn: Date | null;
  description: string;
  reconciledAt: Date | null;
  voidedAt: Date | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AccountRow {
  id: string;
  status: string;
  currency: string;
}

interface CategoryRow {
  id: string;
  kind: string;
  status: string;
}

interface CountRow {
  total: number;
  pending: number;
  candidatePending: number;
  duplicate: number;
}

interface CurrentDeterministicCandidate {
  suggestion: AiSuggestion;
  detail: Readonly<Record<string, unknown>>;
}

const IMPORT_BATCH_SELECT_COLUMNS = `"id", "organizationId", "financialProfileId", "defaultAccountId",
  "sourceKind", "status", "originalFileName", "sourceHash", "contentHash", "totalRows", "validRows", "duplicateRows",
  "problemRows", "problems", "csvDelimiter", "csvMapping", "receivedAt", "completedAt", "createdAt", "updatedAt"`;
const AI_SUGGESTION_SELECT_COLUMNS = `"id", "organizationId", "financialProfileId", "kind", "status",
  "sourceEntityId", "targetEntityId", "confidence", "explanation", "payload", "sourceSuggestionId",
  "payloadFingerprint", "provider", "model", "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt"`;
const TRANSACTION_SELECT_COLUMNS = `"id", "organizationId", "financialProfileId", "accountId", "destinationAccountId",
  "categoryId", "cardId", "cardInstrumentId", "invoiceId", "recurrenceId", "installmentId", "importBatchId",
  "aiSuggestionId", "transferGroupId", "kind", "status", "source", "amountMinor", "currency", "occurredOn",
  "plannedOn", "effectiveOn", "description", "reconciledAt", "voidedAt", "createdByUserId", "updatedByUserId",
  "createdAt", "updatedAt"`;

export class ImportReviewError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: string,
    message: string,
    statusCode = 400,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "ImportReviewError";
    this.code = code;
    this.statusCode = statusCode;
    if (details !== undefined) this.details = details;
  }
}

export async function previewCsvImportForContext(
  context: TenantContext,
  payload: PreviewCsvImportPayload,
): Promise<ImportPreview> {
  const preview = await buildCsvImportPreviewForContext(context, payload);
  return {
    ...preview,
    suggestions: preview.suggestions.slice(0, 10),
  };
}

async function buildCsvImportPreviewForContext(
  context: TenantContext,
  payload: PreviewCsvImportPayload,
): Promise<ImportPreview> {
  if (payload.consentAccepted !== true) {
    throw new ImportReviewError(
      "IMPORT_CONSENT_REQUIRED",
      "Confirme que o arquivo pode ser processado neste perfil financeiro.",
    );
  }
  const account = await assertActiveAccount(context, payload.accountId, query);

  const preview = previewImportedStatement({
    context,
    now: new Date().toISOString(),
    originalFileName: payload.originalFileName,
    content: payload.content,
    defaultAccountId: payload.accountId,
    ...(payload.csvMapping === undefined ? {} : { csvMapping: payload.csvMapping }),
    ...(payload.csvDelimiter === undefined ? {} : { csvDelimiter: payload.csvDelimiter }),
  });
  return {
    ...preview,
    suggestions: preview.suggestions.map((suggestion) => ({
      ...suggestion,
      currency: account.currency,
    })),
    ...(preview.csv === undefined
      ? {}
      : {
          csv: {
            ...preview.csv,
            sampleRows: preview.csv.sampleRows.map((row) => ({
              ...row,
              currency: account.currency,
            })),
          },
        }),
  };
}

export async function createCsvImportBatchForContext(
  context: TenantContext,
  payload: CreateCsvImportBatchPayload,
): Promise<CreateImportBatchResult> {
  if (payload.consentAccepted !== true) {
    throw new ImportReviewError(
      "IMPORT_CONSENT_REQUIRED",
      "Confirme que o arquivo pode ser processado neste perfil financeiro.",
    );
  }

  await assertActiveAccount(context, payload.accountId, query);
  const preview = await buildCsvImportPreviewForContext(context, payload);

  if (preview.state === "mapping_required") {
    throw new ImportReviewError(
      "IMPORT_CSV_MAPPING_REQUIRED",
      "Mapeie as colunas obrigatorias antes de iniciar a importacao.",
      422,
    );
  }

  if (preview.state === "blocked") {
    throw new ImportReviewError(
      "IMPORT_CSV_NO_VALID_ROWS",
      "O arquivo nao possui linhas validas para revisao.",
      422,
    );
  }

  const legacySourceHash = buildLegacyImportBatchHash({
    kind: "csv",
    content: payload.content,
    defaultAccountId: payload.accountId,
    ...(preview.batch.csvDelimiter === undefined
      ? {}
      : { csvDelimiter: preview.batch.csvDelimiter }),
    ...(preview.batch.csvMapping === undefined ? {} : { csvMapping: preview.batch.csvMapping }),
  });
  const duplicate = await findImportBatchBySourceHashes(
    context,
    [preview.batch.sourceHash, legacySourceHash],
    query,
  );
  if (duplicate !== undefined) {
    const detail = await getImportBatchDetailForContext(context, duplicate.id);
    return {
      ...detail,
      problems: [
        ...detail.problems,
        {
          rowNumber: 0,
          severity: "warning",
          code: "IMPORT_BATCH_DUPLICATE",
          message: "Este arquivo ja foi importado com a mesma conta e configuracao.",
        },
      ],
      duplicateBatch: true,
    };
  }

  const sameContentDifferentConfiguration = await findImportBatchByContentHash(
    context,
    preview.batch.contentHash,
    query,
  );
  const configurationWarnings: ImportProblem[] =
    sameContentDifferentConfiguration === undefined
      ? []
      : [
          {
            rowNumber: 0,
            severity: "warning",
            code: "IMPORT_BATCH_CONFIGURATION_CHANGED",
            message:
              "O mesmo conteudo ja foi usado em outra importacao com conta, delimitador ou mapeamento diferente.",
          },
        ];

  const batch: ImportBatch = {
    id: randomUUID(),
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    sourceKind: "csv",
    status: "reviewing",
    originalFileName: payload.originalFileName,
    sourceHash: preview.batch.sourceHash,
    contentHash: preview.batch.contentHash,
    receivedAt: preview.batch.receivedAt,
    createdAt: preview.batch.receivedAt,
    updatedAt: preview.batch.receivedAt,
    defaultAccountId: payload.accountId,
    totalRows: preview.batch.totalRows,
    validRows: preview.batch.validRows,
    duplicateRows: preview.batch.duplicateRows,
    problemRows: preview.batch.problemRows,
    problems: [...preview.problems, ...configurationWarnings],
    ...(preview.batch.csvDelimiter === undefined
      ? {}
      : { csvDelimiter: preview.batch.csvDelimiter }),
    ...(preview.batch.csvMapping === undefined ? {} : { csvMapping: preview.batch.csvMapping }),
  };
  const suggestions = preview.suggestions.map((suggestion) => {
    const aiSuggestion: AiSuggestion = {
      id: randomUUID(),
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      kind: "transaction_extraction",
      status: "pending_review",
      sourceEntityId: batch.id,
      confidence: suggestion.status === "duplicate" ? 0.7 : 1,
      explanation: buildImportExplanation(suggestion.sourceRowNumber, suggestion.status),
      payload: buildTransactionExtractionPayload(suggestion),
      provider: "solverfin-import-csv",
      model: "csv-parser-v3",
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
    };
    return aiSuggestion;
  });

  const inserted = await withSharedTransaction(async (executeQuery) => {
    const insertedRows = await executeQuery<{ id: string }>(
      buildInsertImportBatchSql(),
      buildImportBatchParams(batch),
    );
    if (insertedRows.length === 0) return false;
    await insertAuditLogEntry(executeQuery, buildBatchAuditEntry(context, batch, "create"));
    await insertAuditLogEntry(executeQuery, buildConsentAuditEntry(context, batch));

    for (const suggestion of suggestions) {
      await executeQuery(buildInsertAiSuggestionSql(), buildAiSuggestionParams(suggestion));
      await insertAuditLogEntry(
        executeQuery,
        buildSuggestionAuditEntry(
          context,
          suggestion,
          "create",
          "Linha CSV preparada para revisao.",
        ),
      );
    }
    return true;
  });

  if (!inserted) {
    const concurrentDuplicate = await findImportBatchBySourceHashes(
      context,
      [preview.batch.sourceHash, legacySourceHash],
      query,
    );
    if (concurrentDuplicate === undefined) {
      throw new Error("Import batch conflict did not converge to an existing batch.");
    }
    const detail = await getImportBatchDetailForContext(context, concurrentDuplicate.id);
    return {
      ...detail,
      problems: [
        ...detail.problems,
        {
          rowNumber: 0,
          severity: "warning",
          code: "IMPORT_BATCH_DUPLICATE",
          message: "Este arquivo ja foi importado com a mesma conta e configuracao.",
        },
      ],
      duplicateBatch: true,
    };
  }

  return {
    importBatch: batch,
    suggestions: suggestions.map((suggestion) =>
      toImportReviewSuggestion(suggestion, [], undefined),
    ),
    problems: batch.problems ?? [],
    duplicateBatch: false,
  };
}

export async function listImportBatchesForContext(
  context: TenantContext,
  filters: ListImportBatchFilters = {},
): Promise<ImportBatch[]> {
  const rows = await query<ImportBatchRow>(
    `select ${IMPORT_BATCH_SELECT_COLUMNS} from "ImportBatch"
     where "organizationId" = $1 and "financialProfileId" = $2
     order by "receivedAt" desc, "createdAt" desc`,
    [context.organizationId, context.financialProfileId],
  );

  return rows.map(mapImportBatchRow).filter((batch) => {
    if (filters.status !== undefined && filters.status !== "all" && batch.status !== filters.status)
      return false;
    if (filters.sourceKind !== undefined && batch.sourceKind !== filters.sourceKind) return false;
    return true;
  });
}

export async function getImportBatchDetailForContext(
  context: TenantContext,
  importBatchId: EntityId,
): Promise<ImportBatchDetail> {
  const batch = await findImportBatch(context, importBatchId, query);
  if (batch === undefined) {
    throw new ImportReviewError(
      "TENANT_RESOURCE_NOT_FOUND",
      "Recurso nao encontrado no perfil financeiro ativo.",
      404,
    );
  }

  const suggestionRows = await query<AiSuggestionRow>(
    `select ${AI_SUGGESTION_SELECT_COLUMNS} from "AiSuggestion"
     where "organizationId" = $1 and "financialProfileId" = $2 and "sourceEntityId" = $3
     order by "createdAt" asc, "id" asc`,
    [context.organizationId, context.financialProfileId, importBatchId],
  );
  const extractionSuggestions = suggestionRows
    .map(mapAiSuggestionRow)
    .filter((suggestion) => suggestion.kind === "transaction_extraction");
  const deterministicRows = await query<AiSuggestionRow>(
    `select ${AI_SUGGESTION_SELECT_COLUMNS} from "AiSuggestion"
     where "organizationId" = $1 and "financialProfileId" = $2
       and "sourceSuggestionId" = any($3::uuid[])
     order by "createdAt" asc, "id" asc`,
    [
      context.organizationId,
      context.financialProfileId,
      extractionSuggestions.map((suggestion) => suggestion.id),
    ],
  );
  const deterministicSuggestions = deterministicRows.map(mapAiSuggestionRow);
  const reconciliationTargetIds = [
    ...new Set([
      ...deterministicSuggestions.flatMap((candidate) => {
        if (candidate.kind !== "reconciliation" || candidate.status !== "approved") return [];
        const payload = parseDeterministicReviewPayload(candidate.payload);
        return payload === undefined ? [] : [payload.targetTransactionId];
      }),
      ...extractionSuggestions.flatMap((suggestion) =>
        suggestion.status === "approved" && suggestion.targetEntityId !== undefined
          ? [suggestion.targetEntityId]
          : [],
      ),
    ]),
  ];
  const transactionRows = await query<TransactionRow>(
    `select ${TRANSACTION_SELECT_COLUMNS} from "Transaction"
     where "organizationId" = $1 and "financialProfileId" = $2
       and ("importBatchId" = $3 or "id" = any($4::uuid[]))`,
    [context.organizationId, context.financialProfileId, importBatchId, reconciliationTargetIds],
  );
  const mappedTransactions = transactionRows.map(mapTransactionRow);
  const transactionsBySuggestion = new Map(
    mappedTransactions.flatMap((transaction) =>
      transaction.aiSuggestionId === undefined
        ? []
        : [[transaction.aiSuggestionId, transaction] as const],
    ),
  );
  const transactionsById = new Map(
    mappedTransactions.map((transaction) => [transaction.id, transaction] as const),
  );

  return {
    importBatch: batch,
    suggestions: extractionSuggestions.map((suggestion) => {
      const candidates = deterministicSuggestions.filter(
        (candidate) => getSourceSuggestionId(candidate) === suggestion.id,
      );
      const reconciliationTargetId =
        suggestion.targetEntityId ??
        candidates.flatMap((candidate) => {
          if (candidate.kind !== "reconciliation" || candidate.status !== "approved") return [];
          const payload = parseDeterministicReviewPayload(candidate.payload);
          return payload === undefined ? [] : [payload.targetTransactionId];
        })[0];
      return toImportReviewSuggestion(
        suggestion,
        candidates,
        transactionsBySuggestion.get(suggestion.id) ??
          (reconciliationTargetId === undefined
            ? undefined
            : transactionsById.get(reconciliationTargetId)),
      );
    }),
    problems: batch.problems as ImportProblem[],
  };
}

export async function updateImportSuggestionForContext(
  context: TenantContext,
  importBatchId: EntityId,
  suggestionId: EntityId,
  changes: ImportSuggestionUpdatePayload,
): Promise<ImportReviewDecisionResult> {
  return withSharedTransaction(async (executeQuery) => {
    const batch = await requireMutableBatch(context, importBatchId, executeQuery);
    const suggestion = await requireImportSuggestion(
      context,
      importBatchId,
      suggestionId,
      executeQuery,
      true,
    );
    const currentPayload = requireExtractionPayload(suggestion);
    const updatedPayload = mergeExtractionPayload(currentPayload, changes);
    await validateExtractionReferences(context, updatedPayload, executeQuery);
    const updatedAt = new Date().toISOString();
    const updatedSuggestion: AiSuggestion = {
      ...suggestion,
      payload: updatedPayload,
      explanation: buildImportExplanation(updatedPayload.sourceRowNumber, "pending_review"),
      updatedAt,
      updatedByUserId: context.userId,
    };

    await executeQuery(buildUpdateAiSuggestionSql(), buildAiSuggestionParams(updatedSuggestion));
    await expireDeterministicCandidates(
      context,
      updatedSuggestion.id,
      updatedAt,
      executeQuery,
      "Candidatura expirada porque a linha de origem foi editada.",
    );
    await insertAuditLogEntry(
      executeQuery,
      buildSuggestionAuditEntry(
        context,
        updatedSuggestion,
        "update",
        "Linha de importacao corrigida antes da confirmacao.",
        buildReviewChanges(changes),
      ),
    );
    const refreshedCandidates = await ensureCurrentDeterministicCandidates(
      context,
      batch.id,
      updatedSuggestion.id,
      executeQuery,
    );
    const recalculatedBatch = await recalculateImportBatch(context, batch.id, executeQuery);

    return {
      suggestion: toImportReviewSuggestion(
        updatedSuggestion,
        refreshedCandidates.map((candidate) => candidate.suggestion),
        undefined,
      ),
      importBatch: recalculatedBatch,
      idempotent: false,
      outcome: "updated",
    };
  });
}

export async function approveImportSuggestionForContext(
  context: TenantContext,
  importBatchId: EntityId,
  suggestionId: EntityId,
): Promise<ImportReviewDecisionResult> {
  const outcome = await withSharedTransaction(async (executeQuery) => {
    const pendingCandidates = await ensureCurrentDeterministicCandidates(
      context,
      importBatchId,
      suggestionId,
      executeQuery,
    );
    if (pendingCandidates.length > 0) {
      return { blockedCandidates: pendingCandidates.map((candidate) => candidate.detail) } as const;
    }
    return approveImportSuggestionInTransaction(context, importBatchId, suggestionId, executeQuery);
  });

  if ("blockedCandidates" in outcome) {
    throw new ImportReviewError(
      "IMPORT_REVIEW_CANDIDATE_PENDING",
      "Resolva as possíveis duplicidades ou conciliações antes de confirmar esta linha.",
      409,
      { candidates: outcome.blockedCandidates },
    );
  }
  return outcome;
}

export async function rejectImportSuggestionForContext(
  context: TenantContext,
  importBatchId: EntityId,
  suggestionId: EntityId,
  reason?: string,
): Promise<ImportReviewDecisionResult> {
  return withSharedTransaction(async (executeQuery) => {
    const batch = await requireMutableBatch(context, importBatchId, executeQuery);
    const suggestion = await requireImportSuggestion(
      context,
      importBatchId,
      suggestionId,
      executeQuery,
      false,
    );

    if (suggestion.status === "rejected") {
      return {
        suggestion: toImportReviewSuggestion(suggestion, [], undefined),
        importBatch: batch,
        idempotent: true,
        outcome: "idempotent",
      };
    }

    if (suggestion.status !== "pending_review") {
      throw invalidTransition(suggestion.status);
    }

    const now = new Date().toISOString();
    const rejected: AiSuggestion = {
      ...suggestion,
      status: "rejected",
      reviewedByUserId: context.userId,
      reviewedAt: now,
      updatedAt: now,
      updatedByUserId: context.userId,
    };
    await executeQuery(buildUpdateAiSuggestionSql(), buildAiSuggestionParams(rejected));
    await expireDeterministicCandidates(
      context,
      rejected.id,
      now,
      executeQuery,
      "Candidatura expirada porque a linha de origem foi rejeitada.",
    );
    await insertAuditLogEntry(
      executeQuery,
      buildSuggestionAuditEntry(
        context,
        rejected,
        "reject",
        reason?.trim() || "Linha de importacao rejeitada pelo usuario.",
      ),
    );
    const recalculatedBatch = await recalculateImportBatch(context, batch.id, executeQuery);

    return {
      suggestion: toImportReviewSuggestion(rejected, [], undefined),
      importBatch: recalculatedBatch,
      idempotent: false,
      outcome: "rejected",
    };
  });
}

export async function approveSelectedImportSuggestionsForContext(
  context: TenantContext,
  importBatchId: EntityId,
  suggestionIds: readonly EntityId[],
): Promise<BulkImportReviewResult> {
  if (suggestionIds.length === 0) {
    throw new ImportReviewError(
      "IMPORT_REVIEW_SELECTION_REQUIRED",
      "Selecione ao menos uma linha valida para confirmar.",
    );
  }
  if (new Set(suggestionIds).size !== suggestionIds.length) {
    throw new ImportReviewError(
      "IMPORT_REVIEW_DUPLICATE_SELECTION",
      "A selecao nao pode repetir a mesma linha.",
    );
  }

  const results: BulkImportReviewItemResult[] = [];
  const failures: { suggestionId: EntityId; code: string; message: string }[] = [];
  let approved = 0;
  let created = 0;
  let reconciled = 0;
  let idempotent = 0;
  let blocked = 0;
  let transferCount = 0;
  let transferTotalMinor = 0;

  for (const suggestionId of suggestionIds) {
    try {
      const decision = await approveImportSuggestionForContext(
        context,
        importBatchId,
        suggestionId,
      );
      approved += 1;
      if (decision.outcome === "created") created += 1;
      if (decision.outcome === "reconciled") reconciled += 1;
      if (decision.outcome === "idempotent") idempotent += 1;
      if (decision.suggestion.payload?.kind === "transfer") {
        transferCount += 1;
        transferTotalMinor += decision.suggestion.payload.amountMinor;
      }
      results.push({
        suggestionId,
        status: "approved",
        outcome: decision.outcome,
        decision,
      });
    } catch (error) {
      if (error instanceof ImportReviewError && error.statusCode < 500) {
        const failure = { suggestionId, code: error.code, message: error.message };
        const outcome = error.code === "IMPORT_REVIEW_CANDIDATE_PENDING" ? "blocked" : "failed";
        if (outcome === "blocked") blocked += 1;
        failures.push(failure);
        results.push({
          suggestionId,
          status: "failed",
          outcome,
          error: { code: error.code, message: error.message },
        });
        continue;
      }
      throw error;
    }
  }

  const importBatch = await withSharedTransaction((executeQuery) =>
    recalculateImportBatch(context, importBatchId, executeQuery),
  );
  return {
    importBatch,
    summary: {
      requested: suggestionIds.length,
      approved,
      failed: failures.length,
      created,
      reconciled,
      idempotent,
      blocked,
      transferCount,
      transferTotalMinor,
    },
    results,
    failures,
  };
}

export async function discardImportBatchForContext(
  context: TenantContext,
  importBatchId: EntityId,
  reason?: string,
): Promise<ImportBatchDetail> {
  await withSharedTransaction(async (executeQuery) => {
    const batch = await findImportBatch(context, importBatchId, executeQuery, true);
    if (batch === undefined) {
      throw new ImportReviewError(
        "TENANT_RESOURCE_NOT_FOUND",
        "Recurso nao encontrado no perfil financeiro ativo.",
        404,
      );
    }
    if (batch.status === "discarded") return;

    const financialEffectRows = await executeQuery<{ hasEffects: boolean }>(
      `select (
         exists (
           select 1 from "Transaction"
           where "organizationId" = $1 and "financialProfileId" = $2 and "importBatchId" = $3
         ) or exists (
           select 1 from "AiSuggestion"
           where "organizationId" = $1 and "financialProfileId" = $2
             and "sourceEntityId" = $3 and "kind" = 'TRANSACTION_EXTRACTION'
             and "status" = 'APPROVED' and "targetEntityId" is not null
         )
       ) as "hasEffects"`,
      [context.organizationId, context.financialProfileId, importBatchId],
    );
    if (financialEffectRows[0]?.hasEffects === true) {
      throw new ImportReviewError(
        "IMPORT_BATCH_HAS_FINANCIAL_EFFECTS",
        "Este lote ja criou ou vinculou lancamentos e nao pode ser descartado.",
        409,
      );
    }

    const now = new Date().toISOString();
    const rejectedRows = await executeQuery<AiSuggestionRow>(
      `update "AiSuggestion" set "status" = 'REJECTED', "reviewedByUserId" = $4,
         "reviewedAt" = $5, "updatedAt" = $5
       where "organizationId" = $1 and "financialProfileId" = $2
         and "sourceEntityId" = $3 and "kind" = 'TRANSACTION_EXTRACTION'
         and "status" = 'PENDING_REVIEW'
       returning ${AI_SUGGESTION_SELECT_COLUMNS}`,
      [context.organizationId, context.financialProfileId, importBatchId, context.userId, now],
    );
    for (const row of rejectedRows) {
      await insertAuditLogEntry(
        executeQuery,
        buildSuggestionAuditEntry(
          context,
          mapAiSuggestionRow(row),
          "reject",
          reason?.trim() || "Linha encerrada porque o lote foi descartado.",
        ),
      );
    }

    const expiredRows = await executeQuery<AiSuggestionRow>(
      `update "AiSuggestion" set "status" = 'EXPIRED', "reviewedByUserId" = $4,
         "reviewedAt" = $5, "updatedAt" = $5
       where "organizationId" = $1 and "financialProfileId" = $2
         and "sourceSuggestionId" in (
           select "id" from "AiSuggestion"
           where "organizationId" = $1 and "financialProfileId" = $2
             and "sourceEntityId" = $3 and "kind" = 'TRANSACTION_EXTRACTION'
         ) and "kind" in ('DEDUPLICATION', 'RECONCILIATION')
         and "status" = 'PENDING_REVIEW'
       returning ${AI_SUGGESTION_SELECT_COLUMNS}`,
      [context.organizationId, context.financialProfileId, importBatchId, context.userId, now],
    );
    for (const row of expiredRows) {
      await insertAuditLogEntry(
        executeQuery,
        buildSuggestionAuditEntry(
          context,
          mapAiSuggestionRow(row),
          "update",
          "Candidatura expirada porque o lote foi descartado.",
        ),
      );
    }
    await executeQuery(
      `update "ImportBatch" set "status" = 'DISCARDED', "completedAt" = $4, "updatedAt" = $4
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
      [importBatchId, context.organizationId, context.financialProfileId, now],
    );
    await insertAuditLogEntry(executeQuery, {
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      occurredAt: now,
      actorKind: "user",
      actorId: context.userId,
      action: "update",
      entityKind: "import_batch",
      entityId: importBatchId,
      reason: reason?.trim() || "Lote de importacao descartado pelo usuario.",
      redactedChanges: { status: "changed", completedAt: "added" },
    });
  });

  return getImportBatchDetailForContext(context, importBatchId);
}

export async function resolveImportSuggestionFromDeterministicDecision(
  context: TenantContext,
  sourceSuggestionId: EntityId,
  deterministicSuggestion: AiSuggestion,
  executeQuery: QueryExecutor,
): Promise<{
  sourceSuggestion: AiSuggestion;
  transaction?: Transaction;
  importBatch: ImportBatch;
}> {
  const sourceRows = await executeQuery<AiSuggestionRow>(
    `select ${AI_SUGGESTION_SELECT_COLUMNS} from "AiSuggestion"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
       and "kind" = 'TRANSACTION_EXTRACTION' for update`,
    [sourceSuggestionId, context.organizationId, context.financialProfileId],
  );
  const sourceSuggestion = sourceRows[0] ? mapAiSuggestionRow(sourceRows[0]) : undefined;
  if (sourceSuggestion === undefined || sourceSuggestion.sourceEntityId === undefined) {
    throw new ImportReviewError(
      "TENANT_RESOURCE_NOT_FOUND",
      "Linha de importacao vinculada a sugestao deterministica nao foi encontrada.",
      404,
    );
  }

  let transaction: Transaction | undefined;
  let resolvedSource = sourceSuggestion;
  const now = new Date().toISOString();

  if (deterministicSuggestion.kind === "deduplication") {
    if (sourceSuggestion.status === "pending_review") {
      resolvedSource = {
        ...sourceSuggestion,
        status: "rejected",
        reviewedByUserId: context.userId,
        reviewedAt: now,
        updatedAt: now,
        updatedByUserId: context.userId,
      };
      await executeQuery(buildUpdateAiSuggestionSql(), buildAiSuggestionParams(resolvedSource));
      await insertAuditLogEntry(
        executeQuery,
        buildSuggestionAuditEntry(
          context,
          resolvedSource,
          "reject",
          "Linha resolvida como duplicidade de um lancamento existente.",
        ),
      );
    }
  } else if (deterministicSuggestion.kind === "reconciliation") {
    const payload = parseDeterministicReviewPayload(deterministicSuggestion.payload);
    if (payload === undefined) {
      throw new ImportReviewError(
        "IMPORT_DETERMINISTIC_PAYLOAD_INVALID",
        "Sugestao de conciliacao nao possui vinculo estruturado valido.",
      );
    }
    const rows = await executeQuery<TransactionRow>(
      `select ${TRANSACTION_SELECT_COLUMNS} from "Transaction"
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3 for update`,
      [payload.targetTransactionId, context.organizationId, context.financialProfileId],
    );
    const current = rows[0] ? mapTransactionRow(rows[0]) : undefined;
    if (current === undefined) {
      throw new ImportReviewError(
        "TENANT_RESOURCE_NOT_FOUND",
        "Lancamento alvo da conciliacao nao foi encontrado.",
        404,
      );
    }
    if (current.status !== "reconciled") {
      await executeQuery(
        `update "Transaction" set "status" = 'RECONCILED', "reconciledAt" = $4,
           "updatedAt" = $4, "updatedByUserId" = $5
         where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
        [current.id, context.organizationId, context.financialProfileId, now, context.userId],
      );
      transaction = {
        ...current,
        status: "reconciled",
        reconciledAt: now,
        updatedAt: now,
        updatedByUserId: context.userId,
      };
      if (transaction.kind === "transfer") {
        await insertAuditLogEntry(
          executeQuery,
          buildImportedTransferReconciliationAuditEntry(context, transaction),
        );
      }
    } else {
      transaction = current;
    }
    if (sourceSuggestion.status === "pending_review") {
      resolvedSource = {
        ...sourceSuggestion,
        status: "approved",
        targetEntityId: current.id,
        reviewedByUserId: context.userId,
        reviewedAt: now,
        updatedAt: now,
        updatedByUserId: context.userId,
      };
      await executeQuery(buildUpdateAiSuggestionSql(), buildAiSuggestionParams(resolvedSource));
      await insertAuditLogEntry(
        executeQuery,
        buildSuggestionAuditEntry(
          context,
          resolvedSource,
          "approve",
          "Linha de importacao vinculada a lancamento conciliado.",
        ),
      );
    }
  }

  await expireDeterministicCandidates(
    context,
    sourceSuggestionId,
    now,
    executeQuery,
    "Candidatura expirada porque outra decisao resolveu a linha.",
    deterministicSuggestion.id,
  );
  const importBatch = await recalculateImportBatch(
    context,
    sourceSuggestion.sourceEntityId,
    executeQuery,
  );
  return { sourceSuggestion: resolvedSource, ...(transaction ? { transaction } : {}), importBatch };
}

async function approveImportSuggestionInTransaction(
  context: TenantContext,
  importBatchId: EntityId,
  suggestionId: EntityId,
  executeQuery: QueryExecutor,
): Promise<ImportReviewDecisionResult> {
  const batch = await requireMutableBatch(context, importBatchId, executeQuery);
  const suggestion = await requireImportSuggestion(
    context,
    importBatchId,
    suggestionId,
    executeQuery,
    false,
  );
  const existingTransaction = await findTransactionBySuggestion(
    context,
    suggestion.id,
    executeQuery,
  );

  if (existingTransaction !== undefined) {
    return {
      suggestion: toImportReviewSuggestion(suggestion, [], existingTransaction),
      transaction: existingTransaction,
      importBatch: batch,
      idempotent: true,
      outcome: "idempotent",
    };
  }

  if (suggestion.status === "approved" && suggestion.targetEntityId !== undefined) {
    const target = await findTransactionById(context, suggestion.targetEntityId, executeQuery);
    if (target === undefined) {
      throw new ImportReviewError(
        "IMPORT_APPROVED_TRANSACTION_MISSING",
        "O lancamento vinculado a esta linha nao foi encontrado.",
        409,
      );
    }
    return {
      suggestion: toImportReviewSuggestion(suggestion, [], target),
      transaction: target,
      importBatch: batch,
      idempotent: true,
      outcome: "idempotent",
    };
  }

  if (suggestion.status !== "pending_review") throw invalidTransition(suggestion.status);
  const payload = requireExtractionPayload(suggestion);
  await validateExtractionReferences(context, payload, executeQuery);

  if (payload.kind === "transfer") {
    await lockCanonicalTransfer(context, payload, executeQuery);
    const existingTransfer = await findCanonicalTransfer(
      context,
      payload,
      suggestion.id,
      executeQuery,
    );
    if (existingTransfer !== undefined) {
      return reconcileImportTransferInTransaction(
        context,
        batch,
        suggestion,
        existingTransfer,
        executeQuery,
      );
    }
  }

  const now = new Date().toISOString();
  const transaction = buildImportedTransaction(context, batch.id, suggestion.id, payload, now);
  await executeQuery(buildInsertTransactionSql(), buildTransactionParams(transaction));
  await insertAuditLogEntry(executeQuery, buildImportedTransactionAuditEntry(context, transaction));

  const approved: AiSuggestion = {
    ...suggestion,
    status: "approved",
    targetEntityId: transaction.id,
    reviewedByUserId: context.userId,
    reviewedAt: now,
    updatedAt: now,
    updatedByUserId: context.userId,
  };
  await executeQuery(buildUpdateAiSuggestionSql(), buildAiSuggestionParams(approved));
  await expireDeterministicCandidates(
    context,
    approved.id,
    now,
    executeQuery,
    "Candidatura expirada porque a linha foi confirmada como novo lancamento.",
  );
  await insertAuditLogEntry(
    executeQuery,
    buildSuggestionAuditEntry(
      context,
      approved,
      "approve",
      transaction.kind === "transfer"
        ? "Linha de importacao confirmada como transferencia entre contas."
        : "Linha de importacao confirmada e convertida em lancamento.",
    ),
  );
  const recalculatedBatch = await recalculateImportBatch(context, batch.id, executeQuery);

  return {
    suggestion: toImportReviewSuggestion(approved, [], transaction),
    transaction,
    importBatch: recalculatedBatch,
    idempotent: false,
    outcome: "created",
  };
}

async function findTransactionById(
  context: TenantContext,
  transactionId: EntityId,
  executeQuery: QueryExecutor,
): Promise<Transaction | undefined> {
  const rows = await executeQuery<TransactionRow>(
    `select ${TRANSACTION_SELECT_COLUMNS} from "Transaction"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [transactionId, context.organizationId, context.financialProfileId],
  );
  return rows[0] ? mapTransactionRow(rows[0]) : undefined;
}

async function lockCanonicalTransfer(
  context: TenantContext,
  payload: TransactionExtractionPayload,
  executeQuery: QueryExecutor,
): Promise<void> {
  const accounts = resolveCanonicalTransferAccounts(payload);
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
  suggestionId: EntityId,
  executeQuery: QueryExecutor,
): Promise<Transaction | undefined> {
  const accounts = resolveCanonicalTransferAccounts(payload);
  const rows = await executeQuery<TransactionRow>(
    `select ${TRANSACTION_SELECT_COLUMNS} from "Transaction" candidate
     where candidate."organizationId" = $1 and candidate."financialProfileId" = $2
       and candidate."kind" = 'TRANSFER' and candidate."status" <> 'VOIDED'
       and candidate."accountId" = $3 and candidate."destinationAccountId" = $4
       and candidate."amountMinor" = $5 and upper(candidate."currency") = upper($6)
       and candidate."occurredOn" between ($7::date - interval '2 days') and ($7::date + interval '2 days')
       and not exists (
         select 1 from "AiSuggestion" rejected
         where rejected."organizationId" = $1 and rejected."financialProfileId" = $2
           and rejected."sourceSuggestionId" = $8
           and rejected."payloadFingerprint" = $9
           and rejected."targetEntityId" = candidate."id"
           and rejected."kind" in ('DEDUPLICATION', 'RECONCILIATION')
           and rejected."status" = 'REJECTED'
       )
     order by abs(candidate."occurredOn" - $7::date), candidate."createdAt" asc
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
      suggestionId,
      buildImportPayloadFingerprint(payload),
    ],
  );
  return rows[0] ? mapTransactionRow(rows[0]) : undefined;
}

async function reconcileImportTransferInTransaction(
  context: TenantContext,
  batch: ImportBatch,
  suggestion: AiSuggestion,
  existingTransfer: Transaction,
  executeQuery: QueryExecutor,
): Promise<ImportReviewDecisionResult> {
  const now = new Date().toISOString();
  const transaction =
    existingTransfer.status === "reconciled"
      ? existingTransfer
      : {
          ...existingTransfer,
          status: "reconciled" as const,
          reconciledAt: now,
          updatedAt: now,
          updatedByUserId: context.userId,
        };

  if (existingTransfer.status !== "reconciled") {
    await executeQuery(
      `update "Transaction" set "status" = 'RECONCILED', "reconciledAt" = $4,
         "updatedAt" = $4, "updatedByUserId" = $5
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
      [
        existingTransfer.id,
        context.organizationId,
        context.financialProfileId,
        now,
        context.userId,
      ],
    );
    await insertAuditLogEntry(
      executeQuery,
      buildImportedTransferReconciliationAuditEntry(context, transaction),
    );
  }

  const approved: AiSuggestion = {
    ...suggestion,
    status: "approved",
    targetEntityId: existingTransfer.id,
    reviewedByUserId: context.userId,
    reviewedAt: now,
    updatedAt: now,
    updatedByUserId: context.userId,
  };
  await executeQuery(buildUpdateAiSuggestionSql(), buildAiSuggestionParams(approved));
  await expireDeterministicCandidates(
    context,
    approved.id,
    now,
    executeQuery,
    "Candidatura expirada porque a linha convergiu para uma transferencia existente.",
  );
  await insertAuditLogEntry(
    executeQuery,
    buildSuggestionAuditEntry(
      context,
      approved,
      "approve",
      "Linha de importacao conciliada com transferencia existente sem criar novo lancamento.",
    ),
  );
  const recalculatedBatch = await recalculateImportBatch(context, batch.id, executeQuery);
  return {
    suggestion: toImportReviewSuggestion(approved, [], transaction),
    transaction,
    importBatch: recalculatedBatch,
    idempotent: false,
    outcome: "reconciled",
  };
}

async function requireMutableBatch(
  context: TenantContext,
  importBatchId: EntityId,
  executeQuery: QueryExecutor,
): Promise<ImportBatch> {
  const batch = await findImportBatch(context, importBatchId, executeQuery, true);
  if (batch === undefined) {
    throw new ImportReviewError(
      "TENANT_RESOURCE_NOT_FOUND",
      "Recurso nao encontrado no perfil financeiro ativo.",
      404,
    );
  }
  if (batch.status === "discarded") {
    throw new ImportReviewError(
      "IMPORT_BATCH_DISCARDED",
      "Lote descartado nao pode receber novas decisoes.",
      409,
    );
  }
  return batch;
}

async function requireImportSuggestion(
  context: TenantContext,
  importBatchId: EntityId,
  suggestionId: EntityId,
  executeQuery: QueryExecutor,
  pendingRequired: boolean,
): Promise<AiSuggestion> {
  const rows = await executeQuery<AiSuggestionRow>(
    `select ${AI_SUGGESTION_SELECT_COLUMNS} from "AiSuggestion"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
       and "sourceEntityId" = $4 and "kind" = 'TRANSACTION_EXTRACTION' for update`,
    [suggestionId, context.organizationId, context.financialProfileId, importBatchId],
  );
  const suggestion = rows[0] ? mapAiSuggestionRow(rows[0]) : undefined;
  if (suggestion === undefined) {
    throw new ImportReviewError(
      "TENANT_RESOURCE_NOT_FOUND",
      "Linha de importacao nao encontrada neste lote.",
      404,
    );
  }
  if (pendingRequired && suggestion.status !== "pending_review")
    throw invalidTransition(suggestion.status);
  return suggestion;
}

async function validateExtractionReferences(
  context: TenantContext,
  payload: TransactionExtractionPayload,
  executeQuery: QueryExecutor,
): Promise<void> {
  if (payload.accountId === undefined) {
    throw new ImportReviewError(
      "IMPORT_ACCOUNT_REQUIRED",
      "Selecione uma conta valida antes de confirmar a linha.",
    );
  }
  const referenceAccount = await assertActiveAccount(
    context,
    payload.accountId,
    executeQuery,
    "reference",
  );
  if (referenceAccount.currency.toUpperCase() !== payload.currency.toUpperCase()) {
    throw new ImportReviewError(
      "IMPORT_ACCOUNT_CURRENCY_MISMATCH",
      "A moeda da linha importada precisa ser a mesma moeda da conta selecionada.",
    );
  }

  if (payload.kind === "transfer") {
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
    const otherAccount = await assertActiveAccount(
      context,
      payload.otherAccountId,
      executeQuery,
      "other",
    );
    if (
      otherAccount.currency.toUpperCase() !== payload.currency.toUpperCase() ||
      otherAccount.currency.toUpperCase() !== referenceAccount.currency.toUpperCase()
    ) {
      throw new ImportReviewError(
        "IMPORT_TRANSFER_CURRENCY_MISMATCH",
        "As duas contas da transferencia precisam usar a mesma moeda da linha importada.",
      );
    }
  }

  if (payload.categoryId !== undefined) {
    const rows = await executeQuery<CategoryRow>(
      `select "id", "kind", "status" from "Category"
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
    if (category.kind.toLowerCase() !== payload.kind) {
      throw new ImportReviewError(
        "IMPORT_CATEGORY_KIND_MISMATCH",
        "A categoria precisa ter o mesmo tipo da linha importada.",
      );
    }
  }
}

async function assertActiveAccount(
  context: TenantContext,
  accountId: EntityId,
  executeQuery: QueryExecutor,
  role: "reference" | "other" = "reference",
): Promise<AccountRow> {
  const rows = await executeQuery<AccountRow>(
    `select "id", "status", "currency" from "Account"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [accountId, context.organizationId, context.financialProfileId],
  );
  if (rows[0] === undefined) {
    throw new ImportReviewError(
      "TENANT_RESOURCE_NOT_FOUND",
      "Recurso nao encontrado no perfil financeiro ativo.",
      404,
    );
  }
  if (rows[0].status !== "ACTIVE") {
    throw new ImportReviewError(
      role === "other" ? "IMPORT_TRANSFER_OTHER_ACCOUNT_INVALID" : "IMPORT_ACCOUNT_INVALID",
      role === "other"
        ? "A outra conta da transferencia precisa estar ativa neste perfil financeiro."
        : "Conta selecionada nao esta disponivel neste perfil financeiro.",
    );
  }
  return rows[0];
}

interface CanonicalTransferAccounts {
  direction: ImportLineDirection;
  sourceAccountId: EntityId;
  destinationAccountId: EntityId;
}

function resolveCanonicalTransferAccounts(
  payload: TransactionExtractionPayload,
): CanonicalTransferAccounts {
  const direction = deriveImportLineDirection(payload);
  if (direction === undefined) {
    throw new ImportReviewError(
      "IMPORT_TRANSFER_DIRECTION_INVALID",
      "Nao foi possivel determinar se a transferencia entra ou sai da conta de referencia.",
    );
  }
  if (
    payload.kind !== "transfer" ||
    payload.payloadVersion !== 2 ||
    payload.accountId === undefined ||
    payload.otherAccountId === undefined
  ) {
    throw new ImportReviewError(
      "IMPORT_TRANSFER_OTHER_ACCOUNT_REQUIRED",
      "Selecione as duas contas da transferencia antes de confirmar.",
    );
  }

  return direction === "outflow"
    ? {
        direction,
        sourceAccountId: payload.accountId,
        destinationAccountId: payload.otherAccountId,
      }
    : {
        direction,
        sourceAccountId: payload.otherAccountId,
        destinationAccountId: payload.accountId,
      };
}

async function findImportBatchBySourceHashes(
  context: TenantContext,
  sourceHashes: readonly string[],
  executeQuery: QueryExecutor,
): Promise<ImportBatch | undefined> {
  const rows = await executeQuery<ImportBatchRow>(
    `select ${IMPORT_BATCH_SELECT_COLUMNS} from "ImportBatch"
     where "organizationId" = $1 and "financialProfileId" = $2 and "sourceHash" = any($3::text[])
     order by "createdAt" asc limit 1`,
    [context.organizationId, context.financialProfileId, sourceHashes],
  );
  return rows[0] ? mapImportBatchRow(rows[0]) : undefined;
}

async function findImportBatchByContentHash(
  context: TenantContext,
  contentHash: string,
  executeQuery: QueryExecutor,
): Promise<ImportBatch | undefined> {
  const rows = await executeQuery<ImportBatchRow>(
    `select ${IMPORT_BATCH_SELECT_COLUMNS} from "ImportBatch"
     where "organizationId" = $1 and "financialProfileId" = $2 and "contentHash" = $3
     order by "createdAt" asc limit 1`,
    [context.organizationId, context.financialProfileId, contentHash],
  );
  return rows[0] ? mapImportBatchRow(rows[0]) : undefined;
}

async function findImportBatch(
  context: TenantContext,
  importBatchId: EntityId,
  executeQuery: QueryExecutor,
  lock = false,
): Promise<ImportBatch | undefined> {
  const rows = await executeQuery<ImportBatchRow>(
    `select ${IMPORT_BATCH_SELECT_COLUMNS} from "ImportBatch"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3${lock ? " for update" : ""}`,
    [importBatchId, context.organizationId, context.financialProfileId],
  );
  return rows[0] ? mapImportBatchRow(rows[0]) : undefined;
}

async function findTransactionBySuggestion(
  context: TenantContext,
  suggestionId: EntityId,
  executeQuery: QueryExecutor,
): Promise<Transaction | undefined> {
  const rows = await executeQuery<TransactionRow>(
    `select ${TRANSACTION_SELECT_COLUMNS} from "Transaction"
     where "organizationId" = $1 and "financialProfileId" = $2 and "aiSuggestionId" = $3`,
    [context.organizationId, context.financialProfileId, suggestionId],
  );
  return rows[0] ? mapTransactionRow(rows[0]) : undefined;
}

async function ensureCurrentDeterministicCandidates(
  context: TenantContext,
  importBatchId: EntityId,
  suggestionId: EntityId,
  executeQuery: QueryExecutor,
): Promise<readonly CurrentDeterministicCandidate[]> {
  await requireMutableBatch(context, importBatchId, executeQuery);
  const suggestion = await requireImportSuggestion(
    context,
    importBatchId,
    suggestionId,
    executeQuery,
    false,
  );
  const existingTransaction = await findTransactionBySuggestion(
    context,
    suggestion.id,
    executeQuery,
  );
  if (existingTransaction !== undefined || suggestion.status !== "pending_review") return [];

  const payload = requireExtractionPayload(suggestion);
  await validateExtractionReferences(context, payload, executeQuery);
  const { createDeterministicImportReviewSuggestionsForContext } =
    await import("./review-suggestions.js");
  const direction = deriveImportLineDirection(payload);
  if (direction === undefined) {
    throw new ImportReviewError(
      "IMPORT_TRANSFER_DIRECTION_INVALID",
      "Nao foi possivel determinar a direcao original da linha importada.",
    );
  }
  await createDeterministicImportReviewSuggestionsForContext(
    context,
    importBatchId,
    [
      {
        id: suggestion.id,
        payloadVersion: payload.payloadVersion,
        organizationId: context.organizationId,
        financialProfileId: context.financialProfileId,
        status: "pending_review",
        sourceKind: "csv",
        sourceHash: payload.sourceHash,
        sourceRowNumber: payload.sourceRowNumber,
        occurredOn: payload.occurredOn,
        description: payload.description,
        kind: payload.kind,
        direction,
        amountMinor: payload.amountMinor,
        currency: payload.currency,
        ...(payload.accountId === undefined ? {} : { accountId: payload.accountId }),
        ...(payload.kind === "transfer" &&
        payload.payloadVersion === 2 &&
        payload.otherAccountId !== undefined
          ? { otherAccountId: payload.otherAccountId }
          : {}),
        ...(payload.categoryId === undefined ? {} : { categoryId: payload.categoryId }),
        ...(payload.externalId === undefined ? {} : { externalId: payload.externalId }),
      },
    ],
    new Date().toISOString(),
    executeQuery,
  );

  const fingerprint = buildImportPayloadFingerprint(payload);
  const candidateRows = await executeQuery<AiSuggestionRow>(
    `select ${AI_SUGGESTION_SELECT_COLUMNS} from "AiSuggestion"
     where "organizationId" = $1 and "financialProfileId" = $2
       and "sourceSuggestionId" = $3 and "payloadFingerprint" = $4
       and "kind" in ('DEDUPLICATION', 'RECONCILIATION')
       and "status" = 'PENDING_REVIEW'
     order by "createdAt" asc, "id" asc`,
    [context.organizationId, context.financialProfileId, suggestion.id, fingerprint],
  );
  const candidates = candidateRows.map(mapAiSuggestionRow).flatMap((candidate) => {
    const deterministic = parseDeterministicReviewPayload(candidate.payload);
    if (deterministic === undefined) return [];
    return [
      {
        suggestion: candidate,
        detail: {
          id: candidate.id,
          kind: candidate.kind,
          status: candidate.status,
          targetTransactionId: deterministic.targetTransactionId,
          confidence: candidate.confidence,
          explanation: candidate.explanation,
          reasons: deterministic.reasons,
          conflicts: deterministic.conflicts,
        },
      },
    ];
  });
  if (candidates.length > 0) {
    await recalculateImportBatch(context, importBatchId, executeQuery);
  }
  return candidates;
}

export async function refreshImportBatchStatusForContext(
  context: TenantContext,
  importBatchId: EntityId,
  executeQuery: QueryExecutor = query,
): Promise<ImportBatch> {
  return recalculateImportBatch(context, importBatchId, executeQuery);
}

async function expireDeterministicCandidates(
  context: TenantContext,
  sourceSuggestionId: EntityId,
  now: string,
  executeQuery: QueryExecutor,
  reason: string,
  exceptSuggestionId?: EntityId,
): Promise<void> {
  const rows = await executeQuery<AiSuggestionRow>(
    `update "AiSuggestion" set "status" = 'EXPIRED', "reviewedAt" = $4,
       "reviewedByUserId" = $5, "updatedAt" = $4
     where "organizationId" = $1 and "financialProfileId" = $2
       and "sourceSuggestionId" = $3 and "status" = 'PENDING_REVIEW'
       and ($6::uuid is null or "id" <> $6)
     returning ${AI_SUGGESTION_SELECT_COLUMNS}`,
    [
      context.organizationId,
      context.financialProfileId,
      sourceSuggestionId,
      now,
      context.userId,
      exceptSuggestionId ?? null,
    ],
  );
  for (const row of rows) {
    await insertAuditLogEntry(
      executeQuery,
      buildSuggestionAuditEntry(context, mapAiSuggestionRow(row), "update", reason),
    );
  }
}

async function recalculateImportBatch(
  context: TenantContext,
  importBatchId: EntityId,
  executeQuery: QueryExecutor,
): Promise<ImportBatch> {
  const countRows = await executeQuery<CountRow>(
    `select
       count(*)::int as "total",
       count(*) filter (where "status" = 'PENDING_REVIEW')::int as "pending",
       (select count(*)::int from "AiSuggestion" candidate
        where candidate."organizationId" = $1
          and candidate."financialProfileId" = $2
          and candidate."sourceSuggestionId" in (
            select source_pending."id" from "AiSuggestion" source_pending
            where source_pending."organizationId" = $1
              and source_pending."financialProfileId" = $2
              and source_pending."sourceEntityId" = $3
              and source_pending."kind" = 'TRANSACTION_EXTRACTION'
          )
          and candidate."status" = 'PENDING_REVIEW') as "candidatePending",
       count(*) filter (where exists (
         select 1 from "AiSuggestion" candidate
         where candidate."organizationId" = source."organizationId"
           and candidate."financialProfileId" = source."financialProfileId"
           and candidate."sourceSuggestionId" = source."id"
           and candidate."kind" = 'DEDUPLICATION'
           and candidate."status" <> 'EXPIRED'
       ))::int as "duplicate"
     from "AiSuggestion" source
     where source."organizationId" = $1 and source."financialProfileId" = $2
       and source."sourceEntityId" = $3 and source."kind" = 'TRANSACTION_EXTRACTION'`,
    [context.organizationId, context.financialProfileId, importBatchId],
  );
  const counts = countRows[0] ?? { total: 0, pending: 0, candidatePending: 0, duplicate: 0 };
  const now = new Date().toISOString();
  const status: ImportStatus =
    counts.pending === 0 && counts.candidatePending === 0 ? "completed" : "reviewing";
  await executeQuery(
    `update "ImportBatch" set "status" = $4, "validRows" = $5, "duplicateRows" = $6,
       "completedAt" = $7, "updatedAt" = $8
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [
      importBatchId,
      context.organizationId,
      context.financialProfileId,
      status.toUpperCase(),
      counts.total,
      counts.duplicate,
      status === "completed" ? now : null,
      now,
    ],
  );
  const batch = await findImportBatch(context, importBatchId, executeQuery);
  if (batch === undefined) throw new Error("Import batch disappeared during recalculation.");
  return batch;
}

function buildImportedTransaction(
  context: TenantContext,
  importBatchId: EntityId,
  aiSuggestionId: EntityId,
  payload: TransactionExtractionPayload,
  now: string,
): Transaction {
  const id = randomUUID();
  const transaction: Transaction = {
    id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    kind: payload.kind,
    status: "posted",
    source: "import",
    amountMinor: payload.amountMinor,
    currency: payload.currency,
    occurredOn: payload.occurredOn,
    plannedOn: payload.occurredOn,
    effectiveOn: payload.occurredOn,
    description: payload.description,
    ...(payload.categoryId === undefined ? {} : { categoryId: payload.categoryId }),
    importBatchId,
    aiSuggestionId,
    createdByUserId: context.userId,
    updatedByUserId: context.userId,
    createdAt: now,
    updatedAt: now,
  };

  if (payload.kind === "transfer") {
    const accounts = resolveCanonicalTransferAccounts(payload);
    transaction.accountId = accounts.sourceAccountId;
    transaction.destinationAccountId = accounts.destinationAccountId;
    transaction.transferGroupId = id;
  } else if (payload.accountId !== undefined) {
    transaction.accountId = payload.accountId;
  }

  buildTransactionMovements(transaction);
  return transaction;
}

function mergeExtractionPayload(
  current: TransactionExtractionPayload,
  changes: ImportSuggestionUpdatePayload,
): TransactionExtractionPayload {
  const kind = changes.kind ?? current.kind;
  const direction = deriveImportLineDirection(current);
  const common = {
    sourceRowNumber: current.sourceRowNumber,
    sourceHash: current.sourceHash,
    occurredOn: changes.occurredOn ?? current.occurredOn,
    kind,
    amountMinor: changes.amountMinor ?? current.amountMinor,
    currency: current.currency,
    description:
      changes.description === undefined ? current.description : changes.description.trim(),
    ...(changes.accountId === undefined
      ? current.accountId === undefined
        ? {}
        : { accountId: current.accountId }
      : { accountId: changes.accountId }),
    ...(current.externalId === undefined ? {} : { externalId: current.externalId }),
  };

  let merged: TransactionExtractionPayload;
  if (current.payloadVersion === 2 || changes.kind !== undefined || kind === "transfer") {
    if (direction === undefined) {
      throw new ImportReviewError(
        "IMPORT_TRANSFER_DIRECTION_INVALID",
        "A linha legada nao possui direcao segura para ser convertida em transferencia.",
      );
    }
    const currentOtherAccountId = current.payloadVersion === 2 ? current.otherAccountId : undefined;
    const otherAccountId =
      kind === "transfer"
        ? changes.otherAccountId === null
          ? undefined
          : (changes.otherAccountId ?? currentOtherAccountId)
        : undefined;
    const candidate: TransactionExtractionPayloadV2 = {
      payloadVersion: 2,
      ...common,
      direction,
      ...(otherAccountId === undefined ? {} : { otherAccountId }),
    };
    merged = candidate;
  } else {
    const candidate: TransactionExtractionPayloadV1 = {
      payloadVersion: 1,
      ...common,
      kind: kind as "income" | "expense",
    };
    merged = candidate;
  }

  if (changes.categoryId === null) delete merged.categoryId;
  else if (changes.categoryId !== undefined) merged.categoryId = changes.categoryId;
  else if (current.categoryId !== undefined) merged.categoryId = current.categoryId;

  const parsed = parseTransactionExtractionPayload(merged);
  if (parsed === undefined) {
    throw new ImportReviewError(
      "IMPORT_SUGGESTION_PAYLOAD_INVALID",
      "Revise data, tipo, valor, moeda e descricao antes de salvar a linha.",
    );
  }
  return parsed;
}

function requireExtractionPayload(suggestion: AiSuggestion): TransactionExtractionPayload {
  const payload = parseTransactionExtractionPayload(suggestion.payload);
  if (payload === undefined) {
    throw new ImportReviewError(
      "IMPORT_SUGGESTION_PAYLOAD_INVALID",
      "Linha de importacao nao possui dados estruturados validos.",
    );
  }
  return payload;
}

function invalidTransition(status: AiSuggestion["status"]): ImportReviewError {
  return new ImportReviewError(
    "IMPORT_REVIEW_INVALID_TRANSITION",
    `A linha ja foi resolvida com status ${status} e nao pode receber esta acao.`,
    409,
  );
}

function buildImportExplanation(
  sourceRowNumber: number,
  status: "pending_review" | "duplicate",
): string {
  return status === "duplicate"
    ? `Linha ${sourceRowNumber} importada com alerta de possivel duplicidade. Revise antes de confirmar.`
    : `Linha ${sourceRowNumber} importada e pronta para revisao humana.`;
}

function buildInsertImportBatchSql(): string {
  return `insert into "ImportBatch"
    ("id", "organizationId", "financialProfileId", "defaultAccountId", "sourceKind", "status",
     "originalFileName", "sourceHash", "contentHash", "totalRows", "validRows", "duplicateRows", "problemRows", "problems",
     "csvDelimiter", "csvMapping", "receivedAt", "completedAt", "createdAt", "updatedAt")
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16::jsonb,
      $17, $18, $19, $20)
    on conflict ("organizationId", "financialProfileId", "sourceHash") do nothing
    returning "id"`;
}

function buildImportBatchParams(batch: ImportBatch): unknown[] {
  return [
    batch.id,
    batch.organizationId,
    batch.financialProfileId,
    batch.defaultAccountId ?? null,
    batch.sourceKind.toUpperCase(),
    batch.status.toUpperCase(),
    batch.originalFileName ?? null,
    batch.sourceHash,
    batch.contentHash ?? null,
    batch.totalRows ?? 0,
    batch.validRows ?? 0,
    batch.duplicateRows ?? 0,
    batch.problemRows ?? 0,
    JSON.stringify(batch.problems ?? []),
    batch.csvDelimiter ?? null,
    batch.csvMapping === undefined ? null : JSON.stringify(batch.csvMapping),
    batch.receivedAt,
    batch.completedAt ?? null,
    batch.createdAt,
    batch.updatedAt,
  ];
}

function buildAiSuggestionParams(suggestion: AiSuggestion): unknown[] {
  const sourceSuggestionId = getSourceSuggestionId(suggestion);
  const fingerprint =
    suggestion.kind === "transaction_extraction"
      ? parseTransactionExtractionPayload(suggestion.payload)
      : undefined;
  const deterministic = parseDeterministicReviewPayload(suggestion.payload);
  return [
    suggestion.id,
    suggestion.organizationId,
    suggestion.financialProfileId,
    suggestion.kind.toUpperCase(),
    suggestion.status.toUpperCase(),
    suggestion.sourceEntityId ?? null,
    suggestion.targetEntityId ?? deterministic?.targetTransactionId ?? null,
    suggestion.confidence,
    suggestion.explanation,
    suggestion.payload === undefined ? null : JSON.stringify(suggestion.payload),
    sourceSuggestionId ?? null,
    fingerprint !== undefined
      ? buildImportPayloadFingerprint(fingerprint)
      : (deterministic?.sourcePayloadFingerprint ?? null),
    suggestion.provider ?? null,
    suggestion.model ?? null,
    suggestion.reviewedByUserId ?? null,
    suggestion.reviewedAt ?? null,
    suggestion.createdAt,
    suggestion.updatedAt,
  ];
}

function buildInsertTransactionSql(): string {
  return `insert into "Transaction"
    ("id", "organizationId", "financialProfileId", "accountId", "destinationAccountId", "categoryId",
     "cardId", "cardInstrumentId", "invoiceId", "recurrenceId", "installmentId", "importBatchId",
     "aiSuggestionId", "transferGroupId", "kind", "status", "source", "amountMinor", "currency",
     "occurredOn", "plannedOn", "effectiveOn", "description", "reconciledAt", "voidedAt",
     "createdByUserId", "updatedByUserId", "createdAt", "updatedAt")
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
      $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)`;
}

function buildTransactionParams(transaction: Transaction): unknown[] {
  return [
    transaction.id,
    transaction.organizationId,
    transaction.financialProfileId,
    transaction.accountId ?? null,
    transaction.destinationAccountId ?? null,
    transaction.categoryId ?? null,
    transaction.cardId ?? null,
    transaction.cardInstrumentId ?? null,
    transaction.invoiceId ?? null,
    transaction.recurrenceId ?? null,
    transaction.installmentId ?? null,
    transaction.importBatchId ?? null,
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
    transaction.createdByUserId ?? null,
    transaction.updatedByUserId ?? null,
    transaction.createdAt,
    transaction.updatedAt,
  ];
}

function buildBatchAuditEntry(
  context: TenantContext,
  batch: ImportBatch,
  action: Extract<AuditLogEntryDraft["action"], "create" | "update">,
): AuditLogEntryDraft {
  return {
    organizationId: batch.organizationId,
    financialProfileId: batch.financialProfileId,
    occurredAt: batch.updatedAt,
    actorKind: action === "create" ? "import" : "user",
    ...(action === "create" ? {} : { actorId: context.userId }),
    action,
    entityKind: "import_batch",
    entityId: batch.id,
    reason: action === "create" ? "Lote CSV criado para revisao humana." : "Lote CSV atualizado.",
    redactedChanges: {
      status: action === "create" ? "added" : "changed",
      totalRows: action === "create" ? "added" : "changed",
      validRows: action === "create" ? "added" : "changed",
      duplicateRows: action === "create" ? "added" : "changed",
      problemRows: action === "create" ? "added" : "changed",
    },
  };
}

function buildConsentAuditEntry(context: TenantContext, batch: ImportBatch): AuditLogEntryDraft {
  return {
    organizationId: batch.organizationId,
    financialProfileId: batch.financialProfileId,
    occurredAt: batch.createdAt,
    actorKind: "user",
    actorId: context.userId,
    action: "create",
    entityKind: "privacy_consent",
    entityId: batch.id,
    reason: "Usuario confirmou autorizacao, direito de uso do arquivo e ciencia da revisao humana.",
    redactedChanges: { consentAccepted: "added" },
  };
}

function buildSuggestionAuditEntry(
  context: TenantContext,
  suggestion: AiSuggestion,
  action: Extract<AuditLogEntryDraft["action"], "create" | "update" | "approve" | "reject">,
  reason: string,
  redactedChanges?: AuditLogEntryDraft["redactedChanges"],
): AuditLogEntryDraft {
  return {
    organizationId: suggestion.organizationId,
    financialProfileId: suggestion.financialProfileId,
    occurredAt: suggestion.updatedAt,
    actorKind: action === "create" ? "import" : "user",
    ...(action === "create" ? {} : { actorId: context.userId }),
    action,
    entityKind: "ai_suggestion",
    entityId: suggestion.id,
    reason,
    redactedChanges: redactedChanges ?? {
      status: action === "create" ? "added" : "changed",
      payload: action === "create" ? "added" : "changed",
      reviewedAt: action === "create" ? "added" : "changed",
    },
  };
}

function buildImportedTransactionAuditEntry(
  context: TenantContext,
  transaction: Transaction,
): AuditLogEntryDraft {
  return {
    organizationId: transaction.organizationId,
    financialProfileId: transaction.financialProfileId,
    occurredAt: transaction.createdAt,
    actorKind: "user",
    actorId: context.userId,
    action: "create",
    entityKind: "transaction",
    entityId: transaction.id,
    reason: "Lancamento criado pela aprovacao de uma linha CSV revisada.",
    redactedChanges: {
      status: "added",
      source: "added",
      amountMinor: "added",
      occurredOn: "added",
      accountId: "added",
      importBatchId: "added",
      aiSuggestionId: "added",
    },
  };
}

function buildImportedTransferReconciliationAuditEntry(
  context: TenantContext,
  transaction: Transaction,
): AuditLogEntryDraft {
  return {
    organizationId: transaction.organizationId,
    financialProfileId: transaction.financialProfileId,
    occurredAt: transaction.updatedAt,
    actorKind: "user",
    actorId: context.userId,
    action: "reconcile",
    entityKind: "transaction",
    entityId: transaction.id,
    reason: "Segunda ponta importada conciliada com transferencia existente.",
    redactedChanges: {
      status: "changed",
      reconciledAt: "added",
    },
  };
}

function buildReviewChanges(
  changes: ImportSuggestionUpdatePayload,
): AuditLogEntryDraft["redactedChanges"] {
  const result: NonNullable<AuditLogEntryDraft["redactedChanges"]> = { payload: "changed" };
  for (const key of Object.keys(changes)) result[key] = "changed";
  return result;
}

function toImportReviewSuggestion(
  suggestion: AiSuggestion,
  candidates: readonly AiSuggestion[],
  transaction: Transaction | undefined,
): ImportReviewSuggestion {
  const payload = parseTransactionExtractionPayload(suggestion.payload);
  const { payload: _discardedPayload, ...suggestionWithoutPayload } = suggestion;
  return {
    ...suggestionWithoutPayload,
    ...(payload === undefined ? {} : { payload }),
    candidates: candidates.flatMap((candidate) => {
      const deterministic = parseDeterministicReviewPayload(candidate.payload);
      if (
        deterministic === undefined ||
        (candidate.kind !== "deduplication" && candidate.kind !== "reconciliation")
      )
        return [];
      return [
        {
          id: candidate.id,
          kind: candidate.kind,
          status: candidate.status,
          targetTransactionId: deterministic.targetTransactionId,
          confidence: candidate.confidence,
          explanation: candidate.explanation,
          reasons: deterministic.reasons,
          conflicts: deterministic.conflicts,
          createdAt: candidate.createdAt,
        },
      ];
    }),
    ...(transaction === undefined ? {} : { transaction }),
  };
}

function getSourceSuggestionId(suggestion: AiSuggestion): string | undefined {
  return parseDeterministicReviewPayload(suggestion.payload)?.sourceSuggestionId;
}

function mapImportBatchRow(row: ImportBatchRow): ImportBatch {
  return {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    sourceKind: row.sourceKind.toLowerCase() as ImportBatch["sourceKind"],
    status: row.status.toLowerCase() as ImportBatch["status"],
    sourceHash: row.sourceHash,
    ...(row.contentHash === null ? {} : { contentHash: row.contentHash }),
    receivedAt: row.receivedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    totalRows: row.totalRows,
    validRows: row.validRows,
    duplicateRows: row.duplicateRows,
    problemRows: row.problemRows,
    problems: parseProblems(row.problems),
    ...(row.defaultAccountId === null ? {} : { defaultAccountId: row.defaultAccountId }),
    ...(row.originalFileName === null ? {} : { originalFileName: row.originalFileName }),
    ...(row.csvDelimiter === null ? {} : { csvDelimiter: row.csvDelimiter as CsvDelimiter }),
    ...(isRecord(row.csvMapping) ? { csvMapping: row.csvMapping as Record<string, string> } : {}),
    ...(row.completedAt === null ? {} : { completedAt: row.completedAt.toISOString() }),
  };
}

function mapAiSuggestionRow(row: AiSuggestionRow): AiSuggestion {
  const suggestion: AiSuggestion = {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    kind: row.kind.toLowerCase() as AiSuggestion["kind"],
    status: row.status.toLowerCase() as AiSuggestion["status"],
    confidence: Number(row.confidence),
    explanation: row.explanation,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (row.sourceEntityId !== null) suggestion.sourceEntityId = row.sourceEntityId;
  if (row.targetEntityId !== null) suggestion.targetEntityId = row.targetEntityId;
  const payload =
    parseTransactionExtractionPayload(row.payload) ?? parseDeterministicReviewPayload(row.payload);
  if (payload !== undefined) suggestion.payload = payload;
  if (row.provider !== null) suggestion.provider = row.provider;
  if (row.model !== null) suggestion.model = row.model;
  if (row.reviewedByUserId !== null) suggestion.reviewedByUserId = row.reviewedByUserId;
  if (row.reviewedAt !== null) suggestion.reviewedAt = row.reviewedAt.toISOString();
  return suggestion;
}

function mapTransactionRow(row: TransactionRow): Transaction {
  const transaction: Transaction = {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    kind: row.kind.toLowerCase() as Transaction["kind"],
    status: row.status.toLowerCase() as Transaction["status"],
    source: row.source.toLowerCase() as Transaction["source"],
    amountMinor: row.amountMinor,
    currency: row.currency,
    occurredOn: row.occurredOn.toISOString().slice(0, 10),
    plannedOn: row.plannedOn.toISOString().slice(0, 10),
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (row.accountId !== null) transaction.accountId = row.accountId;
  if (row.destinationAccountId !== null)
    transaction.destinationAccountId = row.destinationAccountId;
  if (row.categoryId !== null) transaction.categoryId = row.categoryId;
  if (row.cardId !== null) transaction.cardId = row.cardId;
  if (row.cardInstrumentId !== null) transaction.cardInstrumentId = row.cardInstrumentId;
  if (row.invoiceId !== null) transaction.invoiceId = row.invoiceId;
  if (row.recurrenceId !== null) transaction.recurrenceId = row.recurrenceId;
  if (row.installmentId !== null) transaction.installmentId = row.installmentId;
  if (row.importBatchId !== null) transaction.importBatchId = row.importBatchId;
  if (row.aiSuggestionId !== null) transaction.aiSuggestionId = row.aiSuggestionId;
  if (row.transferGroupId !== null) transaction.transferGroupId = row.transferGroupId;
  if (row.effectiveOn !== null)
    transaction.effectiveOn = row.effectiveOn.toISOString().slice(0, 10);
  if (row.reconciledAt !== null) transaction.reconciledAt = row.reconciledAt.toISOString();
  if (row.voidedAt !== null) transaction.voidedAt = row.voidedAt.toISOString();
  if (row.createdByUserId !== null) transaction.createdByUserId = row.createdByUserId;
  if (row.updatedByUserId !== null) transaction.updatedByUserId = row.updatedByUserId;
  return transaction;
}

function parseProblems(value: unknown): ImportProblem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    if (
      !Number.isSafeInteger(item.rowNumber) ||
      (item.severity !== "error" && item.severity !== "warning") ||
      typeof item.code !== "string" ||
      typeof item.message !== "string"
    )
      return [];
    return [
      {
        rowNumber: Number(item.rowNumber),
        severity: item.severity,
        code: item.code,
        message: item.message,
      },
    ];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
