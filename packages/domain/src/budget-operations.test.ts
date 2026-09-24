import assert from "node:assert/strict";

import type { Budget, FutureCommitment, Transaction } from "./index.js";
import type { TenantContext } from "./tenant.js";
import {
  summarizeOperationalBudgetDashboard,
  summarizeOperationalBudgetUsage,
} from "./budget-operations.js";

const context: TenantContext = {
  organizationId: "org-budget-619",
  financialProfileId: "profile-budget-619",
  financialProfileKind: "personal",
  userId: "user-budget-619",
};
const now = "2038-08-01T12:00:00.000Z";

coversProjectedBudgetWithoutDoubleCountingInvoice();
keepsUnbudgetedAndUncategorizedWithoutSyntheticPlan();
excludesInvoiceForecastAndPaymentFromUncategorizedConsumption();
movesConsumptionFromCommittedPeriodToRealizedPeriod();
keepsCurrenciesAndTransfersOutsideBudgetConsumption();

function coversProjectedBudgetWithoutDoubleCountingInvoice(): void {
  const budget = makeBudget("budget-food", "food", "BRL", "2038-08-01", "2038-08-31", 100_000);
  const transactions: Transaction[] = [
    expense("posted-food", "posted", "2038-08-04", "2038-08-04", 25_000, "BRL", "food"),
    expense("card-purchase", "planned", "2038-08-20", "2038-08-20", 30_000, "BRL", "food", {
      invoiceId: "invoice-1",
      cardId: "card-1",
    }),
  ];
  const commitments: FutureCommitment[] = [
    {
      id: "transaction:card-purchase",
      plannedOn: "2038-08-20",
      description: "Compra futura já materializada",
      source: {
        kind: "transaction",
        id: "card-purchase",
        transactionId: "card-purchase",
      },
      categoryId: "food",
      monetaryEffects: [
        {
          id: "transaction:card-purchase:source",
          role: "source_account",
          amountMinor: -30_000,
          currency: "BRL",
        },
      ],
    },
    {
      id: "invoice:invoice-1",
      plannedOn: "2038-08-25",
      description: "Fatura do cartão",
      source: { kind: "invoice", id: "invoice-1", invoiceId: "invoice-1" },
      monetaryEffects: [
        {
          id: "invoice:invoice-1:payment",
          role: "invoice_payment",
          amountMinor: -30_000,
          currency: "BRL",
        },
      ],
    },
    {
      id: "recurrence:food:2038-08-28",
      plannedOn: "2038-08-28",
      description: "Mercado recorrente",
      source: {
        kind: "recurrence_projection",
        id: "rec-food",
        recurrenceId: "rec-food",
      },
      replacementKey: "recurrence:rec-food:2038-08-28",
      categoryId: "food",
      monetaryEffects: [
        {
          id: "recurrence:food:2038-08-28:account",
          role: "recurrence_account",
          amountMinor: -10_000,
          currency: "BRL",
        },
      ],
    },
  ];

  const summary = summarizeOperationalBudgetUsage({
    context,
    budget,
    transactions,
    commitments,
  });

  assert.equal(summary.realizedAmountMinor, 25_000);
  assert.equal(summary.committedAmountMinor, 40_000);
  assert.equal(summary.projectedAmountMinor, 65_000);
  assert.equal(summary.availableAmountMinor, 35_000);
  assert.equal(summary.overBudgetAmountMinor, 0);
  assert.equal(summary.committedItems.length, 2);
  assert.equal(
    summary.committedItems.some((item) => item.commitmentId === "invoice:invoice-1"),
    false,
    "invoice payment must not add a second category consumption",
  );
}

function keepsUnbudgetedAndUncategorizedWithoutSyntheticPlan(): void {
  const result = summarizeOperationalBudgetDashboard({
    context,
    budgets: [],
    transactions: [
      expense("health-posted", "posted", "2038-08-03", "2038-08-03", 12_000, "BRL", "health"),
      expense("uncategorized-posted", "posted", "2038-08-04", "2038-08-04", 4_000, "BRL"),
      expense("uncategorized-planned", "planned", "2038-08-18", "2038-08-18", 6_000, "BRL"),
    ],
    commitments: [],
    periodStartOn: "2038-08-01",
    periodEndOn: "2038-08-31",
  });

  const unbudgeted = result.find((item) => item.source === "unbudgeted");
  const uncategorized = result.find((item) => item.source === "uncategorized");
  assert.ok(unbudgeted);
  assert.equal(unbudgeted.plannedAmountMinor, null);
  assert.equal(unbudgeted.availableAmountMinor, null);
  assert.equal(unbudgeted.overBudgetAmountMinor, null);
  assert.equal(unbudgeted.projectedAmountMinor, 12_000);

  assert.ok(uncategorized);
  assert.equal(uncategorized.categoryId, undefined);
  assert.equal(uncategorized.plannedAmountMinor, null);
  assert.equal(uncategorized.realizedAmountMinor, 4_000);
  assert.equal(uncategorized.committedAmountMinor, 6_000);
  assert.equal(uncategorized.projectedAmountMinor, 10_000);
  assert.equal(uncategorized.availableAmountMinor, null);
  assert.equal(uncategorized.overBudgetAmountMinor, null);
}

