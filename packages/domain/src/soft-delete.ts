import type {
  Account,
  Attachment,
  AuditAction,
  AuditEntityKind,
  AuditLogEntryDraft,
  Card,
  Category,
  EntityId,
  ImportBatch,
  ISODateTime,
  Transaction,
} from "./index.js";
import type { TenantContext } from "./tenant.js";
import { getTenantScopedResource, listTenantScopedResources } from "./tenant-authorization.js";

export type SoftDeletableEntity =
  | Account
  | Card
  | Category
  | Transaction
  | ImportBatch
  | Attachment;

export interface SoftDeleteMetadata {
  deletedAt?: ISODateTime;
  deletedByUserId?: EntityId;
  deletionReason?: string;
}

export type SoftDeleted<TEntity extends SoftDeletableEntity> = TEntity & SoftDeleteMetadata;

export interface SoftDeleteInput<TEntity extends SoftDeletableEntity> {
  context: TenantContext;
  entity: TEntity | undefined;
  now: ISODateTime;
  entityKind: AuditEntityKind;
  reason?: string;
}

export interface SoftDeleteResult<TEntity extends SoftDeletableEntity> {
  entity: SoftDeleted<TEntity>;
  auditEntry: AuditLogEntryDraft;
}

export function softDeleteEntity<TEntity extends SoftDeletableEntity>(
  input: SoftDeleteInput<TEntity>,
): SoftDeleteResult<TEntity> {
  const entity = getTenantScopedResource(input.context, input.entity);
  const deleted = {
    ...entity,
    updatedAt: input.now,
    updatedByUserId: input.context.userId,
    deletedAt: input.now,
    deletedByUserId: input.context.userId,
  } as SoftDeleted<TEntity>;

  if (input.reason !== undefined && input.reason.trim()) {
    deleted.deletionReason = input.reason;
  }

  return {
    entity: deleted,
    auditEntry: buildDeletionAuditEntry(
      input.context,
      deleted,
      input.entityKind,
      input.now,
      input.reason,
    ),
  };
}

export function listVisibleEntities<TEntity extends SoftDeletableEntity & SoftDeleteMetadata>(
  context: TenantContext,
  entities: readonly TEntity[],
): TEntity[] {
  return listTenantScopedResources(context, entities).filter(
    (entity) => entity.deletedAt === undefined,
  );
}

export function listAuditVisibleEntities<TEntity extends SoftDeletableEntity & SoftDeleteMetadata>(
  context: TenantContext,
  entities: readonly TEntity[],
): TEntity[] {
  return listTenantScopedResources(context, entities);
}

export function assertHardDeleteAllowed(
  entityKind: AuditEntityKind,
  allowHardDelete = false,
): void {
  if (allowHardDelete) {
    return;
  }

  throw new Error(
    `Hard delete de ${entityKind} fica bloqueado no codigo de aplicacao; use exclusao logica ou fluxo de expurgo documentado.`,
  );
}

function buildDeletionAuditEntry<TEntity extends SoftDeletableEntity>(
  context: TenantContext,
  entity: TEntity,
  entityKind: AuditEntityKind,
  occurredAt: ISODateTime,
  reason: string | undefined,
): AuditLogEntryDraft {
  const action: Extract<AuditAction, "soft_delete"> = "soft_delete";
  const entry: AuditLogEntryDraft = {
    organizationId: entity.organizationId,
    financialProfileId: entity.financialProfileId,
    occurredAt,
    actorKind: "user",
    actorId: context.userId,
    action,
    entityKind,
    entityId: entity.id,
    redactedChanges: {
      deletedAt: "added",
      deletedByUserId: "added",
    },
  };

  if (reason !== undefined) {
    entry.reason = reason;
  }

  return entry;
}
