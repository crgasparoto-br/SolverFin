import { randomUUID } from "node:crypto";

import type { TenantContext } from "@solverfin/domain";

import { withSharedTransaction } from "./db.js";
import {
  FinancialNotificationError,
  projectNotification,
  sameFacts,
  validateFinancialNotificationEvent,
  type ExternalNotificationChannel,
  type FinancialNotificationEvent,
  type FinancialNotificationItem,
  type NotificationRow,
} from "./financial-notifications-contract.js";
import {
  assertFinancialNotificationScope,
  assertResourceAllowed,
  lockPreferenceOrdering,
  readEffectiveNotificationPreference,
} from "./financial-notification-scope.js";
import { insertAuditLogEntry } from "./repositories/audit.js";

export {
  FINANCIAL_NOTIFICATION_CHANNELS,
  FINANCIAL_NOTIFICATION_EVENT_TYPES,
  FinancialNotificationError,
  parseNotificationChannel,
  parseNotificationEventType,
  parseNotificationPageFilters,
  validateFinancialNotificationEvent,
} from "./financial-notifications-contract.js";
export type {
  ExternalNotificationChannel,
  FinancialNotificationChannel,
  FinancialNotificationEvent,
  FinancialNotificationEventType,
  FinancialNotificationFacts,
  FinancialNotificationItem,
  FinancialNotificationPage,
} from "./financial-notifications-contract.js";
export {
  countUnreadFinancialNotificationsForContext,
  getFinancialNotificationNavigationForContext,
  listFinancialNotificationPreferencesForContext,
  listFinancialNotificationsForContext,
  setFinancialNotificationPreferenceForContext,
  setFinancialNotificationReadStateForContext,
} from "./financial-notification-access.js";
export {
  assertFinancialNotificationScope,
  readEffectiveNotificationPreference,
} from "./financial-notification-scope.js";

/** Internal-only producer; financial calculation and event existence belong to the caller. */
export async function publishFinancialNotificationForContext(
  context: TenantContext,
  event: FinancialNotificationEvent,
): Promise<{
  notification: FinancialNotificationItem | null;
  created: boolean;
  suppressed: boolean;
}> {
  validateFinancialNotificationEvent(event);
  return withSharedTransaction(async (executeQuery) => {
    await assertFinancialNotificationScope(context, executeQuery);
    await lockPreferenceOrdering(executeQuery, context, event.type);
    const inAppVisible = await readEffectiveNotificationPreference(
      context,
      event.type,
      "in_app",
      executeQuery,
    );
    const externalChannels: ExternalNotificationChannel[] = [];
    for (const channel of ["push", "email"] as const) {
      if (await readEffectiveNotificationPreference(context, event.type, channel, executeQuery)) {
        externalChannels.push(channel);
      }
    }
    // The in-app preference must never suppress an independently enabled external channel.
    if (!inAppVisible && externalChannels.length === 0) {
      return { notification: null, created: false, suppressed: true };
    }
    if (event.resource) await assertResourceAllowed(context, event.resource, executeQuery);
    const id = randomUUID();
    const parameters = [
      id,
      context.organizationId,
      context.financialProfileId,
      context.userId,
      event.type,
      event.fingerprint,
      JSON.stringify(event.facts),
      event.resource?.kind ?? null,
      event.resource?.id ?? null,
      event.occurredAt,
      inAppVisible,
    ];
    const inserted = await executeQuery<NotificationRow>(
      [
        'insert into "FinancialNotification"',
        '("id","organizationId","financialProfileId","recipientUserId","eventType","fingerprint",',
        '"facts","resourceKind","resourceId","occurredAt","inAppVisible","updatedAt")',
        "values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,now())",
        'on conflict ("organizationId","financialProfileId","recipientUserId","eventType","fingerprint")',
        "do nothing",
        'returning "id","eventType","facts","resourceKind","resourceId","occurredAt","createdAt","readAt","inAppVisible"',
      ].join(" "),
      parameters,
    );
    const row =
      inserted[0] ??
      (
        await executeQuery<NotificationRow>(
          [
            'select "id","eventType","facts","resourceKind","resourceId","occurredAt","createdAt","readAt","inAppVisible"',
            'from "FinancialNotification" where "organizationId"=$1 and "financialProfileId"=$2',
            'and "recipientUserId"=$3 and "eventType"=$4 and "fingerprint"=$5',
          ].join(" "),
          [
            context.organizationId,
            context.financialProfileId,
            context.userId,
            event.type,
            event.fingerprint,
          ],
        )
      )[0];
    if (!row)
      throw new FinancialNotificationError(
        "NOTIFICATION_CONFLICT",
        "Falha na identidade do evento.",
        409,
      );
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
      for (const channel of externalChannels) {
        await executeQuery(
          [
            'insert into "FinancialNotificationDelivery"',
            '("id","organizationId","financialProfileId","recipientUserId","notificationId","channel","updatedAt")',
            'values ($1,$2,$3,$4,$5,$6,now()) on conflict ("notificationId","channel") do nothing',
          ].join(" "),
          [
            randomUUID(),
            context.organizationId,
            context.financialProfileId,
            context.userId,
            row.id,
            channel,
          ],
        );
      }
      await insertAuditLogEntry(executeQuery, {
        organizationId: context.organizationId,
        financialProfileId: context.financialProfileId,
        occurredAt: new Date().toISOString(),
        actorKind: "system",
        action: "create",
        entityKind: "financial_notification",
        entityId: row.id,
        redactedChanges: { event: "added" },
      });
    }
    return {
      notification: row.inAppVisible ? projectNotification(row) : null,
      created: inserted.length > 0,
      suppressed: false,
    };
  });
}
