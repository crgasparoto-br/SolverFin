import {
  AI_SUGGESTION_PAYLOAD_CONTRACT_VERSION,
  AiSuggestionPayloadError,
  type AiSuggestionPayload,
  type AiSuggestionPayloadAudit,
  type AiSuggestionPayloadBase,
  type AiSuggestionPayloadKind,
  type AiSuggestionPayloadOrigin,
  type AiSuggestionPayloadTarget,
  type CategorizationSuggestionPayloadV1,
  type DeduplicationSuggestionPayloadV1,
  type InsightSuggestionPayloadV1,
  type LegacyAiSuggestionPayload,
  type LegacyDeterministicReviewPayloadV1,
  type LegacyTransactionExtractionPayload,
  type ReconciliationSuggestionPayloadV1,
  type TransactionExtractionSuggestionPayload,
} from "./ai-suggestion-payload-types.js";

export function validateCommonFields(record: Record<string, unknown>): void {
  parseOrigin(record.origin);
  parseTarget(record.target);
  parseAudit(record.audit);
  expectString(record.fingerprint);
  if (record.confidence !== undefined) expectConfidence(record.confidence);
  expectStringArray(record.reasons);
}

export function parseCurrentByKind(
  record: Record<string, unknown>,
  kind: AiSuggestionPayloadKind,
): AiSuggestionPayload {
  switch (kind) {
    case "transaction_extraction":
      return parseCurrentTransactionExtraction(record);
    case "categorization":
      return parseCurrentCategorization(record);
    case "deduplication":
      return parseCurrentDeterministic(record, "deduplication");
    case "reconciliation":
      return parseCurrentDeterministic(record, "reconciliation");
    case "insight":
      return parseCurrentInsight(record);
  }
}

function parseCurrentTransactionExtraction(
  record: Record<string, unknown>,
): TransactionExtractionSuggestionPayload {
  const payloadVersion = record.payloadVersion;
  if (payloadVersion !== 1 && payloadVersion !== 2) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_VERSION_UNSUPPORTED");
  }
  const common = parseBase(record, "transaction_extraction");
  const sourceRowNumber = expectPositiveInteger(record.sourceRowNumber);
  const sourceHash = expectString(record.sourceHash);
  const occurredOn = expectIsoDate(record.occurredOn);
  const amountMinor = expectPositiveInteger(record.amountMinor);
  const currency = expectCurrency(record.currency);
  const description = expectString(record.description);
  const optional = parseTransactionOptionalFields(record, payloadVersion);

  if (payloadVersion === 1) {
    const kind = expectOneOf(record.kind, ["income", "expense"] as const);
    assertAllowedKeys(record, [
      ...COMMON_KEYS,
      "payloadVersion",
      "sourceRowNumber",
      "sourceHash",
      "occurredOn",
      "kind",
      "amountMinor",
      "currency",
      "description",
      "accountId",
      "categoryId",
      "externalId",
    ]);
    return {
      ...common,
      payloadVersion,
      sourceRowNumber,
      sourceHash,
      occurredOn,
      kind,
      amountMinor,
      currency,
      description,
      ...optional,
    };
  }

  const kind = expectOneOf(record.kind, ["income", "expense", "transfer"] as const);
  const direction = expectOneOf(record.direction, ["inflow", "outflow"] as const);
  assertAllowedKeys(record, [
    ...COMMON_KEYS,
    "payloadVersion",
    "sourceRowNumber",
    "sourceHash",
    "occurredOn",
    "kind",
    "direction",
    "amountMinor",
    "currency",
    "description",
    "accountId",
    "otherAccountId",
    "categoryId",
    "externalId",
  ]);
  return {
    ...common,
    payloadVersion,
    sourceRowNumber,
    sourceHash,
    occurredOn,
    kind,
    direction,
    amountMinor,
    currency,
    description,
    ...optional,
  };
}

