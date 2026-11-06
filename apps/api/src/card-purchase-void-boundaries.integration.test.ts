import assert from "node:assert/strict";

import { TenantAuthorizationError, type TenantContext } from "@solverfin/domain";

import { closePool, query, withSharedTransaction } from "./db.js";
import { buildApiErrorResponse } from "./errors.js";
import { createAccountForContext } from "./repositories/accounts.js";
import { createCreditCardAccountForContext } from "./repositories/card-instruments.js";
import { moveCardPurchaseInvoicePeriodForContext } from "./repositories/card-purchase-invoice-period-move.js";
import {
  adjustInvoiceInstallmentAmountForContext,
  listCardPurchasesForContext,
  reconcileInvoiceInstallmentForContext,
  reverseCardPurchaseForContext,
  summarizeInvoiceForContext,
  updateCardReversalForContext,
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
      // Reconciliation must reject mixed card/account batches before mutating either row.
      await assert.rejects(
        () =>
          executeTransactionBulkActionForContext(CONTEXT, {
            action: "reconcile",
            transactionIds: [bankTransaction.id, bulkPurchase.transaction.id],
          }),
        hasCode("TRANSACTION_BULK_PROTECTED"),
      );
      assert.equal((await getTransactionForContext(CONTEXT, bankTransaction.id)).status, "posted");
      assert.equal((await readTransaction(bulkPurchase.transaction.id)).status, "POSTED");
      assert.equal(await readInvoiceTotal(bulkPurchase.invoice.id), batchBefore.totalExpensesMinor);
      assert.equal(await countSoftDelete(bulkPurchase.transaction.id), 0);

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
            action: "unreconcile",
            transactionIds: [locked.transaction.id],
          }),
        hasCode("TRANSACTION_BULK_PROTECTED"),
      );
      assert.equal((await readTransaction(locked.transaction.id)).status, "RECONCILED");
      assert.equal(await readInvoiceTotal(eligible.invoice.id), lockedBefore.totalExpensesMinor);
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
      // Full reimbursement: the invoice balance is zero, but the purchase and
      // credit are still active. Reject void with a public 409 (not a DB 500).
      assert.equal(await readInvoiceTotal(expense.invoice.id), 0);
      const reversalVoidError = await voidTransactionForContext(
        CONTEXT,
        expense.transaction.id,
      ).then(
        () => null,
        (error: unknown) => error,
      );
      assert.ok(hasCode("CARD_PURCHASE_ACTIVE_REVERSAL")(reversalVoidError));
      assert.deepEqual(
        buildApiErrorResponse({
          error: reversalVoidError,
          correlationId: "corr-active-reversal-void",
        }),
        {
          statusCode: 409,
          body: {
            error: {
              code: "CARD_PURCHASE_ACTIVE_REVERSAL",
              message: "Anule primeiro o estorno ativo antes de excluir a compra.",
              correlationId: "corr-active-reversal-void",
            },
          },
        },
      );
      assert.equal((await readTransaction(expense.transaction.id)).status, "POSTED");
      assert.equal(await countSoftDelete(expense.transaction.id), 0);
      assert.equal(await readInvoiceTotal(expense.invoice.id), 0);
      await assert.rejects(
        () =>
          moveCardPurchaseInvoicePeriodForContext(CONTEXT, card.id, expense.transaction.id, {
            invoicePeriod: "2032-06",
          }),
        hasCode("CARD_PURCHASE_INVOICE_LOCKED"),
      );
      assert.equal(await readInvoiceTotal(expense.invoice.id), 0);

      // Also reject when another purchase keeps the invoice balance positive:
      // a non-negative total alone cannot prove absence of an orphaned credit.
      const sibling = await registerCardPurchaseForContext(CONTEXT, card.id, {
        occurredOn: "2032-05-09",
        amountMinor: 1_200,
        description: "Outra compra na fatura " + suffix,
        cardInstrumentId: instrumentId,
      });
      assert.equal(sibling.invoice.id, expense.invoice.id);
      const positiveTotal = await readInvoiceTotal(expense.invoice.id);
      assert.equal(positiveTotal, 1_200);
      await assert.rejects(
        () => voidTransactionForContext(CONTEXT, expense.transaction.id),
        hasCode("CARD_PURCHASE_ACTIVE_REVERSAL"),
      );
      await assert.rejects(
        () =>
          moveCardPurchaseInvoicePeriodForContext(CONTEXT, card.id, expense.transaction.id, {
            invoicePeriod: "2032-06",
          }),
        hasCode("CARD_PURCHASE_ACTIVE_REVERSAL"),
      );
      const [sourceInvoice] = await query<{ invoiceId: string }>(
        'select "invoiceId" from "Transaction" where "id" = $1',
        [expense.transaction.id],
      );
      assert.equal(sourceInvoice?.invoiceId, expense.invoice.id);
      assert.equal(await readInvoiceTotal(expense.invoice.id), positiveTotal);

      // A mixed card/bank batch must roll back the entire selection.
      const bankForRollback = await createTransactionForContext(CONTEXT, {
        accountId: bankAccount.id,
        kind: "expense",
        status: "posted",
        amountMinor: 250,
        occurredOn: "2032-05-09",
        effectiveOn: "2032-05-09",
        description: "Conta protegida do lote " + suffix,
      });
      await assert.rejects(
        () =>
          executeTransactionBulkActionForContext(CONTEXT, {
            action: "void",
            transactionIds: [bankForRollback.id, expense.transaction.id],
          }),
        hasCode("CARD_PURCHASE_ACTIVE_REVERSAL"),
      );
      assert.equal((await getTransactionForContext(CONTEXT, bankForRollback.id)).status, "posted");
      assert.equal((await readTransaction(expense.transaction.id)).status, "POSTED");
      assert.equal((await readTransaction(credit.transactionId)).status, "POSTED");
      assert.equal(await readInvoiceTotal(expense.invoice.id), positiveTotal);
      assert.equal(await countSoftDelete(expense.transaction.id), 0);
      // The generic endpoint cannot redirect a card credit into a bank account
      // or bypass the reversal-specific invoice recalculation.
      await assert.rejects(
        () =>
          updateTransactionForContext(CONTEXT, credit.transactionId, {
            amountMinor: 950,
            accountId: bankAccount.id,
            status: "posted",
          }),
        hasCode("CARD_REVERSAL_EDIT_ROUTE_REQUIRED"),
      );
      assert.equal(await readInvoiceTotal(expense.invoice.id), positiveTotal);
      await updateCardReversalForContext(CONTEXT, card.id, credit.transactionId, {
        amountMinor: 650,
        occurredOn: "2032-05-08",
        description: "Estorno editado na rota canônica",
      });
      assert.equal(await readInvoiceTotal(expense.invoice.id), positiveTotal + 150);
      await voidTransactionForContext(CONTEXT, credit.transactionId);
      assert.equal(
        (await summarizeInvoiceForContext(CONTEXT, expense.invoice.id)).totalExpensesMinor,
        positiveTotal + 800,
      );
      assert.equal(await countSoftDelete(credit.transactionId), 1);
      await assert.rejects(
        () => updateTransactionForContext(CONTEXT, credit.transactionId, { amountMinor: 900 }),
        hasCode("CARD_PURCHASE_NOT_FOUND"),
      );
      await voidTransactionForContext(CONTEXT, expense.transaction.id);
      assert.equal((await readTransaction(expense.transaction.id)).status, "VOIDED");
      assert.equal((await readTransaction(sibling.transaction.id)).status, "POSTED");
      assert.equal(await countSoftDelete(expense.transaction.id), 1);
      assert.equal(await readInvoiceTotal(expense.invoice.id), 1_200);

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
