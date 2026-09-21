import type {
  Card,
  EntityId,
  Invoice,
  ISODate,
  Transaction,
  TransactionKind,
  TransactionSource,
} from "./index.js";
import type {
  PayableReceivable,
  PayableReceivableKind,
  PayableReceivableStatus,
} from "./payables-receivables.js";

export type PayableReceivableTransitionDisposition =
  | "create_planned_transaction"
  | "link_existing_settlement_transaction"
  | "keep_legacy_settlement_reference"
  | "keep_legacy_cancelled_history"
  | "keep_legacy_duplicate_reference"
  | "manual_review";

export interface PayableReceivableTransitionPlanInput {
  payablesReceivables: readonly PayableReceivable[];
  transactions: readonly Transaction[];
  invoices?: readonly Invoice[];
  cards?: readonly Card[];
}

export interface PlannedTransactionDraft {
  kind: Extract<TransactionKind, "income" | "expense">;
  status: "planned";
  source: Extract<TransactionSource, "manual">;
  amountMinor: number;
  currency: string;
  occurredOn: ISODate;
  plannedOn: ISODate;
  description: string;
  accountId: EntityId;
  categoryId?: EntityId;
}

export interface PayableReceivableTransitionPlanItem {
  payableReceivableId: EntityId;
  kind: PayableReceivableKind;
  status: PayableReceivableStatus;
  disposition: PayableReceivableTransitionDisposition;
  reason: string;
  transactionId?: EntityId;
  invoiceId?: EntityId;
  plannedTransactionDraft?: PlannedTransactionDraft;
}

export interface PayableReceivableTransitionPlan {
  items: PayableReceivableTransitionPlanItem[];
  summary: Record<PayableReceivableTransitionDisposition, number>;
}

const emptySummary = {
  create_planned_transaction: 0,
  link_existing_settlement_transaction: 0,
  keep_legacy_settlement_reference: 0,
  keep_legacy_cancelled_history: 0,
  keep_legacy_duplicate_reference: 0,
  manual_review: 0,
} satisfies Record<PayableReceivableTransitionDisposition, number>;

export function buildPayableReceivableTransitionPlan(
  input: PayableReceivableTransitionPlanInput,
): PayableReceivableTransitionPlan {
  const invoices = input.invoices ?? [];
  const cardsById = new Map((input.cards ?? []).map((card) => [card.id, card]));
  const items = input.payablesReceivables.map((payableReceivable) =>
    planPayableReceivableTransition(
      payableReceivable,
      input.transactions,
      invoices,
      cardsById,
    ),
  );
  const summary = { ...emptySummary };

  for (const item of items) {
    summary[item.disposition] += 1;
  }

  return { items, summary };
}

function planPayableReceivableTransition(
  payableReceivable: PayableReceivable,
  transactions: readonly Transaction[],
  invoices: readonly Invoice[],
  cardsById: ReadonlyMap<EntityId, Card>,
): PayableReceivableTransitionPlanItem {
  if (payableReceivable.status === "cancelled") {
    return buildPlanItem(payableReceivable, {
      disposition: "keep_legacy_cancelled_history",
      reason: "cancelled records must be preserved as legacy audit history and not migrated.",
    });
  }

  if (payableReceivable.status === "settled") {
    return planSettledPayableReceivable(payableReceivable, transactions);
  }

  return planPendingPayableReceivable(payableReceivable, transactions, invoices, cardsById);
}

function planPendingPayableReceivable(
  payableReceivable: PayableReceivable,
  transactions: readonly Transaction[],
  invoices: readonly Invoice[],
  cardsById: ReadonlyMap<EntityId, Card>,
): PayableReceivableTransitionPlanItem {
  const equivalentTransaction = findEquivalentTransaction(payableReceivable, transactions, {
    statuses: ["planned", "suggested", "posted", "reconciled"],
  });

  if (equivalentTransaction !== undefined) {
    return buildPlanItem(payableReceivable, {
      disposition: "keep_legacy_duplicate_reference",
      transactionId: equivalentTransaction.id,
      reason: "an equivalent transaction already represents this pending legacy commitment.",
    });
  }

  const equivalentInvoice = findEquivalentInvoice(payableReceivable, invoices, cardsById);
  if (equivalentInvoice !== undefined) {
    return buildPlanItem(payableReceivable, {
      disposition: "keep_legacy_duplicate_reference",
      invoiceId: equivalentInvoice.id,
      reason: "an equivalent invoice already represents this pending legacy card commitment.",
    });
  }

  if (payableReceivable.accountId === undefined) {
    return buildPlanItem(payableReceivable, {
      disposition: "manual_review",
      reason: "pending legacy record has no accountId, but Transaction requires an account.",
    });
  }

  return buildPlanItem(payableReceivable, {
    disposition: "create_planned_transaction",
    reason: "pending legacy record can be represented as a planned Transaction.",
    plannedTransactionDraft: {
      kind: toTransactionKind(payableReceivable.kind),
      status: "planned",
      source: "manual",
      amountMinor: payableReceivable.amountMinor,
      currency: payableReceivable.currency,
      occurredOn: payableReceivable.dueOn,
      plannedOn: payableReceivable.dueOn,
      description: payableReceivable.description,
      accountId: payableReceivable.accountId,
      ...(payableReceivable.categoryId === undefined
        ? {}
        : { categoryId: payableReceivable.categoryId }),
    },
  });
}

