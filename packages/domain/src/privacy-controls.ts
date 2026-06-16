import type {
  AuditActorKind,
  AuditEntityKind,
  AuditLogEntryDraft,
  EntityId,
  ISODateTime,
  TenantScoped,
} from "./index.js";

export type PrivacyConsentPurpose =
  | "ai_processing"
  | "bank_message_processing"
  | "external_integration"
  | "data_export";
export type PrivacyConsentStatus = "granted" | "revoked";
export type PrivacyConsentSource = "settings" | "onboarding" | "import_flow" | "system";
export type PrivacyConsentErrorCode = "PRIVACY_CONSENT_REQUIRED" | "PRIVACY_TENANT_MISMATCH";

export interface PrivacyConsentRecord extends TenantScoped {
  id: EntityId;
  userId: EntityId;
  purpose: PrivacyConsentPurpose;
  status: PrivacyConsentStatus;
  termsVersion?: string;
  source: PrivacyConsentSource;
  grantedAt?: ISODateTime;
  revokedAt?: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ConsentMutationInput extends TenantScoped {
  id: EntityId;
  userId: EntityId;
  purpose: PrivacyConsentPurpose;
  now: ISODateTime;
  termsVersion?: string;
  source: PrivacyConsentSource;
}

export interface PrivacyPreferenceView {
  purpose: PrivacyConsentPurpose;
  status: PrivacyConsentStatus | "missing";
  termsVersion?: string;
  updatedAt?: ISODateTime;
  actionLabel: string;
}

export interface SoftDeletableResource extends TenantScoped {
  id: EntityId;
  deletedAt?: ISODateTime;
  deletedByUserId?: EntityId;
  deletionReason?: string;
}

export interface SoftDeleteInput<TResource extends SoftDeletableResource> {
  context: TenantScoped & { userId: EntityId };
  resource: TResource | undefined;
  now: ISODateTime;
  reason?: string;
}

export class PrivacyConsentError extends Error {
  readonly code: PrivacyConsentErrorCode;
  readonly statusCode = 403;

  constructor(code: PrivacyConsentErrorCode, message: string) {
    super(message);
    this.name = "PrivacyConsentError";
    this.code = code;
  }
}

export function grantPrivacyConsent(input: ConsentMutationInput): PrivacyConsentRecord {
  return {
    id: input.id,
    organizationId: input.organizationId,
    financialProfileId: input.financialProfileId,
    userId: input.userId,
    purpose: input.purpose,
    status: "granted",
    ...(input.termsVersion ? { termsVersion: input.termsVersion } : {}),
    source: input.source,
    grantedAt: input.now,
    updatedAt: input.now,
  };
}

export function revokePrivacyConsent(
  consent: PrivacyConsentRecord,
  now: ISODateTime,
): PrivacyConsentRecord {
  return {
    ...consent,
    status: "revoked",
    revokedAt: now,
    updatedAt: now,
  };
}

export function hasActivePrivacyConsent(
  consents: readonly PrivacyConsentRecord[],
  context: TenantScoped & { userId: EntityId },
  purpose: PrivacyConsentPurpose,
): boolean {
  return getLatestConsent(consents, context, purpose)?.status === "granted";
}

export function requireActivePrivacyConsent(
  consents: readonly PrivacyConsentRecord[],
  context: TenantScoped & { userId: EntityId },
  purpose: PrivacyConsentPurpose,
): void {
  if (!hasActivePrivacyConsent(consents, context, purpose)) {
    throw new PrivacyConsentError(
      "PRIVACY_CONSENT_REQUIRED",
      "Ative o consentimento de privacidade para continuar com este fluxo.",
    );
  }
}

export function buildPrivacyPreferenceView(
  consents: readonly PrivacyConsentRecord[],
  context: TenantScoped & { userId: EntityId },
  purpose: PrivacyConsentPurpose,
): PrivacyPreferenceView {
  const latest = getLatestConsent(consents, context, purpose);

  if (!latest) {
    return {
      purpose,
      status: "missing",
      actionLabel: "Ativar consentimento",
    };
  }

  return {
    purpose,
    status: latest.status,
    ...(latest.termsVersion ? { termsVersion: latest.termsVersion } : {}),
    updatedAt: latest.updatedAt,
    actionLabel: latest.status === "granted" ? "Revogar consentimento" : "Ativar novamente",
  };
}

export function maskFinancialIdentifier(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    return "";
  }

  if (value.includes("*")) {
    return value;
  }

  const digits = value.replace(/\D/g, "");

  if (digits.length <= 4) {
    return digits.replace(/\d/g, "*");
  }

  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export function maskSensitiveFinancialText(text: string): string {
  return text
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[cartao mascarado]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[documento mascarado]")
    .replace(/\b(?:ag\.?\s*)?\d{3,6}[- ]?\d{0,2}\b/gi, "[identificador mascarado]")
    .replace(/R\$\s?\d{1,3}(?:\.\d{3})*,\d{2}/g, "[valor]");
}

export function sanitizeSensitiveErrorMessage(message: string): string {
  return maskSensitiveFinancialText(message).slice(0, 300);
}

export function listActiveResources<TResource extends SoftDeletableResource>(
  context: TenantScoped,
  resources: readonly TResource[],
): TResource[] {
  return resources.filter(
    (resource) =>
      resource.organizationId === context.organizationId &&
      resource.financialProfileId === context.financialProfileId &&
      resource.deletedAt === undefined,
  );
}

export function softDeleteResource<TResource extends SoftDeletableResource>(
  input: SoftDeleteInput<TResource>,
): TResource {
  if (!input.resource || !isSameTenant(input.context, input.resource)) {
    throw new PrivacyConsentError(
      "PRIVACY_TENANT_MISMATCH",
      "Nao foi possivel localizar o item neste contexto financeiro.",
    );
  }

  if (input.resource.deletedAt !== undefined) {
    return input.resource;
  }

  return {
    ...input.resource,
    deletedAt: input.now,
    deletedByUserId: input.context.userId,
    ...(input.reason ? { deletionReason: sanitizeSensitiveErrorMessage(input.reason) } : {}),
  };
}

export function buildSoftDeleteAuditEntry(input: {
  context: TenantScoped;
  actorKind: AuditActorKind;
  actorId?: EntityId;
  entityKind: AuditEntityKind;
  entityId: EntityId;
  occurredAt: ISODateTime;
  reason?: string;
  correlationId?: string;
}): AuditLogEntryDraft {
  return {
    organizationId: input.context.organizationId,
    financialProfileId: input.context.financialProfileId,
    occurredAt: input.occurredAt,
    actorKind: input.actorKind,
    ...(input.actorId ? { actorId: input.actorId } : {}),
    action: "soft_delete",
    entityKind: input.entityKind,
    entityId: input.entityId,
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.reason ? { reason: sanitizeSensitiveErrorMessage(input.reason) } : {}),
    redactedChanges: {
      deletedAt: "added",
      deletedByUserId: "added",
    },
  };
}

function getLatestConsent(
  consents: readonly PrivacyConsentRecord[],
  context: TenantScoped & { userId: EntityId },
  purpose: PrivacyConsentPurpose,
): PrivacyConsentRecord | undefined {
  const scoped = consents
    .filter(
      (consent) =>
        consent.organizationId === context.organizationId &&
        consent.financialProfileId === context.financialProfileId &&
        consent.userId === context.userId &&
        consent.purpose === purpose,
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return scoped[0];
}

function isSameTenant(left: TenantScoped, right: TenantScoped): boolean {
  return (
    left.organizationId === right.organizationId &&
    left.financialProfileId === right.financialProfileId
  );
}
