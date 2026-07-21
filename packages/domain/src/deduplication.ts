import type {
  AuditLogEntryDraft,
  EntityId,
  ISODate,
  ISODateTime,
  TenantScoped,
  Transaction,
  TransactionKind,
} from "./index.js";
import type { TenantContext } from "./tenant.js";
import { listTenantScopedResources } from "./tenant-authorization.js";
import type { ImportTransactionSuggestion } from "./imports.js";
import type { BankMessageInboxItem } from "./bank-message-inbox.js";

export type DeduplicationCandidateKind = "transaction" | "import_suggestion" | "bank_message";
export type DeduplicationSourceKind =
  | "manual"
  | "recurrence"
  | "installment"
  | "import"
  | "bank_message"
  | "ai_suggestion"
  | "account_remuneration";
export type DeduplicationReviewStatus = "needs_review" | "not_duplicate";
export type DeduplicationReasonCode =
  | "DEDUP_EXACT_SOURCE_HASH"
  | "DEDUP_SAME_AMOUNT"
  | "DEDUP_CLOSE_DATE"
  | "DEDUP_SAME_ACCOUNT"
  | "DEDUP_SAME_CARD"
  | "DEDUP_SIMILAR_DESCRIPTION"
  | "DEDUP_SAME_EXTERNAL_ID";

export interface DeduplicationCandidate extends TenantScoped {
  id: EntityId;
  candidateKind: DeduplicationCandidateKind;
  sourceKind: DeduplicationSourceKind;
  kind: TransactionKind;
  amountMinor: number;
  currency: string;
  occurredOn: ISODate;
  description: string;
  accountId?: EntityId;
  destinationAccountId?: EntityId;
  cardId?: EntityId;
  sourceHash?: string;
  externalId?: string;
}

export interface BankMessageDeduplicationInput extends TenantScoped {
  id: EntityId;
  item: BankMessageInboxItem;
  occurredOn: ISODate;
  amountMinor: number;
  kind: TransactionKind;
  currency?: string;
  accountId?: EntityId;
  cardId?: EntityId;
  description?: string;
  externalId?: string;
}

export interface DeduplicationReason {
  code: DeduplicationReasonCode;
  score: number;
  message: string;
}

export interface DeduplicationReviewCandidate extends TenantScoped {
  id: EntityId;
  status: DeduplicationReviewStatus;
  candidateId: EntityId;
  possibleDuplicateId: EntityId;
  score: number;
  reasons: readonly DeduplicationReason[];
  reviewed: false;
  createdAt: ISODateTime;
}

export interface DetectDuplicateTransactionsInput {
  context: TenantContext;
  now: ISODateTime;
  candidate: DeduplicationCandidate;
  existingCandidates: readonly DeduplicationCandidate[];
  minimumReviewScore?: number;
}

const defaultMinimumReviewScore = 70;
const oneDayInMs = 24 * 60 * 60 * 1000;

export function detectDuplicateTransactions(
  input: DetectDuplicateTransactionsInput,
): DeduplicationReviewCandidate[] {
  const scopedExistingCandidates = listTenantScopedResources(
    input.context,
    input.existingCandidates,
  );
  const reviewCandidates: DeduplicationReviewCandidate[] = [];
  const minimumReviewScore = input.minimumReviewScore ?? defaultMinimumReviewScore;

  for (const possibleDuplicate of scopedExistingCandidates) {
    if (possibleDuplicate.id === input.candidate.id) {
      continue;
    }

    const reasons = buildDeduplicationReasons(input.candidate, possibleDuplicate);
    const score = Math.min(
      100,
      reasons.reduce((total, reason) => total + reason.score, 0),
    );

    if (score < minimumReviewScore) {
      continue;
    }

    reviewCandidates.push({
      id: `dedup-${input.candidate.id}-${possibleDuplicate.id}`,
      organizationId: input.context.organizationId,
      financialProfileId: input.context.financialProfileId,
      status: "needs_review",
      candidateId: input.candidate.id,
      possibleDuplicateId: possibleDuplicate.id,
      score,
      reasons,
      reviewed: false,
      createdAt: input.now,
    });
  }

  return reviewCandidates.sort((left, right) => right.score - left.score);
}

