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

const RESULT_FIELDS = [
  "contractVersion",
  "suggestionKind",
  "payloadVersion",
  "proposedCategoryId",
  "proposedAccountId",
  "proposedCardId",
  "proposedStatus",
  "reasons",
] as const;

const PROPOSED_STATUSES: readonly AiClassificationProposedStatus[] = [
  "pending_review",
  "duplicate",
  "planned",
  "posted",
  "reconciled",
  "suggested",
  "voided",
];

export function validateAiClassificationResult(
  value: unknown,
): value is AiClassificationResultV1 {
  if (!isRecord(value)) return false;
  if (!hasOnlyKnownFields(value)) return false;
  if (value.contractVersion !== AI_CLASSIFICATION_RESULT_CONTRACT_VERSION) return false;
  if (value.suggestionKind !== "categorization") return false;
  if (value.payloadVersion !== 1) return false;
  if (!isNonEmptyStringArray(value.reasons)) return false;
  if (!hasProposal(value)) return false;
  if (!isOptionalString(value.proposedCategoryId)) return false;
  if (!isOptionalString(value.proposedAccountId)) return false;
  if (!isOptionalString(value.proposedCardId)) return false;
  if (!isOptionalStatus(value.proposedStatus)) return false;
  return true;
}

function hasOnlyKnownFields(value: Record<string, unknown>): boolean {
  return Object.keys(value).every((field) => RESULT_FIELDS.includes(field as never));
}

function hasProposal(value: Record<string, unknown>): boolean {
  return [
    value.proposedCategoryId,
    value.proposedAccountId,
    value.proposedCardId,
    value.proposedStatus,
  ].some(isNonEmptyString);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || isNonEmptyString(value);
}

function isOptionalStatus(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isNonEmptyString(value)) return false;
  return PROPOSED_STATUSES.includes(value as AiClassificationProposedStatus);
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
