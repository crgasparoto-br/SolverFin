import type {
  Account,
  AuditLogEntryDraft,
  Category,
  EntityId,
  Installment,
  InstallmentStatus,
  ISODate,
  ISODateTime,
  Recurrence,
  RecurrenceFrequency,
  RecurrenceStatus,
} from "./index.js";
import type { TenantContext } from "./tenant.js";
import {
  applyTenantScope,
  getTenantScopedResource,
  listTenantScopedResources,
  updateTenantScopedResource,
} from "./tenant-authorization.js";

export type RecurrenceErrorCode =
  | "RECURRENCE_FREQUENCY_REQUIRED"
  | "RECURRENCE_FREQUENCY_INVALID"
  | "RECURRENCE_STATUS_INVALID"
  | "RECURRENCE_AMOUNT_INVALID"
  | "RECURRENCE_DATE_REQUIRED"
  | "RECURRENCE_END_BEFORE_START"
  | "RECURRENCE_DESCRIPTION_REQUIRED"
  | "RECURRENCE_ACCOUNT_REQUIRED"
  | "RECURRENCE_ACCOUNT_INVALID"
  | "RECURRENCE_ACCOUNT_ARCHIVED"
  | "RECURRENCE_CATEGORY_INVALID"
  | "RECURRENCE_CATEGORY_ARCHIVED"
  | "RECURRENCE_GENERATION_WINDOW_INVALID"
  | "INSTALLMENT_TOTAL_INVALID"
  | "INSTALLMENT_SEQUENCE_INVALID"
  | "INSTALLMENT_STATUS_INVALID";

export class RecurrenceError extends Error {
  readonly code: RecurrenceErrorCode;
  readonly statusCode = 400;

  constructor(code: RecurrenceErrorCode, message: string) {
    super(message);
    this.name = "RecurrenceError";
    this.code = code;
  }
}

export interface RecurrenceMutationResult {
  recurrence: Recurrence;
  auditEntry: AuditLogEntryDraft;
}

export interface CreateRecurrenceInput {
  id: EntityId;
  context: TenantContext;
  now: ISODateTime;
  payload: CreateRecurrencePayload;
  account?: Account;
  category?: Category;
}

export interface CreateRecurrencePayload {
  frequency: RecurrenceFrequency;
  startOn: ISODate;
  endOn?: ISODate;
  amountMinor: number;
  description: string;
  accountId: EntityId;
  currency?: string;
  categoryId?: EntityId;
  organizationId?: EntityId;
  financialProfileId?: EntityId;
}

export interface UpdateRecurrenceInput {
  context: TenantContext;
  recurrence: Recurrence | undefined;
  now: ISODateTime;
  payload: UpdateRecurrencePayload;
  account?: Account;
  category?: Category;
}

export interface UpdateRecurrencePayload {
  frequency?: RecurrenceFrequency;
  status?: RecurrenceStatus;
  startOn?: ISODate;
  endOn?: ISODate;
  amountMinor?: number;
  description?: string;
  accountId?: EntityId;
  currency?: string;
  categoryId?: EntityId;
  organizationId?: EntityId;
  financialProfileId?: EntityId;
}

export interface ListRecurrencesFilters {
  status?: RecurrenceStatus | "all";
  accountId?: EntityId;
  categoryId?: EntityId;
  activeOn?: ISODate;
}

export interface GenerateRecurrenceInstallmentsInput {
  context: TenantContext;
  recurrence: Recurrence | undefined;
  existingInstallments: readonly Installment[];
  now: ISODateTime;
  through: ISODate;
  makeInstallmentId: (sequenceNumber: number, dueOn: ISODate) => EntityId;
  maxOccurrences?: number;
}

export interface GenerateInstallmentScheduleInput {
  context: TenantContext;
  now: ISODateTime;
  firstDueOn: ISODate;
  totalInstallments: number;
  amountMinor: number;
  makeInstallmentId: (sequenceNumber: number, dueOn: ISODate) => EntityId;
  currency?: string;
  cardId?: EntityId;
  recurrenceId?: EntityId;
  existingInstallments?: readonly Installment[];
}

const ALLOWED_RECURRENCE_FREQUENCIES: readonly RecurrenceFrequency[] = [
  "daily",
  "weekly",
  "monthly",
  "yearly",
];
const ALLOWED_RECURRENCE_STATUSES: readonly RecurrenceStatus[] = [
  "active",
  "paused",
  "cancelled",
  "completed",
];
const ALLOWED_INSTALLMENT_STATUSES: readonly InstallmentStatus[] = [
  "planned",
  "posted",
  "reconciled",
  "cancelled",
];

