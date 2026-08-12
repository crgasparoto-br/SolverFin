import type {
  AiSuggestionPayloadKind,
  PublicAiSuggestionPayload,
  PublicCategorizationProposal,
  PublicDeterministicReviewProposal,
  PublicInsightProposal,
  PublicInsightProposalV2,
  PublicTransactionExtractionProposal,
} from "@solverfin/domain/ai-suggestion-payloads";

export type AiSuggestionPayloadViewModel = PublicAiSuggestionPayload extends infer TPayload
  ? TPayload extends PublicAiSuggestionPayload
    ? {
        suggestionId: string;
        legacyProjection: boolean;
        kind: TPayload["suggestionKind"];
        versionLabel: string;
        confidence?: number;
        reasons: readonly string[];
        proposal: TPayload["proposal"];
        fingerprint: string;
      }
    : never
  : never;

export class AiSuggestionPayloadViewError extends Error {
  readonly code = "AI_SUGGESTION_PAYLOAD_RESPONSE_INVALID";

  constructor() {
    super("Nao foi possivel exibir os dados estruturados desta sugestao.");
    this.name = "AiSuggestionPayloadViewError";
  }
}

export function parseAiSuggestionPayloadResponse(value: unknown): AiSuggestionPayloadViewModel {
  const response = expectRecord(value);
  assertAllowedKeys(response, ["suggestionId", "legacyProjection", "payload"]);
  const suggestionId = expectString(response.suggestionId);
  if (typeof response.legacyProjection !== "boolean") fail();
  const payload = parsePublicPayload(response.payload);
  return {
    suggestionId,
    legacyProjection: response.legacyProjection,
    kind: payload.suggestionKind,
    versionLabel: `v${payload.contractVersion}.${payload.payloadVersion}`,
    ...(payload.confidence === undefined ? {} : { confidence: payload.confidence }),
    reasons: payload.reasons,
    proposal: payload.proposal,
    fingerprint: payload.fingerprint,
  } as AiSuggestionPayloadViewModel;
}

function parsePublicPayload(value: unknown): PublicAiSuggestionPayload {
  const record = expectRecord(value);
  assertAllowedKeys(record, [
    "contractVersion",
    "suggestionKind",
    "payloadVersion",
    "origin",
    "fingerprint",
    "confidence",
    "reasons",
    "target",
    "proposal",
  ]);
  if (record.contractVersion !== 1) fail();
  const suggestionKind = expectKind(record.suggestionKind);
  const payloadVersion = expectPayloadVersion(record.payloadVersion, suggestionKind);
  const origin = parseOrigin(record.origin);
  const target = parseTarget(record.target);
  const reasons = expectStringArray(record.reasons);
  const fingerprint = expectString(record.fingerprint);
  if (!/^(?:sha256|db-fp-v1)-[a-f0-9]{64}$/.test(fingerprint)) fail();
  const confidence = record.confidence;
  if (
    confidence !== undefined &&
    (typeof confidence !== "number" ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1)
  ) {
    fail();
  }
  const common = {
    contractVersion: 1 as const,
    origin,
    fingerprint,
    ...(confidence === undefined ? {} : { confidence: confidence as number }),
    reasons,
    target,
  };

  switch (suggestionKind) {
    case "transaction_extraction":
      return {
        ...common,
        suggestionKind,
        payloadVersion,
        proposal: parseTransactionProposal(record.proposal, payloadVersion),
      };
    case "categorization":
      return {
        ...common,
        suggestionKind,
        payloadVersion: 1,
        proposal: parseCategorizationProposal(record.proposal),
      };
    case "deduplication":
    case "reconciliation":
      return {
        ...common,
        suggestionKind,
        payloadVersion: 1,
        proposal: parseDeterministicProposal(record.proposal),
      };
    case "insight":
      if (payloadVersion === 1) {
        return {
          ...common,
          suggestionKind,
          payloadVersion,
          proposal: parseInsightProposalV1(record.proposal),
        };
      }
      return {
        ...common,
        suggestionKind,
        payloadVersion,
        proposal: parseInsightProposalV2(record.proposal),
      };
  }
}

