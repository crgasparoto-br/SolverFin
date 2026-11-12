import { randomUUID } from "node:crypto";

import type { AuditLogEntryDraft } from "@solverfin/domain";

import type { query as QueryFn } from "../db.js";

export async function insertAuditLogEntry(
  executeQuery: typeof QueryFn,
  draft: AuditLogEntryDraft,
): Promise<void> {
  await executeQuery(
    `insert into "AuditLogEntry"
      ("id", "organizationId", "financialProfileId", "occurredAt", "actorKind", "actorId",
       "action", "entityKind", "entityId", "correlationId", "reason", "redactedChanges")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      randomUUID(),
      draft.organizationId,
      draft.financialProfileId,
      draft.occurredAt,
      draft.actorKind.toUpperCase(),
      draft.actorId ?? null,
      draft.action.toUpperCase(),
      draft.entityKind.toUpperCase(),
      draft.entityId,
      draft.correlationId ?? null,
      draft.reason ?? null,
      draft.redactedChanges ? JSON.stringify(draft.redactedChanges) : null,
    ],
  );
}
