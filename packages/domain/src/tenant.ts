import type {
  EntityId,
  FinancialContextKind,
  FinancialProfile,
  ISODateTime,
  Organization,
  TenantScoped,
  User,
} from "./index.js";

export type TenantErrorCode =
  | "TENANT_USER_DISABLED"
  | "TENANT_ORGANIZATION_REQUIRED"
  | "TENANT_PROFILE_REQUIRED"
  | "TENANT_CONTEXT_REQUIRED"
  | "TENANT_ACCESS_DENIED"
  | "TENANT_SCOPE_REQUIRED";

export class TenantError extends Error {
  readonly code: TenantErrorCode;

  constructor(code: TenantErrorCode, message: string) {
    super(message);
    this.name = "TenantError";
    this.code = code;
  }
}

export interface TenantContext {
  userId: EntityId;
  organizationId: EntityId;
  financialProfileId: EntityId;
  financialProfileKind: FinancialContextKind;
}

export interface CreateOrganizationInput {
  id: EntityId;
  owner: Pick<User, "id" | "status">;
  name: string;
  now: ISODateTime;
}

export interface CreateFinancialProfileInput {
  id: EntityId;
  organization: Pick<Organization, "id" | "ownerUserId">;
  owner: Pick<User, "id" | "status">;
  name: string;
  kind: FinancialContextKind;
  now: ISODateTime;
}

export interface ResolveTenantContextInput {
  user: Pick<User, "id" | "status">;
  profiles: readonly FinancialProfile[];
  requestedFinancialProfileId?: EntityId;
}

export function createOrganization(input: CreateOrganizationInput): Organization {
  assertActiveUser(input.owner);

  return {
    id: input.id,
    name: normalizeRequiredName(input.name, "Organization name is required."),
    ownerUserId: input.owner.id,
    createdAt: input.now,
    updatedAt: input.now,
    createdByUserId: input.owner.id,
    updatedByUserId: input.owner.id,
  };
}

export function createFinancialProfile(input: CreateFinancialProfileInput): FinancialProfile {
  assertActiveUser(input.owner);

  if (input.organization.ownerUserId !== input.owner.id) {
    throw new TenantError(
      "TENANT_ACCESS_DENIED",
      "User cannot create a financial profile for this organization.",
    );
  }

  return {
    id: input.id,
    organizationId: input.organization.id,
    ownerUserId: input.owner.id,
    name: normalizeRequiredName(input.name, "Financial profile name is required."),
    kind: input.kind,
    status: "active",
    createdAt: input.now,
    updatedAt: input.now,
    createdByUserId: input.owner.id,
    updatedByUserId: input.owner.id,
  };
}

export function resolveTenantContext(input: ResolveTenantContextInput): TenantContext {
  assertActiveUser(input.user);

  const activeProfiles = input.profiles.filter(
    (profile) => profile.ownerUserId === input.user.id && profile.status === "active",
  );

  if (activeProfiles.length === 0) {
    throw new TenantError(
      "TENANT_PROFILE_REQUIRED",
      "User must create a financial profile before using private financial features.",
    );
  }

  const selectedProfile = input.requestedFinancialProfileId
    ? activeProfiles.find((profile) => profile.id === input.requestedFinancialProfileId)
    : selectOnlyActiveProfile(activeProfiles);

  if (!selectedProfile) {
    throw new TenantError(
      "TENANT_ACCESS_DENIED",
      "User cannot access the requested financial profile.",
    );
  }

  return {
    userId: input.user.id,
    organizationId: selectedProfile.organizationId,
    financialProfileId: selectedProfile.id,
    financialProfileKind: selectedProfile.kind,
  };
}

export function assertTenantScopedEntity(
  context: TenantContext,
  entity: Partial<TenantScoped>,
): asserts entity is TenantScoped {
  if (!entity.organizationId || !entity.financialProfileId) {
    throw new TenantError(
      "TENANT_SCOPE_REQUIRED",
      "Financial entity requires organization and financial profile scope.",
    );
  }

  if (
    entity.organizationId !== context.organizationId ||
    entity.financialProfileId !== context.financialProfileId
  ) {
    throw new TenantError("TENANT_ACCESS_DENIED", "Financial entity belongs to another tenant.");
  }
}

export function isTenantScopedTo(context: TenantContext, entity: TenantScoped): boolean {
  return (
    entity.organizationId === context.organizationId &&
    entity.financialProfileId === context.financialProfileId
  );
}

function assertActiveUser(user: Pick<User, "status">): void {
  if (user.status !== "active") {
    throw new TenantError("TENANT_USER_DISABLED", "Only active users can use tenant features.");
  }
}

function normalizeRequiredName(value: string, message: string): string {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new TenantError("TENANT_ORGANIZATION_REQUIRED", message);
  }

  return normalizedValue;
}

function selectOnlyActiveProfile(profiles: readonly FinancialProfile[]): FinancialProfile {
  if (profiles.length !== 1) {
    throw new TenantError(
      "TENANT_CONTEXT_REQUIRED",
      "Active financial profile must be selected when the user has multiple profiles.",
    );
  }

  return profiles[0];
}
