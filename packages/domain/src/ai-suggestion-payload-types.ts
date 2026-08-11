export const AI_SUGGESTION_PAYLOAD_CONTRACT_VERSION = 1 as const;

export type AiSuggestionPayloadKind =
  | "transaction_extraction"
  | "categorization"
  | "deduplication"
  | "reconciliation"
  | "insight";

export type AiSuggestionPayloadStatus =
  | "pending_review"
  | "approved"
  | "edited"
  | "rejected"
  | "expired";

export type AiSuggestionPayloadOrigin =
  | {
      kind: "provider";
      provider: string;
      model?: string;
    }
  | {
      kind: "import";
      sourceKind: "csv" | "ofx" | "bank_message" | "manual";
      sourceEntityId?: string;
    }
  | {
      kind: "rule";
      ruleId?: string;
    }
  | {
      kind: "automation";
      ruleId?: string;
    }
  | {
      kind: "system";
      component: string;
    };

export interface AiSuggestionPayloadTarget {
  entityKind:
    | "transaction"
    | "category"
    | "account"
    | "card"
    | "import_suggestion"
    | "financial_profile"
    | "period";
  entityId?: string;
}

export interface AiSuggestionPayloadAudit {
  createdAt: string;
  correlationId?: string;
  sourceFingerprint?: string;
}

export interface AiSuggestionPayloadBase<TKind extends AiSuggestionPayloadKind> {
  contractVersion: typeof AI_SUGGESTION_PAYLOAD_CONTRACT_VERSION;
  suggestionKind: TKind;
  origin: AiSuggestionPayloadOrigin;
  fingerprint: string;
  target: AiSuggestionPayloadTarget;
  confidence?: number;
  reasons: readonly string[];
  audit: AiSuggestionPayloadAudit;
}

export type ImportLineDirection = "inflow" | "outflow";
export type TransactionKind = "income" | "expense" | "transfer";

export interface TransactionExtractionSuggestionPayloadV1 extends AiSuggestionPayloadBase<"transaction_extraction"> {
  payloadVersion: 1;
  sourceRowNumber: number;
  sourceHash: string;
  occurredOn: string;
  kind: Extract<TransactionKind, "income" | "expense">;
  amountMinor: number;
  currency: string;
  description: string;
  accountId?: string;
  categoryId?: string;
  externalId?: string;
}

export interface TransactionExtractionSuggestionPayloadV2 extends AiSuggestionPayloadBase<"transaction_extraction"> {
  payloadVersion: 2;
  sourceRowNumber: number;
  sourceHash: string;
  occurredOn: string;
  kind: TransactionKind;
  direction: ImportLineDirection;
  amountMinor: number;
  currency: string;
  description: string;
  accountId?: string;
  otherAccountId?: string;
  categoryId?: string;
  externalId?: string;
}

export type TransactionExtractionSuggestionPayload =
  | TransactionExtractionSuggestionPayloadV1
  | TransactionExtractionSuggestionPayloadV2;

export interface CategorizationSuggestionPayloadV1 extends AiSuggestionPayloadBase<"categorization"> {
  payloadVersion: 1;
  targetEntityId: string;
  targetTransactionId?: string;
  proposedCategoryId?: string;
  proposedAccountId?: string;
  proposedCardId?: string;
  proposedStatus?:
    | "pending_review"
    | "duplicate"
    | "planned"
    | "posted"
    | "reconciled"
    | "suggested"
    | "voided";
  previousCategoryId?: string;
  sourceSuggestionId?: string;
}

interface DeterministicSuggestionPayloadV1Base<
  TKind extends "deduplication" | "reconciliation",
> extends AiSuggestionPayloadBase<TKind> {
  payloadVersion: 1;
  sourceSuggestionId: string;
  sourcePayloadFingerprint: string;
  targetTransactionId: string;
  conflicts: readonly string[];
}

export type DeduplicationSuggestionPayloadV1 =
  DeterministicSuggestionPayloadV1Base<"deduplication">;

export type ReconciliationSuggestionPayloadV1 =
  DeterministicSuggestionPayloadV1Base<"reconciliation">;

export interface InsightSuggestionPayloadV1 extends AiSuggestionPayloadBase<"insight"> {
  payloadVersion: 1;
  insightType: "anomaly" | "trend" | "summary" | "opportunity";
  title: string;
  summary: string;
  periodStartOn: string;
  periodEndOn: string;
  metric?: {
    name: string;
    value: number;
    unit: "minor_currency" | "count" | "percentage";
    currency?: string;
  };
  relatedEntityIds?: readonly string[];
}

export type VerifiableFinancialInsightKind =
  | "category_spending_increase"
  | "merchant_spending_increase"
  | "probable_subscription"
  | "negative_balance_risk"
  | "budget_exceeded"
  | "monthly_summary";

export interface InsightNumericEvidenceV2 {
  label: string;
  value: number;
  unit: "minor_currency" | "count" | "percentage";
  currency?: string;
}

export interface InsightComparisonV2 {
  kind: "previous_period" | "planned_budget";
  currentValue: number;
  previousValue: number;
  unit: "minor_currency" | "count" | "percentage";
  percentChange?: number;
  previousPeriodStartOn?: string;
  previousPeriodEndOn?: string;
}

export interface InsightFiltersV2 {
  currency: string;
  categoryId?: string;
  merchantKey?: string;
}

export interface InsightNavigationV2 {
  view: "transactions" | "budgets" | "cash_flow";
  categoryId?: string;
  merchantKey?: string;
}

