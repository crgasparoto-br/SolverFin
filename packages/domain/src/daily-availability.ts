import type {
  EntityId,
  Installment,
  Invoice,
  ISODate,
  ISODateTime,
  Recurrence,
  Transaction,
} from "./index.js";
import type { TenantContext } from "./tenant.js";
import { listTenantScopedResources } from "./tenant-authorization.js";
import type { PayableReceivable } from "./payables-receivables.js";
import type { AvailabilityAssumptionValues, FinancialAssumption } from "./financial-assumptions.js";
import { resolveAvailabilityAssumptions } from "./financial-assumptions.js";
import type { InferredRecurringExpense } from "./statistical-recurrences.js";

export type FinancialAvailabilityConfidence = "high" | "medium" | "low";
export type AvailabilityComponentKind =
  | "balance"
  | "income"
  | "known_expense"
  | "card"
  | "registered_recurrence"
  | "inferred"
  | "reserve"
  | "safety_margin"
  | "ignored";

export interface DailyAvailabilityComponent {
  label: string;
  kind: AvailabilityComponentKind;
  amountMinor: number;
  confidence: FinancialAvailabilityConfidence;
  source: string;
  entityId?: EntityId;
}

export interface DailyAvailabilityResult {
  availableTodayMinor: number;
  projectedBalanceMinor: number;
  currency: string;
  horizonStartOn: ISODate;
  horizonEndOn: ISODate;
  confidence: FinancialAvailabilityConfidence;
  components: readonly DailyAvailabilityComponent[];
  assumptions: readonly string[];
  appliedAssumptionIds: readonly EntityId[];
  limitations: readonly string[];
  calculatedAt: ISODateTime;
}

export interface CalculateDailyAvailabilityInput {
  context: TenantContext;
  today: ISODate;
  calculatedAt: ISODateTime;
  currentBalanceMinor: number;
  currency?: string;
  assumptions?: readonly FinancialAssumption[];
  resolvedAssumptions?: AvailabilityAssumptionValues;
  transactions?: readonly Transaction[];
  payablesReceivables?: readonly PayableReceivable[];
  invoices?: readonly Invoice[];
  installments?: readonly Installment[];
  registeredRecurrences?: readonly Recurrence[];
  inferredRecurrences?: readonly InferredRecurringExpense[];
}

export function calculateDailyAvailability(
  input: CalculateDailyAvailabilityInput,
): DailyAvailabilityResult {
  const resolvedAssumptions =
    input.resolvedAssumptions ??
    resolveAvailabilityAssumptions(input.context, input.assumptions ?? [], input.today);
  const horizonEndOn = addDays(input.today, resolvedAssumptions.horizonDays - 1);
  const components: DailyAvailabilityComponent[] = [
    {
      label: "Saldo atual",
      kind: "balance",
      amountMinor: input.currentBalanceMinor,
      confidence: "high",
      source: "accounts",
    },
  ];
  const ignoredCategoryIds = new Set(resolvedAssumptions.ignoredCategoryIds);
  const seenEntityIds = new Set<EntityId>();
  const limitations: string[] = [];
  const currency = normalizeCurrency(input.currency);

  appendTransactionComponents(input, horizonEndOn, ignoredCategoryIds, seenEntityIds, components);
  appendPayableReceivableComponents(input, horizonEndOn, ignoredCategoryIds, seenEntityIds, components);
  appendInvoiceComponents(input, horizonEndOn, seenEntityIds, components);
  appendInstallmentComponents(input, horizonEndOn, seenEntityIds, components);
  appendRegisteredRecurrenceComponents(input, horizonEndOn, ignoredCategoryIds, seenEntityIds, components);

  if (resolvedAssumptions.includeInferredRecurrences) {
    appendInferredRecurrenceComponents(input, horizonEndOn, ignoredCategoryIds, seenEntityIds, components);
  } else {
    limitations.push("Recorrencias inferidas foram desativadas nas premissas.");
  }

  const futureOutflowMinor = Math.abs(
    components
      .filter((component) => component.amountMinor < 0 && component.kind !== "ignored")
      .reduce((sum, component) => sum + component.amountMinor, 0),
  );
  const safetyMarginMinor = Math.round(
    (futureOutflowMinor * resolvedAssumptions.safetyMarginPercent) / 100,
  );

  if (resolvedAssumptions.reserveAmountMinor > 0) {
    components.push({
      label: "Reserva minima",
      kind: "reserve",
      amountMinor: -resolvedAssumptions.reserveAmountMinor,
      confidence: "high",
      source: "financial_assumptions",
    });
  }

  if (safetyMarginMinor > 0) {
    components.push({
      label: "Margem de seguranca",
      kind: "safety_margin",
      amountMinor: -safetyMarginMinor,
      confidence: "medium",
      source: "financial_assumptions",
    });
  }

  if ((input.transactions ?? []).length === 0) {
    limitations.push("Historico de transacoes vazio ou indisponivel reduz a confianca do calculo.");
  }

  const projectedBalanceMinor = components
    .filter((component) => component.kind !== "ignored")
    .reduce((sum, component) => sum + component.amountMinor, 0);
  const confidence = resolveConfidence(components, limitations);

  return {
    availableTodayMinor: Math.max(0, projectedBalanceMinor),
    projectedBalanceMinor,
    currency,
    horizonStartOn: input.today,
    horizonEndOn,
    confidence,
    components,
    assumptions: resolvedAssumptions.explanations,
    appliedAssumptionIds: resolvedAssumptions.appliedAssumptionIds,
    limitations,
    calculatedAt: input.calculatedAt,
  };
}

