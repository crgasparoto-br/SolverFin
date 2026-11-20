import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import { createAccountForContext } from "./repositories/accounts.js";
import { closeInvoiceForContext } from "./repositories/card-invoice-contracts.js";
import {
  createCardForContext,
  payInvoiceForContext,
  registerCardPurchaseForContext,
} from "./repositories/cards.js";
import { buildDashboardOverview } from "./repositories/dashboard-overview.js";
import { createTransactionForContext } from "./repositories/transactions.js";

const CONTEXT: TenantContext = {
  organizationId: "22222222-2222-4222-8222-222222222222",
  financialProfileId: randomUUID(),
  financialProfileKind: "personal",
  userId: "11111111-1111-4111-8111-111111111111",
};
const REFERENCE = new Date("2041-05-19T12:00:00.000Z");
const PURCHASE_ON = "2041-05-19";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for this test.");

  const suffix = `${Date.now().toString(36)}${process.pid.toString(36)}`;
  // Keep integration fixtures in their own financial profile. Posted purchases
  // must not displace another suite's recent transactions in the seeded profile.
  await query(
    `insert into "FinancialProfile"
      ("id", "organizationId", "ownerUserId", "name", "kind", "status", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, 'PERSONAL', 'ACTIVE', now(), now())`,
    [
      CONTEXT.financialProfileId,
      CONTEXT.organizationId,
      CONTEXT.userId,
      `Dashboard test ${suffix}`,
    ],
  );
  // At 01:30Z on June 1st the Sao Paulo civil date is still May 31st.
  // Both the monthly overview and the card-advice clock must agree.
  const atUtcMonthBoundary = await buildDashboardOverview(
    CONTEXT,
    PURCHASE_ON,
    new Date("2041-06-01T01:30:00.000Z"),
  );
  assert.equal(atUtcMonthBoundary.purchaseToday, "2041-05-31");
  assert.equal(atUtcMonthBoundary.periodStartOn, "2041-05-01");
  assert.equal(atUtcMonthBoundary.periodEndOn, "2041-05-31");
  const baseline = await buildDashboardOverview(CONTEXT, PURCHASE_ON, REFERENCE);
  const account = await createAccountForContext(CONTEXT, {
    name: `Overview cash ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 10_000,
    currency: "BRL",
  });
  await createTransactionForContext(CONTEXT, {
    accountId: account.id,
    kind: "expense",
    status: "planned",
    amountMinor: 1_500,
    currency: "BRL",
    occurredOn: "2041-05-07",
    plannedOn: "2041-05-25",
    effectiveOn: null,
    description: `Overview planned bill ${suffix}`,
  });
  const card = await createCardForContext(CONTEXT, {
    name: `Overview card ${suffix}`,
    closingDay: 8,
    dueDay: 16,
    paymentAccountId: account.id,
    currency: "BRL",
  });
  const purchase = await registerCardPurchaseForContext(CONTEXT, card.id, {
    occurredOn: "2041-05-03",
    amountMinor: 7_000,
    description: `Overview purchase ${suffix}`,
  });
  assert.equal(purchase.invoice.dueOn, "2041-05-16");

  const beforePayment = await buildDashboardOverview(CONTEXT, PURCHASE_ON, REFERENCE);
  assert.equal(
    brlPayables(beforePayment) - brlPayables(baseline),
    8_500,
    "open invoice and independent planned expense count once each",
  );
  assert.equal(
    beforePayment.accountBalances.find((row) => row.id === account.id)?.balanceMinor,
    10_000,
    "planned transactions and credit purchases do not affect bank cash",
  );
  assert.equal(beforePayment.cardSpending.find((row) => row.id === card.id)?.spentMinor, 7_000);

  await closeInvoiceForContext(CONTEXT, purchase.invoice.id);
  await payInvoiceForContext(CONTEXT, purchase.invoice.id, account.id, {
    paidOn: "2041-05-18",
    amountMinor: purchase.invoice.totalAmountMinor,
  });
  const afterPayment = await buildDashboardOverview(CONTEXT, PURCHASE_ON, REFERENCE);
  assert.equal(
    brlPayables(afterPayment) - brlPayables(baseline),
    1_500,
    "settled invoice disappears while unrelated planned bill remains",
  );
  assert.equal(
    afterPayment.accountBalances.find((row) => row.id === account.id)?.balanceMinor,
    3_000,
    "the paid invoice reduces bank cash exactly once",
  );
  assert.equal(
    afterPayment.cardSpending.find((row) => row.id === card.id)?.spentMinor,
    7_000,
    "the payment does not create another card purchase",
  );
  assert.equal(
    expenseTotal(afterPayment, "BRL") - expenseTotal(baseline, "BRL"),
    7_000,
    "the payment does not double economic expenses",
  );

  // Uma fatura vencida ainda é exigível; PAID/CANCELLED não podem reaparecer.
  const overdueCard = await createCardForContext(CONTEXT, {
    name: `Overview overdue ${suffix}`,
    closingDay: 8,
    dueDay: 16,
    paymentAccountId: account.id,
    currency: "BRL",
  });
  const overduePurchase = await registerCardPurchaseForContext(CONTEXT, overdueCard.id, {
    occurredOn: "2041-05-03",
    amountMinor: 2_200,
    description: `Overdue purchase ${suffix}`,
  });
  await query(
    `update "Invoice" set "status" = 'OVERDUE' where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [overduePurchase.invoice.id, CONTEXT.organizationId, CONTEXT.financialProfileId],
  );
  const withOverdue = await buildDashboardOverview(CONTEXT, PURCHASE_ON, REFERENCE);
  assert.equal(
    brlPayables(withOverdue) - brlPayables(afterPayment),
    2_200,
    "the overdue invoice must remain in the month payables",
  );
  assert.equal(
    (withOverdue.payableTotals.find((row) => row.currency === "BRL")?.overdueMinor ?? 0) -
      (afterPayment.payableTotals.find((row) => row.currency === "BRL")?.overdueMinor ?? 0),
    2_200,
    "overdue totals count the unpaid invoice even when it falls outside the ten listed rows",
  );
  await query(
    `update "Invoice" set "status" = 'PAID' where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [overduePurchase.invoice.id, CONTEXT.organizationId, CONTEXT.financialProfileId],
  );
  const withSettled = await buildDashboardOverview(CONTEXT, PURCHASE_ON, REFERENCE);
  assert.equal(brlPayables(withSettled), brlPayables(afterPayment));

  // A elegibilidade para recomendar não elimina o histórico de gastos do mês.
  await query(
    `update "Card" set "status" = 'BLOCKED' where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [overdueCard.id, CONTEXT.organizationId, CONTEXT.financialProfileId],
  );
  const withBlocked = await buildDashboardOverview(CONTEXT, PURCHASE_ON, REFERENCE);
  assert.equal(
    withBlocked.cardSpending.find((row) => row.id === overdueCard.id)?.spentMinor,
    2_200,
  );
  assert.equal(
    withBlocked.cardAdvice.some((row) => row.id === overdueCard.id),
    false,
  );
  assert.equal(
    withBlocked.cardSpendingTotals.find((row) => row.currency === "BRL")?.amountMinor,
    withSettled.cardSpendingTotals.find((row) => row.currency === "BRL")?.amountMinor,
    "blocking a card cannot retroactively reduce monthly card spending",
  );
  await query(
    `update "Card" set "status" = 'ARCHIVED' where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [overdueCard.id, CONTEXT.organizationId, CONTEXT.financialProfileId],
  );
  const withArchived = await buildDashboardOverview(CONTEXT, PURCHASE_ON, REFERENCE);
  assert.equal(
    withArchived.cardSpending.find((row) => row.id === overdueCard.id)?.spentMinor,
    2_200,
  );
  assert.equal(
    withArchived.cardAdvice.some((row) => row.id === overdueCard.id),
    false,
  );
}

function brlPayables(overview: Awaited<ReturnType<typeof buildDashboardOverview>>): number {
  return overview.payableTotals.find((row) => row.currency === "BRL")?.amountMinor ?? 0;
}

function expenseTotal(
  overview: Awaited<ReturnType<typeof buildDashboardOverview>>,
  currency: string,
): number {
  return overview.categoryExpenses
    .filter((row) => row.currency === currency)
    .reduce((sum, row) => sum + row.amountMinor, 0);
}
