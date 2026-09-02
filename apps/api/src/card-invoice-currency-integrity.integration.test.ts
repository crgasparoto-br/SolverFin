import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import {
  closeInvoiceForContext,
  summarizeInvoiceForContext,
} from "./repositories/card-invoice-contracts.js";
import { moveCardPurchaseInvoicePeriodForContext } from "./repositories/card-purchase-invoice-period-move.js";
import { createCreditCardAccountForContext } from "./repositories/card-instruments.js";
import { registerCardPurchaseForContext } from "./repositories/cards.js";

const CONTEXT: TenantContext = {
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
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required for currency integrity integration tests.",
  );

  const suffix = Date.now().toString(36);
  const account = await createCreditCardAccountForContext(CONTEXT, {
    name: `Cartao integridade moeda ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    creditLimitMinor: 500_000,
    instruments: [
      {
        type: "physical",
        holder: "primary",
        name: "Fisico moeda",
        maskedIdentifier: "**** 5151",
      },
    ],
  });
  const instrument = account.instruments[0];

  assert.ok(instrument, "Expected initial active instrument.");

  await assertRejectsCrossCurrencyPurchaseWithoutWrites(account.id, instrument.id, suffix);
  await assertRejectsCrossCurrencyMoveWithoutWrites(account.id, instrument.id, suffix);
  await assertHistoricalMismatchFailsClosed(account.id, instrument.id, suffix);
}

async function assertRejectsCrossCurrencyPurchaseWithoutWrites(
  cardId: string,
  instrumentId: string,
  suffix: string,
): Promise<void> {
  const baseline = await registerCardPurchaseForContext(CONTEXT, cardId, {
    occurredOn: "2031-06-10",
    amountMinor: 10_000,
    description: `Baseline BRL ${suffix}`,
    currency: "BRL",
    cardInstrumentId: instrumentId,
  });
  const beforeTotal = await readInvoiceTotal(baseline.invoice.id);
  const beforeCount = await countInvoicePurchases(baseline.invoice.id);

  await assert.rejects(
    () =>
      registerCardPurchaseForContext(CONTEXT, cardId, {
        occurredOn: "2031-06-12",
        amountMinor: 5_000,
        description: `USD rejected ${suffix}`,
        currency: "USD",
        cardInstrumentId: instrumentId,
      }),
    hasCode("CARD_INVOICE_CURRENCY_MISMATCH"),
  );

  assert.equal(await readInvoiceTotal(baseline.invoice.id), beforeTotal);
  assert.equal(await countInvoicePurchases(baseline.invoice.id), beforeCount);
  assert.equal(await countTransactionsByDescription(`USD rejected ${suffix}`), 0);
}

async function assertRejectsCrossCurrencyMoveWithoutWrites(
  cardId: string,
  instrumentId: string,
  suffix: string,
): Promise<void> {
  const origin = await registerCardPurchaseForContext(CONTEXT, cardId, {
    occurredOn: "2031-07-10",
    amountMinor: 2_500,
    description: `Move origin ${suffix}`,
    currency: "BRL",
    cardInstrumentId: instrumentId,
  });
  const destination = await registerCardPurchaseForContext(CONTEXT, cardId, {
    occurredOn: "2031-08-10",
    amountMinor: 1_100,
    description: `Move destination ${suffix}`,
    currency: "BRL",
    cardInstrumentId: instrumentId,
  });

  await query(`update "Invoice" set "currency" = 'USD' where "id" = $1`, [destination.invoice.id]);

  const originBefore = await readInvoiceTotal(origin.invoice.id);
  const destinationBefore = await readInvoiceTotal(destination.invoice.id);
  const transactionBefore = await readTransactionInvoice(origin.transaction.id);

  await assert.rejects(
    () =>
      moveCardPurchaseInvoicePeriodForContext(CONTEXT, cardId, origin.transaction.id, {
        invoicePeriod: "2031-08",
      }),
    hasCode("CARD_INVOICE_CURRENCY_MISMATCH"),
  );

  assert.equal(await readTransactionInvoice(origin.transaction.id), transactionBefore);
  assert.equal(await readInvoiceTotal(origin.invoice.id), originBefore);
  assert.equal(await readInvoiceTotal(destination.invoice.id), destinationBefore);
}

async function assertHistoricalMismatchFailsClosed(
  cardId: string,
  instrumentId: string,
  suffix: string,
): Promise<void> {
  const purchase = await registerCardPurchaseForContext(CONTEXT, cardId, {
    occurredOn: "2031-09-10",
    amountMinor: 3_300,
    description: `Historical mismatch ${suffix}`,
    currency: "BRL",
    cardInstrumentId: instrumentId,
  });

  await query(`update "Invoice" set "currency" = 'USD' where "id" = $1`, [purchase.invoice.id]);

  await assert.rejects(
    () => summarizeInvoiceForContext(CONTEXT, purchase.invoice.id),
    hasCode("CARD_INVOICE_CURRENCY_MISMATCH"),
  );
  await assert.rejects(
    () => closeInvoiceForContext(CONTEXT, purchase.invoice.id),
    hasCode("CARD_INVOICE_CURRENCY_MISMATCH"),
  );

  assert.equal(await readInvoiceStatus(purchase.invoice.id), "OPEN");
  assert.equal(await readInvoiceTotal(purchase.invoice.id), purchase.invoice.totalAmountMinor);
}

function hasCode(expectedCode: string): (error: unknown) => boolean {
  return (error: unknown) =>
    error instanceof Error && "code" in error && error.code === expectedCode;
}

async function readInvoiceTotal(invoiceId: string): Promise<number> {
  const rows = await query<{ totalAmountMinor: number }>(
    `select "totalAmountMinor" from "Invoice" where "id" = $1`,
    [invoiceId],
  );
  const row = rows[0];
  assert.ok(row, `Expected invoice ${invoiceId}.`);
  return row.totalAmountMinor;
}

async function readInvoiceStatus(invoiceId: string): Promise<string> {
  const rows = await query<{ status: string }>(`select "status" from "Invoice" where "id" = $1`, [
    invoiceId,
  ]);
  const row = rows[0];
  assert.ok(row, `Expected invoice ${invoiceId}.`);
  return row.status;
}

async function countInvoicePurchases(invoiceId: string): Promise<number> {
  const rows = await query<{ count: number | string }>(
    `select count(*)::int as "count" from "Transaction"
      where "invoiceId" = $1 and "accountId" is null and "kind" = 'EXPENSE'`,
    [invoiceId],
  );
  return Number(rows[0]?.count ?? 0);
}

async function countTransactionsByDescription(description: string): Promise<number> {
  const rows = await query<{ count: number | string }>(
    `select count(*)::int as "count" from "Transaction"
      where "organizationId" = $1 and "financialProfileId" = $2 and "description" = $3`,
    [CONTEXT.organizationId, CONTEXT.financialProfileId, description],
  );
  return Number(rows[0]?.count ?? 0);
}

async function readTransactionInvoice(transactionId: string): Promise<string | null> {
  const rows = await query<{ invoiceId: string | null }>(
    `select "invoiceId" from "Transaction" where "id" = $1`,
    [transactionId],
  );
  const row = rows[0];
  assert.ok(row, `Expected transaction ${transactionId}.`);
  return row.invoiceId;
}
