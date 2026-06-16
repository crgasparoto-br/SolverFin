import type {
  AuditLogEntryDraft,
  EntityId,
  ISODate,
  ISODateTime,
  TenantScoped,
  Traceable,
} from "./index.js";
import type { TenantContext } from "./tenant.js";
import {
  applyTenantScope,
  getTenantScopedResource,
  listTenantScopedResources,
  updateTenantScopedResource,
} from "./tenant-authorization.js";

export type FinancialAssumptionStatus = "active" | "inactive" | "archived";
export type FinancialAssumptionOrigin = "system_default" | "user" | "import" | "ai_review";
export type FinancialAssumptionKind =
  | "horizon_days"
  | "reserve_amount"
  | "safety_margin_percent"
  | "ignored_category"
  | "include_inferred_recurrences";
export type FinancialAssumptionScopeKind =
  | "global"
  | "profile"
  | "category"
  | "account"
  | "card"
  | "inferred_recurrence"
  | "calculation";

export interface FinancialAssumptionScope {
  kind: FinancialAssumptionScopeKind;
  entityId?: EntityId;
}

export interface FinancialAssumption extends Traceable, TenantScoped {
  status: FinancialAssumptionStatus;
  kind: FinancialAssumptionKind;
  scope: FinancialAssumptionScope;
  value: number | boolean | string;
  origin: FinancialAssumptionOrigin;
  effectiveFrom: ISODate;
  effectiveTo?: ISODate;
  version: number;
  archivedAt?: ISODateTime;
  deactivatedAt?: ISODateTime;
  reason?: string;
}

export interface AvailabilityAssumptionValues {
  horizonDays: number;
  reserveAmountMinor: number;
  safetyMarginPercent: number;
  ignoredCategoryIds: readonly EntityId[];
  includeInferredRecurrences: boolean;
  appliedAssumptionIds: readonly EntityId[];
  explanations: readonly string[];
}

export interface CreateFinancialAssumptionInput {
  id: EntityId;
  context: TenantContext;
  now: ISODateTime;
  payload: CreateFinancialAssumptionPayload;
}

export interface CreateFinancialAssumptionPayload {
  kind: FinancialAssumptionKind;
  scope: FinancialAssumptionScope;
  value: number | boolean | string;
  origin?: FinancialAssumptionOrigin;
  effectiveFrom: ISODate;
  effectiveTo?: ISODate;
  reason?: string;
  organizationId?: EntityId;
  financialProfileId?: EntityId;
}

export interface UpdateFinancialAssumptionInput {
  context: TenantContext;
  assumption: FinancialAssumption | undefined;
  now: ISODateTime;
  payload: UpdateFinancialAssumptionPayload;
}

export interface UpdateFinancialAssumptionPayload {
  status?: FinancialAssumptionStatus;
  scope?: FinancialAssumptionScope;
  value?: number | boolean | string;
  effectiveFrom?: ISODate;
  effectiveTo?: ISODate;
  reason?: string;
  organizationId?: EntityId;
  financialProfileId?: EntityId;
}

export interface FinancialAssumptionMutationResult {
  assumption: FinancialAssumption;
  auditEntry: AuditLogEntryDraft;
}

export interface ListFinancialAssumptionsFilters {
  status?: FinancialAssumptionStatus | "all";
  kind?: FinancialAssumptionKind;
  activeOn?: ISODate;
  scopeKind?: FinancialAssumptionScopeKind;
}

export const defaultAvailabilityAssumptions: AvailabilityAssumptionValues = {
  horizonDays: 30,
  reserveAmountMinor: 0,
  safetyMarginPercent: 10,
  ignoredCategoryIds: [],
  includeInferredRecurrences: true,
  appliedAssumptionIds: [],
  explanations: [
    "Horizonte padrao de 30 dias.",
    "Margem de seguranca padrao de 10% sobre compromissos futuros.",
    "Recorrencias inferidas entram no calculo ate serem desativadas.",
  ],
};

const ALLOWED_STATUSES: readonly FinancialAssumptionStatus[] = [
  "active",
  "inactive",
  "archived",
];
const ALLOWED_KINDS: readonly FinancialAssumptionKind[] = [
  "horizon_days",
  "reserve_amount",
  "safety_margin_percent",
  "ignored_category",
  "include_inferred_recurrences",
];
const ALLOWED_SCOPE_KINDS: readonly FinancialAssumptionScopeKind[] = [
  "global",
  "profile",
  "category",
  "account",
  "card",
  "inferred_recurrence",
  "calculation",
];

