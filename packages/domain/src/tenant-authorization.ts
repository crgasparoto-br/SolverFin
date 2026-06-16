import type { TenantScoped } from "./index.js";
import type { TenantContext } from "./tenant.js";

export type TenantAuthorizationErrorCode =
  | "TENANT_RESOURCE_NOT_FOUND"
  | "TENANT_PAYLOAD_SCOPE_FORBIDDEN";

export class TenantAuthorizationError extends Error {
  readonly code: TenantAuthorizationErrorCode;
  readonly statusCode: 403 | 404;

  constructor(code: TenantAuthorizationErrorCode, message: string, statusCode: 403 | 404) {
    super(message);
    this.name = "TenantAuthorizationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type TenantScopedPayload<TPayload extends object> = Omit<
  TPayload,
  "organizationId" | "financialProfileId"
> &
  TenantScoped;

export function getTenantScopedResource<TEntity extends TenantScoped>(
  context: TenantContext,
  entity: TEntity | undefined,
): TEntity {
  if (!entity || !belongsToTenant(context, entity)) {
    throw notFoundError();
  }

  return entity;
}

export function listTenantScopedResources<TEntity extends TenantScoped>(
  context: TenantContext,
  entities: readonly TEntity[],
): TEntity[] {
  return entities.filter((entity) => belongsToTenant(context, entity));
}

export function applyTenantScope<TPayload extends object>(
  context: TenantContext,
  payload: TPayload,
): TenantScopedPayload<TPayload> {
  const payloadWithoutTenant = { ...payload };

  deleteTenantScope(payloadWithoutTenant);

  return {
    ...payloadWithoutTenant,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
  } as TenantScopedPayload<TPayload>;
}

export function assertPayloadTenantScope(
  context: TenantContext,
  payload: Partial<TenantScoped>,
): void {
  if (payload.organizationId !== undefined && payload.organizationId !== context.organizationId) {
    throw payloadScopeError();
  }

  if (
    payload.financialProfileId !== undefined &&
    payload.financialProfileId !== context.financialProfileId
  ) {
    throw payloadScopeError();
  }
}

export function updateTenantScopedResource<TEntity extends TenantScoped>(
  context: TenantContext,
  entity: TEntity | undefined,
  payload: Partial<TenantScoped>,
): TEntity {
  assertPayloadTenantScope(context, payload);

  return getTenantScopedResource(context, entity);
}

export function deleteTenantScopedResource<TEntity extends TenantScoped>(
  context: TenantContext,
  entity: TEntity | undefined,
): TEntity {
  return getTenantScopedResource(context, entity);
}

function belongsToTenant(context: TenantContext, entity: TenantScoped): boolean {
  return (
    entity.organizationId === context.organizationId &&
    entity.financialProfileId === context.financialProfileId
  );
}

function deleteTenantScope(payload: object): void {
  delete (payload as Partial<TenantScoped>).organizationId;
  delete (payload as Partial<TenantScoped>).financialProfileId;
}

function notFoundError(): TenantAuthorizationError {
  return new TenantAuthorizationError(
    "TENANT_RESOURCE_NOT_FOUND",
    "Resource was not found in the active financial context.",
    404,
  );
}

function payloadScopeError(): TenantAuthorizationError {
  return new TenantAuthorizationError(
    "TENANT_PAYLOAD_SCOPE_FORBIDDEN",
    "Request payload cannot change the active financial context.",
    403,
  );
}
