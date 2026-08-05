export const AI_CLASSIFICATION_RESULT_CONTRACT_VERSION = 1 as const;

export type AiClassificationProposedStatus =
  | "pending_review"
  | "duplicate"
  | "planned"
  | "posted"
  | "reconciled"
  | "suggested"
  | "voided";

export interface AiClassificationResultV1 {
  contractVersion: typeof AI_CLASSIFICATION_RESULT_CONTRACT_VERSION;
  suggestionKind: "categorization";
  payloadVersion: 1;
  proposedCategoryId?: string;
  proposedAccountId?: string;
  proposedCardId?: string;
  proposedStatus?: AiClassificationProposedStatus;
  reasons: readonly string[];
}

const CLASSIFICATION_RESULT_FIELDS = new Set([
  "contractVersion",
  "suggestionKind",
  "payloadVersion",
  "proposedCategoryId",
  "proposedAccountId",
  "proposedCardId",
  "proposedStatus",
  "reasons",
]);

const PROPOSED_STATUSES = new Set<AiClassificationProposedStatus>([
  "pending_review",
  "duplicate",
  "planned",
  "posted",
  "reconciled",
  "suggested",
  "voided",
]);

export function validateAiClassificationResult(
  value: unknown,
): value is AiClassificationResultV1 {
  if (!isRecord(value)) {
    return false;
  }

  if (Object.keys(value).some((field) => !CLASSIFICATION_RESULT_FIELDS.has(field))) {
    return false;
  }

  if (
    value.contractVersion !== AI_CLASSIFICATION_RESULT_CONTRACT_VERSION ||
    value.suggestionKind !== "categorization" ||
    value.payloadVersion !== 1 ||
    !isNonEmptyStringArray(value.reasons)
  ) {
    return false;
  }

  const proposedFields = [
    value.proposedCategoryId,
    value.proposedAccountId,
    value.proposedCardId,
    value.proposedStatus,
  ];

  if (!proposedFields.some((field) => isNonEmptyString(field))) {
    return false;
  }

  for (const field of [
    value.proposedCategoryId,
    value.proposedAccountId,
    value.proposedCardId,
  ]) {
    if (field !== undefined && !isNonEmptyString(field)) {
      return false;
    }
  }

  if (
    value.proposedStatus !== undefined &&
    !PROPOSED_STATUSES.has(value.proposedStatus as AiClassificationProposedStatus)
  ) {
    return false;
  }

  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 2048;
}

function isNonEmptyStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}
