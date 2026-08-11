import { createHash } from "node:crypto";

import {
  AI_SUGGESTION_PAYLOAD_CONTRACT_VERSION,
  AiSuggestionPayloadError,
  type AiSuggestionPayload,
  type AiSuggestionPayloadAudit,
  type AiSuggestionPayloadDraft,
  type AiSuggestionPayloadKind,
  type AiSuggestionPayloadOrigin,
  type AiSuggestionPayloadReadResult,
  type AiSuggestionPayloadStatus,
  type AiSuggestionPayloadTarget,
  type InsightComparisonV2,
  type InsightFiltersV2,
  type InsightNavigationV2,
  type InsightNumericEvidenceV2,
  type InsightSuggestionPayloadV2,
  type LegacyAiSuggestionPayload,
} from "./ai-suggestion-payload-types.js";
import {
  canonicalJson,
  expectRecord,
  isLegacyDeterministicReviewPayload,
  isLegacyTransactionExtractionPayload,
  isRecord,
  parseCurrentByKind,
  parseLegacyAiSuggestionPayload,
  parseSuggestionKind,
  validateCommonFields,
} from "./ai-suggestion-payload-internals.js";

export * from "./ai-suggestion-payload-types.js";
export * from "./ai-suggestion-payload-public.js";

type BuiltAiSuggestionPayload<TDraft extends AiSuggestionPayloadDraft> = TDraft extends {
  suggestionKind: infer TKind;
  payloadVersion: infer TVersion;
}
  ? Extract<AiSuggestionPayload, { suggestionKind: TKind; payloadVersion: TVersion }>
  : never;

export function buildAiSuggestionPayload<TDraft extends AiSuggestionPayloadDraft>(input: {
  payload: TDraft;
}): BuiltAiSuggestionPayload<TDraft> {
  const payload = {
    ...input.payload,
    fingerprint: input.payload.fingerprint ?? "pending",
  } as AiSuggestionPayload;
  payload.fingerprint = buildAiSuggestionPayloadFingerprint(payload);
  return validateAiSuggestionPayload(
    payload,
    payload.suggestionKind,
  ) as BuiltAiSuggestionPayload<TDraft>;
}

export function readAiSuggestionPayload(
  value: unknown,
  expectedKind: AiSuggestionPayloadKind,
): AiSuggestionPayloadReadResult {
  if (value === undefined || value === null) return { state: "missing" };

  try {
    if (isRecord(value) && "contractVersion" in value) {
      return {
        state: "current",
        payload: validateAiSuggestionPayload(value, expectedKind),
      };
    }

    const legacy = parseLegacyAiSuggestionPayload(value, expectedKind);
    if (legacy !== undefined) return { state: "legacy", payload: legacy };

    return {
      state: "invalid",
      error: new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_INVALID"),
    };
  } catch (error) {
    return {
      state: "invalid",
      error:
        error instanceof AiSuggestionPayloadError
          ? error
          : new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_INVALID"),
    };
  }
}

export function requireCurrentAiSuggestionPayload(
  value: unknown,
  expectedKind: AiSuggestionPayloadKind,
): AiSuggestionPayload {
  const result = readAiSuggestionPayload(value, expectedKind);
  if (result.state === "current") return result.payload;
  if (result.state === "missing") {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_MISSING");
  }
  if (result.state === "legacy") {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_VERSION_UNSUPPORTED");
  }
  throw result.error;
}

export function validateAiSuggestionPayload(
  value: unknown,
  expectedKind?: AiSuggestionPayloadKind,
): AiSuggestionPayload {
  const record = expectRecord(value);
  if (record.contractVersion !== AI_SUGGESTION_PAYLOAD_CONTRACT_VERSION) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_VERSION_UNSUPPORTED");
  }
  const suggestionKind = parseSuggestionKind(record.suggestionKind);
  if (expectedKind !== undefined && suggestionKind !== expectedKind) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_KIND_MISMATCH");
  }

  validateCommonFields(record);
  const payload =
    suggestionKind === "insight" && record.payloadVersion === 2
      ? parseCurrentInsightV2(record)
      : parseCurrentByKind(record, suggestionKind);
  const expectedFingerprint = buildAiSuggestionPayloadFingerprint(payload);
  if (payload.fingerprint.startsWith("sha256-") && payload.fingerprint !== expectedFingerprint) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_OBSOLETE");
  }
  if (!/^(?:sha256|db-fp-v1)-[a-f0-9]{64}$/.test(payload.fingerprint)) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_INVALID");
  }
  return payload;
}

