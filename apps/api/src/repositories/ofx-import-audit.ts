import type {
  AiSuggestion,
  AuditLogEntryDraft,
  ImportBatch,
  ImportPreview,
  TenantContext,
} from "@solverfin/domain";

export function buildOfxPreviewAuditEntry(
  context: TenantContext,
  attemptId: string,
  preview: ImportPreview,
): AuditLogEntryDraft {
  return {
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    occurredAt: preview.batch.receivedAt,
    actorKind: "user",
    actorId: context.userId,
    action: "create",
    entityKind: "import_batch",
    entityId: attemptId,
    reason: "Preview OFX processado com consentimento explicito e sem persistir o arquivo bruto.",
    redactedChanges: {
      sourceKind: "added",
      previewState: "added",
      validRows: "added",
      problemRows: "added",
    },
  };
}

export function buildOfxFailureAuditEntry(
  context: TenantContext,
  input: {
    attemptId: string;
    occurredAt: string;
    phase: "preview" | "creation";
    errorCode: string;
  },
): AuditLogEntryDraft {
  return {
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    occurredAt: input.occurredAt,
    actorKind: "user",
    actorId: context.userId,
    action: "reject",
    entityKind: "import_batch",
    entityId: input.attemptId,
    reason: `Tentativa OFX na fase ${input.phase} encerrada com erro controlado ${input.errorCode}.`,
    redactedChanges: {
      sourceKind: "added",
      phase: "added",
      outcome: "changed",
      errorCode: "added",
    },
  };
}

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