export function createFinancialAssumption(
  input: CreateFinancialAssumptionInput,
): FinancialAssumptionMutationResult {
  const payload = applyTenantScope(input.context, input.payload);
  const assumption: FinancialAssumption = {
    id: input.id,
    organizationId: payload.organizationId,
    financialProfileId: payload.financialProfileId,
    status: "active",
    kind: validateKind(payload.kind),
    scope: validateScope(payload.scope),
    value: validateValue(payload.kind, payload.value),
    origin: payload.origin ?? "user",
    effectiveFrom: validateDate(payload.effectiveFrom),
    version: 1,
    createdAt: input.now,
    updatedAt: input.now,
    createdByUserId: input.context.userId,
    updatedByUserId: input.context.userId,
  };

  if (payload.effectiveTo !== undefined) {
    assumption.effectiveTo = validateEffectiveTo(assumption.effectiveFrom, payload.effectiveTo);
  }

  if (payload.reason !== undefined) {
    assumption.reason = payload.reason.trim();
  }

  return {
    assumption,
    auditEntry: buildFinancialAssumptionAuditEntry(
      "create",
      input.context.userId,
      input.now,
      undefined,
      assumption,
    ),
  };
}

export function listFinancialAssumptions(
  context: TenantContext,
  assumptions: readonly FinancialAssumption[],
  filters: ListFinancialAssumptionsFilters = {},
): FinancialAssumption[] {
  return listTenantScopedResources(context, assumptions).filter((assumption) => {
    const statusMatches =
      filters.status === undefined ||
      filters.status === "all" ||
      assumption.status === filters.status;
    const kindMatches = filters.kind === undefined || assumption.kind === filters.kind;
    const scopeMatches = filters.scopeKind === undefined || assumption.scope.kind === filters.scopeKind;
    const activeOnMatches =
      filters.activeOn === undefined ||
      (assumption.effectiveFrom <= filters.activeOn &&
        (assumption.effectiveTo === undefined || assumption.effectiveTo >= filters.activeOn));

    return statusMatches && kindMatches && scopeMatches && activeOnMatches;
  });
}

export function getFinancialAssumption(
  context: TenantContext,
  assumption: FinancialAssumption | undefined,
): FinancialAssumption {
  return getTenantScopedResource(context, assumption);
}

export function updateFinancialAssumption(
  input: UpdateFinancialAssumptionInput,
): FinancialAssumptionMutationResult {
  const currentAssumption = updateTenantScopedResource(
    input.context,
    input.assumption,
    input.payload,
  );
  const nextKind = currentAssumption.kind;
  const effectiveFrom = input.payload.effectiveFrom ?? currentAssumption.effectiveFrom;
  const updatedAssumption: FinancialAssumption = {
    ...currentAssumption,
    ...buildOptionalAssumptionUpdate(input.payload, nextKind, effectiveFrom),
    updatedAt: input.now,
    updatedByUserId: input.context.userId,
    version: currentAssumption.version + 1,
  };

  return {
    assumption: updatedAssumption,
    auditEntry: buildFinancialAssumptionAuditEntry(
      "update",
      input.context.userId,
      input.now,
      currentAssumption,
      updatedAssumption,
    ),
  };
}

export function deactivateFinancialAssumption(
  context: TenantContext,
  assumption: FinancialAssumption | undefined,
  now: ISODateTime,
  reason?: string,
): FinancialAssumptionMutationResult {
  const currentAssumption = getTenantScopedResource(context, assumption);
  const updatedAssumption: FinancialAssumption = {
    ...currentAssumption,
    status: "inactive",
    deactivatedAt: now,
    updatedAt: now,
    updatedByUserId: context.userId,
    version: currentAssumption.version + 1,
  };

  if (reason !== undefined) {
    updatedAssumption.reason = reason.trim();
  }

  return {
    assumption: updatedAssumption,
    auditEntry: buildFinancialAssumptionAuditEntry(
      "update",
      context.userId,
      now,
      currentAssumption,
      updatedAssumption,
    ),
  };
}

export function archiveFinancialAssumption(
  context: TenantContext,
  assumption: FinancialAssumption | undefined,
  now: ISODateTime,
): FinancialAssumptionMutationResult {
  const currentAssumption = getTenantScopedResource(context, assumption);
  const archivedAssumption: FinancialAssumption = {
    ...currentAssumption,
    status: "archived",
    archivedAt: now,
    updatedAt: now,
    updatedByUserId: context.userId,
    version: currentAssumption.version + 1,
  };

  return {
    assumption: archivedAssumption,
    auditEntry: buildFinancialAssumptionAuditEntry(
      "archive",
      context.userId,
      now,
      currentAssumption,
      archivedAssumption,
    ),
  };
}

