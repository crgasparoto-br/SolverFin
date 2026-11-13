import type { TenantContext } from "@solverfin/domain";

import { withTransaction, type QueryExecutor } from "./db.js";
import { insertAuditLogEntry } from "./repositories/audit.js";

const EXTRACTION_LEASE_MS = 2 * 60 * 1000;

/** Processing metadata is non-sensitive, persisted to allow a single crash-safe reclaim. */
export function processingOutcome(token: string): string {
  return JSON.stringify([
    {
      code: "BANK_MESSAGE_EXTRACTION_PROCESSING",
      message: "A mensagem está sendo processada. Atualize a Inbox para acompanhar o resultado.",
      source: "none",
      state: "processing",
      retryable: false,
      reviewReasons: [],
      processingToken: token,
    },
  ]);
}
export async function recordUserSubmissionAudit(
  executeQuery: QueryExecutor,
  input: {
    context: TenantContext;
    importBatchId: string;
    now: string;
    action: "create" | "update";
    reason: string;
  },
): Promise<void> {
  await insertAuditLogEntry(executeQuery, {
    organizationId: input.context.organizationId,
    financialProfileId: input.context.financialProfileId,
    occurredAt: input.now,
    actorKind: "user",
    actorId: input.context.userId,
    action: input.action,
    entityKind: "import_batch",
    entityId: input.importBatchId,
    reason: input.reason,
    redactedChanges:
      input.action === "create" ? { sourceHash: "added", status: "added" } : { status: "changed" },
  });
}

/** An expired extraction is reclaimed atomically with its audit record. */
export async function claimBankMessageExtractionLease(input: {
  context: TenantContext;
  importBatchId: string;
  now: string;
  processingToken: string;
}): Promise<string | undefined> {
  const { context, importBatchId, now, processingToken } = input;
  const staleBefore = new Date(new Date(now).getTime() - EXTRACTION_LEASE_MS).toISOString();
  return withTransaction(async (executeQuery) => {
      const rows = await executeQuery<{ id: string }>(
        `update "ImportBatch" as batch
         set "status" = 'REVIEWING', "completedAt" = null,
             "problems" = $5::jsonb, "updatedAt" = $4
         where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
           and (
             "status" = 'FAILED' or (
               "status" = 'REVIEWING' and "updatedAt" <= $6::timestamptz
               and ("problems" = '[]'::jsonb
                    or "problems"->0->>'code' = 'BANK_MESSAGE_EXTRACTION_PROCESSING')
               and not exists (
                 select 1 from "AiSuggestion" suggestion
                  where suggestion."sourceEntityId" = batch."id"
                    and suggestion."organizationId" = $2
                    and suggestion."financialProfileId" = $3
               )
             )
           )
         returning "id"`,
        [
          importBatchId,
          context.organizationId,
          context.financialProfileId,
          now,
          processingOutcome(processingToken),
          staleBefore,
        ],
      );

    if (rows[0] !== undefined) {
      await recordUserSubmissionAudit(executeQuery, {
        context,
        importBatchId: rows[0].id,
        now,
        action: "update",
        reason: "Mensagem bancária retomada para extração idempotente.",
      });
    }
    return rows[0]?.id;
  });
}
