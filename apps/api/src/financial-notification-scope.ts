import { TenantAuthorizationError, type TenantContext } from "@solverfin/domain";

import { query, type QueryExecutor } from "./db.js";
import type {
  FinancialNotificationChannel,
  FinancialNotificationEvent,
  FinancialNotificationEventType,
} from "./financial-notifications-contract.js";

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

export async function lockPreferenceOrdering(
  executeQuery: QueryExecutor,
  context: TenantContext,
  type: FinancialNotificationEventType,
): Promise<void> {
  await executeQuery("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
    context.organizationId + ":" + context.financialProfileId + ":" + context.userId + ":" + type,
  ]);
}

export async function assertResourceAllowed(
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

export function notFound(): TenantAuthorizationError {
  return new TenantAuthorizationError(
    "TENANT_RESOURCE_NOT_FOUND",
    "Recurso indisponível no perfil financeiro ativo.",
    404,
  );
}
