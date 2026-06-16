import assert from "node:assert/strict";

import {
  buildPrivacyPreferenceView,
  buildSoftDeleteAuditEntry,
  grantPrivacyConsent,
  hasActivePrivacyConsent,
  listActiveResources,
  maskFinancialIdentifier,
  maskSensitiveFinancialText,
  PrivacyConsentError,
  requireActivePrivacyConsent,
  revokePrivacyConsent,
  sanitizeSensitiveErrorMessage,
  softDeleteResource,
  type SoftDeletableResource,
} from "./index.js";

const context = {
  organizationId: "org-privacy-a",
  financialProfileId: "profile-privacy-a",
  userId: "user-privacy-a",
};

consentCanBeGrantedRevokedAndBlocked();
consentIsTenantScoped();
maskingCoversFinancialIdentifiersAndPayloads();
softDeleteHidesDefaultListsAndBuildsSafeAudit();

function consentCanBeGrantedRevokedAndBlocked(): void {
  const granted = grantPrivacyConsent({
    ...context,
    id: "consent-ai",
    purpose: "ai_processing",
    now: "2026-06-16T10:00:00.000Z",
    termsVersion: "privacy-mvp-v1",
    source: "settings",
  });
  const revoked = revokePrivacyConsent(granted, "2026-06-16T11:00:00.000Z");

  assert.equal(hasActivePrivacyConsent([granted], context, "ai_processing"), true);
  assert.equal(hasActivePrivacyConsent([revoked], context, "ai_processing"), false);
  assert.throws(
    () => requireActivePrivacyConsent([revoked], context, "ai_processing"),
    PrivacyConsentError,
  );

  const view = buildPrivacyPreferenceView([revoked], context, "ai_processing");

  assert.equal(view.status, "revoked");
  assert.equal(view.actionLabel, "Ativar novamente");
}

function consentIsTenantScoped(): void {
  const granted = grantPrivacyConsent({
    ...context,
    id: "consent-bank-message",
    purpose: "bank_message_processing",
    now: "2026-06-16T10:00:00.000Z",
    source: "import_flow",
  });
  const otherContext = {
    ...context,
    financialProfileId: "profile-other",
  };

  assert.equal(hasActivePrivacyConsent([granted], otherContext, "bank_message_processing"), false);
}

function maskingCoversFinancialIdentifiersAndPayloads(): void {
  const maskedIdentifier = maskFinancialIdentifier("4111 1111 1111 1234");
  const maskedText = maskSensitiveFinancialText(
    "CPF 123.456.789-00 cartao 4111 1111 1111 1234 compra R$ 123,45",
  );
  const safeError = sanitizeSensitiveErrorMessage(
    "Falha no payload com cartao 4111 1111 1111 1234 e valor R$ 123,45",
  );

  assert.equal(maskedIdentifier.endsWith("1234"), true);
  assert.equal(maskedIdentifier.includes("4111"), false);
  assert.equal(maskFinancialIdentifier("****1234"), "****1234");
  assert.equal(maskFinancialIdentifier(""), "");
  assert.equal(maskedText.includes("123.456"), false);
  assert.equal(maskedText.includes("4111"), false);
  assert.equal(maskedText.includes("R$ 123,45"), false);
  assert.equal(safeError.includes("4111"), false);
}

function softDeleteHidesDefaultListsAndBuildsSafeAudit(): void {
  const active = buildResource(
    "resource-active",
    context.organizationId,
    context.financialProfileId,
  );
  const deleted = softDeleteResource({
    context,
    resource: buildResource("resource-delete", context.organizationId, context.financialProfileId),
    now: "2026-06-16T12:00:00.000Z",
    reason: "Pedido com cartao 4111 1111 1111 1234",
  });
  const visible = listActiveResources(context, [active, deleted]);
  const audit = buildSoftDeleteAuditEntry({
    context,
    actorKind: "user",
    actorId: context.userId,
    entityKind: "transaction",
    entityId: deleted.id,
    occurredAt: "2026-06-16T12:00:00.000Z",
    reason: "Pedido com cartao 4111 1111 1111 1234",
  });

  assert.equal(deleted.deletedByUserId, context.userId);
  assert.equal(deleted.deletionReason?.includes("4111"), false);
  assert.deepEqual(
    visible.map((item) => item.id),
    ["resource-active"],
  );
  assert.equal(audit.action, "soft_delete");
  assert.equal(audit.reason?.includes("4111"), false);
  assert.equal(audit.redactedChanges?.deletedAt, "added");
  assert.throws(
    () =>
      softDeleteResource({
        context,
        resource: buildResource("foreign", "org-other", context.financialProfileId),
        now: "2026-06-16T12:00:00.000Z",
      }),
    PrivacyConsentError,
  );
}

function buildResource(
  id: string,
  organizationId: string,
  financialProfileId: string,
): SoftDeletableResource {
  return {
    id,
    organizationId,
    financialProfileId,
  };
}
