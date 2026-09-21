import { addRecurrenceFrequency } from "./recurrence-calendar.js";
import { buildPayableReceivableTransitionPlan } from "./payables-receivables-transition.js";
import type { PayableReceivable } from "./payables-receivables.js";
import type { TenantContext } from "./tenant.js";
import type { Card, EntityId, Invoice, ISODate, Recurrence, Transaction } from "./index.js";

export type FutureCommitmentSourceKind =
  | "transaction"
  | "invoice"
  | "recurrence_projection"
  | "payable_receivable";

export type FutureCommitmentEffectRole =
  | "source_account"
  | "destination_account"
  | "invoice_payment"
  | "recurrence_account"
  | "legacy_account";

export type FutureCommitmentErrorCode =
  | "FUTURE_COMMITMENT_PERIOD_INVALID"
  | "FUTURE_COMMITMENT_CURRENCY_INVALID"
  | "FUTURE_COMMITMENT_AMOUNT_INVALID"
  | "FUTURE_COMMITMENT_TRANSFER_INCOMPLETE";

export class FutureCommitmentError extends Error {
  readonly code: FutureCommitmentErrorCode;
  readonly statusCode: number;

  constructor(code: FutureCommitmentErrorCode, message: string, statusCode = 400) {
    super(message);
    this.name = "FutureCommitmentError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface FutureCommitmentMonetaryEffect {
  id: string;
  role: FutureCommitmentEffectRole;
  amountMinor: number;
  currency: string;
  accountId?: EntityId;
  cardId?: EntityId;
}

export interface FutureCommitmentSource {
  kind: FutureCommitmentSourceKind;
  id: EntityId;
  transactionId?: EntityId;
  invoiceId?: EntityId;
  recurrenceId?: EntityId;
  installmentId?: EntityId;
  payableReceivableId?: EntityId;
}

export interface FutureCommitment {
  id: string;
  plannedOn: ISODate;
  description: string;
  source: FutureCommitmentSource;
  monetaryEffects: FutureCommitmentMonetaryEffect[];
  replacementKey?: string;
  categoryId?: EntityId;
}

export interface FutureCommitmentAgenda {
  from: ISODate;
  to: ISODate;
  commitments: FutureCommitment[];
  currency?: string;
}

export interface FutureCommitmentInstallmentMarker {
  id: EntityId;
  organizationId: EntityId;
  financialProfileId: EntityId;
  recurrenceId?: EntityId;
  dueOn: ISODate;
}

export interface BuildFutureCommitmentAgendaInput {
  context: TenantContext;
  from: ISODate;
  to: ISODate;
  currency?: string;
  transactions?: readonly Transaction[];
  invoices?: readonly Invoice[];
  cards?: readonly Card[];
  recurrences?: readonly Recurrence[];
  installments?: readonly FutureCommitmentInstallmentMarker[];
  payablesReceivables?: readonly PayableReceivable[];
}

const INVOICE_FUTURE_STATUSES = new Set<Invoice["status"]>(["open", "closed", "overdue"]);
const MAX_RECURRENCE_OCCURRENCES_PER_QUERY = 10_000;

export function buildFutureCommitmentAgenda(
  input: BuildFutureCommitmentAgendaInput,
): FutureCommitmentAgenda {
  const from = validateDate(input.from);
  const to = validateDate(input.to);
  if (from > to) {
    throw new FutureCommitmentError(
      "FUTURE_COMMITMENT_PERIOD_INVALID",
      "O inicio do periodo nao pode ser posterior ao fim.",
    );
  }

  const currency = normalizeOptionalCurrency(input.currency);
  const transactions = scopeToContext(input.context, input.transactions ?? []);
  const invoices = scopeToContext(input.context, input.invoices ?? []);
  const cards = scopeToContext(input.context, input.cards ?? []);
  const recurrences = scopeToContext(input.context, input.recurrences ?? []);
  const installments = scopeToContext(input.context, input.installments ?? []);
  const payablesReceivables = scopeToContext(input.context, input.payablesReceivables ?? []);
  const commitments: FutureCommitment[] = [];

  for (const transaction of transactions) {
    const commitment = buildTransactionCommitment(transaction, from, to);
    if (commitment) commitments.push(commitment);
  }

  const cardsById = new Map(cards.map((card) => [card.id, card]));
  for (const invoice of invoices) {
    const commitment = buildInvoiceCommitment(invoice, cardsById.get(invoice.cardId), from, to);
    if (commitment) commitments.push(commitment);
  }

  const materializedRecurrenceDates = new Set<string>();
  for (const transaction of transactions) {
    if (transaction.recurrenceId) {
      materializedRecurrenceDates.add(
        recurrenceOccurrenceKey(transaction.recurrenceId, transaction.plannedOn),
      );
    }
  }
  for (const installment of installments) {
    if (installment.recurrenceId) {
      materializedRecurrenceDates.add(
        recurrenceOccurrenceKey(installment.recurrenceId, installment.dueOn),
      );
    }
  }

  for (const recurrence of recurrences) {
    commitments.push(
      ...buildRecurrenceProjections(recurrence, from, to, materializedRecurrenceDates),
    );
  }

  const transitionPlan = buildPayableReceivableTransitionPlan({
    payablesReceivables,
    transactions,
  });
  const legacyDuplicates = new Set(
    transitionPlan.items
      .filter((item) => item.disposition === "keep_legacy_duplicate_reference")
      .map((item) => item.payableReceivableId),
  );

  for (const payableReceivable of payablesReceivables) {
    const commitment = buildLegacyCommitment(payableReceivable, legacyDuplicates, from, to);
    if (commitment) commitments.push(commitment);
  }

  const projected = commitments
    .map((commitment) => filterCommitmentCurrency(commitment, currency))
    .filter((commitment): commitment is FutureCommitment => commitment !== undefined)
    .sort((left, right) => {
      const dateOrder = left.plannedOn.localeCompare(right.plannedOn);
      return dateOrder === 0 ? left.id.localeCompare(right.id) : dateOrder;
    });

  return {
    from,
    to,
    commitments: projected,
    ...(currency ? { currency } : {}),
  };
}

function buildTransactionCommitment(
  transaction: Transaction,
  from: ISODate,
  to: ISODate,
): FutureCommitment | undefined {
  if (
    transaction.status !== "planned" ||
    transaction.effectiveOn !== undefined ||
    transaction.invoiceId !== undefined ||
    !isWithin(transaction.plannedOn, from, to)
  ) {
    return undefined;
  }

  const source: FutureCommitmentSource = {
    kind: "transaction",
    id: transaction.id,
    transactionId: transaction.id,
    ...(transaction.recurrenceId ? { recurrenceId: transaction.recurrenceId } : {}),
    ...(transaction.installmentId ? { installmentId: transaction.installmentId } : {}),
  };
  const replacementKey = transaction.recurrenceId
    ? recurrenceOccurrenceKey(transaction.recurrenceId, transaction.plannedOn)
    : undefined;

  return {
    id: `transaction:${transaction.id}`,
    plannedOn: transaction.plannedOn,
    description: transaction.description,
    source,
    monetaryEffects: buildTransactionEffects(transaction),
    ...(replacementKey ? { replacementKey } : {}),
    ...(transaction.categoryId ? { categoryId: transaction.categoryId } : {}),
  };
}

function buildTransactionEffects(transaction: Transaction): FutureCommitmentMonetaryEffect[] {
  const sourceCurrency = normalizeCurrency(transaction.currency);
  const sourceAmount = validatePositiveAmount(transaction.amountMinor, transaction.id);

  if (transaction.kind === "transfer") {
    if (!transaction.destinationAccountId) {
      throw incompleteTransfer(transaction.id);
    }

    const destinationCurrency = normalizeCurrency(
      transaction.destinationCurrency ?? sourceCurrency,
    );
    const destinationAmount =
      transaction.destinationAmountMinor ??
      (destinationCurrency === sourceCurrency ? sourceAmount : undefined);

    if (destinationAmount === undefined) {
      throw incompleteTransfer(transaction.id);
    }

    return [
      {
        id: `transaction:${transaction.id}:source`,
        role: "source_account",
        amountMinor: -sourceAmount,
        currency: sourceCurrency,
        ...(transaction.accountId ? { accountId: transaction.accountId } : {}),
      },
      {
        id: `transaction:${transaction.id}:destination`,
        role: "destination_account",
        amountMinor: validatePositiveAmount(destinationAmount, transaction.id),
        currency: destinationCurrency,
        accountId: transaction.destinationAccountId,
      },
    ];
  }

  return [
    {
      id: `transaction:${transaction.id}:source`,
      role: "source_account",
      amountMinor: transaction.kind === "income" ? sourceAmount : -sourceAmount,
      currency: sourceCurrency,
      ...(transaction.accountId ? { accountId: transaction.accountId } : {}),
    },
  ];
}

function buildInvoiceCommitment(
  invoice: Invoice,
  card: Card | undefined,
  from: ISODate,
  to: ISODate,
): FutureCommitment | undefined {
  if (
    !INVOICE_FUTURE_STATUSES.has(invoice.status) ||
    !isWithin(invoice.dueOn, from, to) ||
    invoice.totalAmountMinor <= 0
  ) {
    return undefined;
  }

  const amountMinor = validatePositiveAmount(invoice.totalAmountMinor, invoice.id);
  return {
    id: `invoice:${invoice.id}`,
    plannedOn: invoice.dueOn,
    description: card ? `Fatura ${card.name}` : "Fatura de cartao",
    source: {
      kind: "invoice",
      id: invoice.id,
      invoiceId: invoice.id,
    },
    monetaryEffects: [
      {
        id: `invoice:${invoice.id}:payment`,
        role: "invoice_payment",
        amountMinor: -amountMinor,
        currency: normalizeCurrency(invoice.currency),
        cardId: invoice.cardId,
        ...(card?.paymentAccountId ? { accountId: card.paymentAccountId } : {}),
      },
    ],
  };
}

function buildRecurrenceProjections(
  recurrence: Recurrence,
  from: ISODate,
  to: ISODate,
  materializedRecurrenceDates: ReadonlySet<string>,
): FutureCommitment[] {
  if (
    recurrence.status !== "active" ||
    recurrence.accountId === undefined ||
    recurrence.cardId !== undefined ||
    recurrence.kind === "transfer"
  ) {
    return [];
  }

  const amountMinor = validatePositiveAmount(recurrence.amountMinor, recurrence.id);
  const currency = normalizeCurrency(recurrence.currency);
  const commitments: FutureCommitment[] = [];

  for (let offset = 0; offset < MAX_RECURRENCE_OCCURRENCES_PER_QUERY; offset += 1) {
    const plannedOn = addRecurrenceFrequency(
      recurrence.startOn,
      recurrence.frequency,
      offset,
      recurrence.interval,
    );

    if (recurrence.endOn !== undefined && plannedOn > recurrence.endOn) break;
    if (plannedOn > to) break;
    if (plannedOn < from) continue;

    const replacementKey = recurrenceOccurrenceKey(recurrence.id, plannedOn);
    if (materializedRecurrenceDates.has(replacementKey)) continue;

    commitments.push({
      id: replacementKey,
      replacementKey,
      plannedOn,
      description: recurrence.description,
      source: {
        kind: "recurrence_projection",
        id: recurrence.id,
        recurrenceId: recurrence.id,
      },
      monetaryEffects: [
        {
          id: `${replacementKey}:account`,
          role: "recurrence_account",
          amountMinor: recurrence.kind === "income" ? amountMinor : -amountMinor,
          currency,
          accountId: recurrence.accountId,
        },
      ],
      ...(recurrence.categoryId ? { categoryId: recurrence.categoryId } : {}),
    });

    if (offset === MAX_RECURRENCE_OCCURRENCES_PER_QUERY - 1) {
      throw new FutureCommitmentError(
        "FUTURE_COMMITMENT_PERIOD_INVALID",
        "O periodo solicitado excede o limite seguro de projecoes recorrentes.",
      );
    }
  }

  return commitments;
}

function buildLegacyCommitment(
  payableReceivable: PayableReceivable,
  legacyDuplicates: ReadonlySet<EntityId>,
  from: ISODate,
  to: ISODate,
): FutureCommitment | undefined {
  if (
    payableReceivable.status !== "pending" ||
    legacyDuplicates.has(payableReceivable.id) ||
    !isWithin(payableReceivable.dueOn, from, to)
  ) {
    return undefined;
  }

  const amountMinor = validatePositiveAmount(payableReceivable.amountMinor, payableReceivable.id);
  return {
    id: `payable-receivable:${payableReceivable.id}`,
    plannedOn: payableReceivable.dueOn,
    description: payableReceivable.description,
    source: {
      kind: "payable_receivable",
      id: payableReceivable.id,
      payableReceivableId: payableReceivable.id,
    },
    monetaryEffects: [
      {
        id: `payable-receivable:${payableReceivable.id}:account`,
        role: "legacy_account",
        amountMinor: payableReceivable.kind === "receivable" ? amountMinor : -amountMinor,
        currency: normalizeCurrency(payableReceivable.currency),
        ...(payableReceivable.accountId ? { accountId: payableReceivable.accountId } : {}),
      },
    ],
    ...(payableReceivable.categoryId ? { categoryId: payableReceivable.categoryId } : {}),
  };
}

function filterCommitmentCurrency(
  commitment: FutureCommitment,
  currency: string | undefined,
): FutureCommitment | undefined {
  if (!currency) return commitment;
  const monetaryEffects = commitment.monetaryEffects.filter(
    (effect) => effect.currency === currency,
  );
  if (monetaryEffects.length === 0) return undefined;
  return { ...commitment, monetaryEffects };
}

function recurrenceOccurrenceKey(recurrenceId: EntityId, plannedOn: ISODate): string {
  return `recurrence:${recurrenceId}:${plannedOn}`;
}

function incompleteTransfer(transactionId: EntityId): FutureCommitmentError {
  return new FutureCommitmentError(
    "FUTURE_COMMITMENT_TRANSFER_INCOMPLETE",
    `Transferencia planejada ${transactionId} nao possui os dois efeitos monetarios canonicos.`,
    500,
  );
}

function validatePositiveAmount(amountMinor: number, sourceId: EntityId): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new FutureCommitmentError(
      "FUTURE_COMMITMENT_AMOUNT_INVALID",
      `Compromisso ${sourceId} possui valor monetario invalido.`,
      500,
    );
  }
  return amountMinor;
}

function normalizeOptionalCurrency(currency: string | undefined): string | undefined {
  if (currency === undefined || currency.trim() === "") return undefined;
  return normalizeCurrency(currency);
}

function normalizeCurrency(currency: string): string {
  const normalized = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new FutureCommitmentError(
      "FUTURE_COMMITMENT_CURRENCY_INVALID",
      "Moeda deve usar codigo ISO de tres letras.",
    );
  }
  return normalized;
}

function validateDate(value: string): ISODate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new FutureCommitmentError(
      "FUTURE_COMMITMENT_PERIOD_INVALID",
      "Periodo deve usar datas YYYY-MM-DD.",
    );
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new FutureCommitmentError(
      "FUTURE_COMMITMENT_PERIOD_INVALID",
      "Periodo contem data invalida.",
    );
  }
  return value;
}

function isWithin(value: ISODate, from: ISODate, to: ISODate): boolean {
  return value >= from && value <= to;
}

function scopeToContext<T extends { organizationId: EntityId; financialProfileId: EntityId }>(
  context: TenantContext,
  resources: readonly T[],
): T[] {
  return resources.filter(
    (resource) =>
      resource.organizationId === context.organizationId &&
      resource.financialProfileId === context.financialProfileId,
  );
}
