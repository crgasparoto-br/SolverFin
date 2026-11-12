import assert from "node:assert/strict";

import type { Installment, Invoice, Transaction } from "./index.js";
import type { TenantContext } from "./tenant.js";
import type { PayableReceivable } from "./payables-receivables.js";
import { createFinancialAssumption } from "./financial-assumptions.js";
import type { InferredRecurringExpense } from "./statistical-recurrences.js";
import { calculateDailyAvailability } from "./daily-availability.js";

const now = "2026-06-16T12:00:00.000Z";
const tenantA: TenantContext = {
  userId: "user-a",
  organizationId: "org-a",
  financialProfileId: "profile-a",
  financialProfileKind: "personal",
};
const tenantB: TenantContext = {
  userId: "user-b",
  organizationId: "org-b",
  financialProfileId: "profile-b",
  financialProfileKind: "business",
};

calculatesAvailabilityWithCardsAndInferredRecurrences();
usesPlannedTransactionsInvoicesAndLegacyFallbacks();
skipsLegacyPayablesWhenLinkedOrEquivalentToTransactions();
changedAssumptionChangesResult();
emptyHistoryProducesLowConfidenceLimitation();
tenantIsolationIsApplied();

function calculatesAvailabilityWithCardsAndInferredRecurrences(): void {
  const invoice = invoiceFixture("invoice-june", 25000, "2026-06-25");
  const installment = installmentFixture("installment-course", 12000, "2026-06-28");
  const receivable = payableReceivableFixture("salary", "receivable", 100000, "2026-06-30");
  const inferred = inferredFixture("inferred-market", 18000, "2026-06-20", 0.82);

  const result = calculateDailyAvailability({
    context: tenantA,
    today: "2026-06-16",
    calculatedAt: now,
    currentBalanceMinor: 50000,
    transactions: [transactionFixture("posted-income", "income", 5000, "2026-06-18")],
    payablesReceivables: [receivable],
    invoices: [invoice],
    installments: [installment],
    inferredRecurrences: [inferred],
  });

  assert.equal(result.availableTodayMinor, 94500);
  assert.equal(
    result.components.some((component) => component.source === "invoices"),
    true,
  );
  assert.equal(
    result.components.some((component) => component.source === "statistical_recurrences"),
    true,
  );
  assert.equal(result.confidence, "medium");
}

function usesPlannedTransactionsInvoicesAndLegacyFallbacks(): void {
  const result = calculateDailyAvailability({
    context: tenantA,
    today: "2026-06-16",
    calculatedAt: now,
    currentBalanceMinor: 100000,
    transactions: [
      transactionFixture("planned-income", "income", 30000, "2026-06-20"),
      transactionFixture("planned-expense", "expense", 12000, "2026-06-21"),
    ],
    invoices: [invoiceFixture("open-invoice", 45000, "2026-06-25", "open")],
    payablesReceivables: [
      payableReceivableFixture("legacy-receivable", "receivable", 18000, "2026-06-26"),
    ],
  });
  const commitmentSources = ["transactions", "invoices", "payables_receivables"];
  const commitmentComponents = result.components.filter((component) =>
    commitmentSources.includes(component.source),
  );

  assert.deepEqual(
    commitmentComponents.map((component) => [
      component.source,
      component.entityId,
      component.amountMinor,
    ]),
    [
      ["transactions", "planned-income", 30000],
      ["transactions", "planned-expense", -12000],
      ["payables_receivables", "legacy-receivable", 18000],
      ["invoices", "open-invoice", -45000],
    ],
  );
}

function skipsLegacyPayablesWhenLinkedOrEquivalentToTransactions(): void {
  const equivalentTransaction = transactionFixture(
    "planned-energy",
    "expense",
    25000,
    "2026-06-20",
    "cat-a",
  );
  const settlementTransaction: Transaction = {
    ...transactionFixture("settled-salary", "income", 50000, "2026-06-21"),
    status: "posted",
  };
  const equivalentLegacy = payableReceivableFixture(
    "legacy-energy",
    "payable",
    25000,
    "2026-06-20",
  );
  const linkedLegacy: PayableReceivable = {
    ...payableReceivableFixture("legacy-salary", "receivable", 50000, "2026-06-21"),
    settlementTransactionId: "settled-salary",
  };
  const fallbackLegacy = payableReceivableFixture(
    "legacy-client",
    "receivable",
    15000,
    "2026-06-22",
  );

  const result = calculateDailyAvailability({
    context: tenantA,
    today: "2026-06-16",
    calculatedAt: now,
    currentBalanceMinor: 100000,
    transactions: [equivalentTransaction, settlementTransaction],
    payablesReceivables: [equivalentLegacy, linkedLegacy, fallbackLegacy],
  });

  assert.deepEqual(
    result.components
      .filter((component) => component.source === "payables_receivables")
      .map((component) => component.entityId),
    ["legacy-client"],
  );
}

