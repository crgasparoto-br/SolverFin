import { randomUUID } from "node:crypto";

import {
  BankMessageInboxError,
  createBankMessageInboxItem,
  type AiSuggestion,
  type BankMessageInboxOrigin,
  type ImportBatch,
  type TenantContext,
  type TransactionKind,
} from "@solverfin/domain";
import {
  buildAiSuggestionPayload,
  readAiSuggestionPayload,
  type AiSuggestionPayload,
  type LegacyTransactionExtractionPayload,
  type TransactionExtractionSuggestionPayloadV2,
} from "@solverfin/domain/ai-suggestion-payloads";

import { query, withTransaction } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";

export interface BankMessageInboxCreatePayload {
  origin: BankMessageInboxOrigin;
  text: string;
  consentAccepted: boolean;
  accountId?: string;
  categoryId?: string;
}

type BankMessageInboxSuggestionPayload =
  | Extract<AiSuggestionPayload, { suggestionKind: "transaction_extraction" }>
  | LegacyTransactionExtractionPayload;

type BankMessageInboxSuggestion = Omit<AiSuggestion, "payload"> & {
  payload?: BankMessageInboxSuggestionPayload;
};

export interface BankMessageInboxItem {
  id: string;
  origin: BankMessageInboxOrigin;
  status: "pending_review" | "approved" | "edited" | "rejected" | "discarded" | "error";
  sourceHash: string;
  maskedText: string;
  receivedAt: string;
  importBatch: ImportBatch;
  suggestion?: BankMessageInboxSuggestion;
}

interface BankMessageInboxRow {
  importBatchId: string;
  organizationId: string;
  financialProfileId: string;
  sourceKind: string;
  importStatus: string;
  originalFileName: string | null;
  sourceHash: string;
  receivedAt: Date;
  completedAt: Date | null;
  importCreatedAt: Date;
  importUpdatedAt: Date;
  suggestionId: string | null;
  suggestionKind: string | null;
  suggestionStatus: string | null;
  targetEntityId: string | null;
  confidence: string | number | null;
  explanation: string | null;
  payload: unknown;
  provider: string | null;
  model: string | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  suggestionCreatedAt: Date | null;
  suggestionUpdatedAt: Date | null;
}

type StructuredBankMessageSuggestion = Omit<BankMessageInboxSuggestion, "payload"> & {
  payload: TransactionExtractionSuggestionPayloadV2;
};

