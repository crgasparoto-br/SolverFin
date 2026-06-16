import type { AuditLogEntryDraft, EntityId, ISODateTime, TenantScoped } from "./index.js";
import type { TenantContext } from "./tenant.js";
import { applyTenantScope, listTenantScopedResources } from "./tenant-authorization.js";

export type ConsentPurpose =
  | "ai_processing"
  | "bank_message_processing"
  | "import_processing"
  | "professional_integration"
  | "accountant_export";
export type ConsentStatus = "granted" | "revoked";
export type ConsentSource = "settings" | "onboarding" | "share_target" | "api" | "system";

export interface PrivacyConsent extends TenantScoped {
  id: EntityId;
  userId: EntityId;
  purpose: ConsentPurpose;
  status: ConsentStatus;
  termsVersion?: string;
  source: ConsentSource;
  grantedAt?: ISODateTime;
  revokedAt?: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface PrivacyPreferenceSummary {
  purpose: ConsentPurpose;
  status: "granted" | "revoked" | "missing";
  termsVersion?: string;
  updatedAt?: ISODateTime;
}

export interface ConsentMutationResult {
  consent: PrivacyConsent;
  auditEntry: AuditLogEntryDraft;
}

export interface ConsentRequirementResult {
  allowed: boolean;
  purpose: ConsentPurpose;
  status: "granted" | "revoked" | "missing";
  message?: string;
}

export interface GrantConsentInput {
  id: EntityId;
  context: TenantContext;
  now: ISODateTime;
  purpose: ConsentPurpose;
  source: ConsentSource;
  termsVersion?: string;
}

export interface RevokeConsentInput {
  context: TenantContext;
  consent: PrivacyConsent | undefined;
  now: ISODateTime;
  reason?: string;
}

const CONSENT_REQUIRED_MESSAGE =
  "Ative o consentimento desta finalidade para continuar com este processamento.";

export function grantPrivacyConsent(input: GrantConsentInput): ConsentMutationResult {
  const scoped = applyTenantScope(input.context, {});
  const consent: PrivacyConsent = {
    id: input.id,
    organizationId: scoped.organizationId,
    financialProfileId: scoped.financialProfileId,
    userId: input.context.userId,
    purpose: input.purpose,
    status: "granted",
    source: input.source,
    grantedAt: input.now,
    createdAt: input.now,
    updatedAt: input.now,
  };

  if (input.termsVersion !== undefined) {
    consent.termsVersion = input.termsVersion;
  }

  return {
    consent,
    auditEntry: buildConsentAuditEntry(input.context, input.now, "create", consent),
  };
}

export function revokePrivacyConsent(input: RevokeConsentInput): ConsentMutationResult {
  const consent = getActiveTenantConsent(input.context, input.consent);
  const revokedConsent: PrivacyConsent = {
    ...consent,
    status: "revoked",
    revokedAt: input.now,
    updatedAt: input.now,
  };

  return {
    consent: revokedConsent,
    auditEntry: buildConsentAuditEntry(input.context, input.now, "update", revokedConsent, input.reason),
  };
}

export function summarizePrivacyPreferences(
  context: TenantContext,
  consents: readonly PrivacyConsent[],
  purposes: readonly ConsentPurpose[],
): PrivacyPreferenceSummary[] {
  return purposes.map((purpose) => {
    const latest = getLatestConsent(context, consents, purpose);

    if (!latest) {
      return { purpose, status: "missing" };
    }

    return {
      purpose,
      status: latest.status,
      termsVersion: latest.termsVersion,
      updatedAt: latest.updatedAt,
    };
  });
}

export function requireActiveConsent(
  context: TenantContext,
  consents: readonly PrivacyConsent[],
  purpose: ConsentPurpose,
): ConsentRequirementResult {
  const latest = getLatestConsent(context, consents, purpose);

  if (latest?.status === "granted") {
    return { allowed: true, purpose, status: "granted" };
  }

  return {
    allowed: false,
    purpose,
    status: latest?.status ?? "missing",
    message: CONSENT_REQUIRED_MESSAGE,
  };
}

function getLatestConsent(
  context: TenantContext,
  consents: readonly PrivacyConsent[],
  purpose: ConsentPurpose,
): PrivacyConsent | undefined {
  return listTenantScopedResources(context, consents)
    .filter((consent) => consent.userId === context.userId && consent.purpose === purpose)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

function getActiveTenantConsent(
  context: TenantContext,
  consent: PrivacyConsent | undefined,
): PrivacyConsent {
  const [scopedConsent] = listTenantScopedResources(context, consent ? [consent] : []);

  if (!scopedConsent || scopedConsent.userId !== context.userId) {
    throw new Error("Consentimento nao encontrado no contexto financeiro ativo.");
  }

  return scopedConsent;
}

function buildConsentAuditEntry(
  context: TenantContext,
  occurredAt: ISODateTime,
  action: "create" | "update",
  consent: PrivacyConsent,
  reason?: string,
): AuditLogEntryDraft {
  const entry: AuditLogEntryDraft = {
    organizationId: consent.organizationId,
    financialProfileId: consent.financialProfileId,
    occurredAt,
    actorKind: "user",
    actorId: context.userId,
    action,
    entityKind: "privacy_consent",
    entityId: consent.id,
    redactedChanges: {
      purpose: "changed",
      status: "changed",
      termsVersion: "changed",
    },
  };

  if (reason !== undefined) {
    entry.reason = reason;
  }

  return entry;
}
