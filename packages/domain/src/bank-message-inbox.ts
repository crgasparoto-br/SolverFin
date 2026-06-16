import type {
  AiSuggestion,
  AuditLogEntryDraft,
  EntityId,
  ISODateTime,
  TenantScoped,
  Traceable,
} from "./index.js";
import type { TenantContext } from "./tenant.js";
import {
  applyTenantScope,
  getTenantScopedResource,
  listTenantScopedResources,
  updateTenantScopedResource,
} from "./tenant-authorization.js";
import { buildStableImportHash } from "./imports.js";

export type BankMessageInboxOrigin = "pasted" | "shared";
export type BankMessageInboxStatus = "pending" | "processed" | "error" | "discarded";

export interface BankMessageInboxItem extends Traceable, TenantScoped {
  origin: BankMessageInboxOrigin;
  status: BankMessageInboxStatus;
  rawText: string;
  maskedText: string;
  sourceHash: string;
  receivedAt: ISODateTime;
  linkedSuggestionId?: EntityId;
  processedAt?: ISODateTime;
  errorCode?: string;
  errorMessage?: string;
  discardedAt?: ISODateTime;
}

export type BankMessageInboxErrorCode =
  | "BANK_MESSAGE_ORIGIN_INVALID"
  | "BANK_MESSAGE_TEXT_EMPTY"
  | "BANK_MESSAGE_TEXT_TOO_LARGE"
  | "BANK_MESSAGE_DUPLICATE"
  | "BANK_MESSAGE_STATUS_INVALID"
  | "BANK_MESSAGE_SUGGESTION_INVALID";

export class BankMessageInboxError extends Error {
  readonly code: BankMessageInboxErrorCode;
  readonly statusCode = 400;

  constructor(code: BankMessageInboxErrorCode, message: string) {
    super(message);
    this.name = "BankMessageInboxError";
    this.code = code;
  }
}

export interface CreateBankMessageInboxItemInput {
  id: EntityId;
  context: TenantContext;
  now: ISODateTime;
  payload: CreateBankMessageInboxItemPayload;
  existingSourceHashes?: readonly string[];
  maxTextLength?: number;
}

export interface CreateBankMessageInboxItemPayload {
  origin: BankMessageInboxOrigin;
  text: string;
  organizationId?: EntityId;
  financialProfileId?: EntityId;
}

export interface BankMessageInboxMutationResult {
  item: BankMessageInboxItem;
  auditEntry: AuditLogEntryDraft;
}

export interface ListBankMessageInboxFilters {
  status?: BankMessageInboxStatus | "all";
  origin?: BankMessageInboxOrigin;
  receivedFrom?: ISODateTime;
  receivedTo?: ISODateTime;
}

export interface ProcessBankMessageInboxItemInput {
  context: TenantContext;
  item: BankMessageInboxItem | undefined;
  now: ISODateTime;
  suggestion?: AiSuggestion;
  suggestionId?: EntityId;
}

export interface MarkBankMessageInboxItemErrorInput {
  context: TenantContext;
  item: BankMessageInboxItem | undefined;
  now: ISODateTime;
  errorCode: string;
  errorMessage: string;
}

export interface DiscardBankMessageInboxItemInput {
  context: TenantContext;
  item: BankMessageInboxItem | undefined;
  now: ISODateTime;
  reason?: string;
}

const allowedOrigins: readonly BankMessageInboxOrigin[] = ["pasted", "shared"];
const allowedStatuses: readonly BankMessageInboxStatus[] = [
  "pending",
  "processed",
  "error",
  "discarded",
];
const defaultMaxTextLength = 4_000;

export function createBankMessageInboxItem(
  input: CreateBankMessageInboxItemInput,
): BankMessageInboxMutationResult {
  const payload = applyTenantScope(input.context, input.payload);
  const origin = validateOrigin(payload.origin);
  const rawText = normalizeRawText(payload.text, input.maxTextLength ?? defaultMaxTextLength);
  const sourceHash = buildBankMessageSourceHash(input.context, rawText);

  if ((input.existingSourceHashes ?? []).includes(sourceHash)) {
    throw new BankMessageInboxError(
      "BANK_MESSAGE_DUPLICATE",
      "Esta mensagem ja foi recebida e deve ser revisada na inbox existente.",
    );
  }

  const item: BankMessageInboxItem = {
    id: input.id,
    organizationId: payload.organizationId,
    financialProfileId: payload.financialProfileId,
    origin,
    status: "pending",
    rawText,
    maskedText: maskBankMessageText(rawText),
    sourceHash,
    receivedAt: input.now,
    createdAt: input.now,
    updatedAt: input.now,
    createdByUserId: input.context.userId,
    updatedByUserId: input.context.userId,
  };

  return {
    item,
    auditEntry: buildBankMessageInboxAuditEntry("create", input.context.userId, input.now, item),
  };
}

export function listBankMessageInboxItems(
  context: TenantContext,
  items: readonly BankMessageInboxItem[],
  filters: ListBankMessageInboxFilters = {},
): BankMessageInboxItem[] {
  return listTenantScopedResources(context, items).filter((item) => {
    const statusMatches =
      filters.status === undefined || filters.status === "all" || item.status === filters.status;
    const originMatches = filters.origin === undefined || item.origin === filters.origin;
    const fromMatches =
      filters.receivedFrom === undefined || item.receivedAt >= filters.receivedFrom;
    const toMatches = filters.receivedTo === undefined || item.receivedAt <= filters.receivedTo;

    return statusMatches && originMatches && fromMatches && toMatches;
  });
}

export function getBankMessageInboxItem(
  context: TenantContext,
  item: BankMessageInboxItem | undefined,
): BankMessageInboxItem {
  return getTenantScopedResource(context, item);
}