function parseCurrentCategorization(
  record: Record<string, unknown>,
): CategorizationSuggestionPayloadV1 {
  if (record.payloadVersion !== 1) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_VERSION_UNSUPPORTED");
  }
  assertAllowedKeys(record, [
    ...COMMON_KEYS,
    "payloadVersion",
    "targetEntityId",
    "targetTransactionId",
    "proposedCategoryId",
    "proposedAccountId",
    "proposedCardId",
    "proposedStatus",
    "previousCategoryId",
    "sourceSuggestionId",
  ]);
  const proposal = {
    ...optionalString(record, "proposedCategoryId"),
    ...optionalString(record, "proposedAccountId"),
    ...optionalString(record, "proposedCardId"),
    ...(record.proposedStatus === undefined
      ? {}
      : {
          proposedStatus: expectOneOf(record.proposedStatus, [
            "pending_review",
            "duplicate",
            "planned",
            "posted",
            "reconciled",
            "suggested",
            "voided",
          ] as const),
        }),
  };
  if (Object.keys(proposal).length === 0) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_INVALID");
  }
  const common = parseBase(record, "categorization");
  const sourceSuggestionId =
    record.sourceSuggestionId === undefined
      ? undefined
      : expectString(record.sourceSuggestionId);
  const result = {
    ...common,
    payloadVersion: 1 as const,
    targetEntityId: expectString(record.targetEntityId),
    ...optionalString(record, "targetTransactionId"),
    ...proposal,
    ...optionalString(record, "previousCategoryId"),
  };

  if (sourceSuggestionId === undefined) return result;
  if (common.audit.sourceFingerprint === undefined) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_INVALID");
  }
  return {
    ...result,
    sourceSuggestionId,
    audit: {
      ...common.audit,
      sourceFingerprint: common.audit.sourceFingerprint,
    },
  };
}

function parseCurrentDeterministic<TKind extends "deduplication" | "reconciliation">(
  record: Record<string, unknown>,
  kind: TKind,
): TKind extends "deduplication"
  ? DeduplicationSuggestionPayloadV1
  : ReconciliationSuggestionPayloadV1 {
  if (record.payloadVersion !== 1) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_VERSION_UNSUPPORTED");
  }
  assertAllowedKeys(record, [
    ...COMMON_KEYS,
    "payloadVersion",
    "sourceSuggestionId",
    "sourcePayloadFingerprint",
    "targetTransactionId",
    "conflicts",
  ]);
  return {
    ...parseBase(record, kind),
    payloadVersion: 1,
    sourceSuggestionId: expectString(record.sourceSuggestionId),
    sourcePayloadFingerprint: expectString(record.sourcePayloadFingerprint),
    targetTransactionId: expectString(record.targetTransactionId),
    conflicts: expectStringArray(record.conflicts),
  } as unknown as TKind extends "deduplication"
    ? DeduplicationSuggestionPayloadV1
    : ReconciliationSuggestionPayloadV1;
}

function parseCurrentInsight(record: Record<string, unknown>): InsightSuggestionPayloadV1 {
  if (record.payloadVersion !== 1) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_VERSION_UNSUPPORTED");
  }
  assertAllowedKeys(record, [
    ...COMMON_KEYS,
    "payloadVersion",
    "insightType",
    "title",
    "summary",
    "periodStartOn",
    "periodEndOn",
    "metric",
    "relatedEntityIds",
  ]);
  const metric = record.metric === undefined ? undefined : parseMetric(record.metric);
  const relatedEntityIds =
    record.relatedEntityIds === undefined ? undefined : expectStringArray(record.relatedEntityIds);
  return {
    ...parseBase(record, "insight"),
    payloadVersion: 1,
    insightType: expectOneOf(record.insightType, [
      "anomaly",
      "trend",
      "summary",
      "opportunity",
    ] as const),
    title: expectString(record.title),
    summary: expectString(record.summary),
    periodStartOn: expectIsoDate(record.periodStartOn),
    periodEndOn: expectIsoDate(record.periodEndOn),
    ...(metric === undefined ? {} : { metric }),
    ...(relatedEntityIds === undefined ? {} : { relatedEntityIds }),
  };
}

