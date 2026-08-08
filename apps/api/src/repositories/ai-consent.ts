import { randomUUID } from "node:crypto";

import type { AiConsentState } from "@solverfin/ai";
import type { TenantContext } from "@solverfin/domain";

import { query, withTransaction, type QueryExecutor } from "../db.js";

export type BankMessageAiConsentPurpose = "bank_message_processing" | "ai_processing";

export interface BankMessageAiConsentMutationOptions {
  correlationId?: string;
}

interface ConsentEventRow {
  purpose: string;
  result: string;
}

const CONSENT_ACTION = "PRIVACY_CONSENT_UPDATED";
const REQUIRED_PURPOSES: readonly BankMessageAiConsentPurpose[] = [
  "bank_message_processing",
  "ai_processing",
];

export async function grantBankMessageAiConsentForContext(
  context: TenantContext,
  options: BankMessageAiConsentMutationOptions = {},
): Promise<void> {
  await withTransaction(async (executeQuery) => {
    await lockConsentScope(executeQuery, context);
    const current = await readLatestConsentStates(context, executeQuery);
    for (const purpose of REQUIRED_PURPOSES) {
      if (current.get(purpose) === "granted") continue;
      await insertConsentEvent(executeQuery, context, purpose, "granted", options.correlationId);
    }
  });
}

export async function revokeBankMessageAiConsentForContext(
  context: TenantContext,
  options: BankMessageAiConsentMutationOptions = {},
): Promise<void> {
  await withTransaction(async (executeQuery) => {
    await lockConsentScope(executeQuery, context);
    const current = await readLatestConsentStates(context, executeQuery);
    for (const purpose of REQUIRED_PURPOSES) {
      if (current.get(purpose) === "revoked") continue;
      await insertConsentEvent(executeQuery, context, purpose, "revoked", options.correlationId);
    }
  });
}

export async function resolveBankMessageAiConsentForContext(
  context: TenantContext,
): Promise<AiConsentState> {
  const current = await readLatestConsentStates(context, query);
  if (REQUIRED_PURPOSES.some((purpose) => current.get(purpose) === "revoked")) {
    return "revoked";
  }
  return REQUIRED_PURPOSES.every((purpose) => current.get(purpose) === "granted")
    ? "granted"
    : "missing";
}

export async function resolveAiProcessingConsentForContext(
  context: TenantContext,
): Promise<AiConsentState> {
  const current = await readLatestConsentStates(context, query);
  return current.get("ai_processing") ?? "missing";
}

async function lockConsentScope(
  executeQuery: QueryExecutor,
  context: TenantContext,
): Promise<void> {
  await executeQuery(`select pg_advisory_xact_lock(hashtext($1), hashtext($2))`, [
    `${context.organizationId}:${context.financialProfileId}`,
    `${context.userId}:bank-message-ai-consent`,
  ]);
}

async function readLatestConsentStates(
  context: TenantContext,
  executeQuery: QueryExecutor,
): Promise<Map<BankMessageAiConsentPurpose, AiConsentState>> {
  const rows = await executeQuery<ConsentEventRow>(
    `select distinct on (metadata->>'purpose')
       metadata->>'purpose' as purpose,
       lower("result") as result
     from "SecurityAuditEvent"
     where "userId" = $1
       and "action" = $2
       and metadata->>'organizationId' = $3
       and metadata->>'financialProfileId' = $4
       and metadata->>'purpose' = any($5::text[])
     order by metadata->>'purpose', "occurredAt" desc, "id" desc`,
    [
      context.userId,
      CONSENT_ACTION,
      context.organizationId,
      context.financialProfileId,
      [...REQUIRED_PURPOSES],
    ],
  );
  const result = new Map<BankMessageAiConsentPurpose, AiConsentState>();

  for (const row of rows) {
    if (!isConsentPurpose(row.purpose)) continue;
    if (row.result === "granted" || row.result === "revoked") {
      result.set(row.purpose, row.result);
    }
  }

  return result;
}

async function insertConsentEvent(
  executeQuery: QueryExecutor,
  context: TenantContext,
  purpose: BankMessageAiConsentPurpose,
  status: Exclude<AiConsentState, "missing">,
  correlationId?: string,
): Promise<void> {
  await executeQuery(
    `insert into "SecurityAuditEvent"
      ("id", "userId", "sessionId", "occurredAt", "action", "result", "correlationId", "metadata")
     values ($1, $2, null, clock_timestamp(), $3, $4, $5, $6::jsonb)`,
    [
      randomUUID(),
      context.userId,
      CONSENT_ACTION,
      status.toUpperCase(),
      correlationId ?? null,
      JSON.stringify({
        organizationId: context.organizationId,
        financialProfileId: context.financialProfileId,
        purpose,
        source: "api",
      }),
    ],
  );
}

function isConsentPurpose(value: string): value is BankMessageAiConsentPurpose {
  return value === "bank_message_processing" || value === "ai_processing";
}