export function buildAiSuggestionPayloadFingerprint(
  payload: Omit<AiSuggestionPayload, "fingerprint"> | AiSuggestionPayload,
): string {
  const record = expectRecord(payload);
  const withoutMutableAudit = { ...record };
  delete withoutMutableAudit.fingerprint;
  const audit = isRecord(record.audit) ? record.audit : undefined;
  if (typeof audit?.sourceFingerprint === "string") {
    withoutMutableAudit.audit = { sourceFingerprint: audit.sourceFingerprint };
  } else {
    delete withoutMutableAudit.audit;
  }
  return `sha256-${createHash("sha256").update(canonicalJson(withoutMutableAudit)).digest("hex")}`;
}

export interface ProjectLegacyAiSuggestionPayloadInput {
  expectedKind: AiSuggestionPayloadKind;
  legacyPayload: unknown;
  origin: AiSuggestionPayloadOrigin;
  target: AiSuggestionPayloadTarget;
  confidence?: number;
  audit: AiSuggestionPayloadAudit;
}

export function projectLegacyAiSuggestionPayloadForRead(
  input: ProjectLegacyAiSuggestionPayloadInput,
): AiSuggestionPayload {
  const legacy = parseLegacyAiSuggestionPayload(input.legacyPayload, input.expectedKind);
  if (legacy === undefined) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_INVALID");
  }
  return buildCurrentPayloadFromLegacy({
    expectedKind: input.expectedKind,
    legacy,
    origin: input.origin,
    target: input.target,
    ...(input.confidence === undefined ? {} : { confidence: input.confidence }),
    audit: input.audit,
  });
}

export interface MigrateLegacyAiSuggestionPayloadInput {
  expectedKind: AiSuggestionPayloadKind;
  status: AiSuggestionPayloadStatus;
  legacyPayload: unknown;
  origin: AiSuggestionPayloadOrigin;
  target: AiSuggestionPayloadTarget;
  confidence?: number;
  audit: AiSuggestionPayloadAudit;
}

export function migrateLegacyAiSuggestionPayload(
  input: MigrateLegacyAiSuggestionPayloadInput,
): AiSuggestionPayload {
  if (input.status !== "pending_review") {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_IMMUTABLE");
  }
  const legacy = parseLegacyAiSuggestionPayload(input.legacyPayload, input.expectedKind);
  if (legacy === undefined) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_INVALID");
  }
  return buildCurrentPayloadFromLegacy({
    expectedKind: input.expectedKind,
    legacy,
    origin: input.origin,
    target: input.target,
    ...(input.confidence === undefined ? {} : { confidence: input.confidence }),
    audit: input.audit,
  });
}

function buildCurrentPayloadFromLegacy(input: {
  expectedKind: AiSuggestionPayloadKind;
  legacy: LegacyAiSuggestionPayload;
  origin: AiSuggestionPayloadOrigin;
  target: AiSuggestionPayloadTarget;
  confidence?: number;
  audit: AiSuggestionPayloadAudit;
}): AiSuggestionPayload {
  if (input.expectedKind === "transaction_extraction") {
    if (!isLegacyTransactionExtractionPayload(input.legacy)) {
      throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_KIND_MISMATCH");
    }
    return buildAiSuggestionPayload({
      payload: {
        ...input.legacy,
        contractVersion: 1,
        suggestionKind: "transaction_extraction",
        origin: input.origin,
        target: input.target,
        ...(input.confidence === undefined ? {} : { confidence: input.confidence }),
        reasons: [],
        audit: input.audit,
      },
    });
  }
  if (input.expectedKind === "deduplication" || input.expectedKind === "reconciliation") {
    if (!isLegacyDeterministicReviewPayload(input.legacy)) {
      throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_KIND_MISMATCH");
    }
    return buildAiSuggestionPayload({
      payload: {
        ...input.legacy,
        contractVersion: 1,
        suggestionKind: input.expectedKind,
        origin: input.origin,
        target: input.target,
        ...(input.confidence === undefined ? {} : { confidence: input.confidence }),
        audit: input.audit,
      },
    });
  }
  throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_VERSION_UNSUPPORTED");
}

