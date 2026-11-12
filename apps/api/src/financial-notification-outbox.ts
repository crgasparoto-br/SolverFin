import { randomUUID } from "node:crypto";

import type { TenantContext } from "@solverfin/domain";

import { withSharedTransaction } from "./db.js";
import {
  assertFinancialNotificationScope,
  readEffectiveNotificationPreference,
  type ExternalNotificationChannel,
  type FinancialNotificationEventType,
  type FinancialNotificationFacts,
} from "./financial-notifications.js";

/**
 * No adapter is registered or scheduled in production by #693.
 * External channels require a later explicit rollout and provider contract.
 */
export interface FinancialNotificationAdapter {
  readonly channel: ExternalNotificationChannel;
  deliver(input: {
    idempotencyKey: string;
    eventType: FinancialNotificationEventType;
    facts: FinancialNotificationFacts;
  }): Promise<void>;
}

type DeliveryResult = "disabled" | "not_due" | "delivered" | "retry";

interface DeliveryRow {
  id: string;
  channel: string;
  state: string;
  attempts: number;
  nextAttemptAt: Date;
  lockedUntil: Date | null;
  eventType: FinancialNotificationEventType;
  facts: FinancialNotificationFacts;
}

interface Claim {
  token: string;
  delivery: DeliveryRow;
}

export async function retryFinancialNotificationDeliveryForContext(
  context: TenantContext,
  deliveryId: string,
  adapter: FinancialNotificationAdapter,
  options: { externalDeliveryEnabled?: boolean; now?: Date } = {},
): Promise<DeliveryResult> {
  // No provider, worker, credentials, or external delivery is enabled by this issue.
  if (!options.externalDeliveryEnabled) return "disabled";
  if (adapter.channel !== "push" && adapter.channel !== "email") {
    throw new Error("NOTIFICATION_ADAPTER_CHANNEL_INVALID");
  }
  const now = options.now ?? new Date();
  const claim = await withSharedTransaction(async (executeQuery): Promise<Claim | DeliveryResult> => {
    await assertFinancialNotificationScope(context, executeQuery);
    const rows = await executeQuery<DeliveryRow>(
      [
        'select d."id",d."channel",d."state",d."attempts",d."nextAttemptAt",d."lockedUntil",',
        'n."eventType",n."facts" from "FinancialNotificationDelivery" d',
        'join "FinancialNotification" n on n."id" = d."notificationId"',
        'and n."organizationId" = d."organizationId"',
        'and n."financialProfileId" = d."financialProfileId"',
        'and n."recipientUserId" = d."recipientUserId"',
        'where d."id" = $1 and d."organizationId" = $2',
        'and d."financialProfileId" = $3 and d."recipientUserId" = $4',
        "for update of d",
      ].join(" "),
      [deliveryId, context.organizationId, context.financialProfileId, context.userId],
    );
    const delivery = rows[0];
    if (!delivery) return "not_due";
    if (delivery.channel !== adapter.channel) return "not_due";
    if (delivery.state === "delivered") return "delivered";
    if (delivery.state === "disabled") return "disabled";
    if (
      delivery.nextAttemptAt > now ||
      (delivery.state === "leased" && delivery.lockedUntil !== null && delivery.lockedUntil > now)
    ) {
      return "not_due";
    }
    const enabled = await readEffectiveNotificationPreference(
      context,
      delivery.eventType,
      adapter.channel,
      executeQuery,
    );
    if (!enabled) {
      await executeQuery(
        'update "FinancialNotificationDelivery" set "state"=$2,"updatedAt"=now() where "id"=$1',
        [delivery.id, "disabled"],
      );
      return "disabled";
    }
    const token = randomUUID();
    await executeQuery(
      [
        'update "FinancialNotificationDelivery" set "state"=$2,"attempts"="attempts"+1,',
        '"leaseToken"=$3,"lockedUntil"=$4,"lastErrorCode"=null,"updatedAt"=now()',
        'where "id"=$1',
      ].join(" "),
      [delivery.id, "leased", token, new Date(now.getTime() + 60_000).toISOString()],
    );
    return { token, delivery };
  });
  if (typeof claim === "string") return claim;

  // Authorization and current preference must remain valid immediately before any adapter call.
  const allowed = await withSharedTransaction(async (executeQuery) => {
    await assertFinancialNotificationScope(context, executeQuery);
    return readEffectiveNotificationPreference(
      context,
      claim.delivery.eventType,
      adapter.channel,
      executeQuery,
    );
  }).catch(() => false);
  if (!allowed) {
    await finishAttempt(context, claim, "disabled", now);
    return "disabled";
  }

  let result: "delivered" | "retry" = "delivered";
  try {
    await adapter.deliver({
      idempotencyKey: claim.delivery.id,
      eventType: claim.delivery.eventType,
      facts: claim.delivery.facts,
    });
  } catch {
    // Never persist provider diagnostics, raw payloads, email, secrets, or financial facts.
    result = "retry";
  }
  return finishAttempt(context, claim, result, now);
}

async function finishAttempt(
  context: TenantContext,
  claim: Claim,
  result: "disabled" | "delivered" | "retry",
  now: Date,
): Promise<DeliveryResult> {
  return withSharedTransaction(async (executeQuery) => {
    await assertFinancialNotificationScope(context, executeQuery);
    const delayMinutes = Math.min(60, 2 ** Math.min(claim.delivery.attempts, 6));
    const nextAttemptAt = new Date(now.getTime() + delayMinutes * 60_000).toISOString();
    const rows = await executeQuery<{ id: string }>(
      [
        'update "FinancialNotificationDelivery" set "state"=$5,',
        '"leaseToken"=null,"lockedUntil"=null,"nextAttemptAt"=$6,',
        '"lastErrorCode"=$7,"deliveredAt"=$8,"updatedAt"=now()',
        'where "id"=$1 and "organizationId"=$2 and "financialProfileId"=$3',
        'and "recipientUserId"=$4 and "leaseToken"=$9 and "state"=$10',
        'returning "id"',
      ].join(" "),
      [
        claim.delivery.id, context.organizationId, context.financialProfileId, context.userId,
        result, nextAttemptAt, result === "retry" ? "DELIVERY_RECOVERABLE" : null,
        result === "delivered" ? now.toISOString() : null,
        claim.token, "leased",
      ],
    );
    // Another worker may have reclaimed an expired lease: never overwrite its result.
    return rows.length === 1 ? result : "not_due";
  });
}
