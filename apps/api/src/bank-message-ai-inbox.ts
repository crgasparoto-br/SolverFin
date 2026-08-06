import { randomUUID } from "node:crypto";

import {
  createAiProviderFromEnvironment,
  defaultAiUsagePolicy,
  maskSensitiveText,
  parseBankMessage,
  type AiConsentState,
  type AiProviderSelection,
  type AiUsagePolicy,
  type BankMessageParserResult,
  type SafeAiLogger,
} from "@solverfin/ai";
import {
  createBankMessageInboxItem,
  type TenantContext,
} from "@solverfin/domain";
import {
  buildAiSuggestionPayload,
  type TransactionExtractionSuggestionPayloadV2,
} from "@solverfin/domain/ai-suggestion-payloads";

import { query, withTransaction, type QueryExecutor } from "./db.js";
import { insertAuditLogEntry } from "./repositories/audit.js";
import {
  BankMessageInboxRepositoryError,
  listBankMessageInboxForContext,
  type BankMessageInboxCreatePayload,
  type BankMessageInboxItem,
} from "./repositories/bank-message-inbox.js";

export type BankMessageExtractionSource = "deterministic" | "ai" | "none";
export type BankMessageExtractionState =
  | "ready_for_review"
  | "low_confidence"
  | "incomplete"
  | "temporarily_unavailable";

export interface BankMessageExtractionDiagnostic {
  code: string;
  message: string;
  source: BankMessageExtractionSource;
  state: BankMessageExtractionState;
  retryable: boolean;
  reviewReasons: readonly string[];
}

export interface BankMessageInboxViewItem extends BankMessageInboxItem {
  extractionSource: BankMessageExtractionSource;
  extractionState: BankMessageExtractionState;
  retryable: boolean;
  reviewReasons: readonly string[];
}

export interface BankMessageAiRuntime {
  selectProvider: () => AiProviderSelection;
  resolveConsent: (
    context: TenantContext,
  ) => AiConsentState | Promise<AiConsentState>;
  logger?: SafeAiLogger;
  policy?: AiUsagePolicy;
  now?: () => string;
  correlationId?: string;
}

interface ProductExtractionResult {
  parserResult: BankMessageParserResult;
  diagnostic: BankMessageExtractionDiagnostic;
}

interface PersistableSuggestion {
  id: string;
  confidence: number;
  explanation: string;
  payload: TransactionExtractionSuggestionPayloadV2;
  provider: string;
  model: string;
}

interface ImportBatchProblemRow {
  id: string;
  problems: unknown;
}

const BANK_MESSAGE_PURPOSE = "bank_message_transaction_extraction";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function createBankMessageInboxWithAiForContext(
  context: TenantContext,
  payload: BankMessageInboxCreatePayload,
  runtime: Partial<BankMessageAiRuntime> = {},
): Promise<BankMessageInboxViewItem> {
  if (payload.consentAccepted !== true) {
    throw new BankMessageInboxRepositoryError(
      "BANK_MESSAGE_CONSENT_REQUIRED",
      "Confirme que a mensagem e ficticia ou autorizada antes de processar.",
    );
  }

  await validateOptionalSelections(context, payload);

  const now = runtime.now?.() ?? new Date().toISOString();
  const transient = createBankMessageInboxItem({
    id: randomUUID(),
    context,
    now,
    payload: { origin: payload.origin, text: payload.text },
  }).item;

  const inserted = await query<{ id: string }>(
    `insert into "ImportBatch"
      ("id", "organizationId", "financialProfileId", "sourceKind", "status", "originalFileName",
       "sourceHash", "problems", "receivedAt", "completedAt", "createdAt", "updatedAt")
     values ($1, $2, $3, 'BANK_MESSAGE', 'REVIEWING', $4, $5, '[]'::jsonb, $6, null, $7, $7)
     on conflict ("organizationId", "financialProfileId", "sourceHash") do nothing
     returning "id"`,
    [
      transient.id,
      context.organizationId,
      context.financialProfileId,
      `bank-message-${payload.origin}`,
      transient.sourceHash,
      transient.receivedAt,
      now,
    ],
  );

  let importBatchId = inserted[0]?.id;

  if (importBatchId === undefined) {
    const existing = await findInboxItemBySourceHash(
      context,
      transient.sourceHash,
    );

    if (existing.importBatch.status !== "failed") {
      return enrichInboxItem(
        existing,
        await readDiagnostic(context, existing.id),
      );
    }

    const claimed = await query<{ id: string }>(
      `update "ImportBatch"
       set "status" = 'REVIEWING', "completedAt" = null, "problems" = '[]'::jsonb, "updatedAt" = $4
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
         and "status" = 'FAILED'
       returning "id"`,
      [existing.id, context.organizationId, context.financialProfileId, now],
    );

    importBatchId = claimed[0]?.id;
    if (importBatchId === undefined) {
      const concurrent = await findInboxItemBySourceHash(
        context,
        transient.sourceHash,
      );
      return enrichInboxItem(
        concurrent,
        await readDiagnostic(context, concurrent.id),
      );
    }
  }

  const extraction = await extractBankMessageForProduct(
    {
      text: transient.rawText,
      context,
      consentAccepted: payload.consentAccepted,
    },
    runtime,
  );
  const suggestion = buildPersistableSuggestion({
    importBatchId,
    sourceHash: transient.sourceHash,
    maskedText: transient.maskedText,
    payload,
    context,
    now,
    parserResult: extraction.parserResult,
  });

  await persistExtractionOutcome({
    context,
    importBatchId,
    now,
    diagnostic: extraction.diagnostic,
    suggestion,
  });

  const stored = await findInboxItemBySourceHash(context, transient.sourceHash);
  return enrichInboxItem(stored, extraction.diagnostic);
}