function appendTransactionComponents(
  input: CalculateDailyAvailabilityInput,
  horizonEndOn: ISODate,
  ignoredCategoryIds: Set<EntityId>,
  seenEntityIds: Set<EntityId>,
  components: DailyAvailabilityComponent[],
): void {
  for (const transaction of listTenantScopedResources(input.context, input.transactions ?? [])) {
    if (transaction.status === "voided" || transaction.occurredOn < input.today || transaction.occurredOn > horizonEndOn) {
      continue;
    }

    if (transaction.invoiceId !== undefined || transaction.installmentId !== undefined) {
      continue;
    }

    seenEntityIds.add(transaction.id);

    if (transaction.categoryId !== undefined && ignoredCategoryIds.has(transaction.categoryId)) {
      components.push(buildIgnoredComponent("Lancamento ignorado", transaction.amountMinor, "transactions", transaction.id));
      continue;
    }

    if (transaction.kind === "income") {
      components.push({
        label: transaction.description || "Receita planejada",
        kind: "income",
        amountMinor: transaction.amountMinor,
        confidence: transaction.status === "planned" ? "medium" : "high",
        source: "transactions",
        entityId: transaction.id,
      });
      continue;
    }

    if (transaction.kind === "expense") {
      components.push({
        label: transaction.description || "Despesa planejada",
        kind: "known_expense",
        amountMinor: -transaction.amountMinor,
        confidence: transaction.status === "planned" ? "medium" : "high",
        source: "transactions",
        entityId: transaction.id,
      });
    }
  }
}

function appendPayableReceivableComponents(
  input: CalculateDailyAvailabilityInput,
  horizonEndOn: ISODate,
  ignoredCategoryIds: Set<EntityId>,
  seenEntityIds: Set<EntityId>,
  components: DailyAvailabilityComponent[],
): void {
  for (const item of listTenantScopedResources(input.context, input.payablesReceivables ?? [])) {
    if (item.status !== "pending" || item.dueOn < input.today || item.dueOn > horizonEndOn) {
      continue;
    }

    if (seenEntityIds.has(item.id)) {
      continue;
    }

    seenEntityIds.add(item.id);

    if (item.categoryId !== undefined && ignoredCategoryIds.has(item.categoryId)) {
      components.push(buildIgnoredComponent("Conta ignorada", item.amountMinor, "payables_receivables", item.id));
      continue;
    }

    components.push({
      label: item.description,
      kind: item.kind === "receivable" ? "income" : "known_expense",
      amountMinor: item.kind === "receivable" ? item.amountMinor : -item.amountMinor,
      confidence: "high",
      source: "payables_receivables",
      entityId: item.id,
    });
  }
}

function appendInvoiceComponents(
  input: CalculateDailyAvailabilityInput,
  horizonEndOn: ISODate,
  seenEntityIds: Set<EntityId>,
  components: DailyAvailabilityComponent[],
): void {
  for (const invoice of listTenantScopedResources(input.context, input.invoices ?? [])) {
    if (
      invoice.status === "paid" ||
      invoice.status === "cancelled" ||
      invoice.dueOn < input.today ||
      invoice.dueOn > horizonEndOn ||
      seenEntityIds.has(invoice.id)
    ) {
      continue;
    }

    seenEntityIds.add(invoice.id);
    components.push({
      label: `Fatura ${invoice.periodEndOn}`,
      kind: "card",
      amountMinor: -invoice.totalAmountMinor,
      confidence: invoice.status === "open" ? "medium" : "high",
      source: "invoices",
      entityId: invoice.id,
    });
  }
}

