import type { Card, Installment } from "./index.js";
import type { TenantContext } from "./tenant.js";
import { createRecurrence, generateRecurrenceInstallments } from "./recurrences.js";

const now = "2026-06-15T10:00:00.000Z";

const tenantA: TenantContext = {
  organizationId: "org-a",
  financialProfileId: "profile-a",
  financialProfileKind: "personal",
  userId: "user-a",
};

const activeCard: Card = {
  id: "card-a",
  organizationId: tenantA.organizationId,
  financialProfileId: tenantA.financialProfileId,
  name: "Cartao card-a",
  status: "active",
  closingDay: 20,
  dueDay: 10,
  createdAt: now,
  updatedAt: now,
};

runSkipsExistingCardRecurrenceSequence();

function runSkipsExistingCardRecurrenceSequence(): void {
  const recurrence = createRecurrence({
    id: "recurrence-card-no-duplicates",
    context: tenantA,
    now,
    card: activeCard,
    payload: {
      frequency: "monthly",
      startOn: "2026-06-10",
      endOn: "2026-09-10",
      amountMinor: 4990,
      description: "Assinatura no cartao ficticia",
      cardId: activeCard.id,
    },
  }).recurrence;
  const existingInstallments: Installment[] = [
    {
      id: "installment-card-existing-2",
      organizationId: recurrence.organizationId,
      financialProfileId: recurrence.financialProfileId,
      recurrenceId: recurrence.id,
      cardId: activeCard.id,
      status: "planned",
      sequenceNumber: 2,
      totalInstallments: 4,
      dueOn: "2026-07-10",
      amountMinor: recurrence.amountMinor,
      currency: recurrence.currency,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const { installments, transactions } = generateRecurrenceInstallments({
    context: tenantA,
    recurrence,
    existingInstallments,
    now,
    through: "2026-09-30",
    makeInstallmentId: (sequenceNumber) => `installment-card-no-dup-${sequenceNumber}`,
    makeTransactionId: (sequenceNumber) => `transaction-card-no-dup-${sequenceNumber}`,
  });

  assertEqual(installments.length, 3, "card generation should skip existing sequence");
  assertEqual(transactions.length, 3, "card generation should create transactions only for new sequences");
  assertEqual(installments[0]?.sequenceNumber, 1, "first missing card sequence should be generated");
  assertEqual(installments[1]?.sequenceNumber, 3, "third card sequence should be generated");
  assertEqual(installments[2]?.sequenceNumber, 4, "fourth card sequence should be generated");
  assertEqual(transactions[0]?.id, "transaction-card-no-dup-1", "sequence 1 transaction should be generated");
  assertEqual(transactions[1]?.id, "transaction-card-no-dup-3", "sequence 3 transaction should be generated");
  assertEqual(transactions[2]?.id, "transaction-card-no-dup-4", "sequence 4 transaction should be generated");

  for (const installment of installments) {
    assertEqual(installment.cardId, activeCard.id, "generated installment should keep card id");
  }

  for (const transaction of transactions) {
    assertEqual(transaction.cardId, activeCard.id, "generated transaction should keep card id");
    assertEqual(transaction.kind, "expense", "generated card transaction should be expense");
    assertEqual(transaction.source, "recurrence", "generated card transaction should keep recurrence source");
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