export function createRecurrence(input: CreateRecurrenceInput): RecurrenceMutationResult {
  const payload = applyTenantScope(input.context, input.payload);
  const account = assertAccount(input.context, input.account, payload.accountId);
  assertCategory(input.context, input.category, payload.categoryId);

  const recurrence: Recurrence = {
    id: input.id,
    organizationId: payload.organizationId,
    financialProfileId: payload.financialProfileId,
    status: "active",
    frequency: validateFrequency(payload.frequency),
    startOn: validateDate(payload.startOn),
    amountMinor: validateAmount(payload.amountMinor),
    currency: normalizeCurrency(payload.currency ?? account.currency),
    description: normalizeDescription(payload.description),
    accountId: account.id,
    createdAt: input.now,
    updatedAt: input.now,
    createdByUserId: input.context.userId,
    updatedByUserId: input.context.userId,
  };

  if (payload.endOn !== undefined) {
    recurrence.endOn = validateEndOn(recurrence.startOn, payload.endOn);
  }

  if (payload.categoryId !== undefined) {
    recurrence.categoryId = payload.categoryId;
  }

  return {
    recurrence,
    auditEntry: buildRecurrenceAuditEntry("create", input.context.userId, input.now, undefined, recurrence),
  };
}

export function listRecurrences(
  context: TenantContext,
  recurrences: readonly Recurrence[],
  filters: ListRecurrencesFilters = {},
): Recurrence[] {
  return listTenantScopedResources(context, recurrences).filter((recurrence) => {
    const statusMatches =
      filters.status === undefined ||
      filters.status === "all" ||
      recurrence.status === filters.status;
    const accountMatches = filters.accountId === undefined || recurrence.accountId === filters.accountId;
    const categoryMatches =
      filters.categoryId === undefined || recurrence.categoryId === filters.categoryId;
    const activeOnMatches =
      filters.activeOn === undefined ||
      (recurrence.startOn <= filters.activeOn &&
        (recurrence.endOn === undefined || recurrence.endOn >= filters.activeOn));

    return statusMatches && accountMatches && categoryMatches && activeOnMatches;
  });
}

export function getRecurrence(
  context: TenantContext,
  recurrence: Recurrence | undefined,
): Recurrence {
  return getTenantScopedResource(context, recurrence);
}

export function updateRecurrence(input: UpdateRecurrenceInput): RecurrenceMutationResult {
  const currentRecurrence = updateTenantScopedResource(
    input.context,
    input.recurrence,
    input.payload,
  );
  const nextAccountId = input.payload.accountId ?? currentRecurrence.accountId;
  const account = assertAccount(input.context, input.account, nextAccountId);
  assertCategory(input.context, input.category, input.payload.categoryId ?? currentRecurrence.categoryId);

  const updatedRecurrence: Recurrence = {
    ...currentRecurrence,
    ...buildOptionalRecurrenceUpdate(input.payload, currentRecurrence.startOn),
    accountId: account.id,
    updatedAt: input.now,
    updatedByUserId: input.context.userId,
  };

  return {
    recurrence: updatedRecurrence,
    auditEntry: buildRecurrenceAuditEntry(
      "update",
      input.context.userId,
      input.now,
      currentRecurrence,
      updatedRecurrence,
    ),
  };
}

export function pauseRecurrence(
  context: TenantContext,
  recurrence: Recurrence | undefined,
  now: ISODateTime,
): RecurrenceMutationResult {
  return setRecurrenceStatus(context, recurrence, now, "paused");
}

export function resumeRecurrence(
  context: TenantContext,
  recurrence: Recurrence | undefined,
  now: ISODateTime,
): RecurrenceMutationResult {
  return setRecurrenceStatus(context, recurrence, now, "active");
}

export function cancelRecurrence(
  context: TenantContext,
  recurrence: Recurrence | undefined,
  now: ISODateTime,
): RecurrenceMutationResult {
  return setRecurrenceStatus(context, recurrence, now, "cancelled");
}

export function cancelFutureInstallments(
  context: TenantContext,
  installments: readonly Installment[],
  now: ISODateTime,
  from: ISODate,
): Installment[] {
  return listTenantScopedResources(context, installments).map((installment) => {
    if (installment.dueOn < from || installment.status !== "planned") {
      return installment;
    }

    return {
      ...installment,
      status: "cancelled",
      updatedAt: now,
      updatedByUserId: context.userId,
    };
  });
}