function appendInstallmentComponents(
  input: CalculateDailyAvailabilityInput,
  horizonEndOn: ISODate,
  seenEntityIds: Set<EntityId>,
  components: DailyAvailabilityComponent[],
): void {
  for (const installment of listTenantScopedResources(input.context, input.installments ?? [])) {
    if (
      installment.status === "cancelled" ||
      installment.status === "reconciled" ||
      installment.dueOn < input.today ||
      installment.dueOn > horizonEndOn ||
      seenEntityIds.has(installment.id) ||
      (installment.transactionId !== undefined && seenEntityIds.has(installment.transactionId))
    ) {
      continue;
    }

    seenEntityIds.add(installment.id);
    components.push({
      label: `Parcela ${installment.sequenceNumber}/${installment.totalInstallments || "?"}`,
      kind: installment.cardId !== undefined ? "card" : "known_expense",
      amountMinor: -installment.amountMinor,
      confidence: "high",
      source: "installments",
      entityId: installment.id,
    });
  }
}

function appendRegisteredRecurrenceComponents(
  input: CalculateDailyAvailabilityInput,
  horizonEndOn: ISODate,
  ignoredCategoryIds: Set<EntityId>,
  seenEntityIds: Set<EntityId>,
  components: DailyAvailabilityComponent[],
): void {
  for (const recurrence of listTenantScopedResources(input.context, input.registeredRecurrences ?? [])) {
    if (recurrence.status !== "active") {
      continue;
    }

    const nextDueOn = nextDueOnWithinWindow(recurrence.startOn, recurrence.frequency, input.today, horizonEndOn, recurrence.endOn);

    if (nextDueOn === undefined || seenEntityIds.has(recurrence.id)) {
      continue;
    }

    seenEntityIds.add(recurrence.id);

    if (recurrence.categoryId !== undefined && ignoredCategoryIds.has(recurrence.categoryId)) {
      components.push(buildIgnoredComponent("Recorrencia ignorada", recurrence.amountMinor, "recurrences", recurrence.id));
      continue;
    }

    components.push({
      label: recurrence.description,
      kind: "registered_recurrence",
      amountMinor: -recurrence.amountMinor,
      confidence: "high",
      source: "recurrences",
      entityId: recurrence.id,
    });
  }
}

function appendInferredRecurrenceComponents(
  input: CalculateDailyAvailabilityInput,
  horizonEndOn: ISODate,
  ignoredCategoryIds: Set<EntityId>,
  seenEntityIds: Set<EntityId>,
  components: DailyAvailabilityComponent[],
): void {
  for (const recurrence of listTenantScopedResources(input.context, input.inferredRecurrences ?? [])) {
    if (
      recurrence.status === "ignored" ||
      recurrence.status === "disabled" ||
      recurrence.nextExpectedOn < input.today ||
      recurrence.nextExpectedOn > horizonEndOn ||
      seenEntityIds.has(recurrence.id)
    ) {
      continue;
    }

    seenEntityIds.add(recurrence.id);

    if (recurrence.categoryId !== undefined && ignoredCategoryIds.has(recurrence.categoryId)) {
      components.push(buildIgnoredComponent("Recorrencia inferida ignorada", recurrence.averageAmountMinor, "statistical_recurrences", recurrence.id));
      continue;
    }

    components.push({
      label: recurrence.description,
      kind: "inferred",
      amountMinor: -recurrence.averageAmountMinor,
      confidence: recurrence.confidence >= 0.75 ? "medium" : "low",
      source: "statistical_recurrences",
      entityId: recurrence.id,
    });
  }
}

function buildIgnoredComponent(
  label: string,
  amountMinor: number,
  source: string,
  entityId: EntityId,
): DailyAvailabilityComponent {
  return {
    label,
    kind: "ignored",
    amountMinor,
    confidence: "high",
    source,
    entityId,
  };
}

function nextDueOnWithinWindow(
  startOn: ISODate,
  frequency: Recurrence["frequency"],
  windowStartOn: ISODate,
  windowEndOn: ISODate,
  endOn: ISODate | undefined,
): ISODate | undefined {
  for (let occurrence = 0; occurrence < 600; occurrence += 1) {
    const dueOn = addFrequency(startOn, frequency, occurrence);

    if (endOn !== undefined && dueOn > endOn) {
      return undefined;
    }

    if (dueOn > windowEndOn) {
      return undefined;
    }

    if (dueOn >= windowStartOn) {
      return dueOn;
    }
  }

  return undefined;
}

function resolveConfidence(
  components: readonly DailyAvailabilityComponent[],
  limitations: readonly string[],
): FinancialAvailabilityConfidence {
  if (limitations.length > 0 || components.some((component) => component.confidence === "low")) {
    return "low";
  }

  if (components.some((component) => component.confidence === "medium")) {
    return "medium";
  }

  return "high";
}

function addFrequency(startOn: ISODate, frequency: Recurrence["frequency"], offset: number): ISODate {
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

function normalizeCurrency(currency = "BRL"): string {
  return currency.trim().toUpperCase();
}
