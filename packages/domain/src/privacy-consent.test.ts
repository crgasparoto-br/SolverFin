import { strict as assert } from "node:assert";

import type { TenantContext } from "./tenant.js";
import {
  grantPrivacyConsent,
  requireActiveConsent,
  revokePrivacyConsent,
  summarizePrivacyPreferences,
} from "./privacy-consent.js";

const context: TenantContext = {
  userId: "user-privacy-demo",
  organizationId: "org-privacy-demo",
  financialProfileId: "profile-privacy-demo",
  financialProfileKind: "mei",
};

const otherContext: TenantContext = {
  userId: "user-other-demo",
  organizationId: "org-other-demo",
  financialProfileId: "profile-other-demo",
  financialProfileKind: "personal",
};

const now = "2026-06-16T10:00:00.000Z";

grantsAndRevokesConsent();
blocksMissingOrRevokedConsent();
keepsConsentScopedToTenant();

function grantsAndRevokesConsent(): void {
  const granted = grantPrivacyConsent({
    id: "consent-ai",
    context,
    now,
    purpose: "ai_processing",
    source: "settings",
    termsVersion: "mvp-2026-06",
  });

  assert.equal(granted.consent.status, "granted");
  assert.equal(granted.auditEntry.entityKind, "privacy_consent");

  const revoked = revokePrivacyConsent({
    context,
    consent: granted.consent,
    now: "2026-06-16T11:00:00.000Z",
    reason: "Usuario desativou IA nas preferencias.",
  });

  assert.equal(revoked.consent.status, "revoked");
  assert.equal(revoked.consent.revokedAt, "2026-06-16T11:00:00.000Z");
  assert.equal(revoked.auditEntry.reason, "Usuario desativou IA nas preferencias.");
}

function blocksMissingOrRevokedConsent(): void {
  const missing = requireActiveConsent(context, [], "bank_message_processing");

  assert.equal(missing.allowed, false);
  assert.equal(missing.status, "missing");

  const granted = grantPrivacyConsent({
    id: "consent-import",
    context,
    now,
    purpose: "import_processing",
    source: "onboarding",
  });
  const revoked = revokePrivacyConsent({
    context,
    consent: granted.consent,
    now: "2026-06-16T12:00:00.000Z",
  });
  const result = requireActiveConsent(
    context,
    [granted.consent, revoked.consent],
    "import_processing",
  );

  assert.equal(result.allowed, false);
  assert.equal(result.status, "revoked");
}

function keepsConsentScopedToTenant(): void {
  const granted = grantPrivacyConsent({
    id: "consent-export",
    context,
    now,
    purpose: "accountant_export",
    source: "settings",
  });
  const summary = summarizePrivacyPreferences(
    otherContext,
    [granted.consent],
    ["accountant_export"],
  );

  assert.equal(summary[0]?.status, "missing");
}