export function generateRecurrenceInstallments(
  input: GenerateRecurrenceInstallmentsInput,
): Installment[] {
  const recurrence = getTenantScopedResource(input.context, input.recurrence);

  if (recurrence.status !== "active") {
    return [];
  }

  const through = validateDate(input.through);

  if (through < recurrence.startOn) {
    throw new RecurrenceError(
      "RECURRENCE_GENERATION_WINDOW_INVALID",
      "Generation window must end on or after the recurrence start date.",
    );
  }

  const existingSequences = new Set(
    listTenantScopedResources(input.context, input.existingInstallments)
      .filter((installment) => installment.recurrenceId === recurrence.id)
      .map((installment) => installment.sequenceNumber),
  );
  const installments: Installment[] = [];
  const generationLimit = input.maxOccurrences ?? 36;

  for (let sequenceNumber = 1; sequenceNumber <= generationLimit; sequenceNumber += 1) {
    const dueOn = addFrequency(recurrence.startOn, recurrence.frequency, sequenceNumber - 1);

    if (dueOn > through || (recurrence.endOn !== undefined && dueOn > recurrence.endOn)) {
      break;
    }

    if (existingSequences.has(sequenceNumber)) {
      continue;
    }

    installments.push(
      buildInstallment({
        id: input.makeInstallmentId(sequenceNumber, dueOn),
        context: input.context,
        now: input.now,
        status: "planned",
        sequenceNumber,
        totalInstallments: recurrence.endOn === undefined ? 0 : countOccurrences(recurrence),
        dueOn,
        amountMinor: recurrence.amountMinor,
        currency: recurrence.currency,
        recurrenceId: recurrence.id,
      }),
    );
  }

  return installments;
}

export function generateInstallmentSchedule(input: GenerateInstallmentScheduleInput): Installment[] {
  const totalInstallments = validateTotalInstallments(input.totalInstallments);
  const firstDueOn = validateDate(input.firstDueOn);
  const existingSequences = new Set(
    listTenantScopedResources(input.context, input.existingInstallments ?? []).map(
      (installment) => installment.sequenceNumber,
    ),
  );
  const installments: Installment[] = [];

  for (let sequenceNumber = 1; sequenceNumber <= totalInstallments; sequenceNumber += 1) {
    if (existingSequences.has(sequenceNumber)) {
      continue;
    }

    const dueOn = addMonths(firstDueOn, sequenceNumber - 1);

    installments.push(
      buildInstallment({
        id: input.makeInstallmentId(sequenceNumber, dueOn),
        context: input.context,
        now: input.now,
        status: "planned",
        sequenceNumber,
        totalInstallments,
        dueOn,
        amountMinor: input.amountMinor,
        currency: normalizeCurrency(input.currency),
        cardId: input.cardId,
        recurrenceId: input.recurrenceId,
      }),
    );
  }

  return installments;
}

function setRecurrenceStatus(
  context: TenantContext,
  recurrence: Recurrence | undefined,
  now: ISODateTime,
  status: RecurrenceStatus,
): RecurrenceMutationResult {
  const currentRecurrence = getTenantScopedResource(context, recurrence);
  const updatedRecurrence: Recurrence = {
    ...currentRecurrence,
    status: validateStatus(status),
    updatedAt: now,
    updatedByUserId: context.userId,
  };

  return {
    recurrence: updatedRecurrence,
    auditEntry: buildRecurrenceAuditEntry(
      "update",
      context.userId,
      now,
      currentRecurrence,
      updatedRecurrence,
    ),
  };
}

function buildOptionalRecurrenceUpdate(
  payload: UpdateRecurrencePayload,
  currentStartOn: ISODate,
): Partial<Recurrence> {
  const update: Partial<Recurrence> = {};
  const nextStartOn = payload.startOn !== undefined ? validateDate(payload.startOn) : currentStartOn;

  if (payload.frequency !== undefined) {
    update.frequency = validateFrequency(payload.frequency);
  }

  if (payload.status !== undefined) {
    update.status = validateStatus(payload.status);
  }

  if (payload.startOn !== undefined) {
    update.startOn = nextStartOn;
  }

  if (payload.endOn !== undefined) {
    update.endOn = validateEndOn(nextStartOn, payload.endOn);
  }

  if (payload.amountMinor !== undefined) {
    update.amountMinor = validateAmount(payload.amountMinor);
  }

  if (payload.description !== undefined) {
    update.description = normalizeDescription(payload.description);
  }

  if (payload.currency !== undefined) {
    update.currency = normalizeCurrency(payload.currency);
  }

  if (payload.categoryId !== undefined) {
    update.categoryId = payload.categoryId;
  }

  return update;
}