export function markBankMessageInboxItemProcessed(
  input: ProcessBankMessageInboxItemInput,
): BankMessageInboxMutationResult {
  const currentItem = updateTenantScopedResource(input.context, input.item, {});
  const linkedSuggestionId = resolveLinkedSuggestionId(input);
  const item: BankMessageInboxItem = {
    ...currentItem,
    status: "processed",
    linkedSuggestionId,
    processedAt: input.now,
    updatedAt: input.now,
    updatedByUserId: input.context.userId,
  };

  delete item.errorCode;
  delete item.errorMessage;
  delete item.discardedAt;

  return {
    item,
    auditEntry: buildBankMessageInboxAuditEntry("update", input.context.userId, input.now, item),
  };
}

export function markBankMessageInboxItemError(
  input: MarkBankMessageInboxItemErrorInput,
): BankMessageInboxMutationResult {
  const currentItem = updateTenantScopedResource(input.context, input.item, {});
  const item: BankMessageInboxItem = {
    ...currentItem,
    status: "error",
    errorCode: normalizeRequiredText(input.errorCode, "BANK_MESSAGE_STATUS_INVALID"),
    errorMessage: normalizeRequiredText(input.errorMessage, "BANK_MESSAGE_STATUS_INVALID"),
    updatedAt: input.now,
    updatedByUserId: input.context.userId,
  };

  delete item.processedAt;
  delete item.discardedAt;

  return {
    item,
    auditEntry: buildBankMessageInboxAuditEntry("update", input.context.userId, input.now, item),
  };
}

export function discardBankMessageInboxItem(
  input: DiscardBankMessageInboxItemInput,
): BankMessageInboxMutationResult {
  const currentItem = updateTenantScopedResource(input.context, input.item, {});
  const item: BankMessageInboxItem = {
    ...currentItem,
    status: "discarded",
    discardedAt: input.now,
    updatedAt: input.now,
    updatedByUserId: input.context.userId,
  };

  delete item.processedAt;

  return {
    item,
    auditEntry: buildBankMessageInboxAuditEntry(
      "soft_delete",
      input.context.userId,
      input.now,
      item,
      input.reason,
    ),
  };
}

export function buildBankMessageSourceHash(context: TenantContext, rawText: string): string {
  return buildStableImportHash(
    `bank_message:${context.organizationId}:${context.financialProfileId}:${normalizeRawText(rawText)}`,
  );
}

export function maskBankMessageText(text: string): string {
  return text
    .replace(
      /\b\d{4,}\b/g,
      (value) => `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`,
    )
    .replace(/([A-Z0-9._%+-])[A-Z0-9._%+-]*(@[A-Z0-9.-]+\.[A-Z]{2,})/gi, "$1***$2")
    .replace(
      /\b(ag(?:encia)?|conta|cartao|cpf|cnpj)\s*[:-]?\s*([\d./-]+)/gi,
      (_match, label) => `${label}: ****`,
    );
}

function validateOrigin(origin: BankMessageInboxOrigin): BankMessageInboxOrigin {
  if (!allowedOrigins.includes(origin)) {
    throw new BankMessageInboxError(
      "BANK_MESSAGE_ORIGIN_INVALID",
      "Origem da mensagem bancaria invalida.",
    );
  }

  return origin;
}

function normalizeRawText(text: string, maxTextLength = defaultMaxTextLength): string {
  const normalizedText = text.trim().replace(/\r\n/g, "\n");

  if (normalizedText.length === 0) {
    throw new BankMessageInboxError("BANK_MESSAGE_TEXT_EMPTY", "Mensagem bancaria vazia.");
  }

  if (normalizedText.length > maxTextLength) {
    throw new BankMessageInboxError(
      "BANK_MESSAGE_TEXT_TOO_LARGE",
      "Mensagem bancaria excede o tamanho permitido.",
    );
  }

  return normalizedText;
}

function normalizeRequiredText(text: string, code: BankMessageInboxErrorCode): string {
  const normalizedText = text.trim();

  if (normalizedText.length === 0) {
    throw new BankMessageInboxError(code, "Informe um texto valido.");
  }

  return normalizedText;
}

function resolveLinkedSuggestionId(input: ProcessBankMessageInboxItemInput): EntityId {
  const suggestionId = input.suggestionId ?? input.suggestion?.id;

  if (suggestionId === undefined) {
    throw new BankMessageInboxError(
      "BANK_MESSAGE_SUGGESTION_INVALID",
      "Mensagem processada precisa estar vinculada a uma sugestao.",
    );
  }

  if (input.suggestion !== undefined) {
    getTenantScopedResource(input.context, input.suggestion);
  }

  return suggestionId;
}

function buildBankMessageInboxAuditEntry(
  action: "create" | "update" | "soft_delete",
  actorId: EntityId,
  occurredAt: ISODateTime,
  item: BankMessageInboxItem,
  reason?: string,
): AuditLogEntryDraft {
  const auditEntry: AuditLogEntryDraft = {
    organizationId: item.organizationId,
    financialProfileId: item.financialProfileId,
    occurredAt,
    actorKind: "user",
    actorId,
    action,
    entityKind: "bank_message",
    entityId: item.id,
    redactedChanges: {
      status: "changed",
      maskedText: "changed",
      rawText: "changed",
    },
  };

  if (reason !== undefined) {
    auditEntry.reason = reason;
  }

  return auditEntry;
}

export function assertBankMessageInboxStatus(
  status: BankMessageInboxStatus,
): BankMessageInboxStatus {
  if (!allowedStatuses.includes(status)) {
    throw new BankMessageInboxError(
      "BANK_MESSAGE_STATUS_INVALID",
      "Status da mensagem bancaria invalido.",
    );
  }

  return status;
}
