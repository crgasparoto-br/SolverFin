import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import {
  buildCategoryEvolutionReportForSourceContext,
  CategoryEvolutionSourceNotAvailableError,
} from "./category-evolution-account-filter.js";
import { parseCategoryEvolutionFilters } from "./category-evolution-report.js";
import { closePool } from "./db.js";
import { archiveAccountForContext, createAccountForContext } from "./repositories/accounts.js";
import {
  archiveCardInstrumentForContext,
  archiveCreditCardAccountForContext,
  createCreditCardAccountForContext,
  updateCreditCardAccountForContext,
} from "./repositories/card-instruments.js";
import { closeInvoiceForContext } from "./repositories/card-invoice-contracts.js";
import { payInvoiceForContext, registerCardPurchaseForContext } from "./repositories/cards.js";
import { createCategoryForContext } from "./repositories/categories.js";
import { createTransactionForContext } from "./repositories/transactions.js";

const PERSONAL_CONTEXT: TenantContext = {
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
    "DATABASE_URL is required. Run the integration database before this test.",
  );

  const suffix = `${Date.now().toString(36)}${process.pid.toString(36)}`;
  const filters = parseCategoryEvolutionFilters(
    new URLSearchParams({ interval: "monthly", start: "2032-03", periods: "1" }),
  );

  await assertAccountFilter(filters, suffix);
  await assertCardFilter(filters, suffix);
}