function buildInstallment(input: {
  id: EntityId;
  context: TenantContext;
  now: ISODateTime;
  status: InstallmentStatus;
  sequenceNumber: number;
  totalInstallments: number;
  dueOn: ISODate;
  amountMinor: number;
  currency: string;
  cardId?: EntityId;
  recurrenceId?: EntityId;
}): Installment {
  const installment: Installment = {
    id: input.id,
    organizationId: input.context.organizationId,
    financialProfileId: input.context.financialProfileId,
    status: validateInstallmentStatus(input.status),
    sequenceNumber: validateSequenceNumber(input.sequenceNumber, input.totalInstallments),
    totalInstallments: input.totalInstallments,
    dueOn: validateDate(input.dueOn),
    amountMinor: validateAmount(input.amountMinor),
    currency: normalizeCurrency(input.currency),
    createdAt: input.now,
    updatedAt: input.now,
    createdByUserId: input.context.userId,
    updatedByUserId: input.context.userId,
  };

  if (input.cardId !== undefined) {
    installment.cardId = input.cardId;
  }

  if (input.recurrenceId !== undefined) {
    installment.recurrenceId = input.recurrenceId;
  }

  return installment;
}

function assertAccount(
  context: TenantContext,
  account: Account | undefined,
  accountId: EntityId,
): Account {
  if (!accountId) {
    throw new RecurrenceError("RECURRENCE_ACCOUNT_REQUIRED", "Recurrence account is required.");
  }

  const scopedAccount = getTenantScopedResource(context, account);

  if (scopedAccount.id !== accountId) {
    throw new RecurrenceError("RECURRENCE_ACCOUNT_INVALID", "Recurrence account id does not match.");
  }

  if (scopedAccount.status !== "active") {
    throw new RecurrenceError("RECURRENCE_ACCOUNT_ARCHIVED", "Recurrence account must be active.");
  }

  return scopedAccount;
}

function assertCategory(
  context: TenantContext,
  category: Category | undefined,
  categoryId: EntityId | undefined,
): void {
  if (categoryId === undefined) {
    return;
  }

  const scopedCategory = getTenantScopedResource(context, category);

  if (scopedCategory.id !== categoryId) {
    throw new RecurrenceError("RECURRENCE_CATEGORY_INVALID", "Recurrence category id does not match.");
  }

  if (scopedCategory.status !== "active") {
    throw new RecurrenceError("RECURRENCE_CATEGORY_ARCHIVED", "Recurrence category must be active.");
  }
}

function validateFrequency(frequency: RecurrenceFrequency | undefined): RecurrenceFrequency {
  if (!frequency) {
    throw new RecurrenceError("RECURRENCE_FREQUENCY_REQUIRED", "Recurrence frequency is required.");
  }

  if (!ALLOWED_RECURRENCE_FREQUENCIES.includes(frequency)) {
    throw new RecurrenceError("RECURRENCE_FREQUENCY_INVALID", "Recurrence frequency is not supported.");
  }

  return frequency;
}

function validateStatus(status: RecurrenceStatus): RecurrenceStatus {
  if (!ALLOWED_RECURRENCE_STATUSES.includes(status)) {
    throw new RecurrenceError("RECURRENCE_STATUS_INVALID", "Recurrence status is not supported.");
  }

  return status;
}

function validateInstallmentStatus(status: InstallmentStatus): InstallmentStatus {
  if (!ALLOWED_INSTALLMENT_STATUSES.includes(status)) {
    throw new RecurrenceError("INSTALLMENT_STATUS_INVALID", "Installment status is not supported.");
  }

  return status;
}

function validateAmount(amountMinor: number): number {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new RecurrenceError(
      "RECURRENCE_AMOUNT_INVALID",
      "Amount must be a positive integer minor-unit amount.",
    );
  }

  return amountMinor;
}

function validateTotalInstallments(totalInstallments: number): number {
  if (!Number.isInteger(totalInstallments) || totalInstallments <= 0) {
    throw new RecurrenceError(
      "INSTALLMENT_TOTAL_INVALID",
      "Installment schedule must have a positive total number of installments.",
    );
  }

  return totalInstallments;
}

