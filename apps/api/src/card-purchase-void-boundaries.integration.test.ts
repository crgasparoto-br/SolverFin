import assert from "node:assert/strict";

import { TenantAuthorizationError, type TenantContext } from "@solverfin/domain";

import { closePool, query, withSharedTransaction } from "./db.js";
import { createAccountForContext } from "./repositories/accounts.js";
import { createCreditCardAccountForContext } from "./repositories/card-instruments.js";
import {
  adjustInvoiceInstallmentAmountForContext,
  listCardPurchasesForContext,
  reconcileInvoiceInstallmentForContext,
  reverseCardPurchaseForContext,
  summarizeInvoiceForContext,
  updateCardPurchaseForContext,
} from "./repositories/card-invoice-contracts.js";
import { registerCardPurchaseForContext } from "./repositories/cards.js";
import { listInstallmentsForContext } from "./repositories/installments.js";
import { executeTransactionBulkActionForContext } from "./repositories/transaction-bulk-actions.js";
import {
  createTransactionForContext,
  getTransactionForContext,
  updateTransactionForContext,
  voidTransactionForContext,
} from "./repositories/transactions.js";

const CONTEXT: TenantContext = {
  organizationId: "22222222-2222-4222-8222-222222222222",
  financialProfileId: "33333333-3333-4333-8333-333333333331",
  financialProfileKind: "personal",
  userId: "11111111-1111-4111-8111-111111111111",
};
const OTHER_PROFILE: TenantContext = {
  ...CONTEXT,
  financialProfileId: "33333333-3333-4333-8333-333333333332",
  financialProfileKind: "mei",
};
class FixtureRollback extends Error {}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for PostgreSQL integration.");
  try {
    await withSharedTransaction(async () => {
      const suffix = Date.now().toString(36);
      const card = await createCreditCardAccountForContext(CONTEXT, {
        name: "Cartão void boundary " + suffix,
        closingDay: 20,
        dueDay: 10,
        currency: "BRL",
        creditLimitMinor: 120_000,
        instruments: [
          { type: "physical", holder: "primary", name: "Principal", maskedIdentifier: "**** 9292" },
        ],
      });
      const instrumentId = card.instruments[0]?.id;
      assert.ok(instrumentId);

      // Generic single void must reuse the canonical financial mutation.
      const single = await registerCardPurchaseForContext(CONTEXT, card.id, {
        occurredOn: "2032-01-08",
        amountMinor: 1_200,
        description: "Compra individual " + suffix,
        cardInstrumentId: instrumentId,
      });
      const before = await summarizeInvoiceForContext(CONTEXT, single.invoice.id);
      assert.equal(before.purchasesCount, 1);
      await assert.rejects(
        () => voidTransactionForContext(OTHER_PROFILE, single.transaction.id),
        notFound,
      );
      const response = await voidTransactionForContext(CONTEXT, single.transaction.id);
      assert.equal(response.status, "voided");
      const persisted = await readTransaction(single.transaction.id);
      assert.equal(persisted.status, "VOIDED");
      assert.equal(persisted.amountMinor, 1_200);
      assert.ok(persisted.voidedAt instanceof Date);
      const after = await summarizeInvoiceForContext(CONTEXT, single.invoice.id);
      assert.equal(after.purchasesCount, 0);
      assert.equal(after.totalExpensesMinor, before.totalExpensesMinor - 1_200);
      assert.equal(
        after.cardTotals[0]?.limitUsedMinor,
        before.cardTotals[0]!.limitUsedMinor - 1_200,
      );
      assert.deepEqual(
        await listCardPurchasesForContext(CONTEXT, { invoiceId: single.invoice.id }),
        [],
      );
      assert.equal(await countSoftDelete(single.transaction.id), 1);
      await assert.rejects(
        () => voidTransactionForContext(CONTEXT, single.transaction.id),
        hasCode("CARD_PURCHASE_NOT_FOUND"),
      );
      await assert.rejects(
        () => updateTransactionForContext(CONTEXT, single.transaction.id, { status: "posted" }),
        hasCode("CARD_PURCHASE_NOT_FOUND"),
      );
      assert.equal(await countSoftDelete(single.transaction.id), 1);

      // A batch mixing account movements and card purchases remains atomic.
      const bankAccount = await createAccountForContext(CONTEXT, {
        name: "Conta lote void " + suffix,
        kind: "checking",
        openingBalanceMinor: 0,
      });
      const bankTransaction = await createTransactionForContext(CONTEXT, {
        accountId: bankAccount.id,
        kind: "expense",
        status: "posted",
        amountMinor: 300,
        occurredOn: "2032-02-08",
        effectiveOn: "2032-02-08",
        description: "Conta do lote " + suffix,
      });
      const bulkPurchase = await registerCardPurchaseForContext(CONTEXT, card.id, {
        occurredOn: "2032-02-08",
        amountMinor: 900,
        description: "Cartão do lote " + suffix,
        cardInstrumentId: instrumentId,
      });
      const batchBefore = await summarizeInvoiceForContext(CONTEXT, bulkPurchase.invoice.id);
      const batch = await executeTransactionBulkActionForContext(CONTEXT, {
        action: "void",
        transactionIds: [bulkPurchase.transaction.id, bankTransaction.id],
      });
      assert.deepEqual(
        new Set(batch.affectedTransactionIds),
        new Set([bulkPurchase.transaction.id, bankTransaction.id]),
      );
      assert.deepEqual(batch.unchangedTransactionIds, []);
      assert.equal((await getTransactionForContext(CONTEXT, bankTransaction.id)).status, "voided");
      assert.equal((await readTransaction(bulkPurchase.transaction.id)).status, "VOIDED");
      const batchAfter = await summarizeInvoiceForContext(CONTEXT, bulkPurchase.invoice.id);
      assert.equal(batchAfter.totalExpensesMinor, batchBefore.totalExpensesMinor - 900);
      assert.equal(batchAfter.purchasesCount, batchBefore.purchasesCount - 1);
      assert.equal(await countSoftDelete(bulkPurchase.transaction.id), 1);
      const repeated = await executeTransactionBulkActionForContext(CONTEXT, {
        action: "void",
        transactionIds: [bulkPurchase.transaction.id],
      });
      assert.deepEqual(repeated.affectedTransactionIds, []);
      assert.deepEqual(repeated.unchangedTransactionIds, [bulkPurchase.transaction.id]);
      assert.equal(await countSoftDelete(bulkPurchase.transaction.id), 1);

      // An ineligible purchase must roll back the entire mixed financial batch.
      const eligible = await registerCardPurchaseForContext(CONTEXT, card.id, {
        occurredOn: "2032-03-08",
        amountMinor: 750,
        description: "Compra elegível " + suffix,
        cardInstrumentId: instrumentId,
      });
      const locked = await registerCardPurchaseForContext(CONTEXT, card.id, {
        occurredOn: "2032-03-09",
        amountMinor: 650,
        description: "Compra conciliada " + suffix,
        cardInstrumentId: instrumentId,
      });
      await updateCardPurchaseForContext(CONTEXT, card.id, locked.transaction.id, {
        status: "reconciled",
      });
      const lockedBefore = await summarizeInvoiceForContext(CONTEXT, eligible.invoice.id);
      await assert.rejects(
        () =>
          executeTransactionBulkActionForContext(CONTEXT, {
            action: "void",
            transactionIds: [eligible.transaction.id, locked.transaction.id],
          }),
        hasCode("CARD_PURCHASE_DELETE_LOCKED"),
      );
      const lockedAfter = await summarizeInvoiceForContext(CONTEXT, eligible.invoice.id);
      assert.equal(lockedAfter.totalExpensesMinor, lockedBefore.totalExpensesMinor);
      assert.equal(lockedAfter.purchasesCount, lockedBefore.purchasesCount);
      assert.equal((await readTransaction(eligible.transaction.id)).status, "POSTED");
      assert.equal((await readTransaction(locked.transaction.id)).status, "RECONCILED");
      assert.equal(await countSoftDelete(eligible.transaction.id), 0);

      // Parent installments are ineligible for deletion through either general route.
      const installments = await registerCardPurchaseForContext(CONTEXT, card.id, {
        occurredOn: "2032-04-08",
        amountMinor: 4_500,
        description: "Parcelamento preservado " + suffix,
        cardInstrumentId: instrumentId,
        totalInstallments: 3,
      });
      await assert.rejects(
        () => voidTransactionForContext(CONTEXT, installments.transaction.id),
        hasCode("CARD_PURCHASE_DELETE_RESTRICTED"),
      );
      await assert.rejects(
        () =>
          executeTransactionBulkActionForContext(CONTEXT, {
            action: "void",
            transactionIds: [installments.transaction.id],
          }),
        hasCode("CARD_PURCHASE_DELETE_RESTRICTED"),
      );
      const [occurrence] = await listInstallmentsForContext(CONTEXT, {
        invoiceId: installments.invoice.id,
        status: "all",
      });
      assert.ok(occurrence);
      assert.equal(
        (await summarizeInvoiceForContext(CONTEXT, installments.invoice.id)).purchasesCount,
        1,
      );

      // Reproduce an already-VOIDED parent left by a legacy generic endpoint.
      await query('update "Transaction" set "status" = $2, "voidedAt" = now() where "id" = $1', [
        installments.transaction.id,
        "VOIDED",
      ]);
      const hidden = await summarizeInvoiceForContext(CONTEXT, installments.invoice.id);
      assert.equal(hidden.purchasesCount, 0);
      assert.equal(hidden.unreconciledExpensesMinor, 0);
      assert.deepEqual(
        await listInstallmentsForContext(CONTEXT, {
          invoiceId: installments.invoice.id,
          status: "all",
        }),
        [],
      );
      const totalBeforeGuard = await readInvoiceTotal(installments.invoice.id);
      await assert.rejects(
        () =>
          reconcileInvoiceInstallmentForContext(
            CONTEXT,
            installments.invoice.id,
            occurrence.id,
            "reconciled",
          ),
        hasCode("CARD_INSTALLMENT_NOT_FOUND"),
      );
      await assert.rejects(
        () =>
          adjustInvoiceInstallmentAmountForContext(
            CONTEXT,
            installments.invoice.id,
            occurrence.id,
            1_900,
            "current",
          ),
        hasCode("CARD_INSTALLMENT_AMOUNT_LOCKED"),
      );
      assert.equal(await readInvoiceTotal(installments.invoice.id), totalBeforeGuard);

      // Reversal credits also use their invoice-specific void contract.
      const expense = await registerCardPurchaseForContext(CONTEXT, card.id, {
        occurredOn: "2032-05-08",
        amountMinor: 800,
        description: "Compra para estorno " + suffix,
        cardInstrumentId: instrumentId,
      });
      const balanceBeforeReversal = (await summarizeInvoiceForContext(CONTEXT, expense.invoice.id))
        .totalExpensesMinor;
      const credit = await reverseCardPurchaseForContext(
        CONTEXT,
        card.id,
        expense.transaction.id,
        expense.invoice.id,
      );
      await voidTransactionForContext(CONTEXT, credit.transactionId);
      assert.equal(
        (await summarizeInvoiceForContext(CONTEXT, expense.invoice.id)).totalExpensesMinor,
        balanceBeforeReversal,
      );
      assert.equal(await countSoftDelete(credit.transactionId), 1);
      await assert.rejects(
        () => updateTransactionForContext(CONTEXT, credit.transactionId, { amountMinor: 900 }),
        hasCode("CARD_PURCHASE_NOT_FOUND"),
      );

      throw new FixtureRollback();
    });
  } catch (error) {
    if (!(error instanceof FixtureRollback)) throw error;
  }
}

