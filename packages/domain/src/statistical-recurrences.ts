import type { EntityId, ISODate, ISODateTime, Recurrence, TenantScoped, Transaction } from "./index.js";
import type { TenantContext } from "./tenant.js";
import { listTenantScopedResources } from "./tenant-authorization.js";

export type InferredRecurrenceFrequency = "weekly" | "monthly" | "yearly";
export type InferredRecurrenceStatus = "suggested" | "accepted" | "ignored" | "adjusted" | "disabled";
export type RecurrenceOrigin = "registered" | "confirmed" | "inferred";

export interface InferredRecurringExpense extends TenantScoped {
  id: EntityId;
  status: InferredRecurrenceStatus;
  origin: "inferred";
  frequency: InferredRecurrenceFrequency;
  averageAmountMinor: number;
  varianceMinor: number;
  occurrenceCount: number;
  lastOccurrenceOn: ISODate;
  nextExpectedOn: ISODate;
  confidence: number;
  description: string;
  categoryId?: EntityId;
  accountId?: EntityId;
  cardId?: EntityId;
  sourceTransactionIds: readonly EntityId[];
  explanation: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  acceptedAt?: ISODateTime;
  ignoredAt?: ISODateTime;
  disabledAt?: ISODateTime;
}

export interface DetectRecurringExpensesInput {
  context: TenantContext;
  transactions: readonly Transaction[];
  registeredRecurrences?: readonly Recurrence[];
  now: ISODateTime;
  minOccurrences?: number;
}

export interface UpdateInferredRecurrenceDecisionInput {
  context: TenantContext;
  recurrence: InferredRecurringExpense | undefined;
  now: ISODateTime;
  decision: Extract<InferredRecurrenceStatus, "accepted" | "ignored" | "adjusted" | "disabled">;
  adjustedAmountMinor?: number;
  adjustedFrequency?: InferredRecurrenceFrequency;
}

const DEFAULT_MIN_OCCURRENCES = 3;

export function detectRecurringExpenses(
  input: DetectRecurringExpensesInput,
): InferredRecurringExpense[] {
  const minOccurrences = input.minOccurrences ?? DEFAULT_MIN_OCCURRENCES;
  const registeredKeys = new Set(
    listTenantScopedResources(input.context, input.registeredRecurrences ?? []).map((recurrence) =>
      buildRegisteredRecurrenceKey(recurrence),
    ),
  );
  const groups = new Map<string, Transaction[]>();

  for (const transaction of listTenantScopedResources(input.context, input.transactions)) {
    if (transaction.kind !== "expense" || transaction.status === "voided") {
      continue;
    }

    if (transaction.recurrenceId !== undefined) {
      continue;
    }

    const key = buildTransactionGroupKey(transaction);
    const group = groups.get(key) ?? [];
    group.push(transaction);
    groups.set(key, group);
  }

  const inferred: InferredRecurringExpense[] = [];

  for (const group of groups.values()) {
    if (group.length < minOccurrences) {
      continue;
    }

    const ordered = [...group].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
    const [firstTransaction] = ordered;

    if (!firstTransaction) {
      continue;
    }

    if (registeredKeys.has(buildTransactionRegisteredKey(firstTransaction))) {
      continue;
    }

    const detectedFrequency = detectFrequency(ordered.map((transaction) => transaction.occurredOn));

    if (detectedFrequency === undefined) {
      continue;
    }

    const amounts = ordered.map((transaction) => transaction.amountMinor);
    const averageAmountMinor = Math.round(average(amounts));
    const varianceMinor = Math.round(variance(amounts, averageAmountMinor));
    const confidence = calculateConfidence(ordered.length, amounts, varianceMinor, averageAmountMinor);

    if (confidence < 0.55) {
      continue;
    }

    const lastOccurrenceOn = ordered[ordered.length - 1]?.occurredOn ?? firstTransaction.occurredOn;
    const candidate: InferredRecurringExpense = {
      id: buildInferredRecurrenceId(input.context, firstTransaction, detectedFrequency),
      organizationId: input.context.organizationId,
      financialProfileId: input.context.financialProfileId,
      status: "suggested",
      origin: "inferred",
      frequency: detectedFrequency,
      averageAmountMinor,
      varianceMinor,
      occurrenceCount: ordered.length,
      lastOccurrenceOn,
      nextExpectedOn: addFrequency(lastOccurrenceOn, detectedFrequency, 1),
      confidence,
      description: normalizeDescription(firstTransaction.description),
      sourceTransactionIds: ordered.map((transaction) => transaction.id),
      explanation: buildInferenceExplanation(detectedFrequency, ordered.length, confidence),
      createdAt: input.now,
      updatedAt: input.now,
    };

    if (firstTransaction.categoryId !== undefined) {
      candidate.categoryId = firstTransaction.categoryId;
    }

    if (firstTransaction.accountId !== undefined) {
      candidate.accountId = firstTransaction.accountId;
    }

    if (firstTransaction.cardId !== undefined) {
      candidate.cardId = firstTransaction.cardId;
    }

    inferred.push(candidate);
  }

  return inferred.sort((a, b) => b.confidence - a.confidence);
}