export async function listBankMessageInboxWithAiForContext(
  context: TenantContext,
  filters: { status?: string } = {},
): Promise<BankMessageInboxViewItem[]> {
  const items = await listBankMessageInboxForContext(context, filters);
  const diagnosticRows = await query<ImportBatchProblemRow>(
    `select "id", "problems" from "ImportBatch"
     where "organizationId" = $1 and "financialProfileId" = $2 and "sourceKind" = 'BANK_MESSAGE'`,
    [context.organizationId, context.financialProfileId],
  );
  const diagnostics = new Map(
    diagnosticRows.map(
      (row) => [row.id, parseDiagnostic(row.problems)] as const,
    ),
  );

  return items.map((item) => enrichInboxItem(item, diagnostics.get(item.id)));
}

export async function extractBankMessageForProduct(
  input: {
    text: string;
    context: TenantContext;
    consentAccepted: boolean;
  },
  runtime: Partial<BankMessageAiRuntime> = {},
): Promise<ProductExtractionResult> {
  const deterministic = await parseBankMessage({ text: input.text });

  if (deterministic.sourceKind === "rule") {
    return {
      parserResult: deterministic,
      diagnostic: buildDiagnostic(deterministic),
    };
  }

  let selection: AiProviderSelection;
  try {
    selection =
      runtime.selectProvider?.() ??
      createAiProviderFromEnvironment(process.env);
  } catch {
    return {
      parserResult: deterministic,
      diagnostic: {
        code: "BANK_MESSAGE_AI_NOT_CONFIGURED",
        message:
          "A extração por IA não está disponível. Revise a mensagem manualmente.",
        source: "none",
        state: "incomplete",
        retryable: false,
        reviewReasons: ["Configuração segura do provider indisponível."],
      },
    };
  }

  if (selection.status === "disabled" || selection.provider === undefined) {
    return {
      parserResult: deterministic,
      diagnostic: {
        code: "BANK_MESSAGE_AI_NOT_CONFIGURED",
        message:
          "Nenhuma regra reconheceu a mensagem. Revise os dados manualmente.",
        source: "none",
        state: "incomplete",
        retryable: false,
        reviewReasons: deterministic.reviewReasons,
      },
    };
  }

  const policy: AiUsagePolicy = runtime.policy ?? {
    ...defaultAiUsagePolicy,
    consent: input.consentAccepted ? "granted" : "revoked",
    purpose: BANK_MESSAGE_PURPOSE,
    maxPromptChars: 4_000,
    maxRetries: 1,
    timeoutMs: 8_000,
    allowRawFinancialText: false,
    allowedFieldNames: ["message"],
  };
  const resolveConsent =
    runtime.resolveConsent ??
    (() =>
      input.consentAccepted ? ("granted" as const) : ("revoked" as const));
  const parserInput: Parameters<typeof parseBankMessage>[0] = {
    text: input.text,
    provider: selection.provider,
    context: {
      organizationId: input.context.organizationId,
      financialProfileId: input.context.financialProfileId,
      userId: input.context.userId,
      ...(runtime.correlationId === undefined
        ? {}
        : { correlationId: runtime.correlationId }),
    },
    policy,
    resolveConsent: () => resolveConsent(input.context),
  };

  if (runtime.logger !== undefined) {
    parserInput.logger = runtime.logger;
  }

  const assisted = await parseBankMessage(parserInput);
  return {
    parserResult: assisted,
    diagnostic: buildDiagnostic(assisted),
  };
}