async function readTransaction(id: string): Promise<{
  status: string;
  amountMinor: number;
  voidedAt: Date | null;
}> {
  const [row] = await query<{ status: string; amountMinor: number; voidedAt: Date | null }>(
    'select "status", "amountMinor", "voidedAt" from "Transaction" where "id" = $1',
    [id],
  );
  assert.ok(row);
  return row;
}

async function readInvoiceTotal(id: string): Promise<number> {
  const [row] = await query<{ totalAmountMinor: number }>(
    'select "totalAmountMinor" from "Invoice" where "id" = $1',
    [id],
  );
  assert.ok(row);
  return row.totalAmountMinor;
}

async function countSoftDelete(id: string): Promise<number> {
  const [row] = await query<{ count: number }>(
    'select count(*)::int as "count" from "AuditLogEntry" where "entityId" = $1 and "action" = $2',
    [id, "SOFT_DELETE"],
  );
  return row?.count ?? 0;
}

function hasCode(expected: string): (error: unknown) => boolean {
  return (error) => error instanceof Error && "code" in error && error.code === expected;
}

function notFound(error: unknown): boolean {
  return (
    error instanceof TenantAuthorizationError ||
    hasCode("TENANT_RESOURCE_NOT_FOUND")(error) ||
    hasCode("CARD_PURCHASE_NOT_FOUND")(error)
  );
}