function planSettledPayableReceivable(
  payableReceivable: PayableReceivable,
  transactions: readonly Transaction[],
): PayableReceivableTransitionPlanItem {
  const linkedTransaction = transactions.find(
    (transaction) =>
      payableReceivable.settlementTransactionId !== undefined &&
      transaction.id === payableReceivable.settlementTransactionId &&
      transaction.status !== "voided",
  );

  if (linkedTransaction !== undefined) {
    return buildPlanItem(payableReceivable, {
      disposition: "keep_legacy_settlement_reference",
      transactionId: linkedTransaction.id,
      reason: "settled legacy record already points to a valid settlement transaction.",
    });
  }

  const equivalentTransaction = findEquivalentTransaction(payableReceivable, transactions, {
    statuses: ["posted", "reconciled"],
  });

  if (equivalentTransaction !== undefined) {
    return buildPlanItem(payableReceivable, {
      disposition: "link_existing_settlement_transaction",
      transactionId: equivalentTransaction.id,
      reason: "settled legacy record has an equivalent posted/reconciled transaction to link.",
    });
  }

  return buildPlanItem(payableReceivable, {
    disposition: "manual_review",
    reason: "settled legacy record has no valid settlement transaction to preserve or link.",
  });
}

function findEquivalentInvoice(
  payableReceivable: PayableReceivable,
  invoices: readonly Invoice[],
  cardsById: ReadonlyMap<EntityId, Card>,
): Invoice | undefined {
  if (payableReceivable.kind !== "payable") {
    return undefined;
  }

  return invoices.find((invoice) => {
    if (
      invoice.organizationId !== payableReceivable.organizationId ||
      invoice.financialProfileId !== payableReceivable.financialProfileId ||
      !["open", "closed", "overdue"].includes(invoice.status) ||
      invoice.totalAmountMinor !== payableReceivable.amountMinor ||
      invoice.currency !== payableReceivable.currency ||
      invoice.dueOn !== payableReceivable.dueOn
    ) {
      return false;
    }

    const card = cardsById.get(invoice.cardId);
    return optionalFieldMatches(card?.paymentAccountId, payableReceivable.accountId);
  });
}

function findEquivalentTransaction(
  payableReceivable: PayableReceivable,
  transactions: readonly Transaction[],
  options: { statuses: readonly Transaction["status"][] },
): Transaction | undefined {
  const expectedKind = toTransactionKind(payableReceivable.kind);

  return transactions.find(
    (transaction) =>
      transaction.organizationId === payableReceivable.organizationId &&
      transaction.financialProfileId === payableReceivable.financialProfileId &&
      transaction.kind === expectedKind &&
      options.statuses.includes(transaction.status) &&
      transaction.status !== "voided" &&
      transaction.amountMinor === payableReceivable.amountMinor &&
      transaction.currency === payableReceivable.currency &&
      datesMatch(transaction, payableReceivable.dueOn) &&
      optionalFieldMatches(transaction.accountId, payableReceivable.accountId) &&
      optionalFieldMatches(transaction.categoryId, payableReceivable.categoryId),
  );
}

function datesMatch(transaction: Transaction, dueOn: ISODate): boolean {
  return (
    transaction.plannedOn === dueOn ||
    transaction.effectiveOn === dueOn ||
    transaction.occurredOn === dueOn
  );
}

function optionalFieldMatches(
  transactionValue: EntityId | undefined,
  payableReceivableValue: EntityId | undefined,
): boolean {
  return payableReceivableValue === undefined || transactionValue === payableReceivableValue;
}

function toTransactionKind(
  kind: PayableReceivableKind,
): Extract<TransactionKind, "income" | "expense"> {
  return kind === "receivable" ? "income" : "expense";
}

function buildPlanItem(
  payableReceivable: PayableReceivable,
  details: Omit<PayableReceivableTransitionPlanItem, "payableReceivableId" | "kind" | "status">,
): PayableReceivableTransitionPlanItem {
  return {
    payableReceivableId: payableReceivable.id,
    kind: payableReceivable.kind,
    status: payableReceivable.status,
    ...details,
  };
}