export function restoreFinancialAssumption(
  context: TenantContext,
  assumption: FinancialAssumption | undefined,
  now: ISODateTime,
): FinancialAssumptionMutationResult {
  const currentAssumption = getTenantScopedResource(context, assumption);
  const restoredAssumption: FinancialAssumption = {
    ...currentAssumption,
    status: "active",
    updatedAt: now,
    updatedByUserId: context.userId,
    version: currentAssumption.version + 1,
  };
  delete restoredAssumption.archivedAt;
  delete restoredAssumption.deactivatedAt;

  return {
    assumption: restoredAssumption,
    auditEntry: buildFinancialAssumptionAuditEntry(
      "restore",
      context.userId,
      now,
      currentAssumption,
      restoredAssumption,
    ),
  };
}

export function resolveAvailabilityAssumptions(
  context: TenantContext,
  assumptions: readonly FinancialAssumption[],
  today: ISODate,
): AvailabilityAssumptionValues {
  const activeAssumptions = listFinancialAssumptions(context, assumptions, {
    status: "active",
    activeOn: today,
  }).sort(compareAssumptionPriority);
  const ignoredCategoryIds = new Set<EntityId>();
  const appliedAssumptionIds: EntityId[] = [];
  const explanations = [...defaultAvailabilityAssumptions.explanations];
  let horizonDays = defaultAvailabilityAssumptions.horizonDays;
  let reserveAmountMinor = defaultAvailabilityAssumptions.reserveAmountMinor;
  let safetyMarginPercent = defaultAvailabilityAssumptions.safetyMarginPercent;
  let includeInferredRecurrences = defaultAvailabilityAssumptions.includeInferredRecurrences;

  for (const assumption of activeAssumptions) {
    appliedAssumptionIds.push(assumption.id);

    if (assumption.kind === "horizon_days") {
      horizonDays = Number(assumption.value);
      explanations.push(`Horizonte configurado para ${horizonDays} dia(s).`);
      continue;
    }

    if (assumption.kind === "reserve_amount") {
      reserveAmountMinor = Number(assumption.value);
      explanations.push("Reserva minima configurada pelo usuario aplicada ao calculo.");
      continue;
    }

    if (assumption.kind === "safety_margin_percent") {
      safetyMarginPercent = Number(assumption.value);
      explanations.push(`Margem de seguranca configurada em ${safetyMarginPercent}%.`);
      continue;
    }

    if (assumption.kind === "include_inferred_recurrences") {
      includeInferredRecurrences = Boolean(assumption.value);
      explanations.push(
        includeInferredRecurrences
          ? "Recorrencias inferidas habilitadas."
          : "Recorrencias inferidas desabilitadas.",
      );
      continue;
    }

    if (assumption.kind === "ignored_category" && assumption.scope.entityId !== undefined) {
      ignoredCategoryIds.add(assumption.scope.entityId);
      explanations.push("Uma categoria foi ignorada conforme premissa configurada.");
    }
  }

  return {
    horizonDays,
    reserveAmountMinor,
    safetyMarginPercent,
    ignoredCategoryIds: [...ignoredCategoryIds],
    includeInferredRecurrences,
    appliedAssumptionIds,
    explanations,
  };
}

function buildOptionalAssumptionUpdate(
  payload: UpdateFinancialAssumptionPayload,
  kind: FinancialAssumptionKind,
  effectiveFrom: ISODate,
): Partial<FinancialAssumption> {
  const update: Partial<FinancialAssumption> = {};

  if (payload.status !== undefined) {
    update.status = validateStatus(payload.status);
  }

  if (payload.scope !== undefined) {
    update.scope = validateScope(payload.scope);
  }

  if (payload.value !== undefined) {
    update.value = validateValue(kind, payload.value);
  }

  if (payload.effectiveFrom !== undefined) {
    update.effectiveFrom = validateDate(payload.effectiveFrom);
  }

  if (payload.effectiveTo !== undefined) {
    update.effectiveTo = validateEffectiveTo(effectiveFrom, payload.effectiveTo);
  }

  if (payload.reason !== undefined) {
    update.reason = payload.reason.trim();
  }

  return update;
}