function parseTransactionProposal(
  value: unknown,
  payloadVersion: 1 | 2,
): PublicTransactionExtractionProposal {
  const record = expectRecord(value);
  assertAllowedKeys(record, [
    "occurredOn",
    "kind",
    "amountMinor",
    "currency",
    "description",
    "direction",
    "accountId",
    "otherAccountId",
    "categoryId",
  ]);
  const kind = expectOneOf(record.kind, ["income", "expense", "transfer"] as const);
  const direction =
    payloadVersion === 2
      ? expectOneOf(record.direction, ["inflow", "outflow"] as const)
      : undefined;
  if (
    payloadVersion === 1 &&
    (kind === "transfer" || record.direction !== undefined || record.otherAccountId !== undefined)
  ) {
    fail();
  }
  return {
    occurredOn: expectIsoDate(record.occurredOn),
    kind,
    amountMinor: expectPositiveInteger(record.amountMinor),
    currency: expectCurrency(record.currency),
    description: expectString(record.description),
    ...(direction === undefined ? {} : { direction }),
    ...optionalString(record, "accountId"),
    ...optionalString(record, "otherAccountId"),
    ...optionalString(record, "categoryId"),
  };
}

function parseCategorizationProposal(value: unknown): PublicCategorizationProposal {
  const record = expectRecord(value);
  assertAllowedKeys(record, [
    "targetEntityId",
    "targetTransactionId",
    "proposedCategoryId",
    "proposedAccountId",
    "proposedCardId",
    "proposedStatus",
    "previousCategoryId",
  ]);
  return {
    ...optionalString(record, "targetEntityId"),
    ...optionalString(record, "targetTransactionId"),
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
    ...optionalString(record, "previousCategoryId"),
  };
}

function parseDeterministicProposal(value: unknown): PublicDeterministicReviewProposal {
  const record = expectRecord(value);
  assertAllowedKeys(record, ["targetTransactionId", "conflicts"]);
  return {
    ...optionalString(record, "targetTransactionId"),
    conflicts: expectStringArray(record.conflicts),
  };
}

function parseInsightProposalV1(value: unknown): PublicInsightProposal {
  const record = expectRecord(value);
  assertAllowedKeys(record, [
    "insightType",
    "title",
    "summary",
    "periodStartOn",
    "periodEndOn",
    "metric",
    "relatedEntityIds",
  ]);
  return {
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
    ...(record.metric === undefined ? {} : { metric: parseMetric(record.metric) }),
    ...(record.relatedEntityIds === undefined
      ? {}
      : { relatedEntityIds: expectStringArray(record.relatedEntityIds) }),
  };
}

function parseInsightProposalV2(value: unknown): PublicInsightProposalV2 {
  const record = expectRecord(value);
  assertAllowedKeys(record, [
    "insightType",
    "insightKind",
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
    "relatedEntityIds",
    "navigation",
  ]);
  const currency = expectCurrency(record.currency);
  const filters = parseInsightFilters(record.filters, currency);
  const evidence = parseInsightEvidence(record.evidence, currency);
  return {
    insightType: expectOneOf(record.insightType, [
      "anomaly",
      "trend",
      "summary",
      "opportunity",
    ] as const),
    insightKind: expectOneOf(record.insightKind, [
      "category_spending_increase",
      "merchant_spending_increase",
      "probable_subscription",
      "negative_balance_risk",
      "budget_exceeded",
      "monthly_summary",
    ] as const),
    title: expectString(record.title),
    summary: expectString(record.summary),
    periodStartOn: expectIsoDate(record.periodStartOn),
    periodEndOn: expectIsoDate(record.periodEndOn),
    currency,
    filters,
    evidence,
    ...(record.comparison === undefined
      ? {}
      : { comparison: parseInsightComparison(record.comparison) }),
    limitations: expectStringArray(record.limitations),
    calculationVersion: expectString(record.calculationVersion),
    ...(record.relatedEntityIds === undefined
      ? {}
      : { relatedEntityIds: expectStringArray(record.relatedEntityIds) }),
    ...(record.navigation === undefined
      ? {}
      : { navigation: parseInsightNavigation(record.navigation) }),
  };
}

function parseInsightFilters(value: unknown, currency: string): PublicInsightProposalV2["filters"] {
  const record = expectRecord(value);
  assertAllowedKeys(record, ["currency", "categoryId", "merchantKey"]);
  if (expectCurrency(record.currency) !== currency) fail();
  return {
    currency,
    ...optionalString(record, "categoryId"),
    ...optionalString(record, "merchantKey"),
  };
}

function parseInsightEvidence(
  value: unknown,
  currency: string,
): PublicInsightProposalV2["evidence"] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) fail();
  return value.map((item) => {
    const record = expectRecord(item);
    assertAllowedKeys(record, ["label", "value", "unit", "currency"]);
    const unit = expectOneOf(record.unit, ["minor_currency", "count", "percentage"] as const);
    const itemCurrency =
      record.currency === undefined ? undefined : expectCurrency(record.currency);
    if (unit === "minor_currency" && itemCurrency !== currency) fail();
    if (unit !== "minor_currency" && itemCurrency !== undefined) fail();
    return {
      label: expectString(record.label),
      value: expectFiniteNumber(record.value),
      unit,
      ...(itemCurrency === undefined ? {} : { currency: itemCurrency }),
    };
  });
}