export function updateInferredRecurrenceDecision(
  input: UpdateInferredRecurrenceDecisionInput,
): InferredRecurringExpense {
  const recurrence = assertScopedInferredRecurrence(input.context, input.recurrence);
  const updated: InferredRecurringExpense = {
    ...recurrence,
    status: input.decision,
    updatedAt: input.now,
  };

  if (input.decision === "accepted") {
    updated.acceptedAt = input.now;
  }

  if (input.decision === "ignored") {
    updated.ignoredAt = input.now;
  }

  if (input.decision === "disabled") {
    updated.disabledAt = input.now;
  }

  if (input.adjustedAmountMinor !== undefined) {
    updated.averageAmountMinor = validatePositiveAmount(input.adjustedAmountMinor);
  }

  if (input.adjustedFrequency !== undefined) {
    updated.frequency = input.adjustedFrequency;
    updated.nextExpectedOn = addFrequency(updated.lastOccurrenceOn, input.adjustedFrequency, 1);
  }

  return updated;
}

function assertScopedInferredRecurrence(
  context: TenantContext,
  recurrence: InferredRecurringExpense | undefined,
): InferredRecurringExpense {
  if (
    recurrence === undefined ||
    recurrence.organizationId !== context.organizationId ||
    recurrence.financialProfileId !== context.financialProfileId
  ) {
    throw new Error("Inferred recurrence belongs to another tenant or does not exist.");
  }

  return recurrence;
}

function buildTransactionGroupKey(transaction: Transaction): string {
  return [
    normalizeDescription(transaction.description),
    transaction.categoryId ?? "no-category",
    transaction.accountId ?? "no-account",
    transaction.cardId ?? "no-card",
  ].join("|");
}

function buildRegisteredRecurrenceKey(recurrence: Recurrence): string {
  return [
    normalizeDescription(recurrence.description),
    recurrence.categoryId ?? "no-category",
    recurrence.accountId,
  ].join("|");
}

function buildTransactionRegisteredKey(transaction: Transaction): string {
  return [
    normalizeDescription(transaction.description),
    transaction.categoryId ?? "no-category",
    transaction.accountId ?? "no-account",
  ].join("|");
}

function buildInferredRecurrenceId(
  context: TenantContext,
  transaction: Transaction,
  frequency: InferredRecurrenceFrequency,
): EntityId {
  return [
    "inferred",
    context.organizationId,
    context.financialProfileId,
    frequency,
    normalizeDescription(transaction.description).replace(/[^a-z0-9]+/g, "-"),
    transaction.categoryId ?? transaction.accountId ?? transaction.cardId ?? "general",
  ].join("-");
}

function detectFrequency(dates: readonly ISODate[]): InferredRecurrenceFrequency | undefined {
  if (dates.length < 2) {
    return undefined;
  }

  const gaps = dates.slice(1).map((date, index) => daysBetween(dates[index] as ISODate, date));
  const averageGap = average(gaps);
  const maxDistance = Math.max(...gaps.map((gap) => Math.abs(gap - averageGap)));

  if (averageGap >= 6 && averageGap <= 8 && maxDistance <= 2) {
    return "weekly";
  }

  if (averageGap >= 25 && averageGap <= 35 && maxDistance <= 7) {
    return "monthly";
  }

  if (averageGap >= 350 && averageGap <= 380 && maxDistance <= 20) {
    return "yearly";
  }

  return undefined;
}

function calculateConfidence(
  occurrenceCount: number,
  amounts: readonly number[],
  varianceMinor: number,
  averageAmountMinor: number,
): number {
  const countScore = Math.min(0.45, occurrenceCount * 0.1);
  const variationRatio = averageAmountMinor === 0 ? 1 : Math.sqrt(varianceMinor) / averageAmountMinor;
  const amountScore = Math.max(0.15, 0.45 - variationRatio);
  const stabilityScore = new Set(amounts).size === 1 ? 0.1 : 0.05;

  return roundConfidence(Math.min(0.98, countScore + amountScore + stabilityScore));
}

function buildInferenceExplanation(
  frequency: InferredRecurrenceFrequency,
  occurrenceCount: number,
  confidence: number,
): string {
  const frequencyText: Record<InferredRecurrenceFrequency, string> = {
    weekly: "semanal",
    monthly: "mensal",
    yearly: "anual",
  };

  return `Padrao ${frequencyText[frequency]} inferido a partir de ${occurrenceCount} ocorrencias com confianca ${Math.round(confidence * 100)}%.`;
}

function normalizeDescription(description: string): string {
  return description
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function variance(values: readonly number[], mean: number): number {
  return average(values.map((value) => (value - mean) ** 2));
}

function daysBetween(startOn: ISODate, endOn: ISODate): number {
  const start = Date.parse(`${startOn}T00:00:00.000Z`);
  const end = Date.parse(`${endOn}T00:00:00.000Z`);

  return Math.round((end - start) / 86_400_000);
}

function addFrequency(
  startOn: ISODate,
  frequency: InferredRecurrenceFrequency,
  count: number,
): ISODate {
  if (frequency === "weekly") {
    return addDays(startOn, count * 7);
  }

  if (frequency === "yearly") {
    return addMonths(startOn, count * 12);
  }

  return addMonths(startOn, count);
}

function addDays(startOn: ISODate, days: number): ISODate {
  const date = new Date(`${startOn}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function addMonths(startOn: ISODate, months: number): ISODate {
  const [year, month, day] = startOn.split("-").map(Number) as [number, number, number];
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
  const targetMonth = normalizedMonthIndex + 1;
  const clampedDay = Math.min(day, new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate());

  return `${String(targetYear).padStart(4, "0")}-${String(targetMonth).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
}

function validatePositiveAmount(amountMinor: number): number {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new Error("Adjusted inferred recurrence amount must be positive.");
  }

  return amountMinor;
}

function roundConfidence(confidence: number): number {
  return Math.round(confidence * 100) / 100;
}
