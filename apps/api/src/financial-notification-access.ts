import { randomUUID } from "node:crypto";

import { TenantAuthorizationError, type TenantContext } from "@solverfin/domain";

import { query, withSharedTransaction } from "./db.js";
import {
  FINANCIAL_NOTIFICATION_CHANNELS,
  FINANCIAL_NOTIFICATION_EVENT_TYPES,
  isUuid,
  parseNotificationChannel,
  parseNotificationEventType,
  projectNotification,
  type FinancialNotificationChannel,
  type FinancialNotificationEventType,
  type FinancialNotificationItem,
  type FinancialNotificationPage,
  type NotificationRow,
} from "./financial-notifications-contract.js";
import {
  assertFinancialNotificationScope,
  assertResourceAllowed,
  lockPreferenceOrdering,
  notFound,
} from "./financial-notification-scope.js";
import { insertAuditLogEntry } from "./repositories/audit.js";

interface CountRow {
  count: string;
}

interface PreferenceRow {
  eventType: string;
  channel: string;
  enabled: boolean;
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
      'and "inAppVisible"=true',
    ].join(" ");
    const rows = await executeQuery<NotificationRow>(
      [
        'select "id","eventType","facts","resourceKind","resourceId","occurredAt","createdAt","readAt","inAppVisible"',
        where,
        'order by "occurredAt" desc, "id" desc limit $4 offset $5',
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

export async function countUnreadFinancialNotificationsForContext(
  context: TenantContext,
): Promise<number> {
  await assertFinancialNotificationScope(context);
  const rows = await query<CountRow>(
    [
      'select count(*)::text as "count" from "FinancialNotification"',
      'where "organizationId"=$1 and "financialProfileId"=$2 and "recipientUserId"=$3',
      'and "inAppVisible"=true and "readAt" is null',
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
        'select "id","eventType","facts","resourceKind","resourceId","occurredAt","createdAt","readAt","inAppVisible"',
        'from "FinancialNotification" where "id"=$1 and "organizationId"=$2',
        'and "financialProfileId"=$3 and "recipientUserId"=$4 and "inAppVisible"=true for update',
      ].join(" "),
      params,
    );
    const existing = rows[0];
    if (!existing) throw notFound();
    if ((existing.readAt !== null) === read) return projectNotification(existing);
    const changed = (
      await executeQuery<NotificationRow>(
        [
          'update "FinancialNotification" set "readAt" = $5, "updatedAt"=now()',
          'where "id"=$1 and "organizationId"=$2 and "financialProfileId"=$3 and "recipientUserId"=$4',
          'and "inAppVisible"=true',
          'returning "id","eventType","facts","resourceKind","resourceId","occurredAt","createdAt","readAt","inAppVisible"',
        ].join(" "),
        [...params, read ? new Date().toISOString() : null],
      )
    )[0];
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
      redactedChanges: { readAt: read ? "added" : "removed" },
    });
    return projectNotification(changed);
  });
}

export async function listFinancialNotificationPreferencesForContext(
  context: TenantContext,
): Promise<
  Array<{
    type: FinancialNotificationEventType;
    channel: FinancialNotificationChannel;
    enabled: boolean;
  }>
> {
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
      type,
      channel,
      enabled: overrides.get(type + ":" + channel) ?? channel === "in_app",
    })),
  );
}

export async function setFinancialNotificationPreferenceForContext(
  context: TenantContext,
  input: {
    type: FinancialNotificationEventType;
    channel: FinancialNotificationChannel;
    enabled: boolean;
  },
  correlationId?: string,
): Promise<{
  type: FinancialNotificationEventType;
  channel: FinancialNotificationChannel;
  enabled: boolean;
}> {
  const type = parseNotificationEventType(input.type);
  const channel = parseNotificationChannel(input.channel);
  if (typeof input.enabled !== "boolean") throw invalid("NOTIFICATION_PREFERENCE_INVALID");
  return withSharedTransaction(async (executeQuery) => {
    await assertFinancialNotificationScope(context, executeQuery);
    await lockPreferenceOrdering(executeQuery, context, type);
    const params = [
      context.organizationId,
      context.financialProfileId,
      context.userId,
      type,
      channel,
    ];
    const existing = (
      await executeQuery<{ id: string; enabled: boolean }>(
        [
          'select "id","enabled" from "FinancialNotificationPreference"',
          'where "organizationId"=$1 and "financialProfileId"=$2 and "recipientUserId"=$3',
          'and "eventType"=$4 and "channel"=$5 for update',
        ].join(" "),
        params,
      )
    )[0];
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
        'and "inAppVisible"=true',
      ].join(" "),
      [id, context.organizationId, context.financialProfileId, context.userId],
    );
    const notification = rows[0];
    if (!notification) throw notFound();
    if (!notification.resourceKind || !notification.resourceId)
      return { available: false, href: null };
    const kind = notification.resourceKind;
    if (kind !== "ai_suggestion" && kind !== "budget" && kind !== "invoice") {
      return { available: false, href: null };
    }
    try {
      await assertResourceAllowed(context, { kind, id: notification.resourceId }, executeQuery);
    } catch (error) {
      if (error instanceof TenantAuthorizationError) return { available: false, href: null };
      throw error;
    }
    const href = {
      ai_suggestion: "/inbox#financial-insights",
      budget: "/orcamentos",
      invoice: "/cartoes",
    }[kind];
    return { available: true, href };
  });
}