function buildDiagnostic(
  result: BankMessageParserResult,
): BankMessageExtractionDiagnostic {
  if (result.suggestion !== undefined) {
    const lowConfidence = result.status === "needs_review";
    return {
      code: result.code ?? "BANK_MESSAGE_EXTRACTION_READY",
      message: lowConfidence
        ? "Baixa confiança: revise todos os campos antes de aprovar."
        : result.sourceKind === "ai"
          ? "Extração assistida por IA pronta para revisão."
          : "Extração determinística pronta para revisão.",
      source: result.sourceKind === "ai" ? "ai" : "deterministic",
      state: lowConfidence ? "low_confidence" : "ready_for_review",
      retryable: false,
      reviewReasons: result.reviewReasons,
    };
  }

  const temporary = isTemporaryProviderFailure(result);
  return {
    code: result.code ?? "BANK_MESSAGE_EXTRACTION_INCOMPLETE",
    message: temporary
      ? "A IA está temporariamente indisponível. Envie novamente a mesma mensagem para tentar de novo."
      : "Não foi possível completar a extração. Revise os dados manualmente.",
    source:
      result.sourceKind === "ai"
        ? "ai"
        : result.sourceKind === "rule"
          ? "deterministic"
          : "none",
    state: temporary ? "temporarily_unavailable" : "incomplete",
    retryable: temporary,
    reviewReasons: result.reviewReasons,
  };
}

function buildPersistableSuggestion(input: {
  importBatchId: string;
  sourceHash: string;
  maskedText: string;
  payload: BankMessageInboxCreatePayload;
  context: TenantContext;
  now: string;
  parserResult: BankMessageParserResult;
}): PersistableSuggestion | undefined {
  const parsed = input.parserResult.suggestion;
  if (
    parsed === undefined ||
    parsed.type === "unknown" ||
    parsed.type === "transfer"
  ) {
    return undefined;
  }

  const safeHints = [
    parsed.accountHint
      ? `Pista de conta: ${safeReason(parsed.accountHint)}`
      : undefined,
    parsed.cardHint
      ? `Pista de cartão: ${safeReason(parsed.cardHint)}`
      : undefined,
    parsed.categorySuggestion
      ? `Categoria sugerida: ${safeReason(parsed.categorySuggestion)}`
      : undefined,
  ].filter((value): value is string => value !== undefined);
  const reasons = [...parsed.reasons.map(safeReason), ...safeHints];
  const origin =
    parsed.sourceKind === "ai"
      ? {
          kind: "provider" as const,
          provider: parsed.providerId ?? "configured-provider",
          ...(parsed.model === undefined ? {} : { model: parsed.model }),
        }
      : {
          kind: "rule" as const,
          ...(parsed.ruleId === undefined ? {} : { ruleId: parsed.ruleId }),
        };
  const payload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "transaction_extraction",
      payloadVersion: 2,
      origin,
      target: { entityKind: "transaction" },
      confidence: parsed.confidence,
      reasons,
      audit: { createdAt: input.now, sourceFingerprint: input.sourceHash },
      sourceRowNumber: 1,
      sourceHash: input.sourceHash,
      occurredOn: parsed.occurredOn,
      kind: parsed.type,
      direction: parsed.type === "income" ? "inflow" : "outflow",
      amountMinor: parsed.amountMinor,
      currency: parsed.currency,
      description: safeDescription(parsed.merchant ?? input.maskedText),
      ...(input.payload.accountId === undefined
        ? {}
        : { accountId: input.payload.accountId }),
      ...(input.payload.categoryId === undefined
        ? {}
        : { categoryId: input.payload.categoryId }),
    },
  }) as TransactionExtractionSuggestionPayloadV2;
  const sourceLabel =
    parsed.sourceKind === "ai" ? "assistida por IA" : "determinística";

  return {
    id: randomUUID(),
    confidence: parsed.confidence,
    explanation:
      input.parserResult.status === "needs_review"
        ? `Extração ${sourceLabel} com baixa confiança. Revise todos os campos antes de aprovar.`
        : `Extração ${sourceLabel}. Revise os campos estruturados antes de aprovar.`,
    payload,
    provider:
      parsed.sourceKind === "ai"
        ? (parsed.providerId ?? "configured-provider")
        : "solverfin-rule-bank-message-inbox",
    model:
      parsed.sourceKind === "ai"
        ? (parsed.model ?? "configured-model")
        : (parsed.ruleId ?? "deterministic-v1"),
  };
}

