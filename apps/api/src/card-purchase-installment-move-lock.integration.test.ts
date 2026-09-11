import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { closePool } from "./db.js";
import { createCreditCardAccountForContext } from "./repositories/card-instruments.js";
import { moveCardPurchaseInvoicePeriodForContext } from "./repositories/card-purchase-invoice-period-move.js";
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
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for card installment integration tests.");
  }

  const suffix = Date.now().toString(36);
  const account = await createCreditCardAccountForContext(CONTEXT, {
    name: `Cartao mover parcelamento ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    currency: "BRL",
    creditLimitMinor: 100_000,
    instruments: [
      {
        type: "physical",
        holder: "primary",
        name: "Fisico",
        maskedIdentifier: "**** 6623",
      },
    ],
  });
  const instrument = account.instruments[0];
  assert.ok(instrument);

  const purchase = await registerCardPurchaseForContext(CONTEXT, account.id, {
    occurredOn: "2042-01-08",
    amountMinor: 30_000,
    description: `Compra parcelada mover ${suffix}`,
    cardInstrumentId: instrument.id,
    totalInstallments: 3,
  });

  await assert.rejects(
    () =>
      moveCardPurchaseInvoicePeriodForContext(CONTEXT, account.id, purchase.transaction.id, {
        invoicePeriod: "2042-02",
      }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "CARD_INSTALLMENT_PURCHASE_STRUCTURE_LOCKED",
  );
}
