import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import { createCreditCardAccountForContext } from "./repositories/card-instruments.js";
import {
  listCardPurchasesForContext,
  summarizeInvoiceForContext,
  updateCardPurchaseForContext,
} from "./repositories/card-invoice-contracts.js";
import { registerCardPurchaseForContext } from "./repositories/cards.js";
import { listInstallmentsForContext } from "./repositories/installments.js";

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
  assertIntegrationDatabaseConfigured();
  const suffix = Date.now().toString(36);
  const account = await createCreditCardAccountForContext(CONTEXT, {
    name: `Cartao parcelamento canonico ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    currency: "BRL",
    creditLimitMinor: 500_000,
    instruments: [
      { type: "physical", holder: "primary", name: "Fisico", maskedIdentifier: "**** 6621" },
      { type: "virtual", holder: "primary", name: "Virtual", maskedIdentifier: "**** 6622" },
    ],
  });
  const physical = requireInstrument(account.instruments, "physical");
  const virtual = requireInstrument(account.instruments, "virtual");

  const purchase = await registerCardPurchaseForContext(CONTEXT, account.id, {
    occurredOn: "2041-04-08",
    amountMinor: 10_000,
    description: `Compra parcelada ${suffix}`,
    cardInstrumentId: physical.id,
    totalInstallments: 3,
  });
  const invoices = [purchase.invoice, ...purchase.futureInvoices];

  assert.equal(purchase.transaction.amountMinor, 10_000);
  assert.deepEqual(
    purchase.installments.map((installment) => installment.amountMinor),
    [3_334, 3_333, 3_333],
  );
  assert.equal(invoices.length, 3);

  const persisted = await query<{
    id: string;
    transactionId: string | null;
    invoiceId: string | null;
    sequenceNumber: number;
    totalInstallments: number;
    amountMinor: number;
    dueOn: Date;
    cardInstrumentId: string | null;
  }>(
    `select "id", "transactionId", "invoiceId", "sequenceNumber", "totalInstallments",
            "amountMinor", "dueOn", "cardInstrumentId"
       from "Installment"
      where "organizationId" = $1 and "financialProfileId" = $2 and "transactionId" = $3
      order by "sequenceNumber" asc`,
    [CONTEXT.organizationId, CONTEXT.financialProfileId, purchase.transaction.id],
  );

  assert.equal(persisted.length, 3);
  for (const [index, installment] of persisted.entries()) {
    const invoice = invoices[index];
    assert.ok(invoice);
    assert.equal(installment.transactionId, purchase.transaction.id);
    assert.equal(installment.invoiceId, invoice.id);
    assert.equal(installment.sequenceNumber, index + 1);
    assert.equal(installment.totalInstallments, 3);
    assert.equal(installment.amountMinor, [3_334, 3_333, 3_333][index]);
    assert.equal(installment.dueOn.toISOString().slice(0, 10), invoice.dueOn);
  }

  for (const [index, invoice] of invoices.entries()) {
    assert.ok(invoice);
    const installments = await listInstallmentsForContext(CONTEXT, {
      transactionId: purchase.transaction.id,
      invoiceId: invoice.id,
      status: "all",
    });
    assert.equal(installments.length, 1);
    assert.equal(installments[0]?.invoice?.id, invoice.id);
    assert.equal(installments[0]?.transaction?.id, purchase.transaction.id);

    const purchases = await listCardPurchasesForContext(CONTEXT, {
      invoiceId: invoice.id,
      cardId: account.id,
    });
    const occurrence = purchases.find((item) => item.id === purchase.transaction.id);
    assert.ok(occurrence);
    assert.equal(occurrence.amountMinor, [3_334, 3_333, 3_333][index]);
    assert.equal(occurrence.purchaseAmountMinor, 10_000);
    assert.equal(occurrence.installmentSequenceNumber, index + 1);
    assert.equal(occurrence.totalInstallments, 3);

    const summary = await summarizeInvoiceForContext(CONTEXT, invoice.id);
    assert.equal(summary.totalExpensesMinor, [3_334, 3_333, 3_333][index]);
    assert.equal(summary.purchasesCount, 1);
  }

  const edited = await updateCardPurchaseForContext(
    CONTEXT,
    account.id,
    purchase.transaction.id,
    {
      amountMinor: 10_000,
      occurredOn: "2041-04-08",
      description: `Compra parcelada editada ${suffix}`,
      cardInstrumentId: virtual.id,
    },
  );
  assert.equal(edited.transaction.amountMinor, 10_000);
  assert.equal(edited.transaction.description, `Compra parcelada editada ${suffix}`);
  assert.equal(edited.transaction.cardInstrumentId, virtual.id);

  const instrumentsAfterEdit = await query<{ cardInstrumentId: string | null }>(
    `select "cardInstrumentId" from "Installment"
      where "organizationId" = $1 and "financialProfileId" = $2 and "transactionId" = $3`,
    [CONTEXT.organizationId, CONTEXT.financialProfileId, purchase.transaction.id],
  );
  assert.equal(instrumentsAfterEdit.length, 3);
  assert.ok(instrumentsAfterEdit.every((row) => row.cardInstrumentId === virtual.id));

  await assert.rejects(
    () =>
      updateCardPurchaseForContext(CONTEXT, account.id, purchase.transaction.id, {
        amountMinor: 9_999,
        description: "Nao deve persistir",
      }),
    hasCode("CARD_PURCHASE_INSTALLMENT_STRUCTURE_LOCKED"),
  );
  assert.equal(
    await readPurchaseDescription(purchase.transaction.id),
    `Compra parcelada editada ${suffix}`,
  );

  const lockedInvoice = invoices[2];
  assert.ok(lockedInvoice);
  await query(`update "Invoice" set "status" = 'CLOSED' where "id" = $1`, [lockedInvoice.id]);

  await assert.rejects(
    () =>
      updateCardPurchaseForContext(CONTEXT, account.id, purchase.transaction.id, {
        description: "Tambem nao deve persistir",
      }),
    hasCode("CARD_PURCHASE_INVOICE_LOCKED"),
  );
  assert.equal(
    await readPurchaseDescription(purchase.transaction.id),
    `Compra parcelada editada ${suffix}`,
  );

  const firstInvoicePurchases = await listCardPurchasesForContext(CONTEXT, {
    invoiceId: invoices[0]?.id,
    cardId: account.id,
  });
  const firstOccurrence = firstInvoicePurchases.find((item) => item.id === purchase.transaction.id);
  assert.equal(firstOccurrence?.installmentEditLocked, true);
}

async function readPurchaseDescription(transactionId: string): Promise<string> {
  const rows = await query<{ description: string }>(
    `select "description" from "Transaction" where "id" = $1`,
    [transactionId],
  );
  const row = rows[0];
  if (!row) throw new Error(`Expected transaction ${transactionId}.`);
  return row.description;
}

function requireInstrument(
  instruments: readonly ApiCardInstrument[],
  type: ApiCardInstrument["type"],
): ApiCardInstrument {
  const instrument = instruments.find((candidate) => candidate.type === type);
  if (!instrument) throw new Error(`Expected ${type} card instrument.`);
  return instrument;
}

function hasCode(code: string): (error: unknown) => boolean {
  return (error: unknown) => error instanceof Error && "code" in error && error.code === code;
}

function assertIntegrationDatabaseConfigured(): void {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for card installment integration tests.");
  }
}

interface ApiCardInstrument {
  id: string;
  type: "physical" | "virtual" | "additional";
}