function parseBase<TKind extends AiSuggestionPayloadKind>(
  record: Record<string, unknown>,
  kind: TKind,
): AiSuggestionPayloadBase<TKind> {
  return {
    contractVersion: AI_SUGGESTION_PAYLOAD_CONTRACT_VERSION,
    suggestionKind: kind,
    origin: parseOrigin(record.origin),
    fingerprint: expectString(record.fingerprint),
    target: parseTarget(record.target),
    ...(record.confidence === undefined ? {} : { confidence: expectConfidence(record.confidence) }),
    reasons: expectStringArray(record.reasons),
    audit: parseAudit(record.audit),
  };
}

export function parseLegacyAiSuggestionPayload(
  value: unknown,
  expectedKind: AiSuggestionPayloadKind,
): LegacyAiSuggestionPayload | undefined {
  const record = isRecord(value) ? value : undefined;
  if (record === undefined || "contractVersion" in record) return undefined;

  if (expectedKind === "transaction_extraction") {
    return parseLegacyTransactionExtractionPayload(record);
  }
  if (expectedKind === "deduplication" || expectedKind === "reconciliation") {
    return parseLegacyDeterministicReviewPayload(record);
  }
  return undefined;
}

function parseLegacyTransactionExtractionPayload(
  record: Record<string, unknown>,
): LegacyTransactionExtractionPayload | undefined {
  try {
    const sourceRowNumber = expectPositiveInteger(record.sourceRowNumber);
    const sourceHash = expectString(record.sourceHash);
    const occurredOn = expectIsoDate(record.occurredOn);
    const amountMinor = expectPositiveInteger(record.amountMinor);
    const currency = expectCurrency(record.currency);
    const description = expectString(record.description);
    const optional = parseTransactionOptionalFields(record, record.payloadVersion === 2 ? 2 : 1);
    if (record.payloadVersion === 1) {
      return {
        payloadVersion: 1,
        sourceRowNumber,
        sourceHash,
        occurredOn,
        kind: expectOneOf(record.kind, ["income", "expense"] as const),
        amountMinor,
        currency,
        description,
        ...optional,
      };
    }
    if (record.payloadVersion === 2) {
      return {
        payloadVersion: 2,
        sourceRowNumber,
        sourceHash,
        occurredOn,
        kind: expectOneOf(record.kind, ["income", "expense", "transfer"] as const),
        direction: expectOneOf(record.direction, ["inflow", "outflow"] as const),
        amountMinor,
        currency,
        description,
        ...optional,
      };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function parseLegacyDeterministicReviewPayload(
  record: Record<string, unknown>,
): LegacyDeterministicReviewPayloadV1 | undefined {
  try {
    if (record.payloadVersion !== 1) return undefined;
    return {
      payloadVersion: 1,
      sourceSuggestionId: expectString(record.sourceSuggestionId),
      sourcePayloadFingerprint: expectString(record.sourcePayloadFingerprint),
      targetTransactionId: expectString(record.targetTransactionId),
      reasons: expectStringArray(record.reasons),
      conflicts: expectStringArray(record.conflicts),
    };
  } catch {
    return undefined;
  }
}

function parseTransactionOptionalFields(
  record: Record<string, unknown>,
  version: 1 | 2,
): {
  accountId?: string;
  otherAccountId?: string;
  categoryId?: string;
  externalId?: string;
} {
  return {
    ...optionalString(record, "accountId"),
    ...(version === 2 ? optionalString(record, "otherAccountId") : {}),
    ...optionalString(record, "categoryId"),
    ...optionalString(record, "externalId"),
  };
}

function parseOrigin(value: unknown): AiSuggestionPayloadOrigin {
  const record = expectRecord(value);
  switch (record.kind) {
    case "provider":
      assertAllowedKeys(record, ["kind", "provider", "model"]);
      return {
        kind: "provider",
        provider: expectString(record.provider),
        ...optionalString(record, "model"),
      };
    case "import":
      assertAllowedKeys(record, ["kind", "sourceKind", "sourceEntityId"]);
      return {
        kind: "import",
        sourceKind: expectOneOf(record.sourceKind, [
          "csv",
          "ofx",
          "bank_message",
          "manual",
        ] as const),
        ...optionalString(record, "sourceEntityId"),
      };
    case "rule":
      assertAllowedKeys(record, ["kind", "ruleId"]);
      return { kind: "rule", ...optionalString(record, "ruleId") };
    case "automation":
      assertAllowedKeys(record, ["kind", "ruleId"]);
      return { kind: "automation", ...optionalString(record, "ruleId") };
    case "system":
      assertAllowedKeys(record, ["kind", "component"]);
      return {
        kind: "system",
        component: expectString(record.component),
      };
    default:
      throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_INVALID");
  }
}

function parseTarget(value: unknown): AiSuggestionPayloadTarget {
  const record = expectRecord(value);
  assertAllowedKeys(record, ["entityKind", "entityId"]);
  return {
    entityKind: expectOneOf(record.entityKind, [
      "transaction",
      "category",
      "account",
      "card",
      "import_suggestion",
      "financial_profile",
      "period",
    ] as const),
    ...optionalString(record, "entityId"),
  };
}

function parseAudit(value: unknown): AiSuggestionPayloadAudit {
  const record = expectRecord(value);
  assertAllowedKeys(record, ["createdAt", "correlationId", "sourceFingerprint"]);
  return {
    createdAt: expectIsoDateTime(record.createdAt),
    ...optionalString(record, "correlationId"),
    ...optionalString(record, "sourceFingerprint"),
  };
}

function parseMetric(value: unknown): NonNullable<InsightSuggestionPayloadV1["metric"]> {
  const record = expectRecord(value);
  assertAllowedKeys(record, ["name", "value", "unit", "currency"]);
  return {
    name: expectString(record.name),
    value: expectFiniteNumber(record.value),
    unit: expectOneOf(record.unit, ["minor_currency", "count", "percentage"] as const),
    ...(record.currency === undefined ? {} : { currency: expectCurrency(record.currency) }),
  };
}

const COMMON_KEYS = [
  "contractVersion",
  "suggestionKind",
  "origin",
  "fingerprint",
  "target",
  "confidence",
  "reasons",
  "audit",
] as const;

export function parseSuggestionKind(value: unknown): AiSuggestionPayloadKind {
  return expectOneOf(value, [
    "transaction_extraction",
    "categorization",
    "deduplication",
    "reconciliation",
    "insight",
  ] as const);
}

export function expectRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_INVALID");
  }
  return value;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_INVALID");
  }
  return value;
}

function expectPositiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_INVALID");
  }
  return value as number;
}

function expectFiniteNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_INVALID");
  }
  return value;
}

function expectConfidence(value: unknown): number {
  const confidence = expectFiniteNumber(value);
  if (confidence < 0 || confidence > 1) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_INVALID");
  }
  return confidence;
}

function expectStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_INVALID");
  }
  return value.map(expectString);
}

function expectCurrency(value: unknown): string {
  const currency = expectString(value);
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_INVALID");
  }
  return currency;
}

function expectIsoDate(value: unknown): string {
  const date = expectString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_INVALID");
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_INVALID");
  }
  return date;
}

function expectIsoDateTime(value: unknown): string {
  const dateTime = expectString(value);
  if (Number.isNaN(Date.parse(dateTime))) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_INVALID");
  }
  return dateTime;
}

function expectOneOf<const TValues extends readonly string[]>(
  value: unknown,
  values: TValues,
): TValues[number] {
  if (typeof value !== "string" || !values.includes(value)) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_INVALID");
  }
  return value as TValues[number];
}

function optionalString<TKey extends string>(
  record: Record<string, unknown>,
  key: TKey,
): Partial<Record<TKey, string>> {
  const value = record[key];
  return value === undefined ? {} : ({ [key]: expectString(value) } as Record<TKey, string>);
}

function assertAllowedKeys(record: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) {
      throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_INVALID");
    }
  }
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function isLegacyTransactionExtractionPayload(
  payload: LegacyAiSuggestionPayload,
): payload is LegacyTransactionExtractionPayload {
  return "sourceRowNumber" in payload;
}

export function isLegacyDeterministicReviewPayload(
  payload: LegacyAiSuggestionPayload,
): payload is LegacyDeterministicReviewPayloadV1 {
  return "sourceSuggestionId" in payload && "targetTransactionId" in payload;
}
