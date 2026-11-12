import { isValidDateOnly } from "./installments-route-helpers.js";

export const FINANCIAL_NOTIFICATION_EVENT_TYPES = [
  "financial.insight.available.v1",
  "financial.budget.threshold.v1",
  "financial.invoice.due.v1",
  "financial.balance.warning.v1",
] as const;
export type FinancialNotificationEventType = (typeof FINANCIAL_NOTIFICATION_EVENT_TYPES)[number];

export const FINANCIAL_NOTIFICATION_CHANNELS = ["in_app", "push", "email"] as const;
export type FinancialNotificationChannel = (typeof FINANCIAL_NOTIFICATION_CHANNELS)[number];
export type ExternalNotificationChannel = Exclude<FinancialNotificationChannel, "in_app">;

const EVENT_CODES = {
  "financial.insight.available.v1": "insight_available",
  "financial.budget.threshold.v1": "budget_threshold",
  "financial.invoice.due.v1": "invoice_due",
  "financial.balance.warning.v1": "balance_warning",
} as const;

export type FinancialNotificationFacts = {
  code: (typeof EVENT_CODES)[FinancialNotificationEventType];
  severity: "info" | "warning" | "critical";
  currency?: string;
  amountMinor?: number;
  effectiveOn?: string;
};

export interface FinancialNotificationEvent {
  type: FinancialNotificationEventType;
  fingerprint: string;
  occurredAt: string;
  facts: FinancialNotificationFacts;
  resource?: {
    kind: "ai_suggestion" | "budget" | "invoice";
    id: string;
  };
}

export interface FinancialNotificationItem {
  id: string;
  type: FinancialNotificationEventType;
  occurredAt: string;
  createdAt: string;
  readAt: string | null;
  facts: FinancialNotificationFacts;
}

export interface FinancialNotificationPage {
  items: FinancialNotificationItem[];
  total: number;
  unreadCount: number;
  nextOffset: number | null;
}

export interface NotificationRow {
  id: string;
  eventType: string;
  facts: unknown;
  occurredAt: Date;
  createdAt: Date;
  readAt: Date | null;
  inAppVisible: boolean;
  resourceKind: string | null;
  resourceId: string | null;
}

export class FinancialNotificationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "FinancialNotificationError";
  }
}

export function parseNotificationEventType(value: unknown): FinancialNotificationEventType {
  if (
    typeof value === "string" &&
    FINANCIAL_NOTIFICATION_EVENT_TYPES.some((type) => type === value)
  ) {
    return value as FinancialNotificationEventType;
  }
  throw invalid("NOTIFICATION_EVENT_TYPE_INVALID");
}

export function parseNotificationChannel(value: unknown): FinancialNotificationChannel {
  if (
    typeof value === "string" &&
    FINANCIAL_NOTIFICATION_CHANNELS.some((channel) => channel === value)
  ) {
    return value as FinancialNotificationChannel;
  }
  throw invalid("NOTIFICATION_CHANNEL_INVALID");
}

export function parseNotificationPageFilters(queryParams: URLSearchParams): {
  limit: number;
  offset: number;
} {
  const parse = (key: string, fallback: number, max: number) => {
    const raw = queryParams.get(key);
    if (raw === null) return fallback;
    if (!/^(0|[1-9][0-9]*)$/.test(raw)) throw invalid("NOTIFICATION_PAGINATION_INVALID");
    const number = Number(raw);
    if (!Number.isSafeInteger(number) || number > max || (key === "limit" && number === 0)) {
      throw invalid("NOTIFICATION_PAGINATION_INVALID");
    }
    return number;
  };
  return { limit: parse("limit", 20, 100), offset: parse("offset", 0, 10000) };
}

export function validateFinancialNotificationEvent(input: FinancialNotificationEvent): void {
  if (
    !isRecord(input) ||
    !exactKeys(input, ["type", "fingerprint", "occurredAt", "facts", "resource"])
  ) {
    throw invalid("NOTIFICATION_EVENT_INVALID");
  }
  const type = parseNotificationEventType(input.type);
  if (typeof input.fingerprint !== "string" || !/^sha256-[0-9a-f]{64}$/.test(input.fingerprint)) {
    throw invalid("NOTIFICATION_FINGERPRINT_INVALID");
  }
  if (!isIsoInstant(input.occurredAt)) throw invalid("NOTIFICATION_OCCURRED_AT_INVALID");
  validateFacts(type, input.facts);
  if (input.resource !== undefined) {
    if (
      !isRecord(input.resource) ||
      !exactKeys(input.resource, ["kind", "id"]) ||
      !["ai_suggestion", "budget", "invoice"].includes(String(input.resource.kind)) ||
      !isUuid(input.resource.id)
    ) {
      throw invalid("NOTIFICATION_RESOURCE_INVALID");
    }
    const allowed: Record<FinancialNotificationEventType, readonly string[]> = {
      "financial.insight.available.v1": ["ai_suggestion"],
      "financial.budget.threshold.v1": ["budget"],
      "financial.invoice.due.v1": ["invoice"],
      "financial.balance.warning.v1": [],
    };
    if (!allowed[type].includes(String(input.resource.kind))) {
      throw invalid("NOTIFICATION_RESOURCE_INVALID");
    }
  }
}

function validateFacts(
  type: FinancialNotificationEventType,
  value: unknown,
): asserts value is FinancialNotificationFacts {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["code", "severity", "currency", "amountMinor", "effectiveOn"])
  ) {
    throw invalid("NOTIFICATION_FACTS_INVALID");
  }
  if (
    value.code !== EVENT_CODES[type] ||
    !["info", "warning", "critical"].includes(String(value.severity))
  ) {
    throw invalid("NOTIFICATION_FACTS_INVALID");
  }
  if (
    value.currency !== undefined &&
    (typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency))
  ) {
    throw invalid("NOTIFICATION_FACTS_INVALID");
  }
  if (
    value.amountMinor !== undefined &&
    (!Number.isSafeInteger(value.amountMinor) || value.currency === undefined)
  ) {
    throw invalid("NOTIFICATION_FACTS_INVALID");
  }
  if (
    value.effectiveOn !== undefined &&
    (typeof value.effectiveOn !== "string" || !isValidDateOnly(value.effectiveOn))
  ) {
    throw invalid("NOTIFICATION_FACTS_INVALID");
  }
}

export function projectNotification(row: NotificationRow): FinancialNotificationItem {
  const type = parseNotificationEventType(row.eventType);
  validateFacts(type, row.facts);
  return {
    id: row.id,
    type,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
    facts: row.facts,
  };
}

function isIsoInstant(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))
    return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function exactKeys(object: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(object).every((key) => allowed.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export function sameFacts(actual: unknown, expected: FinancialNotificationFacts): boolean {
  if (!isRecord(actual)) return false;
  const keys = Object.keys(expected).sort();
  return (
    Object.keys(actual).length === keys.length &&
    keys.every((key) => actual[key] === (expected as Record<string, unknown>)[key])
  );
}

function invalid(code: string): FinancialNotificationError {
  return new FinancialNotificationError(code, "Contrato de notificação inválido.", 400);
}