function validateSequenceNumber(sequenceNumber: number, totalInstallments: number): number {
  if (
    !Number.isInteger(sequenceNumber) ||
    sequenceNumber <= 0 ||
    (totalInstallments > 0 && sequenceNumber > totalInstallments)
  ) {
    throw new RecurrenceError(
      "INSTALLMENT_SEQUENCE_INVALID",
      "Installment sequence number must be within the schedule range.",
    );
  }

  return sequenceNumber;
}

function validateDate(date: ISODate): ISODate {
  if (!date.trim()) {
    throw new RecurrenceError("RECURRENCE_DATE_REQUIRED", "Date is required.");
  }

  return date;
}

function validateEndOn(startOn: ISODate, endOn: ISODate): ISODate {
  const normalizedEndOn = validateDate(endOn);

  if (normalizedEndOn < startOn) {
    throw new RecurrenceError(
      "RECURRENCE_END_BEFORE_START",
      "Recurrence end date must be on or after start date.",
    );
  }

  return normalizedEndOn;
}

function normalizeDescription(description: string): string {
  const normalizedDescription = description.trim();

  if (!normalizedDescription) {
    throw new RecurrenceError(
      "RECURRENCE_DESCRIPTION_REQUIRED",
      "Recurrence description is required.",
    );
  }

  return normalizedDescription;
}

function normalizeCurrency(currency = "BRL"): string {
  return currency.trim().toUpperCase();
}

function addFrequency(startOn: ISODate, frequency: RecurrenceFrequency, offset: number): ISODate {
  if (frequency === "daily") {
    return addDays(startOn, offset);
  }

  if (frequency === "weekly") {
    return addDays(startOn, offset * 7);
  }

  if (frequency === "yearly") {
    return addMonths(startOn, offset * 12);
  }

  return addMonths(startOn, offset);
}

function addDays(startOn: ISODate, days: number): ISODate {
  const date = parseDate(startOn);
  date.setUTCDate(date.getUTCDate() + days);

  return formatDate(date);
}

function addMonths(startOn: ISODate, months: number): ISODate {
  const [year, month, day] = startOn.split("-").map(Number) as [number, number, number];
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = getLastDayOfMonth(targetYear, normalizedMonthIndex + 1);
  const date = new Date(Date.UTC(targetYear, normalizedMonthIndex, Math.min(day, lastDay)));

  return formatDate(date);
}

function countOccurrences(recurrence: Recurrence): number {
  if (recurrence.endOn === undefined) {
    return 0;
  }

  let count = 0;

  for (let offset = 0; offset < 600; offset += 1) {
    const dueOn = addFrequency(recurrence.startOn, recurrence.frequency, offset);

    if (dueOn > recurrence.endOn) {
      break;
    }

    count += 1;
  }

  return count;
}

function parseDate(date: ISODate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function formatDate(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

function getLastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function buildRecurrenceAuditEntry(
  action: "create" | "update",
  actorId: EntityId,
  occurredAt: ISODateTime,
  before: Recurrence | undefined,
  after: Recurrence,
): AuditLogEntryDraft {
  const auditEntry: AuditLogEntryDraft = {
    organizationId: after.organizationId,
    financialProfileId: after.financialProfileId,
    occurredAt,
    actorKind: "user",
    actorId,
    action,
    entityKind: "recurrence",
    entityId: after.id,
  };
  const redactedChanges = buildRedactedRecurrenceChanges(before, after);

  if (redactedChanges !== undefined) {
    auditEntry.redactedChanges = redactedChanges;
  }

  return auditEntry;
}

function buildRedactedRecurrenceChanges(
  before: Recurrence | undefined,
  after: Recurrence,
): Record<string, "changed" | "added" | "removed"> | undefined {
  const fields = [
    "status",
    "frequency",
    "startOn",
    "endOn",
    "amountMinor",
    "currency",
    "description",
    "accountId",
    "categoryId",
  ] as const satisfies readonly (keyof Recurrence)[];
  const changes: Record<string, "changed" | "added" | "removed"> = {};

  for (const field of fields) {
    const beforeValue = before?.[field];
    const afterValue = after[field];

    if (beforeValue === afterValue) {
      continue;
    }

    if (beforeValue === undefined) {
      changes[field] = "added";
      continue;
    }

    if (afterValue === undefined) {
      changes[field] = "removed";
      continue;
    }

    changes[field] = "changed";
  }

  return Object.keys(changes).length > 0 ? changes : undefined;
}