export function mutateAiSuggestionPayload<TPayload extends AiSuggestionPayload>(input: {
  payload: TPayload;
  status: AiSuggestionPayloadStatus;
  expectedFingerprint: string;
  mutation: (draft: TPayload) => TPayload;
  audit: AiSuggestionPayloadAudit;
}): TPayload {
  if (input.status !== "pending_review") {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_IMMUTABLE");
  }
  const current = validateAiSuggestionPayload(
    input.payload,
    input.payload.suggestionKind,
  ) as TPayload;
  if (current.fingerprint !== input.expectedFingerprint) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_CONFLICT");
  }
  const next = input.mutation(structuredClone(current));
  const withAudit = {
    ...next,
    audit: input.audit,
    fingerprint: "pending",
  } as TPayload;
  withAudit.fingerprint = buildAiSuggestionPayloadFingerprint(withAudit);
  return validateAiSuggestionPayload(withAudit, withAudit.suggestionKind) as TPayload;
}

export function assertAiSuggestionPayloadSourceCurrent(
  payload: AiSuggestionPayload,
  actualSourceFingerprint: string,
): void {
  const expectedSourceFingerprint =
    payload.audit.sourceFingerprint ??
    (payload.suggestionKind === "deduplication" || payload.suggestionKind === "reconciliation"
      ? payload.sourcePayloadFingerprint
      : undefined);
  if (
    expectedSourceFingerprint !== undefined &&
    expectedSourceFingerprint !== actualSourceFingerprint
  ) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_OBSOLETE");
  }
}

function parseCurrentInsightV2(record: Record<string, unknown>): InsightSuggestionPayloadV2 {
  assertAllowedInsightV2Keys(record);
  const currency = expectCurrency(record.currency);
  const filters = parseInsightFilters(record.filters);
  if (filters.currency !== currency) invalid();
  const evidence = parseInsightEvidence(record.evidence, currency);
  const comparison =
    record.comparison === undefined ? undefined : parseInsightComparison(record.comparison);
  const relatedEntityIds =
    record.relatedEntityIds === undefined
      ? undefined
      : expectBoundedStringArray(record.relatedEntityIds, 100);
  const navigation =
    record.navigation === undefined ? undefined : parseInsightNavigation(record.navigation);
  const dataFingerprint = expectString(record.dataFingerprint, 128);
  if (!/^sha256-[a-f0-9]{64}$/.test(dataFingerprint)) invalid();

  return {
    ...record,
    contractVersion: 1,
    suggestionKind: "insight",
    payloadVersion: 2,
    insightType: expectOneOf(record.insightType, ["anomaly", "trend", "summary", "opportunity"]),
    insightKind: expectOneOf(record.insightKind, [
      "category_spending_increase",
      "merchant_spending_increase",
      "probable_subscription",
      "negative_balance_risk",
      "budget_exceeded",
      "monthly_summary",
    ]),
    insightKey: expectString(record.insightKey, 256),
    title: expectString(record.title, 300),
    summary: expectString(record.summary, 2000),
    periodStartOn: expectIsoDate(record.periodStartOn),
    periodEndOn: expectIsoDate(record.periodEndOn),
    currency,
    filters,
    evidence,
    ...(comparison === undefined ? {} : { comparison }),
    limitations: expectBoundedStringArray(record.limitations, 20),
    calculationVersion: expectString(record.calculationVersion, 128),
    dataFingerprint,
    ...(relatedEntityIds === undefined ? {} : { relatedEntityIds }),
    ...(navigation === undefined ? {} : { navigation }),
  } as InsightSuggestionPayloadV2;
}

function parseInsightFilters(value: unknown): InsightFiltersV2 {
  const record = expectRecord(value);
  assertAllowedKeys(record, ["currency", "categoryId", "merchantKey"]);
  return {
    currency: expectCurrency(record.currency),
    ...optionalString(record, "categoryId", 128),
    ...optionalString(record, "merchantKey", 256),
  };
}

