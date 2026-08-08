import type {
  AI_SUGGESTION_PAYLOAD_CONTRACT_VERSION,
  AiSuggestionPayload,
  AiSuggestionPayloadKind,
  AiSuggestionPayloadOrigin,
  AiSuggestionPayloadTarget,
  CategorizationSuggestionPayloadV1,
  ImportLineDirection,
  InsightSuggestionPayloadV1,
  TransactionKind,
} from "./ai-suggestion-payload-types.js";

export interface PublicTransactionExtractionProposal {
  occurredOn: string;
  kind: TransactionKind;
  amountMinor: number;
  currency: string;
  description: string;
  direction?: ImportLineDirection;
  accountId?: string;
  otherAccountId?: string;
  categoryId?: string;
}

export interface PublicCategorizationProposal {
  targetEntityId?: string;
  targetTransactionId?: string;
  proposedCategoryId?: string;
  proposedAccountId?: string;
  proposedCardId?: string;
  proposedStatus?: CategorizationSuggestionPayloadV1["proposedStatus"];
  previousCategoryId?: string;
}

export interface PublicDeterministicReviewProposal {
  targetTransactionId?: string;
  conflicts: readonly string[];
}

export interface PublicInsightProposal {
  insightType: InsightSuggestionPayloadV1["insightType"];
  title: string;
  summary: string;
  periodStartOn: string;
  periodEndOn: string;
  metric?: NonNullable<InsightSuggestionPayloadV1["metric"]>;
  relatedEntityIds?: readonly string[];
}

interface PublicAiSuggestionPayloadBase<
  TKind extends AiSuggestionPayloadKind,
  TPayloadVersion extends number,
  TProposal extends object,
> {
  contractVersion: typeof AI_SUGGESTION_PAYLOAD_CONTRACT_VERSION;
  suggestionKind: TKind;
  payloadVersion: TPayloadVersion;
  origin: { kind: AiSuggestionPayloadOrigin["kind"] };
  fingerprint: string;
  confidence?: number;
  reasons: readonly string[];
  target: {
    entityKind: AiSuggestionPayloadTarget["entityKind"];
  };
  proposal: TProposal;
}

export type PublicAiSuggestionPayload =
  | PublicAiSuggestionPayloadBase<
      "transaction_extraction",
      1 | 2,
      PublicTransactionExtractionProposal
    >
  | PublicAiSuggestionPayloadBase<"categorization", 1, PublicCategorizationProposal>
  | PublicAiSuggestionPayloadBase<"deduplication", 1, PublicDeterministicReviewProposal>
  | PublicAiSuggestionPayloadBase<"reconciliation", 1, PublicDeterministicReviewProposal>
  | PublicAiSuggestionPayloadBase<"insight", 1, PublicInsightProposal>;

export function toPublicAiSuggestionPayload(
  payload: AiSuggestionPayload,
  options: { includeScopedEntityIds?: boolean } = {},
): PublicAiSuggestionPayload {
  const includeIds = options.includeScopedEntityIds === true;
  const common = {
    contractVersion: payload.contractVersion,
    origin: { kind: payload.origin.kind },
    fingerprint: payload.fingerprint,
    ...(payload.confidence === undefined ? {} : { confidence: payload.confidence }),
    reasons: payload.reasons,
    target: {
      entityKind: payload.target.entityKind,
    },
  };

  switch (payload.suggestionKind) {
    case "transaction_extraction":
      return {
        ...common,
        suggestionKind: payload.suggestionKind,
        payloadVersion: payload.payloadVersion,
        proposal: {
          occurredOn: payload.occurredOn,
          kind: payload.kind,
          amountMinor: payload.amountMinor,
          currency: payload.currency,
          description: payload.description,
          ...(payload.payloadVersion === 2 ? { direction: payload.direction } : {}),
          ...(includeIds && payload.accountId !== undefined
            ? { accountId: payload.accountId }
            : {}),
          ...(includeIds && payload.payloadVersion === 2 && payload.otherAccountId !== undefined
            ? { otherAccountId: payload.otherAccountId }
            : {}),
          ...(includeIds && payload.categoryId !== undefined
            ? { categoryId: payload.categoryId }
            : {}),
        },
      };
    case "categorization":
      return {
        ...common,
        suggestionKind: payload.suggestionKind,
        payloadVersion: payload.payloadVersion,
        proposal: {
          ...(includeIds ? { targetEntityId: payload.targetEntityId } : {}),
          ...(includeIds && payload.targetTransactionId !== undefined
            ? { targetTransactionId: payload.targetTransactionId }
            : {}),
          ...(includeIds && payload.proposedCategoryId !== undefined
            ? { proposedCategoryId: payload.proposedCategoryId }
            : {}),
          ...(includeIds && payload.proposedAccountId !== undefined
            ? { proposedAccountId: payload.proposedAccountId }
            : {}),
          ...(includeIds && payload.proposedCardId !== undefined
            ? { proposedCardId: payload.proposedCardId }
            : {}),
          ...(payload.proposedStatus !== undefined
            ? { proposedStatus: payload.proposedStatus }
            : {}),
          ...(includeIds && payload.previousCategoryId !== undefined
            ? { previousCategoryId: payload.previousCategoryId }
            : {}),
        },
      };
    case "deduplication":
    case "reconciliation":
      return {
        ...common,
        suggestionKind: payload.suggestionKind,
        payloadVersion: payload.payloadVersion,
        proposal: {
          ...(includeIds ? { targetTransactionId: payload.targetTransactionId } : {}),
          conflicts: payload.conflicts,
        },
      };
    case "insight":
      return {
        ...common,
        suggestionKind: payload.suggestionKind,
        payloadVersion: payload.payloadVersion,
        proposal: {
          insightType: payload.insightType,
          title: payload.title,
          summary: payload.summary,
          periodStartOn: payload.periodStartOn,
          periodEndOn: payload.periodEndOn,
          ...(payload.metric === undefined ? {} : { metric: payload.metric }),
          ...(includeIds && payload.relatedEntityIds !== undefined
            ? { relatedEntityIds: payload.relatedEntityIds }
            : {}),
        },
      };
  }
}