function parseInsightComparison(
  value: unknown,
): NonNullable<PublicInsightProposalV2["comparison"]> {
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
    record.previousPeriodStartOn === undefined
      ? undefined
      : expectIsoDate(record.previousPeriodStartOn);
  const previousPeriodEndOn =
    record.previousPeriodEndOn === undefined
      ? undefined
      : expectIsoDate(record.previousPeriodEndOn);
  if ((previousPeriodStartOn === undefined) !== (previousPeriodEndOn === undefined)) fail();
  return {
    kind: expectOneOf(record.kind, ["previous_period", "planned_budget"] as const),
    currentValue: expectFiniteNumber(record.currentValue),
    previousValue: expectFiniteNumber(record.previousValue),
    unit: expectOneOf(record.unit, ["minor_currency", "count", "percentage"] as const),
    ...(record.percentChange === undefined
      ? {}
      : { percentChange: expectFiniteNumber(record.percentChange) }),
    ...(previousPeriodStartOn === undefined
      ? {}
      : { previousPeriodStartOn, previousPeriodEndOn: previousPeriodEndOn as string }),
  };
}

function parseInsightNavigation(
  value: unknown,
): NonNullable<PublicInsightProposalV2["navigation"]> {
  const record = expectRecord(value);
  assertAllowedKeys(record, ["view", "categoryId", "merchantKey"]);
  return {
    view: expectOneOf(record.view, ["transactions", "budgets", "cash_flow"] as const),
    ...optionalString(record, "categoryId"),
    ...optionalString(record, "merchantKey"),
  };
}

function parseMetric(value: unknown): {
  name: string;
  value: number;
  unit: "minor_currency" | "count" | "percentage";
  currency?: string;
} {
  const record = expectRecord(value);
  assertAllowedKeys(record, ["name", "value", "unit", "currency"]);
  return {
    name: expectString(record.name),
    value: expectFiniteNumber(record.value),
    unit: expectOneOf(record.unit, ["minor_currency", "count", "percentage"] as const),
    ...(record.currency === undefined ? {} : { currency: expectCurrency(record.currency) }),
  };
}

function parseOrigin(value: unknown): PublicAiSuggestionPayload["origin"] {
  const record = expectRecord(value);
  assertAllowedKeys(record, ["kind"]);
  return {
    kind: expectOneOf(record.kind, ["provider", "import", "rule", "automation", "system"] as const),
  };
}

function parseTarget(value: unknown): PublicAiSuggestionPayload["target"] {
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

function expectPayloadVersion(value: unknown, kind: AiSuggestionPayloadKind): 1 | 2 {
  if (!Number.isInteger(value)) fail();
  if (kind === "transaction_extraction" || kind === "insight") {
    if (value !== 1 && value !== 2) fail();
    return value;
  }
  if (value !== 1) fail();
  return 1;
}

function expectKind(value: unknown): AiSuggestionPayloadKind {
  return expectOneOf(value, [
    "transaction_extraction",
    "categorization",
    "deduplication",
    "reconciliation",
    "insight",
  ] as const);
}

function expectRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  return value as Record<string, unknown>;
}

function expectString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) fail();
  return value;
}

function expectStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > 100 || value.some((item) => !isString(item))) fail();
  return value as string[];
}

function expectPositiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) fail();
  return value as number;
}

function expectFiniteNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail();
  return value;
}

function expectCurrency(value: unknown): string {
  const currency = expectString(value);
  if (!/^[A-Z]{3}$/.test(currency)) fail();
  return currency;
}

function expectIsoDate(value: unknown): string {
  const date = expectString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail();
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) fail();
  return date;
}

function expectOneOf<const TValues extends readonly string[]>(
  value: unknown,
  values: TValues,
): TValues[number] {
  if (typeof value !== "string" || !values.includes(value)) fail();
  return value as TValues[number];
}

function optionalString<TKey extends string>(
  record: Record<string, unknown>,
  key: TKey,
): Partial<Record<TKey, string>> {
  const value = record[key];
  return value === undefined ? {} : ({ [key]: expectString(value) } as Record<TKey, string>);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 2048;
}

function assertAllowedKeys(record: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  if (Object.keys(record).some((key) => !allowedSet.has(key))) fail();
}

function fail(): never {
  throw new AiSuggestionPayloadViewError();
}