export interface InsightSuggestionPayloadV2 extends AiSuggestionPayloadBase<"insight"> {
  payloadVersion: 2;
  insightType: "anomaly" | "trend" | "summary" | "opportunity";
  insightKind: VerifiableFinancialInsightKind;
  insightKey: string;
  title: string;
  summary: string;
  periodStartOn: string;
  periodEndOn: string;
  currency: string;
  filters: InsightFiltersV2;
  evidence: readonly InsightNumericEvidenceV2[];
  comparison?: InsightComparisonV2;
  limitations: readonly string[];
  calculationVersion: string;
  dataFingerprint: string;
  relatedEntityIds?: readonly string[];
  navigation?: InsightNavigationV2;
}

export type InsightSuggestionPayload = InsightSuggestionPayloadV1 | InsightSuggestionPayloadV2;

export type AiSuggestionPayload =
  | TransactionExtractionSuggestionPayload
  | CategorizationSuggestionPayloadV1
  | DeduplicationSuggestionPayloadV1
  | ReconciliationSuggestionPayloadV1
  | InsightSuggestionPayload;

export interface LegacyTransactionExtractionPayloadV1 {
  payloadVersion: 1;
  sourceRowNumber: number;
  sourceHash: string;
  occurredOn: string;
  kind: "income" | "expense";
  amountMinor: number;
  currency: string;
  description: string;
  accountId?: string;
  categoryId?: string;
  externalId?: string;
}

export interface LegacyTransactionExtractionPayloadV2 {
  payloadVersion: 2;
  sourceRowNumber: number;
  sourceHash: string;
  occurredOn: string;
  kind: TransactionKind;
  direction: ImportLineDirection;
  amountMinor: number;
  currency: string;
  description: string;
  accountId?: string;
  otherAccountId?: string;
  categoryId?: string;
  externalId?: string;
}

export type LegacyTransactionExtractionPayload =
  | LegacyTransactionExtractionPayloadV1
  | LegacyTransactionExtractionPayloadV2;

export interface LegacyDeterministicReviewPayloadV1 {
  payloadVersion: 1;
  sourceSuggestionId: string;
  sourcePayloadFingerprint: string;
  targetTransactionId: string;
  reasons: readonly string[];
  conflicts: readonly string[];
}

export type LegacyAiSuggestionPayload =
  | LegacyTransactionExtractionPayload
  | LegacyDeterministicReviewPayloadV1;

export type AiSuggestionPayloadReadResult =
  | { state: "current"; payload: AiSuggestionPayload }
  | { state: "legacy"; payload: LegacyAiSuggestionPayload }
  | { state: "missing" }
  | { state: "invalid"; error: AiSuggestionPayloadError };

export type AiSuggestionPayloadErrorCode =
  | "AI_SUGGESTION_PAYLOAD_MISSING"
  | "AI_SUGGESTION_PAYLOAD_INVALID"
  | "AI_SUGGESTION_PAYLOAD_KIND_MISMATCH"
  | "AI_SUGGESTION_PAYLOAD_VERSION_UNSUPPORTED"
  | "AI_SUGGESTION_PAYLOAD_OBSOLETE"
  | "AI_SUGGESTION_PAYLOAD_IMMUTABLE"
  | "AI_SUGGESTION_PAYLOAD_CONFLICT";

const ERROR_STATUS: Readonly<Record<AiSuggestionPayloadErrorCode, number>> = {
  AI_SUGGESTION_PAYLOAD_MISSING: 422,
  AI_SUGGESTION_PAYLOAD_INVALID: 422,
  AI_SUGGESTION_PAYLOAD_KIND_MISMATCH: 409,
  AI_SUGGESTION_PAYLOAD_VERSION_UNSUPPORTED: 409,
  AI_SUGGESTION_PAYLOAD_OBSOLETE: 409,
  AI_SUGGESTION_PAYLOAD_IMMUTABLE: 409,
  AI_SUGGESTION_PAYLOAD_CONFLICT: 409,
};

const ERROR_MESSAGE: Readonly<Record<AiSuggestionPayloadErrorCode, string>> = {
  AI_SUGGESTION_PAYLOAD_MISSING: "A sugestao nao possui payload estruturado.",
  AI_SUGGESTION_PAYLOAD_INVALID: "O payload estruturado da sugestao e invalido.",
  AI_SUGGESTION_PAYLOAD_KIND_MISMATCH: "O payload nao e compativel com o tipo da sugestao.",
  AI_SUGGESTION_PAYLOAD_VERSION_UNSUPPORTED: "A versao do payload da sugestao nao e suportada.",
  AI_SUGGESTION_PAYLOAD_OBSOLETE:
    "A sugestao ficou obsoleta porque sua origem ou proposta foi alterada.",
  AI_SUGGESTION_PAYLOAD_IMMUTABLE: "Sugestoes resolvidas nao podem ter o payload alterado.",
  AI_SUGGESTION_PAYLOAD_CONFLICT:
    "A sugestao foi alterada por outra operacao. Recarregue os dados e tente novamente.",
};

export class AiSuggestionPayloadError extends Error {
  readonly code: AiSuggestionPayloadErrorCode;
  readonly statusCode: number;

  constructor(code: AiSuggestionPayloadErrorCode) {
    super(ERROR_MESSAGE[code]);
    this.name = "AiSuggestionPayloadError";
    this.code = code;
    this.statusCode = ERROR_STATUS[code];
  }
}

export type AiSuggestionPayloadDraft = AiSuggestionPayload extends infer TPayload
  ? TPayload extends AiSuggestionPayload
    ? Omit<TPayload, "fingerprint"> & { fingerprint?: string }
    : never
  : never;

export interface BuildAiSuggestionPayloadInput {
  payload: AiSuggestionPayloadDraft;
}