async function persistExtractionOutcome(input: {
  context: TenantContext;
  importBatchId: string;
  now: string;
  diagnostic: BankMessageExtractionDiagnostic;
  suggestion: PersistableSuggestion | undefined;
}): Promise<void> {
  await withTransaction(async (executeQuery) => {
    if (input.suggestion !== undefined) {
      await executeQuery(
        `insert into "AiSuggestion"
          ("id", "organizationId", "financialProfileId", "kind", "status", "sourceEntityId", "targetEntityId",
           "confidence", "explanation", "payload", "payloadFingerprint", "provider", "model",
           "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt")
         values ($1, $2, $3, 'TRANSACTION_EXTRACTION', 'PENDING_REVIEW', $4, null, $5, $6, $7::jsonb,
                 $8, $9, $10, null, null, $11, $11)
         on conflict do nothing`,
        [
          input.suggestion.id,
          input.context.organizationId,
          input.context.financialProfileId,
          input.importBatchId,
          input.suggestion.confidence,
          input.suggestion.explanation,
          JSON.stringify(input.suggestion.payload),
          input.suggestion.payload.fingerprint,
          input.suggestion.provider,
          input.suggestion.model,
          input.now,
        ],
      );
    }

    const finalStatus = input.diagnostic.retryable ? "FAILED" : "REVIEWING";
    await executeQuery(
      `update "ImportBatch"
       set "status" = $4::"ImportStatus", "problems" = $5::jsonb,
           "completedAt" = case
             when $4::"ImportStatus" = 'FAILED' then $6::timestamptz
             else null::timestamptz
           end,
           "updatedAt" = $6::timestamptz
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
      [
        input.importBatchId,
        input.context.organizationId,
        input.context.financialProfileId,
        finalStatus,
        JSON.stringify([input.diagnostic]),
        input.now,
      ],
    );

    await recordSafeAudit(executeQuery, input);
  });
}

async function recordSafeAudit(
  executeQuery: QueryExecutor,
  input: {
    context: TenantContext;
    importBatchId: string;
    now: string;
    diagnostic: BankMessageExtractionDiagnostic;
    suggestion: PersistableSuggestion | undefined;
  },
): Promise<void> {
  await insertAuditLogEntry(executeQuery, {
    organizationId: input.context.organizationId,
    financialProfileId: input.context.financialProfileId,
    occurredAt: input.now,
    actorKind: "system",
    action: "update",
    entityKind: "import_batch",
    entityId: input.importBatchId,
    reason: input.diagnostic.message,
    redactedChanges: { status: "changed", problems: "changed" },
  });

  if (input.suggestion !== undefined) {
    await insertAuditLogEntry(executeQuery, {
      organizationId: input.context.organizationId,
      financialProfileId: input.context.financialProfileId,
      occurredAt: input.now,
      actorKind: "system",
      action: "create",
      entityKind: "ai_suggestion",
      entityId: input.suggestion.id,
      reason: "Sugestão estruturada criada para revisão.",
      redactedChanges: { status: "added", payload: "added" },
    });
  }
}

async function validateOptionalSelections(
  context: TenantContext,
  payload: Pick<BankMessageInboxCreatePayload, "accountId" | "categoryId">,
): Promise<void> {
  if (payload.accountId !== undefined && payload.accountId !== "") {
    await assertScopedActiveEntity(
      context,
      "Account",
      payload.accountId,
      "BANK_MESSAGE_ACCOUNT_INVALID",
    );
  }
  if (payload.categoryId !== undefined && payload.categoryId !== "") {
    await assertScopedActiveEntity(
      context,
      "Category",
      payload.categoryId,
      "BANK_MESSAGE_CATEGORY_INVALID",
    );
  }
}

async function assertScopedActiveEntity(
  context: TenantContext,
  table: "Account" | "Category",
  id: string,
  code: string,
): Promise<void> {
  if (!UUID_PATTERN.test(id)) {
    throw new BankMessageInboxRepositoryError(
      code,
      "Seleção inválida para este perfil.",
      400,
    );
  }

  const rows = await query<{ id: string }>(
    `select "id" from "${table}"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3 and "status" = 'ACTIVE'`,
    [id, context.organizationId, context.financialProfileId],
  );
  if (rows.length === 0) {
    throw new BankMessageInboxRepositoryError(
      code,
      "Seleção inválida para este perfil.",
      404,
    );
  }
}

async function findInboxItemBySourceHash(
  context: TenantContext,
  sourceHash: string,
): Promise<BankMessageInboxItem> {
  const items = await listBankMessageInboxForContext(context, {
    status: "all",
  });
  const item = items.find((candidate) => candidate.sourceHash === sourceHash);
  if (item === undefined) {
    throw new BankMessageInboxRepositoryError(
      "BANK_MESSAGE_NOT_FOUND",
      "Mensagem não encontrada na inbox deste perfil.",
      404,
    );
  }
  return item;
}

async function readDiagnostic(
  context: TenantContext,
  importBatchId: string,
): Promise<BankMessageExtractionDiagnostic | undefined> {
  const rows = await query<ImportBatchProblemRow>(
    `select "id", "problems" from "ImportBatch"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [importBatchId, context.organizationId, context.financialProfileId],
  );
  return parseDiagnostic(rows[0]?.problems);
}

function parseDiagnostic(
  value: unknown,
): BankMessageExtractionDiagnostic | undefined {
  const candidate = Array.isArray(value) ? value[0] : undefined;
  if (typeof candidate !== "object" || candidate === null) return undefined;
  const record = candidate as Record<string, unknown>;
  if (
    typeof record.code !== "string" ||
    typeof record.message !== "string" ||
    !isExtractionSource(record.source) ||
    !isExtractionState(record.state) ||
    typeof record.retryable !== "boolean"
  ) {
    return undefined;
  }
  return {
    code: record.code,
    message: record.message,
    source: record.source,
    state: record.state,
    retryable: record.retryable,
    reviewReasons: Array.isArray(record.reviewReasons)
      ? record.reviewReasons.filter(
          (reason): reason is string => typeof reason === "string",
        )
      : [],
  };
}

function enrichInboxItem(
  item: BankMessageInboxItem,
  diagnostic: BankMessageExtractionDiagnostic | undefined,
): BankMessageInboxViewItem {
  const resolved = diagnostic ?? inferDiagnosticFromSuggestion(item);
  return {
    ...item,
    maskedText: resolved.message,
    extractionSource: resolved.source,
    extractionState: resolved.state,
    retryable: resolved.retryable,
    reviewReasons: resolved.reviewReasons,
  };
}

function inferDiagnosticFromSuggestion(
  item: BankMessageInboxItem,
): BankMessageExtractionDiagnostic {
  const provider = item.suggestion?.provider ?? "";
  const source: BankMessageExtractionSource =
    provider.startsWith("solverfin-rule-")
      ? "deterministic"
      : item.suggestion
        ? "ai"
        : "none";
  return {
    code: "BANK_MESSAGE_EXTRACTION_STATUS",
    message: item.suggestion?.explanation ?? "Mensagem recebida para revisão.",
    source,
    state:
      item.suggestion && item.suggestion.confidence < 0.7
        ? "low_confidence"
        : "ready_for_review",
    retryable: item.status === "error",
    reviewReasons: [],
  };
}

function isTemporaryProviderFailure(result: BankMessageParserResult): boolean {
  if (result.code !== "BANK_MESSAGE_AI_FAILED") return false;
  const text = result.reviewReasons.join(" ");
  return /AI_PROVIDER_(?:TIMEOUT|RATE_LIMITED|UNAVAILABLE)/.test(text);
}

function safeReason(value: string): string {
  return maskSensitiveText(value).replace(/\s+/g, " ").trim().slice(0, 160);
}

function safeDescription(value: string): string {
  return (
    maskSensitiveText(value).replace(/\s+/g, " ").trim().slice(0, 120) ||
    "Mensagem bancária mascarada"
  );
}

function isExtractionSource(
  value: unknown,
): value is BankMessageExtractionSource {
  return value === "deterministic" || value === "ai" || value === "none";
}

function isExtractionState(
  value: unknown,
): value is BankMessageExtractionState {
  return (
    value === "ready_for_review" ||
    value === "low_confidence" ||
    value === "incomplete" ||
    value === "temporarily_unavailable"
  );
}