function changedAssumptionChangesResult(): void {
  const reserve = createFinancialAssumption({
    id: "assumption-reserve",
    context: tenantA,
    now,
    payload: {
      kind: "reserve_amount",
      scope: { kind: "calculation", entityId: "daily-availability" },
      value: 20000,
      effectiveFrom: "2026-06-01",
    },
  }).assumption;
  const ignoredCategory = createFinancialAssumption({
    id: "assumption-ignore-category",
    context: tenantA,
    now,
    payload: {
      kind: "ignored_category",
      scope: { kind: "category", entityId: "cat-ignore" },
      value: "cat-ignore",
      effectiveFrom: "2026-06-01",
    },
  }).assumption;
  const expense = transactionFixture(
    "expense-ignored",
    "expense",
    15000,
    "2026-06-18",
    "cat-ignore",
  );

  const result = calculateDailyAvailability({
    context: tenantA,
    today: "2026-06-16",
    calculatedAt: now,
    currentBalanceMinor: 50000,
    transactions: [expense],
    assumptions: [reserve, ignoredCategory],
  });

  assert.equal(result.availableTodayMinor, 30000);
  assert.equal(
    result.components.some((component) => component.kind === "ignored"),
    true,
  );
  assert.equal(result.appliedAssumptionIds.length, 2);
}

function emptyHistoryProducesLowConfidenceLimitation(): void {
  const result = calculateDailyAvailability({
    context: tenantA,
    today: "2026-06-16",
    calculatedAt: now,
    currentBalanceMinor: 10000,
    transactions: [],
  });

  assert.equal(result.confidence, "low");
  assert.equal(
    result.limitations.some((limitation) => limitation.includes("Historico")),
    true,
  );
}

function tenantIsolationIsApplied(): void {
  const result = calculateDailyAvailability({
    context: tenantA,
    today: "2026-06-16",
    calculatedAt: now,
    currentBalanceMinor: 10000,
    transactions: [
      transactionFixture("expense-a", "expense", 2000, "2026-06-18"),
      {
        ...transactionFixture("expense-b", "expense", 9000, "2026-06-18"),
        organizationId: tenantB.organizationId,
        financialProfileId: tenantB.financialProfileId,
      },
    ],
  });

  assert.equal(result.availableTodayMinor, 7800);
}

function transactionFixture(
  id: string,
  kind: "income" | "expense",
  amountMinor: number,
  occurredOn: string,
  categoryId = "cat-a",
): Transaction {
  return {
    id,
    organizationId: tenantA.organizationId,
    financialProfileId: tenantA.financialProfileId,
    kind,
    status: "planned",
    source: "manual",
    amountMinor,
    currency: "BRL",
    occurredOn,
    plannedOn: occurredOn,
    description: id,
    accountId: "account-a",
    categoryId,
    createdAt: now,
    updatedAt: now,
  };
}

function invoiceFixture(
  id: string,
  totalAmountMinor: number,
  dueOn: string,
  status: Invoice["status"] = "closed",
): Invoice {
  return {
    id,
    organizationId: tenantA.organizationId,
    financialProfileId: tenantA.financialProfileId,
    cardId: "card-a",
    status,
    periodStartOn: "2026-06-01",
    periodEndOn: "2026-06-15",
    dueOn,
    totalAmountMinor,
    currency: "BRL",
    createdAt: now,
    updatedAt: now,
  };
}

function installmentFixture(id: string, amountMinor: number, dueOn: string): Installment {
  return {
    id,
    organizationId: tenantA.organizationId,
    financialProfileId: tenantA.financialProfileId,
    status: "planned",
    sequenceNumber: 2,
    totalInstallments: 6,
    dueOn,
    amountMinor,
    currency: "BRL",
    cardId: "card-a",
    createdAt: now,
    updatedAt: now,
  };
}

function payableReceivableFixture(
  id: string,
  kind: "payable" | "receivable",
  amountMinor: number,
  dueOn: string,
): PayableReceivable {
  return {
    id,
    organizationId: tenantA.organizationId,
    financialProfileId: tenantA.financialProfileId,
    kind,
    status: "pending",
    amountMinor,
    currency: "BRL",
    dueOn,
    description: id,
    accountId: "account-a",
    categoryId: "cat-a",
    createdAt: now,
    updatedAt: now,
  };
}

function inferredFixture(
  id: string,
  averageAmountMinor: number,
  nextExpectedOn: string,
  confidence: number,
): InferredRecurringExpense {
  return {
    id,
    organizationId: tenantA.organizationId,
    financialProfileId: tenantA.financialProfileId,
    status: "suggested",
    origin: "inferred",
    frequency: "monthly",
    averageAmountMinor,
    varianceMinor: 0,
    occurrenceCount: 4,
    lastOccurrenceOn: "2026-05-20",
    nextExpectedOn,
    confidence,
    description: id,
    categoryId: "cat-market",
    sourceTransactionIds: ["t1", "t2", "t3", "t4"],
    explanation: "Recorrencia mensal inferida.",
    createdAt: now,
    updatedAt: now,
  };
}