export class BankMessageInboxRepositoryError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = "BankMessageInboxRepositoryError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const BANK_MESSAGE_SELECT = `
  batch."id" as "importBatchId", batch."organizationId", batch."financialProfileId", batch."sourceKind",
  batch."status" as "importStatus", batch."originalFileName", batch."sourceHash", batch."receivedAt",
  batch."completedAt", batch."createdAt" as "importCreatedAt", batch."updatedAt" as "importUpdatedAt",
  suggestion."id" as "suggestionId", suggestion."kind" as "suggestionKind", suggestion."status" as "suggestionStatus",
  suggestion."targetEntityId", suggestion."confidence", suggestion."explanation", suggestion."payload",
  suggestion."provider", suggestion."model", suggestion."reviewedByUserId", suggestion."reviewedAt",
  suggestion."createdAt" as "suggestionCreatedAt", suggestion."updatedAt" as "suggestionUpdatedAt"`;

export async function listBankMessageInboxForContext(
  context: TenantContext,
  filters: { status?: string } = {},
): Promise<BankMessageInboxItem[]> {
  const rows = await query<BankMessageInboxRow>(
    `select ${BANK_MESSAGE_SELECT}
     from "ImportBatch" batch
     left join "AiSuggestion" suggestion
       on suggestion."sourceEntityId" = batch."id"
      and suggestion."organizationId" = batch."organizationId"
      and suggestion."financialProfileId" = batch."financialProfileId"
     where batch."organizationId" = $1
       and batch."financialProfileId" = $2
       and batch."sourceKind" = 'BANK_MESSAGE'
     order by batch."receivedAt" desc`,
    [context.organizationId, context.financialProfileId],
  );

  return rows
    .map(mapRow)
    .filter(
      (item) =>
        filters.status === undefined || filters.status === "all" || item.status === filters.status,
    );
}

export async function createBankMessageInboxForContext(
  context: TenantContext,
  payload: BankMessageInboxCreatePayload,
): Promise<BankMessageInboxItem> {
  if (payload.consentAccepted !== true) {
    throw new BankMessageInboxRepositoryError(
      "BANK_MESSAGE_CONSENT_REQUIRED",
      "Confirme que a mensagem e ficticia ou autorizada antes de processar.",
    );
  }

  const now = new Date().toISOString();
  const existingSourceHashes = await listExistingBankMessageHashes(context);
  const inboxItem = createBankMessageInboxItem({
    id: randomUUID(),
    context,
    now,
    payload: { origin: payload.origin, text: payload.text },
    existingSourceHashes,
  }).item;
  const importBatch = buildImportBatch(context, inboxItem, now);
  const suggestion = buildSuggestion(context, importBatch, inboxItem.maskedText, payload, now);

  await withTransaction(async (executeQuery) => {
    await executeQuery(
      `insert into "ImportBatch"
        ("id", "organizationId", "financialProfileId", "sourceKind", "status", "originalFileName",
         "sourceHash", "receivedAt", "completedAt", "createdAt", "updatedAt")
       values ($1, $2, $3, 'BANK_MESSAGE', 'REVIEWING', $4, $5, $6, null, $7, $8)`,
      [
        importBatch.id,
        importBatch.organizationId,
        importBatch.financialProfileId,
        importBatch.originalFileName ?? null,
        importBatch.sourceHash,
        importBatch.receivedAt,
        importBatch.createdAt,
        importBatch.updatedAt,
      ],
    );

    if (suggestion !== undefined) {
      await executeQuery(
        `insert into "AiSuggestion"
          ("id", "organizationId", "financialProfileId", "kind", "status", "sourceEntityId", "targetEntityId",
           "confidence", "explanation", "payload", "provider", "model", "reviewedByUserId", "reviewedAt",
           "createdAt", "updatedAt")
         values ($1, $2, $3, 'TRANSACTION_EXTRACTION', 'PENDING_REVIEW', $4, null, $5, $6, $7::jsonb,
                 $8, $9, null, null, $10, $11)`,
        [
          suggestion.id,
          suggestion.organizationId,
          suggestion.financialProfileId,
          suggestion.sourceEntityId ?? null,
          suggestion.confidence,
          suggestion.explanation,
          JSON.stringify(suggestion.payload),
          suggestion.provider ?? null,
          suggestion.model ?? null,
          suggestion.createdAt,
          suggestion.updatedAt,
        ],
      );
    }

    await insertAuditLogEntry(executeQuery, {
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      occurredAt: now,
      actorKind: "user",
      actorId: context.userId,
      action: "create",
      entityKind: "import_batch",
      entityId: importBatch.id,
      reason: "Mensagem bancaria recebida com consentimento explicito.",
      redactedChanges: { sourceHash: "added", status: "added" },
    });

    if (suggestion !== undefined) {
      await insertAuditLogEntry(executeQuery, {
        organizationId: context.organizationId,
        financialProfileId: context.financialProfileId,
        occurredAt: now,
        actorKind: "system",
        action: "create",
        entityKind: "ai_suggestion",
        entityId: suggestion.id,
        reason: "Sugestao revisavel criada por regra deterministica de inbox.",
        redactedChanges: { status: "added", payload: "added" },
      });
    }
  });

  return {
    id: importBatch.id,
    origin: payload.origin,
    status: "pending_review",
    sourceHash: importBatch.sourceHash,
    maskedText: inboxItem.maskedText,
    receivedAt: importBatch.receivedAt,
    importBatch,
    ...(suggestion === undefined ? {} : { suggestion }),
  };
}

export async function discardBankMessageInboxForContext(
  context: TenantContext,
  importBatchId: string,
): Promise<BankMessageInboxItem> {
  const current = await findBankMessageInboxItem(context, importBatchId);
  const now = new Date().toISOString();

  await withTransaction(async (executeQuery) => {
    await executeQuery(
      `update "ImportBatch" set "status" = 'DISCARDED', "completedAt" = $4, "updatedAt" = $4
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
      [importBatchId, context.organizationId, context.financialProfileId, now],
    );

    if (current.suggestion?.status === "pending_review") {
      await executeQuery(
        `update "AiSuggestion" set "status" = 'EXPIRED', "updatedAt" = $4
         where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
        [current.suggestion.id, context.organizationId, context.financialProfileId, now],
      );
    }

    await insertAuditLogEntry(executeQuery, {
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      occurredAt: now,
      actorKind: "user",
      actorId: context.userId,
      action: "soft_delete",
      entityKind: "import_batch",
      entityId: importBatchId,
      reason: "Mensagem bancaria descartada pelo usuario.",
      redactedChanges: { status: "changed" },
    });
  });

  return findBankMessageInboxItem(context, importBatchId);
}

async function findBankMessageInboxItem(
  context: TenantContext,
  importBatchId: string,
): Promise<BankMessageInboxItem> {
  const rows = await query<BankMessageInboxRow>(
    `select ${BANK_MESSAGE_SELECT}
     from "ImportBatch" batch
     left join "AiSuggestion" suggestion
       on suggestion."sourceEntityId" = batch."id"
      and suggestion."organizationId" = batch."organizationId"
      and suggestion."financialProfileId" = batch."financialProfileId"
     where batch."id" = $1 and batch."organizationId" = $2 and batch."financialProfileId" = $3
       and batch."sourceKind" = 'BANK_MESSAGE'`,
    [importBatchId, context.organizationId, context.financialProfileId],
  );

  if (!rows[0]) {
    throw new BankMessageInboxRepositoryError(
      "BANK_MESSAGE_NOT_FOUND",
      "Mensagem nao encontrada na inbox deste perfil.",
      404,
    );
  }

  return mapRow(rows[0]);
}

async function listExistingBankMessageHashes(context: TenantContext): Promise<string[]> {
  const rows = await query<{ sourceHash: string }>(
    `select "sourceHash" from "ImportBatch"
     where "organizationId" = $1 and "financialProfileId" = $2 and "sourceKind" = 'BANK_MESSAGE'`,
    [context.organizationId, context.financialProfileId],
  );

  return rows.map((row) => row.sourceHash);
}

function buildImportBatch(
  context: TenantContext,
  item: {
    id: string;
    sourceHash: string;
    receivedAt: string;
    origin: BankMessageInboxOrigin;
  },
  now: string,
): ImportBatch {
  return {
    id: item.id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    sourceKind: "bank_message",
    status: "reviewing",
    originalFileName: `bank-message-${item.origin}`,
    sourceHash: item.sourceHash,
    receivedAt: item.receivedAt,
    createdAt: now,
    updatedAt: now,
    createdByUserId: context.userId,
    updatedByUserId: context.userId,
  };
}

function buildSuggestion(
  context: TenantContext,
  importBatch: ImportBatch,
  maskedText: string,
  input: BankMessageInboxCreatePayload,
  now: string,
): StructuredBankMessageSuggestion | undefined {
  const parsed = parseBankMessage(maskedText);
  if (parsed.amountMinor === undefined) return undefined;

  const id = randomUUID();
  const confidence = parsed.kind === "expense" ? 0.82 : 0.78;
  const payload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "transaction_extraction",
      payloadVersion: 2,
      origin: {
        kind: "import",
        sourceKind: "bank_message",
        sourceEntityId: importBatch.id,
      },
      target: { entityKind: "transaction" },
      confidence,
      reasons: ["Campos extraidos de mensagem mascarada por regra deterministica."],
      audit: { createdAt: now, sourceFingerprint: importBatch.sourceHash },
      sourceRowNumber: 1,
      sourceHash: importBatch.sourceHash,
      occurredOn: parsed.occurredOn,
      kind: parsed.kind,
      direction: parsed.kind === "income" ? "inflow" : "outflow",
      amountMinor: parsed.amountMinor,
      currency: "BRL",
      description: parsed.description,
      ...(input.accountId === undefined ? {} : { accountId: input.accountId }),
      ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
    },
  }) as TransactionExtractionSuggestionPayloadV2;

  return {
    id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    kind: "transaction_extraction",
    status: "pending_review",
    sourceEntityId: importBatch.id,
    confidence,
    explanation:
      "Mensagem mascarada analisada. Revise os campos estruturados antes de criar o lancamento.",
    payload,
    provider: "solverfin-rule-bank-message-inbox",
    model: "deterministic-v2",
    createdAt: now,
    updatedAt: now,
    createdByUserId: context.userId,
    updatedByUserId: context.userId,
  };
}

function parseBankMessage(maskedText: string): {
  amountMinor?: number;
  occurredOn: string;
  kind: TransactionKind;
  description: string;
} {
  const amountMinor = parseAmountMinor(maskedText);
  return {
    ...(amountMinor === undefined ? {} : { amountMinor }),
    occurredOn: parseDate(maskedText) ?? new Date().toISOString().slice(0, 10),
    kind: parseTransactionKind(maskedText),
    description: normalizeDescription(maskedText),
  };
}

function parseAmountMinor(text: string): number | undefined {
  const match = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})/.exec(text);
  const raw = match?.[1];
  if (raw === undefined) return undefined;

  const value = Number.parseFloat(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : undefined;
}

function parseDate(text: string): string | undefined {
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text)?.[1];
  const br = /\b(\d{2})\/(\d{2})\/(\d{4})\b/.exec(text);
  const candidate = iso ?? (br === null ? undefined : `${br[3]}-${br[2]}-${br[1]}`);
  if (candidate === undefined) return undefined;

  const parsed = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== candidate
    ? undefined
    : candidate;
}

function parseTransactionKind(text: string): TransactionKind {
  const normalized = text.toLocaleLowerCase("pt-BR");
  return /receb|credito|crédito|deposito|depósito/.test(normalized) ? "income" : "expense";
}

function normalizeDescription(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 120) || "Mensagem bancaria mascarada";
}

function mapRow(row: BankMessageInboxRow): BankMessageInboxItem {
  const importBatch: ImportBatch = {
    id: row.importBatchId,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    sourceKind: "bank_message",
    status: row.importStatus.toLowerCase() as ImportBatch["status"],
    sourceHash: row.sourceHash,
    receivedAt: row.receivedAt.toISOString(),
    createdAt: row.importCreatedAt.toISOString(),
    updatedAt: row.importUpdatedAt.toISOString(),
  };
  if (row.originalFileName !== null) {
    importBatch.originalFileName = row.originalFileName;
  }
  if (row.completedAt !== null) {
    importBatch.completedAt = row.completedAt.toISOString();
  }

  const suggestion = row.suggestionId === null ? undefined : mapSuggestion(row);
  const origin = row.originalFileName?.endsWith("shared") === true ? "shared" : "pasted";

  return {
    id: row.importBatchId,
    origin,
    status: resolveStatus(row.importStatus, suggestion?.status),
    sourceHash: row.sourceHash,
    maskedText: suggestion?.explanation ?? "Mensagem bancaria mascarada",
    receivedAt: row.receivedAt.toISOString(),
    importBatch,
    ...(suggestion !== undefined ? { suggestion } : {}),
  };
}

function mapSuggestion(row: BankMessageInboxRow): BankMessageInboxSuggestion | undefined {
  if (row.suggestionId === null || row.suggestionKind === null || row.suggestionStatus === null) {
    return undefined;
  }

  const suggestion: BankMessageInboxSuggestion = {
    id: row.suggestionId,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    kind: row.suggestionKind.toLowerCase() as AiSuggestion["kind"],
    status: row.suggestionStatus.toLowerCase() as AiSuggestion["status"],
    confidence: Number(row.confidence ?? 0),
    explanation: row.explanation ?? "Sugestao revisavel criada a partir da inbox.",
    createdAt: row.suggestionCreatedAt?.toISOString() ?? row.importCreatedAt.toISOString(),
    updatedAt: row.suggestionUpdatedAt?.toISOString() ?? row.importUpdatedAt.toISOString(),
  };

  if (row.targetEntityId !== null) suggestion.targetEntityId = row.targetEntityId;
  const payload = readAiSuggestionPayload(row.payload, "transaction_extraction");
  if (
    payload.state === "current" &&
    payload.payload.suggestionKind === "transaction_extraction"
  ) {
    suggestion.payload = payload.payload;
  } else if (payload.state === "legacy" && "sourceRowNumber" in payload.payload) {
    suggestion.payload = payload.payload;
  }
  if (row.provider !== null) suggestion.provider = row.provider;
  if (row.model !== null) suggestion.model = row.model;
  if (row.reviewedByUserId !== null) {
    suggestion.reviewedByUserId = row.reviewedByUserId;
  }
  if (row.reviewedAt !== null) {
    suggestion.reviewedAt = row.reviewedAt.toISOString();
  }
  suggestion.sourceEntityId = row.importBatchId;

  return suggestion;
}

function resolveStatus(
  importStatus: string,
  suggestionStatus: AiSuggestion["status"] | undefined,
): BankMessageInboxItem["status"] {
  if (importStatus === "DISCARDED") return "discarded";
  if (importStatus === "FAILED") return "error";
  if (suggestionStatus === "approved") return "approved";
  if (suggestionStatus === "edited") return "edited";
  if (suggestionStatus === "rejected" || suggestionStatus === "expired") {
    return "rejected";
  }
  return "pending_review";
}

export function mapBankMessageInboxError(error: unknown): unknown {
  if (error instanceof BankMessageInboxError) {
    return {
      code: error.code,
      statusCode: error.statusCode,
      message: error.message,
    };
  }
  if (error instanceof BankMessageInboxRepositoryError) {
    return {
      code: error.code,
      statusCode: error.statusCode,
      message: error.message,
    };
  }
  return error;
}
