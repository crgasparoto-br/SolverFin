import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import { createAccountForContext } from "./repositories/accounts.js";
import {
  createCardForContext,
  payInvoiceForContext,
  registerCardPurchaseForContext,
} from "./repositories/cards.js";

const context: TenantContext = {
  organizationId: "22222222-2222-4222-8222-222222222222",
  financialProfileId: "33333333-3333-4333-8333-333333333331",
  financialProfileKind: "personal",
  userId: "11111111-1111-4111-8111-111111111111",
};

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for the integration test.");

  const suffix = `${Date.now().toString(36)}${process.pid.toString(36)}`;
  const account = await createAccountForContext(context, {
    name: `Conta pagamento temporal ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  const card = await createCardForContext(context, {
    name: `Cartao temporal ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    paymentAccountId: account.id,
  });

  const purchase = await registerCardPurchaseForContext(context, card.id, {
    occurredOn: "2035-06-05",
    amountMinor: 12500,
    description: `Compra temporal ${suffix}`,
  });

  assert.equal(purchase.transaction.occurredOn, "2035-06-05");
  assert.equal(purchase.transaction.effectiveOn, undefined);
  assert.equal(purchase.forecastTransactions.length, 1);
  const forecast = purchase.forecastTransactions[0];
  assert.ok(forecast);
  assert.equal(forecast.status, "planned");
  assert.equal(forecast.effectiveOn, undefined);

  const payment = await payInvoiceForContext(context, purchase.invoice.id, account.id, {
    paidOn: "2035-07-12",
    amountMinor: purchase.invoice.totalAmountMinor,
  });

  assert.equal(payment.transaction.occurredOn, "2035-07-12");
  assert.equal(payment.transaction.plannedOn, "2035-07-12");
  assert.equal(payment.transaction.effectiveOn, "2035-07-12");

  const paymentRows = await query<{
    status: string;
    occurredOn: string;
    plannedOn: string;
    effectiveOn: string | null;
  }>(
    `select "status", "occurredOn"::text as "occurredOn", "plannedOn"::text as "plannedOn",
            "effectiveOn"::text as "effectiveOn"
       from "Transaction"
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [payment.transaction.id, context.organizationId, context.financialProfileId],
  );
  assert.deepEqual(paymentRows[0], {
    status: "POSTED",
    occurredOn: "2035-07-12",
    plannedOn: "2035-07-12",
    effectiveOn: "2035-07-12",
  });

  const forecastRows = await query<{ status: string; effectiveOn: string | null }>(
    `select "status", "effectiveOn"::text as "effectiveOn"
       from "Transaction"
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [forecast.id, context.organizationId, context.financialProfileId],
  );
  assert.deepEqual(forecastRows[0], { status: "VOIDED", effectiveOn: null });

  const purchaseRows = await query<{ occurredOn: string }>(
    `select "occurredOn"::text as "occurredOn"
       from "Transaction"
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [purchase.transaction.id, context.organizationId, context.financialProfileId],
  );
  assert.equal(
    purchaseRows[0]?.occurredOn,
    "2035-06-05",
    "paying the invoice must not move the purchase economic period",
  );
}