function excludesInvoiceForecastAndPaymentFromUncategorizedConsumption(): void {
  const invoiceForecast = expense(
    "invoice-forecast",
    "planned",
    "2038-08-25",
    "2038-08-25",
    30_000,
    "BRL",
    undefined,
    {
      cardId: "card-1",
      invoiceId: "invoice-1",
      accountId: "checking-brl",
    },
  );
  const invoicePayment = expense(
    "invoice-payment",
    "posted",
    "2038-08-25",
    "2038-08-25",
    30_000,
    "BRL",
    undefined,
    {
      cardId: "card-1",
      invoiceId: "invoice-1",
      accountId: "checking-brl",
      effectiveOn: "2038-08-25",
    },
  );
  const uncategorizedPurchase: Transaction = {
    ...expense(
      "card-purchase-uncategorized",
      "posted",
      "2038-08-10",
      "2038-08-10",
      8_000,
      "BRL",
    ),
    cardId: "card-1",
    invoiceId: "invoice-1",
  };
  delete uncategorizedPurchase.accountId;

  const result = summarizeOperationalBudgetDashboard({
    context,
    budgets: [],
    transactions: [invoiceForecast, invoicePayment, uncategorizedPurchase],
    commitments: [],
    periodStartOn: "2038-08-01",
    periodEndOn: "2038-08-31",
  });

  const uncategorized = result.find((item) => item.source === "uncategorized");
  assert.ok(uncategorized);
  assert.equal(uncategorized.realizedAmountMinor, 8_000);
  assert.equal(uncategorized.committedAmountMinor, 0);
  assert.deepEqual(
    uncategorized.realizedItems.map((item) => item.transactionId),
    ["card-purchase-uncategorized"],
  );
  assert.equal(
    uncategorized.committedItems.some(
      (item) =>
        item.transactionId === "invoice-forecast" || item.transactionId === "invoice-payment",
    ),
    false,
  );
}

function movesConsumptionFromCommittedPeriodToRealizedPeriod(): void {
  const august = makeBudget("budget-aug", "food", "BRL", "2038-08-01", "2038-08-31", 100_000);
  const september = makeBudget("budget-sep", "food", "BRL", "2038-09-01", "2038-09-30", 100_000);

  const planned = expense(
    "moving-event",
    "planned",
    "2038-09-02",
    "2038-08-31",
    15_000,
    "BRL",
    "food",
  );
  const augustBeforeRealization = summarizeOperationalBudgetUsage({
    context,
    budget: august,
    transactions: [planned],
  });
  assert.equal(augustBeforeRealization.committedAmountMinor, 15_000);
  assert.equal(augustBeforeRealization.realizedAmountMinor, 0);

  const realized = {
    ...planned,
    status: "posted" as const,
    occurredOn: "2038-09-02",
  };
  const augustAfterRealization = summarizeOperationalBudgetUsage({
    context,
    budget: august,
    transactions: [realized],
  });
  const septemberAfterRealization = summarizeOperationalBudgetUsage({
    context,
    budget: september,
    transactions: [realized],
  });

  assert.equal(augustAfterRealization.committedAmountMinor, 0);
  assert.equal(augustAfterRealization.realizedAmountMinor, 0);
  assert.equal(septemberAfterRealization.committedAmountMinor, 0);
  assert.equal(septemberAfterRealization.realizedAmountMinor, 15_000);
}

function keepsCurrenciesAndTransfersOutsideBudgetConsumption(): void {
  const brl = makeBudget("budget-brl", "food", "BRL", "2038-08-01", "2038-08-31", 100_000);
  const usd = makeBudget("budget-usd", "food", "USD", "2038-08-01", "2038-08-31", 20_000);
  const transfer: Transaction = {
    ...expense("transfer-cross", "planned", "2038-08-10", "2038-08-10", 53_832, "BRL", "food"),
    kind: "transfer",
    destinationAccountId: "account-usd",
    destinationAmountMinor: 10_000,
    destinationCurrency: "USD",
  };
  const result = summarizeOperationalBudgetDashboard({
    context,
    budgets: [brl, usd],
    transactions: [
      expense("brl-posted", "posted", "2038-08-05", "2038-08-05", 5_000, "BRL", "food"),
      expense("usd-planned", "planned", "2038-08-06", "2038-08-06", 2_500, "USD", "food"),
      transfer,
    ],
    commitments: [],
    periodStartOn: "2038-08-01",
    periodEndOn: "2038-08-31",
  });

  const brlSummary = result.find((item) => item.currency === "BRL" && item.source === "budget");
  const usdSummary = result.find((item) => item.currency === "USD" && item.source === "budget");
  assert.equal(brlSummary?.realizedAmountMinor, 5_000);
  assert.equal(brlSummary?.committedAmountMinor, 0);
  assert.equal(usdSummary?.realizedAmountMinor, 0);
  assert.equal(usdSummary?.committedAmountMinor, 2_500);
}

function makeBudget(
  id: string,
  categoryId: string,
  currency: string,
  periodStartOn: string,
  periodEndOn: string,
  plannedAmountMinor: number,
): Budget {
  return {
    id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    status: "active",
    categoryId,
    periodStartOn,
    periodEndOn,
    plannedAmountMinor,
    currency,
    createdAt: now,
    updatedAt: now,
  };
}

function expense(
  id: string,
  status: Transaction["status"],
  occurredOn: string,
  plannedOn: string,
  amountMinor: number,
  currency: string,
  categoryId?: string,
  extra: Partial<Transaction> = {},
): Transaction {
  return {
    id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    kind: "expense",
    status,
    source: "manual",
    amountMinor,
    currency,
    occurredOn,
    plannedOn,
    description: `Movimento ${id}`,
    accountId: `account-${currency.toLowerCase()}`,
    createdAt: now,
    updatedAt: now,
    ...(categoryId ? { categoryId } : {}),
    ...extra,
  };
}