function compareAssumptionPriority(a: FinancialAssumption, b: FinancialAssumption): number {
  const priorityA = getScopePriority(a.scope.kind);
  const priorityB = getScopePriority(b.scope.kind);

  if (priorityA !== priorityB) {
    return priorityA - priorityB;
  }

  return a.version - b.version;
}

function getScopePriority(scopeKind: FinancialAssumptionScopeKind): number {
  const priorities: Record<FinancialAssumptionScopeKind, number> = {
    global: 1,
    profile: 2,
    category: 3,
    account: 3,
    card: 3,
    inferred_recurrence: 4,
    calculation: 5,
  };

  return priorities[scopeKind];
}

function validateKind(kind: FinancialAssumptionKind): FinancialAssumptionKind {
  if (!ALLOWED_KINDS.includes(kind)) {
    throw new Error("Financial assumption kind is not supported.");
  }

  return kind;
}

function validateStatus(status: FinancialAssumptionStatus): FinancialAssumptionStatus {
  if (!ALLOWED_STATUSES.includes(status)) {
    throw new Error("Financial assumption status is not supported.");
  }

  return status;
}

function validateScope(scope: FinancialAssumptionScope): FinancialAssumptionScope {
  if (!ALLOWED_SCOPE_KINDS.includes(scope.kind)) {
    throw new Error("Financial assumption scope is not supported.");
  }

  if (scope.kind !== "global" && scope.kind !== "profile" && !scope.entityId?.trim()) {
    throw new Error("Scoped financial assumption requires an entity id.");
  }

  return scope;
}

function validateValue(
  kind: FinancialAssumptionKind,
  value: number | boolean | string,
): number | boolean | string {
  if (kind === "include_inferred_recurrences") {
    return Boolean(value);
  }

  if (kind === "ignored_category") {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error("Ignored category assumption requires a category id value.");
    }

    return value.trim();
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    throw new Error("Financial assumption numeric value must be zero or positive.");
  }

  if (kind === "horizon_days" && (!Number.isInteger(numericValue) || numericValue < 1)) {
    throw new Error("Availability horizon must be at least one day.");
  }

  return numericValue;
}

function validateDate(date: ISODate): ISODate {
  if (!date.trim()) {
    throw new Error("Financial assumption date is required.");
  }

  return date;
}

function validateEffectiveTo(effectiveFrom: ISODate, effectiveTo: ISODate): ISODate {
  const normalizedEffectiveTo = validateDate(effectiveTo);

  if (normalizedEffectiveTo < effectiveFrom) {
    throw new Error("Financial assumption effective end must be on or after start.");
  }

  return normalizedEffectiveTo;
}

function buildFinancialAssumptionAuditEntry(
  action: "create" | "update" | "archive" | "restore",
  actorId: EntityId,
  occurredAt: ISODateTime,
  before: FinancialAssumption | undefined,
  after: FinancialAssumption,
): AuditLogEntryDraft {
  const auditEntry: AuditLogEntryDraft = {
    organizationId: after.organizationId,
    financialProfileId: after.financialProfileId,
    occurredAt,
    actorKind: "user",
    actorId,
    action,
    entityKind: "financial_assumption" as AuditLogEntryDraft["entityKind"],
    entityId: after.id,
  };
  const redactedChanges = buildRedactedAssumptionChanges(before, after);

  if (redactedChanges !== undefined) {
    auditEntry.redactedChanges = redactedChanges;
  }

  return auditEntry;
}

function buildRedactedAssumptionChanges(
  before: FinancialAssumption | undefined,
  after: FinancialAssumption,
): Record<string, "changed" | "added" | "removed"> | undefined {
  const fields = [
    "status",
    "kind",
    "scope",
    "value",
    "origin",
    "effectiveFrom",
    "effectiveTo",
    "version",
    "archivedAt",
    "deactivatedAt",
    "reason",
  ] as const satisfies readonly (keyof FinancialAssumption)[];
  const changes: Record<string, "changed" | "added" | "removed"> = {};

  for (const field of fields) {
    const beforeValue = JSON.stringify(before?.[field]);
    const afterValue = JSON.stringify(after[field]);

    if (beforeValue === afterValue) {
      continue;
    }

    if (before?.[field] === undefined) {
      changes[field] = "added";
      continue;
    }

    if (after[field] === undefined) {
      changes[field] = "removed";
      continue;
    }

    changes[field] = "changed";
  }

  return Object.keys(changes).length > 0 ? changes : undefined;
}