export function buildTransactionDeduplicationCandidate(
  transaction: Transaction,
): DeduplicationCandidate {
  const candidate: DeduplicationCandidate = {
    id: transaction.id,
    organizationId: transaction.organizationId,
    financialProfileId: transaction.financialProfileId,
    candidateKind: "transaction",
    sourceKind: transaction.source,
    kind: transaction.kind,
    amountMinor: transaction.amountMinor,
    currency: transaction.currency,
    occurredOn: transaction.occurredOn,
    description: transaction.description,
  };

  if (transaction.accountId !== undefined) {
    candidate.accountId = transaction.accountId;
  }

  if (transaction.destinationAccountId !== undefined) {
    candidate.destinationAccountId = transaction.destinationAccountId;
  }

  if (transaction.cardId !== undefined) {
    candidate.cardId = transaction.cardId;
  }

  return candidate;
}

export function buildImportSuggestionDeduplicationCandidate(
  suggestion: ImportTransactionSuggestion,
): DeduplicationCandidate {
  const candidate: DeduplicationCandidate = {
    id: suggestion.id,
    organizationId: suggestion.organizationId,
    financialProfileId: suggestion.financialProfileId,
    candidateKind: "import_suggestion",
    sourceKind: "import",
    kind: suggestion.kind,
    amountMinor: suggestion.amountMinor,
    currency: suggestion.currency,
    occurredOn: suggestion.occurredOn,
    description: suggestion.description,
    sourceHash: suggestion.sourceHash,
  };

  if (
    suggestion.kind === "transfer" &&
    suggestion.accountId !== undefined &&
    suggestion.otherAccountId !== undefined
  ) {
    candidate.accountId =
      suggestion.direction === "outflow" ? suggestion.accountId : suggestion.otherAccountId;
    candidate.destinationAccountId =
      suggestion.direction === "outflow" ? suggestion.otherAccountId : suggestion.accountId;
  } else if (suggestion.accountId !== undefined) {
    candidate.accountId = suggestion.accountId;
  }

  if (suggestion.externalId !== undefined) {
    candidate.externalId = suggestion.externalId;
  }

  return candidate;
}

export function buildBankMessageDeduplicationCandidate(
  input: BankMessageDeduplicationInput,
): DeduplicationCandidate {
  const candidate: DeduplicationCandidate = {
    id: input.id,
    organizationId: input.organizationId,
    financialProfileId: input.financialProfileId,
    candidateKind: "bank_message",
    sourceKind: "bank_message",
    kind: input.kind,
    amountMinor: input.amountMinor,
    currency: input.currency ?? "BRL",
    occurredOn: input.occurredOn,
    description: input.description ?? input.item.maskedText,
    sourceHash: input.item.sourceHash,
  };

  if (input.accountId !== undefined) {
    candidate.accountId = input.accountId;
  }

  if (input.cardId !== undefined) {
    candidate.cardId = input.cardId;
  }

  if (input.externalId !== undefined) {
    candidate.externalId = input.externalId;
  }

  return candidate;
}

export function buildDeduplicationAuditEntry(
  context: TenantContext,
  reviewCandidate: DeduplicationReviewCandidate,
  occurredAt: ISODateTime,
): AuditLogEntryDraft {
  return {
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    occurredAt,
    actorKind: "system",
    action: "create",
    entityKind: "deduplication_review",
    entityId: reviewCandidate.id,
    redactedChanges: {
      status: "added",
      score: "added",
      reasons: "added",
    },
  };
}

