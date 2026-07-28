import type {
  AiSuggestion,
  AuditLogEntryDraft,
  ImportBatch,
  TenantContext,
} from "@solverfin/domain";

export function buildOfxBatchAuditEntry(batch: ImportBatch): AuditLogEntryDraft {
  return {
    organizationId: batch.organizationId,
    financialProfileId: batch.financialProfileId,
    occurredAt: batch.createdAt,
    actorKind: "import",
    action: "create",
    entityKind: "import_batch",
    entityId: batch.id,
    reason: "Lote OFX criado para revisao humana.",
    redactedChanges: {
      status: "added",
      totalRows: "added",
      validRows: "added",
      problemRows: "added",
      sourceKind: "added",
    },
  };
}

export function buildOfxConsentAuditEntry(
  context: TenantContext,
  batch: ImportBatch,
): AuditLogEntryDraft {
  return {
    organizationId: batch.organizationId,
    financialProfileId: batch.financialProfileId,
    occurredAt: batch.createdAt,
    actorKind: "user",
    actorId: context.userId,
    action: "create",
    entityKind: "privacy_consent",
    entityId: batch.id,
    reason: "Usuario confirmou autorizacao para processar o arquivo OFX e revisar as linhas.",
    redactedChanges: { consentAccepted: "added" },
  };
}

export function buildOfxSuggestionAuditEntry(suggestion: AiSuggestion): AuditLogEntryDraft {
  return {
    organizationId: suggestion.organizationId,
    financialProfileId: suggestion.financialProfileId,
    occurredAt: suggestion.createdAt,
    actorKind: "import",
    action: "create",
    entityKind: "ai_suggestion",
    entityId: suggestion.id,
    reason: "Linha OFX estruturada para revisao humana.",
    redactedChanges: { status: "added", payload: "added", provider: "added" },
  };
}