async function assertAccountFilter(
  filters: ReturnType<typeof parseCategoryEvolutionFilters>,
  suffix: string,
): Promise<void> {
  const selectedAccount = await createAccountForContext(PERSONAL_CONTEXT, {
    name: `Conta selecionada issue 546 ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  const otherAccount = await createAccountForContext(PERSONAL_CONTEXT, {
    name: `Outra conta issue 546 ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  const emptyAccount = await createAccountForContext(PERSONAL_CONTEXT, {
    name: `Conta sem movimento issue 546 ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  const incomeCategory = await createCategoryForContext(PERSONAL_CONTEXT, {
    name: `Receita filtrada issue 546 ${suffix}`,
    kind: "income",
  });
  const expenseCategory = await createCategoryForContext(PERSONAL_CONTEXT, {
    name: `Despesa filtrada issue 546 ${suffix}`,
    kind: "expense",
  });

  await createTransactionForContext(PERSONAL_CONTEXT, {
    accountId: selectedAccount.id,
    categoryId: incomeCategory.id,
    kind: "income",
    status: "posted",
    amountMinor: 12_000,
    occurredOn: "2032-03-10",
    plannedOn: "2032-03-10",
    description: `Receita conta selecionada issue 546 ${suffix}`,
  });
  await createTransactionForContext(PERSONAL_CONTEXT, {
    accountId: selectedAccount.id,
    categoryId: expenseCategory.id,
    kind: "expense",
    status: "reconciled",
    amountMinor: 3_000,
    occurredOn: "2032-03-11",
    plannedOn: "2032-03-11",
    description: `Despesa conta selecionada issue 546 ${suffix}`,
  });
  await createTransactionForContext(PERSONAL_CONTEXT, {
    accountId: otherAccount.id,
    categoryId: incomeCategory.id,
    kind: "income",
    status: "posted",
    amountMinor: 8_000,
    occurredOn: "2032-03-12",
    plannedOn: "2032-03-12",
    description: `Receita outra conta issue 546 ${suffix}`,
  });
  await createTransactionForContext(PERSONAL_CONTEXT, {
    accountId: otherAccount.id,
    destinationAccountId: selectedAccount.id,
    kind: "transfer",
    status: "posted",
    amountMinor: 4_000,
    occurredOn: "2032-03-14",
    plannedOn: "2032-03-14",
    description: `Transferência com destino na conta selecionada issue 546 ${suffix}`,
  });

  const allSources = await buildCategoryEvolutionReportForSourceContext(PERSONAL_CONTEXT, filters, {
    kind: "all",
  });
  assert.equal(allSources.currencyBlocks[0]?.income.totalMinor, 20_000);
  assert.equal(allSources.currencyBlocks[0]?.expense.totalMinor, 3_000);

  const selected = await buildCategoryEvolutionReportForSourceContext(PERSONAL_CONTEXT, filters, {
    kind: "account",
    id: selectedAccount.id,
  });
  assert.equal(selected.currencyBlocks[0]?.income.totalMinor, 12_000);
  assert.equal(selected.currencyBlocks[0]?.expense.totalMinor, 3_000);
  assert.equal(selected.currencyBlocks[0]?.result.totalMinor, 9_000);

  const empty = await buildCategoryEvolutionReportForSourceContext(PERSONAL_CONTEXT, filters, {
    kind: "account",
    id: emptyAccount.id,
  });
  assert.deepEqual(empty.currencyBlocks, []);

  await assert.rejects(
    () =>
      buildCategoryEvolutionReportForSourceContext(
        {
          ...PERSONAL_CONTEXT,
          organizationId: "44444444-4444-4444-8444-444444444444",
        },
        filters,
        { kind: "account", id: selectedAccount.id },
      ),
    isSourceNotAvailable,
  );

  await archiveAccountForContext(PERSONAL_CONTEXT, selectedAccount.id);
  await assert.rejects(
    () =>
      buildCategoryEvolutionReportForSourceContext(PERSONAL_CONTEXT, filters, {
        kind: "account",
        id: selectedAccount.id,
      }),
    isSourceNotAvailable,
  );
}

async function assertCardFilter(
  filters: ReturnType<typeof parseCategoryEvolutionFilters>,
  suffix: string,
): Promise<void> {
  const paymentAccount = await createAccountForContext(PERSONAL_CONTEXT, {
    name: `Conta pagamento issue 546 ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  const expenseCategory = await createCategoryForContext(PERSONAL_CONTEXT, {
    name: `Despesa cartão issue 546 ${suffix}`,
    kind: "expense",
  });
  const selectedCard = await createCreditCardAccountForContext(PERSONAL_CONTEXT, {
    name: `Cartão selecionado issue 546 ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    paymentAccountId: paymentAccount.id,
    instruments: [
      {
        type: "physical",
        holder: "primary",
        name: "Físico principal",
        maskedIdentifier: "**** 5461",
      },
      {
        type: "virtual",
        holder: "additional",
        name: "Virtual adicional",
        maskedIdentifier: "**** 5462",
      },
    ],
  });
  const otherCard = await createCreditCardAccountForContext(PERSONAL_CONTEXT, {
    name: `Outro cartão issue 546 ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    instruments: [
      {
        type: "physical",
        holder: "primary",
        name: "Outro físico",
        maskedIdentifier: "**** 5463",
      },
    ],
  });
  const emptyCard = await createCreditCardAccountForContext(PERSONAL_CONTEXT, {
    name: `Cartão sem movimento issue 546 ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    instruments: [
      {
        type: "virtual",
        holder: "primary",
        name: "Virtual vazio",
        maskedIdentifier: "**** 5464",
      },
    ],
  });
  const primaryInstrument = requireInstrument(selectedCard.instruments, "physical");
  const additionalInstrument = requireInstrument(selectedCard.instruments, "virtual");
  const otherInstrument = requireInstrument(otherCard.instruments, "physical");

  const firstPurchase = await registerCardPurchaseForContext(PERSONAL_CONTEXT, selectedCard.id, {
    occurredOn: "2032-03-10",
    amountMinor: 1_200,
    description: `Compra principal issue 546 ${suffix}`,
    categoryId: expenseCategory.id,
    cardInstrumentId: primaryInstrument.id,
  });
  await registerCardPurchaseForContext(PERSONAL_CONTEXT, selectedCard.id, {
    occurredOn: "2032-03-11",
    amountMinor: 800,
    description: `Compra adicional issue 546 ${suffix}`,
    categoryId: expenseCategory.id,
    cardInstrumentId: additionalInstrument.id,
  });
  await registerCardPurchaseForContext(PERSONAL_CONTEXT, otherCard.id, {
    occurredOn: "2032-03-12",
    amountMinor: 5_000,
    description: `Compra outro cartão issue 546 ${suffix}`,
    categoryId: expenseCategory.id,
    cardInstrumentId: otherInstrument.id,
  });
  await archiveCardInstrumentForContext(PERSONAL_CONTEXT, additionalInstrument.id);
  await closeInvoiceForContext(PERSONAL_CONTEXT, firstPurchase.invoice.id);
  const payment = await payInvoiceForContext(
    PERSONAL_CONTEXT,
    firstPurchase.invoice.id,
    paymentAccount.id,
    {
      paidOn: "2032-03-15",
    },
  );
  assert.equal(payment.invoice.paymentTransactionId, payment.transaction.id);

  await assert.rejects(
    () =>
      payInvoiceForContext(PERSONAL_CONTEXT, firstPurchase.invoice.id, paymentAccount.id, {
        paidOn: "2032-03-15",
      }),
    isInvoiceAlreadyPaid,
  );

  await createTransactionForContext(PERSONAL_CONTEXT, {
    accountId: paymentAccount.id,
    categoryId: expenseCategory.id,
    kind: "expense",
    status: "posted",
    amountMinor: payment.transaction.amountMinor,
    occurredOn: "2032-03-16",
    plannedOn: "2032-03-16",
    description: payment.transaction.description,
  });

  const allSources = await buildCategoryEvolutionReportForSourceContext(PERSONAL_CONTEXT, filters, {
    kind: "all",
  });
  assert.equal(allSources.currencyBlocks[0]?.expense.totalMinor, 9_000);

  const paymentAccountReport = await buildCategoryEvolutionReportForSourceContext(
    PERSONAL_CONTEXT,
    filters,
    {
      kind: "account",
      id: paymentAccount.id,
    },
  );
  assert.equal(paymentAccountReport.currencyBlocks[0]?.expense.totalMinor, 2_000);

  const selected = await buildCategoryEvolutionReportForSourceContext(PERSONAL_CONTEXT, filters, {
    kind: "card",
    id: selectedCard.id,
  });
  assert.equal(selected.currencyBlocks[0]?.expense.totalMinor, 2_000);
  assert.equal(selected.currencyBlocks[0]?.result.totalMinor, -2_000);

  await updateCreditCardAccountForContext(PERSONAL_CONTEXT, selectedCard.id, {
    status: "blocked",
  });
  const blocked = await buildCategoryEvolutionReportForSourceContext(PERSONAL_CONTEXT, filters, {
    kind: "card",
    id: selectedCard.id,
  });
  assert.equal(blocked.currencyBlocks[0]?.expense.totalMinor, 2_000);

  const empty = await buildCategoryEvolutionReportForSourceContext(PERSONAL_CONTEXT, filters, {
    kind: "card",
    id: emptyCard.id,
  });
  assert.deepEqual(empty.currencyBlocks, []);

  await assert.rejects(
    () =>
      buildCategoryEvolutionReportForSourceContext(
        {
          ...PERSONAL_CONTEXT,
          financialProfileId: "55555555-5555-4555-8555-555555555555",
        },
        filters,
        { kind: "card", id: selectedCard.id },
      ),
    isSourceNotAvailable,
  );

  await archiveCreditCardAccountForContext(PERSONAL_CONTEXT, selectedCard.id);
  await assert.rejects(
    () =>
      buildCategoryEvolutionReportForSourceContext(PERSONAL_CONTEXT, filters, {
        kind: "card",
        id: selectedCard.id,
      }),
    isSourceNotAvailable,
  );
  await assert.rejects(
    () =>
      buildCategoryEvolutionReportForSourceContext(PERSONAL_CONTEXT, filters, {
        kind: "card",
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    isSourceNotAvailable,
  );
}

function requireInstrument(
  instruments: readonly { id: string; type: string }[],
  type: string,
): { id: string } {
  const instrument = instruments.find((candidate) => candidate.type === type);
  assert.ok(instrument, `Expected ${type} card instrument`);
  return instrument;
}

function isSourceNotAvailable(error: unknown): boolean {
  return error instanceof CategoryEvolutionSourceNotAvailableError && error.statusCode === 404;
}

function isInvoiceAlreadyPaid(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as Error & { code?: string }).code === "CARD_INVOICE_ALREADY_PAID"
  );
}
