import { randomUUID } from "node:crypto";

import { TenantAuthorizationError, type TenantContext } from "@solverfin/domain";

import { query, withSharedTransaction, type QueryExecutor } from "./db.js";
import { insertAuditLogEntry } from "./repositories/audit.js";

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

interface NotificationRow {
  id: string;
  eventType: string;
  facts: unknown;
  occurredAt: Date;
  createdAt: Date;
  readAt: Date | null;
  resourceKind: string | null;
  resourceId: string | null;
}

interface CountRow {
  count: string;
}

interface PreferenceRow {
  eventType: string;
  channel: string;
  enabled: boolean;
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
  if (typeof value === "string" && FINANCIAL_NOTIFICATION_EVENT_TYPES.some((type) => type === value)) {
    return value as FinancialNotificationEventType;
  }
  throw invalid("NOTIFICATION_EVENT_TYPE_INVALID");
}

export function parseNotificationChannel(value: unknown): FinancialNotificationChannel {
  if (typeof value === "string" && FINANCIAL_NOTIFICATION_CHANNELS.some((channel) => channel === value)) {
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
  if (!isRecord(input) || !exactKeys(input, ["type", "fingerprint", "occurredAt", "facts", "resource"])) {
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

export async function assertFinancialNotificationScope(
  context: TenantContext,
  executeQuery: QueryExecutor = query,
): Promise<void> {
  const rows = await executeQuery<{ id: string }>(
    [
      'select p."id" from "FinancialProfile" p',
      'join "User" u on u."id" = p."ownerUserId"',
      'where p."id" = $1 and p."organizationId" = $2 and p."ownerUserId" = $3',
      "and p.\"status\" = 'ACTIVE' and u.\"status\" = 'ACTIVE'",
      "for share of p, u",
    ].join(" "),
    [context.financialProfileId, context.organizationId, context.userId],
  );
  if (rows.length !== 1) throw notFound();
}

export async function readEffectiveNotificationPreference(
  context: TenantContext,
  type: FinancialNotificationEventType,
  channel: FinancialNotificationChannel,
  executeQuery: QueryExecutor = query,
): Promise<boolean> {
  const rows = await executeQuery<{ enabled: boolean }>(
    [
      'select "enabled" from "FinancialNotificationPreference"',
      'where "organizationId" = $1 and "financialProfileId" = $2 and "recipientUserId" = $3',
      'and "eventType" = $4 and "channel" = $5',
    ].join(" "),
    [context.organizationId, context.financialProfileId, context.userId, type, channel],
  );
  return rows[0]?.enabled ?? channel === "in_app";
}

async function lockPreferenceOrdering(
  executeQuery: QueryExecutor,
  context: TenantContext,
  type: FinancialNotificationEventType,
): Promise<void> {
  await executeQuery(
    "select pg_advisory_xact_lock(hashtextextended($1, 0))",
    [context.organizationId + ":" + context.financialProfileId + ":" + context.userId + ":" + type],
  );
}

async function assertResourceAllowed(
  context: TenantContext,
  resource: NonNullable<FinancialNotificationEvent["resource"]>,
  executeQuery: QueryExecutor,
): Promise<void> {
  const table = {
    ai_suggestion: "AiSuggestion",
    budget: "Budget",
    invoice: "Invoice",
  }[resource.kind];
  const rows = await executeQuery<{ id: string }>(
    [
      'select "id" from "' + table + '"',
      'where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3',
    ].join(" "),
    [resource.id, context.organizationId, context.financialProfileId],
  );
  if (rows.length !== 1) throw notFound();
}

/** Internal-only producer; financial calculation and event existence belong to the caller. */
export async function publishFinancialNotificationForContext(
  context: TenantContext,
  event: FinancialNotificationEvent,
): Promise<{ notification: FinancialNotificationItem | null; created: boolean; suppressed: boolean }> {
  validateFinancialNotificationEvent(event);
  return withSharedTransaction(async (executeQuery) => {
    await assertFinancialNotificationScope(context, executeQuery);
    await lockPreferenceOrdering(executeQuery, context, event.type);
    if (!(await readEffectiveNotificationPreference(context, event.type, "in_app", executeQuery))) {
      return { notification: null, created: false, suppressed: true };
    }
    if (event.resource) await assertResourceAllowed(context, event.resource, executeQuery);
    const id = randomUUID();
    const parameters = [
      id, context.organizationId, context.financialProfileId, context.userId,
      event.type, event.fingerprint, JSON.stringify(event.facts),
      event.resource?.kind ?? null, event.resource?.id ?? null, event.occurredAt,
    ];
    const inserted = await executeQuery<NotificationRow>(
      [
        'insert into "FinancialNotification"',
        '("id","organizationId","financialProfileId","recipientUserId","eventType","fingerprint",',
        '"facts","resourceKind","resourceId","occurredAt","updatedAt")',
        "values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,now())",
        'on conflict ("organizationId","financialProfileId","recipientUserId","eventType","fingerprint")',
        "do nothing",
        'returning "id","eventType","facts","resourceKind","resourceId","occurredAt","createdAt","readAt"',
      ].join(" "),
      parameters,
    );
    const row = inserted[0] ?? (await executeQuery<NotificationRow>(
      [
        'select "id","eventType","facts","resourceKind","resourceId","occurredAt","createdAt","readAt"',
        'from "FinancialNotification" where "organizationId"=$1 and "financialProfileId"=$2',
        'and "recipientUserId"=$3 and "eventType"=$4 and "fingerprint"=$5',
      ].join(" "),
      [context.organizationId, context.financialProfileId, context.userId, event.type, event.fingerprint],
    ))[0];
    if (!row) throw new FinancialNotificationError("NOTIFICATION_CONFLICT", "Falha na identidade do evento.", 409);
    if (
      !sameFacts(row.facts, event.facts) ||
      row.occurredAt.toISOString() !== event.occurredAt ||
      row.resourceKind !== (event.resource?.kind ?? null) ||
      row.resourceId !== (event.resource?.id ?? null)
    ) {
      throw new FinancialNotificationError(
        "NOTIFICATION_FINGERPRINT_CONFLICT",
        "O mesmo fingerprint não pode representar fatos diferentes.",
        409,
      );
    }
    if (inserted.length !== 0) {
      for (const channel of ["push", "email"] as const) {
        if (await readEffectiveNotificationPreference(context, event.type, channel, executeQuery)) {
          await executeQuery(
            [
              'insert into "FinancialNotificationDelivery"',
              '("id","organizationId","financialProfileId","recipientUserId","notificationId","channel","updatedAt")',
              "values ($1,$2,$3,$4,$5,$6,now()) on conflict (\"notificationId\",\"channel\") do nothing",
            ].join(" "),
            [randomUUID(), context.organizationId, context.financialProfileId, context.userId, row.id, channel],
          );
        }
      }
      await insertAuditLogEntry(executeQuery, {
        organizationId: context.organizationId,
        financialProfileId: context.financialProfileId,
        occurredAt: new Date().toISOString(),
        actorKind: "system",
        action: "create",
        entityKind: "financial_notification",
        entityId: row.id,
        redactedChanges: { event: "created" },
      });
    }
    return { notification: projectNotification(row), created: inserted.length > 0, suppressed: false };
  });
}

export async function listFinancialNotificationsForContext(
  context: TenantContext,
  input: { limit: number; offset: number },
): Promise<FinancialNotificationPage> {
  return withSharedTransaction(async (executeQuery) => {
    await assertFinancialNotificationScope(context, executeQuery);
    const params = [context.organizationId, context.financialProfileId, context.userId];
    const where = [
      'from "FinancialNotification"',
      'where "organizationId"=$1 and "financialProfileId"=$2 and "recipientUserId"=$3',
    ].join(" ");
    const rows = await executeQuery<NotificationRow>(
      [
        'select "id","eventType","facts","resourceKind","resourceId","occurredAt","createdAt","readAt"',
        where, 'order by "occurredAt" desc, "id" desc limit $4 offset $5',
      ].join(" "),
      [...params, input.limit, input.offset],
    );
    const [counts] = await executeQuery<{ total: string; unread: string }>(
      [
        'select count(*)::text as "total",',
        'count(*) filter (where "readAt" is null)::text as "unread"',
        where,
      ].join(" "),
      params,
    );
    const total = Number(counts?.total ?? 0);
    return {
      items: rows.map(projectNotification),
      total,
      unreadCount: Number(counts?.unread ?? 0),
      nextOffset: input.offset + rows.length < total ? input.offset + rows.length : null,
    };
  });
}

export async function countUnreadFinancialNotificationsForContext(context: TenantContext): Promise<number> {
  await assertFinancialNotificationScope(context);
  const rows = await query<CountRow>(
    [
      'select count(*)::text as "count" from "FinancialNotification"',
      'where "organizationId"=$1 and "financialProfileId"=$2 and "recipientUserId"=$3',
      'and "readAt" is null',
    ].join(" "),
    [context.organizationId, context.financialProfileId, context.userId],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function setFinancialNotificationReadStateForContext(
  context: TenantContext,
  id: string,
  read: boolean,
  correlationId?: string,
): Promise<FinancialNotificationItem> {
  if (!isUuid(id)) throw notFound();
  return withSharedTransaction(async (executeQuery) => {
    await assertFinancialNotificationScope(context, executeQuery);
    const params = [id, context.organizationId, context.financialProfileId, context.userId];
    const rows = await executeQuery<NotificationRow>(
      [
        'select "id","eventType","facts","resourceKind","resourceId","occurredAt","createdAt","readAt"',
        'from "FinancialNotification" where "id"=$1 and "organizationId"=$2',
        'and "financialProfileId"=$3 and "recipientUserId"=$4 for update',
      ].join(" "),
      params,
    );
    const existing = rows[0];
    if (!existing) throw notFound();
    if ((existing.readAt !== null) === read) return projectNotification(existing);
    const changed = (await executeQuery<NotificationRow>(
      [
        'update "FinancialNotification" set "readAt" = $5, "updatedAt"=now()',
        'where "id"=$1 and "organizationId"=$2 and "financialProfileId"=$3 and "recipientUserId"=$4',
        'returning "id","eventType","facts","resourceKind","resourceId","occurredAt","createdAt","readAt"',
      ].join(" "),
      [...params, read ? new Date().toISOString() : null],
    ))[0];
    if (!changed) throw notFound();
    await insertAuditLogEntry(executeQuery, {
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      occurredAt: new Date().toISOString(),
      actorKind: "user",
      actorId: context.userId,
      action: "update",
      entityKind: "financial_notification",
      entityId: id,
      ...(correlationId ? { correlationId } : {}),
      redactedChanges: { readAt: read ? "added" : "cleared" },
    });
    return projectNotification(changed);
  });
}

export async function listFinancialNotificationPreferencesForContext(
  context: TenantContext,
): Promise<Array<{ type: FinancialNotificationEventType; channel: FinancialNotificationChannel; enabled: boolean }>> {
  await assertFinancialNotificationScope(context);
  const rows = await query<PreferenceRow>(
    [
      'select "eventType","channel","enabled" from "FinancialNotificationPreference"',
      'where "organizationId"=$1 and "financialProfileId"=$2 and "recipientUserId"=$3',
    ].join(" "),
    [context.organizationId, context.financialProfileId, context.userId],
  );
  const overrides = new Map(rows.map((row) => [row.eventType + ":" + row.channel, row.enabled]));
  return FINANCIAL_NOTIFICATION_EVENT_TYPES.flatMap((type) =>
    FINANCIAL_NOTIFICATION_CHANNELS.map((channel) => ({
      type, channel, enabled: overrides.get(type + ":" + channel) ?? channel === "in_app",
    })),
  );
}

export async function setFinancialNotificationPreferenceForContext(
  context: TenantContext,
  input: { type: FinancialNotificationEventType; channel: FinancialNotificationChannel; enabled: boolean },
  correlationId?: string,
): Promise<{ type: FinancialNotificationEventType; channel: FinancialNotificationChannel; enabled: boolean }> {
  const type = parseNotificationEventType(input.type);
  const channel = parseNotificationChannel(input.channel);
  if (typeof input.enabled !== "boolean") throw invalid("NOTIFICATION_PREFERENCE_INVALID");
  return withSharedTransaction(async (executeQuery) => {
    await assertFinancialNotificationScope(context, executeQuery);
    await lockPreferenceOrdering(executeQuery, context, type);
    const params = [context.organizationId, context.financialProfileId, context.userId, type, channel];
    const existing = (await executeQuery<{ id: string; enabled: boolean }>(
      [
        'select "id","enabled" from "FinancialNotificationPreference"',
        'where "organizationId"=$1 and "financialProfileId"=$2 and "recipientUserId"=$3',
        'and "eventType"=$4 and "channel"=$5 for update',
      ].join(" "),
      params,
    ))[0];
    if (existing?.enabled === input.enabled) return { type, channel, enabled: input.enabled };
    const id = existing?.id ?? randomUUID();
    if (existing) {
      await executeQuery(
        'update "FinancialNotificationPreference" set "enabled"=$2,"updatedAt"=now() where "id"=$1',
        [id, input.enabled],
      );
    } else {
      await executeQuery(
        [
          'insert into "FinancialNotificationPreference"',
          '("id","organizationId","financialProfileId","recipientUserId","eventType","channel","enabled","updatedAt")',
          "values ($1,$2,$3,$4,$5,$6,$7,now())",
        ].join(" "),
        [id, ...params, input.enabled],
      );
    }
    await insertAuditLogEntry(executeQuery, {
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      occurredAt: new Date().toISOString(),
      actorKind: "user",
      actorId: context.userId,
      action: existing ? "update" : "create",
      entityKind: "financial_notification",
      entityId: id,
      ...(correlationId ? { correlationId } : {}),
      redactedChanges: { preference: "changed" },
    });
    return { type, channel, enabled: input.enabled };
  });
}

export async function getFinancialNotificationNavigationForContext(
  context: TenantContext,
  id: string,
): Promise<{ available: boolean; href: string | null }> {
  if (!isUuid(id)) throw notFound();
  return withSharedTransaction(async (executeQuery) => {
    await assertFinancialNotificationScope(context, executeQuery);
    const rows = await executeQuery<Pick<NotificationRow, "resourceKind" | "resourceId">>(
      [
        'select "resourceKind","resourceId" from "FinancialNotification"',
        'where "id"=$1 and "organizationId"=$2 and "financialProfileId"=$3 and "recipientUserId"=$4',
      ].join(" "),
      [id, context.organizationId, context.financialProfileId, context.userId],
    );
    const notification = rows[0];
    if (!notification) throw notFound();
    if (!notification.resourceKind || !notification.resourceId) return { available: false, href: null };
    const kind = notification.resourceKind;
    if (kind !== "ai_suggestion" && kind !== "budget" && kind !== "invoice") {
      return { available: false, href: null };
    }
    try {
      await assertResourceAllowed(
        context,
        { kind, id: notification.resourceId },
        executeQuery,
      );
    } catch (error) {
      if (error instanceof TenantAuthorizationError) return { available: false, href: null };
      throw error;
    }
    const href = { ai_suggestion: "/inbox#financial-insights", budget: "/orcamentos", invoice: "/cartoes" }[kind];
    return { available: true, href };
  });
}

function sameFacts(actual: unknown, expected: FinancialNotificationFacts): boolean {
  if (!isRecord(actual)) return false;
  const keys = Object.keys(expected).sort();
  return Object.keys(actual).length === keys.length &&
    keys.every((key) => actual[key] === expected[key]);
}

function validateFacts(type: FinancialNotificationEventType, value: unknown): asserts value is FinancialNotificationFacts {
  if (!isRecord(value) || !exactKeys(value, ["code", "severity", "currency", "amountMinor", "effectiveOn"])) {
    throw invalid("NOTIFICATION_FACTS_INVALID");
  }
  if (value.code !== EVENT_CODES[type] || !["info", "warning", "critical"].includes(String(value.severity))) {
    throw invalid("NOTIFICATION_FACTS_INVALID");
  }
  if (value.currency !== undefined && (typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency))) {
    throw invalid("NOTIFICATION_FACTS_INVALID");
  }
  if (value.amountMinor !== undefined && (!Number.isSafeInteger(value.amountMinor) || value.currency === undefined)) {
    throw invalid("NOTIFICATION_FACTS_INVALID");
  }
  if (value.effectiveOn !== undefined && (typeof value.effectiveOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.effectiveOn))) {
    throw invalid("NOTIFICATION_FACTS_INVALID");
  }
}

function projectNotification(row: NotificationRow): FinancialNotificationItem {
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
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function exactKeys(object: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(object).every((key) => allowed.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function notFound(): TenantAuthorizationError {
  return new TenantAuthorizationError(
    "TENANT_RESOURCE_NOT_FOUND",
    "Recurso indisponível no perfil financeiro ativo.",
    404,
  );
}

function invalid(code: string): FinancialNotificationError {
  return new FinancialNotificationError(code, "Contrato de notificação inválido.", 400);
}
