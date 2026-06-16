export type SharedInboxItemStatus = "received" | "rejected";
export type SharedInboxSource = "web_share_target" | "manual_paste";

export interface ShareTargetRequest {
  organizationId?: string;
  financialProfileId?: string;
  userId?: string;
  title?: string;
  text?: string;
  url?: string;
  receivedAt: string;
  source: SharedInboxSource;
}

export interface SharedInboxItem {
  id: string;
  organizationId: string;
  financialProfileId: string;
  userId: string;
  source: SharedInboxSource;
  status: SharedInboxItemStatus;
  receivedAt: string;
  title: string;
  maskedPreview: string;
  rawText: string;
  originUrl?: string;
  duplicateKey: string;
}

export interface ShareTargetResult {
  accepted: boolean;
  item?: SharedInboxItem;
  errorMessage?: string;
}

const MAX_SHARED_TEXT_LENGTH = 4_000;
const CARD_NUMBER_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g;
const DOCUMENT_PATTERN = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const MONEY_PATTERN = /R\$\s?\d{1,3}(?:\.\d{3})*,\d{2}/g;

export function createInboxItemFromShareTarget(
  request: ShareTargetRequest,
): ShareTargetResult {
  const authError = validateShareTargetAuth(request);

  if (authError) {
    return {
      accepted: false,
      errorMessage: authError,
    };
  }

  const rawText = normalizeSharedText(request);

  if (rawText.length === 0) {
    return {
      accepted: false,
      errorMessage: "Nao encontramos texto para enviar a inbox.",
    };
  }

  if (rawText.length > MAX_SHARED_TEXT_LENGTH) {
    return {
      accepted: false,
      errorMessage: "O texto compartilhado e grande demais para este fluxo.",
    };
  }

  const maskedPreview = maskSharedFinancialText(rawText).slice(0, 280);
  const item = buildSharedInboxItem(request, rawText, maskedPreview);

  return {
    accepted: true,
    item,
  };
}

export function maskSharedFinancialText(text: string): string {
  return text
    .replace(CARD_NUMBER_PATTERN, "[cartao mascarado]")
    .replace(DOCUMENT_PATTERN, "[documento mascarado]")
    .replace(MONEY_PATTERN, "[valor]");
}

function validateShareTargetAuth(request: ShareTargetRequest): string | undefined {
  if (!request.organizationId || !request.financialProfileId || !request.userId) {
    return "Entre no SolverFin antes de compartilhar uma mensagem financeira.";
  }

  return undefined;
}

function normalizeSharedText(request: ShareTargetRequest): string {
  return [request.title, request.text, request.url]
    .filter((part): part is string => part !== undefined && part.trim().length > 0)
    .map((part) => part.trim())
    .join("\n")
    .trim();
}

function buildSharedInboxItem(
  request: ShareTargetRequest,
  rawText: string,
  maskedPreview: string,
): SharedInboxItem {
  const organizationId = requireValue(request.organizationId, "organizationId");
  const financialProfileId = requireValue(request.financialProfileId, "financialProfileId");
  const userId = requireValue(request.userId, "userId");
  const duplicateKey = buildDuplicateKey(organizationId, financialProfileId, rawText);

  return {
    id: `share_${duplicateKey}`,
    organizationId,
    financialProfileId,
    userId,
    source: request.source,
    status: "received",
    receivedAt: request.receivedAt,
    title: request.title?.trim() || "Mensagem compartilhada",
    maskedPreview,
    rawText,
    ...(request.url ? { originUrl: request.url.trim() } : {}),
    duplicateKey,
  };
}

function buildDuplicateKey(
  organizationId: string,
  financialProfileId: string,
  rawText: string,
): string {
  const normalized = rawText.toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
  const base = `${organizationId}:${financialProfileId}:${normalized}`;
  let hash = 0;

  for (const char of base) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return hash.toString(36);
}

function requireValue(value: string | undefined, field: string): string {
  if (!value) {
    throw new Error(`Missing required share target field: ${field}`);
  }

  return value;
}