function buildDeduplicationReasons(
  candidate: DeduplicationCandidate,
  possibleDuplicate: DeduplicationCandidate,
): DeduplicationReason[] {
  if (candidate.kind !== possibleDuplicate.kind) return [];
  if (candidate.kind === "transfer" && !hasSameTransferAccounts(candidate, possibleDuplicate)) {
    return [];
  }

  if (
  candidate.kind === "transfer" &&
  dateDistanceInDays(candidate.occurredOn, possibleDuplicate.occurredOn) > 2
) {
  return [];
}

  const reasons: DeduplicationReason[] = [];

  if (candidate.sourceHash !== undefined && candidate.sourceHash === possibleDuplicate.sourceHash) {
    reasons.push({
      code: "DEDUP_EXACT_SOURCE_HASH",
      score: 100,
      message: "A origem tecnica da movimentacao e identica.",
    });
  }

  if (candidate.externalId !== undefined && candidate.externalId === possibleDuplicate.externalId) {
    reasons.push({
      code: "DEDUP_SAME_EXTERNAL_ID",
      score: 95,
      message: "O identificador externo da origem e igual.",
    });
  }

  if (candidate.kind === "transfer") {
    reasons.push({
      code: "DEDUP_SAME_ACCOUNT",
      score: 40,
      message: "O par de contas da transferencia e o mesmo.",
    });
  }

  if (candidate.amountMinor === possibleDuplicate.amountMinor) {
    reasons.push({
      code: "DEDUP_SAME_AMOUNT",
      score: 30,
      message: "O valor da movimentacao e igual.",
    });
  }

  if (dateDistanceInDays(candidate.occurredOn, possibleDuplicate.occurredOn) <= 2) {
    reasons.push({
      code: "DEDUP_CLOSE_DATE",
      score: 20,
      message: "As datas das movimentacoes sao proximas.",
    });
  }

  if (
    candidate.kind !== "transfer" &&
    candidate.accountId !== undefined &&
    candidate.accountId === possibleDuplicate.accountId
  ) {
    reasons.push({
      code: "DEDUP_SAME_ACCOUNT",
      score: 15,
      message: "A conta financeira e a mesma.",
    });
  }

  if (candidate.cardId !== undefined && candidate.cardId === possibleDuplicate.cardId) {
    reasons.push({
      code: "DEDUP_SAME_CARD",
      score: 15,
      message: "O cartao e o mesmo.",
    });
  }

  const descriptionSimilarity = calculateDescriptionSimilarity(
    candidate.description,
    possibleDuplicate.description,
  );

  if (descriptionSimilarity >= 0.6) {
    reasons.push({
      code: "DEDUP_SIMILAR_DESCRIPTION",
      score: Math.round(descriptionSimilarity * 30),
      message: "As descricoes sao parecidas.",
    });
  }

  return reasons;
}

function hasSameTransferAccounts(
  candidate: DeduplicationCandidate,
  possibleDuplicate: DeduplicationCandidate,
): boolean {
  if (
    candidate.accountId === undefined ||
    candidate.destinationAccountId === undefined ||
    possibleDuplicate.accountId === undefined ||
    possibleDuplicate.destinationAccountId === undefined
  ) {
    return false;
  }

  return (
    (candidate.accountId === possibleDuplicate.accountId &&
      candidate.destinationAccountId === possibleDuplicate.destinationAccountId) ||
    (candidate.accountId === possibleDuplicate.destinationAccountId &&
      candidate.destinationAccountId === possibleDuplicate.accountId)
  );
}

function calculateDescriptionSimilarity(left: string, right: string): number {
  const leftTokens = tokenizeDescription(left);
  const rightTokens = tokenizeDescription(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;

  return intersection / union;
}

function tokenizeDescription(value: string): Set<string> {
  return new Set(
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3),
  );
}

function dateDistanceInDays(left: ISODate, right: ISODate): number {
  const leftTime = Date.parse(`${left}T00:00:00.000Z`);
  const rightTime = Date.parse(`${right}T00:00:00.000Z`);

  return Math.abs(leftTime - rightTime) / oneDayInMs;
}