function parseInsightEvidence(value: unknown, currency: string): readonly InsightNumericEvidenceV2[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) invalid();
  return value.map((item) => {
    const record = expectRecord(item);
    assertAllowedKeys(record, ["label", "value", "unit", "currency"]);
    const unit = expectOneOf(record.unit, ["minor_currency", "count", "percentage"]);
    const itemCurrency =
      record.currency === undefined ? undefined : expectCurrency(record.currency);
    if (unit === "minor_currency" && itemCurrency !== currency) invalid();
    if (unit !== "minor_currency" && itemCurrency !== undefined) invalid();
    return {
      label: expectString(record.label, 128),
      value: expectFiniteNumber(record.value),
      unit,
      ...(itemCurrency === undefined ? {} : { currency: itemCurrency }),
    };
  });
}

function parseInsightComparison(value: unknown): InsightComparisonV2 {
  const record = expectRecord(value);
  assertAllowedKeys(record, [
    "kind",
    "currentValue",
    "previousValue",
    "unit",
    "percentChange",
    "previousPeriodStartOn",
    "previousPeriodEndOn",
  ]);
  const previousPeriodStartOn =
    record.previousPeriodStartOn === undefined ? undefined : expectIsoDate(record.previousPeriodStartOn);
  const previousPeriodEndOn =
    record.previousPeriodEndOn === undefined ? undefined : expectIsoDate(record.previousPeriodEndOn);
  if ((previousPeriodStartOn === undefined) !== (previousPeriodEndOn === undefined)) invalid();
  return {
    kind: expectOneOf(record.kind, ["previous_period", "planned_budget"]),
    currentValue: expectFiniteNumber(record.currentValue),
    previousValue: expectFiniteNumber(record.previousValue),
    unit: expectOneOf(record.unit, ["minor_currency", "count", "percentage"]),
    ...(record.percentChange === undefined
      ? {}
      : { percentChange: expectFiniteNumber(record.percentChange) }),
    ...(previousPeriodStartOn === undefined
      ? {}
      : { previousPeriodStartOn, previousPeriodEndOn: previousPeriodEndOn as string }),
  };
}

function parseInsightNavigation(value: unknown): InsightNavigationV2 {
  const record = expectRecord(value);
  assertAllowedKeys(record, ["view", "categoryId", "merchantKey"]);
  return {
    view: expectOneOf(record.view, ["transactions", "budgets", "cash_flow"]),
    ...optionalString(record, "categoryId", 128),
    ...optionalString(record, "merchantKey", 256),
  };
}

function assertAllowedInsightV2Keys(record: Record<string, unknown>): void {
  assertAllowedKeys(record, [
    "contractVersion",
    "suggestionKind",
    "origin",
    "fingerprint",
    "target",
    "confidence",
    "reasons",
    "audit",
    "payloadVersion",
    "insightType",
    "insightKind",
    "insightKey",
    "title",
    "summary",
    "periodStartOn",
    "periodEndOn",
    "currency",
    "filters",
    "evidence",
    "comparison",
    "limitations",
    "calculationVersion",
    "dataFingerprint",
    "relatedEntityIds",
    "navigation",
  ]);
}

function assertAllowedKeys(record: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  if (Object.keys(record).some((key) => !allowedSet.has(key))) invalid();
}

function expectOneOf<const TValues extends readonly string[]>(
  value: unknown,
  values: TValues,
): TValues[number] {
  if (typeof value !== "string" || !values.includes(value)) invalid();
  return value as TValues[number];
}

function expectString(value: unknown, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) invalid();
  return value;
}

function optionalString<TKey extends string>(
  record: Record<string, unknown>,
  key: TKey,
  maxLength: number,
): Partial<Record<TKey, string>> {
  return record[key] === undefined
    ? {}
    : ({ [key]: expectString(record[key], maxLength) } as Record<TKey, string>);
}

function expectFiniteNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) invalid();
  return value;
}

function expectCurrency(value: unknown): string {
  const currency = expectString(value, 3);
  if (!/^[A-Z]{3}$/.test(currency)) invalid();
  return currency;
}

function expectIsoDate(value: unknown): string {
  const date = expectString(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) invalid();
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) invalid();
  return date;
}

function expectBoundedStringArray(value: unknown, maxLength: number): readonly string[] {
  if (!Array.isArray(value) || value.length > maxLength) invalid();
  return value.map((item) => expectString(item, 2048));
}

function invalid(): never {
  throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_INVALID");
}
