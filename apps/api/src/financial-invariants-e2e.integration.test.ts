import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import { resolveFinancialAssistantData } from "./financial-assistant-data.js";
import { createAccountForContext } from "./repositories/accounts.js";
import { closeInvoiceForContext } from "./repositories/card-invoice-contracts.js";
import {
  createCardForContext,
  getInvoiceForContext,
  payInvoiceForContext,
  registerCardPurchaseForContext,
} from "./repositories/cards.js";
import {
  buildFinancialSummary,
  type DashboardCurrencyBlock,
  type DashboardSummary,
} from "./repositories/dashboard.js";
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
const SIBLING_CONTEXT: TenantContext = {
  organizationId: CONTEXT.organizationId,
  financialProfileId: "33333333-3333-4333-8333-333333333332",
  financialProfileKind: "mei",
  userId: CONTEXT.userId,
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
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for the financial E2E suite.");

  await runInvariant(
    "FIN-E2E-001",
    "compra de cartao, fechamento e pagamento nao duplicam despesa",
    invariantCardPurchaseSettlementDoesNotDoubleCountExpense,
  );
  await runInvariant(
    "FIN-E2E-002",
    "compra parcelada distribui exatamente o total entre faturas",
    invariantInstallmentPurchaseIsDistributedAcrossInvoices,
  );
  await runInvariant(
    "FIN-E2E-003",
    "receita e despesa de conta alteram saldo uma unica vez",
    invariantAccountIncomeAndExpenseAffectBalanceOnce,
  );
  await runInvariant(
    "FIN-E2E-004",
    "transferencia interna nao altera resultado economico liquido",
    invariantTransferDoesNotChangeEconomicResult,
  );
  await runInvariant(
    "FIN-E2E-005",
    "estorno preserva rastreabilidade e remove o sinal financeiro original",
    invariantVoidPreservesTraceAndReversesFinancialEffect,
  );
  await runInvariant(
    "FIN-E2E-006",
    "compromisso planejado conciliado nao permanece duplicado como futuro",
    invariantPlannedCommitmentMaterializesWithoutDuplication,
  );
  await runInvariant(
    "FIN-E2E-007",
    "perfil BRL e USD permanece particionado sem agregado unico",
    invariantMixedCurrencyProfileNeverProducesSingleAggregate,
  );
  await runInvariant(
    "FIN-E2E-008",
    "filtro explicito de moeda preserva isolamento de perfil",
    invariantCurrencyFilterDoesNotLeakAcrossProfiles,
  );
  await runInvariant(
    "FIN-E2E-009",
    "retry de mutacao financeira nao cria efeitos duplicados",
    invariantMutationRetryDoesNotDuplicateEffects,
  );
}

async function runInvariant(id: string, name: string, action: () => Promise<void>): Promise<void> {
  try {
    await action();
    console.log(`[${id}] PASS ${name}`);
  } catch (error: unknown) {
    const detail = error instanceof Error ? `: ${error.message}` : "";
    throw new Error(`[${id}] ${name}${detail}`);
  }
}

async function invariantCardPurchaseSettlementDoesNotDoubleCountExpense(): Promise<void> {
  const suffix = token();
  const paymentAccount = await createAccountForContext(CONTEXT, {
    name: `FIN-E2E-001 conta ${suffix}`,
    kind: "checking",
    currency: "BRL",
    openingBalanceMinor: 20_000,
  });
  const card = await createCardForContext(CONTEXT, {
    name: `FIN-E2E-001 cartao ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    paymentAccountId: paymentAccount.id,
  });
  const juneReference = new Date("2040-06-30T12:00:00.000Z");
  const julyReference = new Date("2040-07-31T12:00:00.000Z");
  const juneBaseline = await buildFinancialSummary(CONTEXT, juneReference);

  const purchase = await registerCardPurchaseForContext(CONTEXT, card.id, {
    occurredOn: "2040-06-15",
    amountMinor: 7_000,
    description: `FIN-E2E-001 compra ${suffix}`,
  });
  const juneAfterPurchase = await buildFinancialSummary(CONTEXT, juneReference);
  assertCurrencyDelta(juneAfterPurchase, juneBaseline, "BRL", {
    availableBalanceMinor: 0,
    incomeMinor: 0,
    expensesMinor: 7_000,
    plannedCommitmentsMinor: 0,
  });

  await closeInvoiceForContext(CONTEXT, purchase.invoice.id);
  const julyBeforePayment = await buildFinancialSummary(CONTEXT, julyReference);
  const payment = await payInvoiceForContext(CONTEXT, purchase.invoice.id, paymentAccount.id, {
    paidOn: "2040-07-10",
    amountMinor: purchase.invoice.totalAmountMinor,
    description: `FIN-E2E-001 pagamento ${suffix}`,
  });
  const julyAfterPayment = await buildFinancialSummary(CONTEXT, julyReference);

  assert.equal(payment.invoice.paymentTransactionId, payment.transaction.id);
  assertCurrencyDelta(julyAfterPayment, julyBeforePayment, "BRL", {
    availableBalanceMinor: -7_000,
    incomeMinor: 0,
    expensesMinor: 0,
    plannedCommitmentsMinor: -7_000,
  });
}

async function invariantInstallmentPurchaseIsDistributedAcrossInvoices(): Promise<void> {
  const suffix = token();
  const card = await createCardForContext(CONTEXT, {
    name: `FIN-E2E-002 cartao ${suffix}`,
    closingDay: 20,
    dueDay: 10,
  });
  const purchase = await registerCardPurchaseForContext(CONTEXT, card.id, {
    occurredOn: "2041-06-15",
    amountMinor: 10_000,
    description: `FIN-E2E-002 compra parcelada ${suffix}`,
    totalInstallments: 3,
  });
  const invoices = [purchase.invoice, ...purchase.futureInvoices];

  assert.equal(purchase.installments.length, 3);
  assert.equal(invoices.length, 3);
  assert.deepEqual(
    purchase.installments.map((installment) => installment.amountMinor),
    [3_334, 3_333, 3_333],
  );
  assert.deepEqual(
    invoices.map((invoice) => invoice.totalAmountMinor),
    [3_334, 3_333, 3_333],
  );
  assert.deepEqual(
    purchase.installments.map((installment) => installment.dueOn),
    invoices.map((invoice) => invoice.dueOn),
  );
  assert.equal(
    invoices.reduce((total, invoice) => total + invoice.totalAmountMinor, 0),
    purchase.transaction.amountMinor,
  );
}

async function invariantAccountIncomeAndExpenseAffectBalanceOnce(): Promise<void> {
  const suffix = token();
  const account = await createAccountForContext(CONTEXT, {
    name: `FIN-E2E-003 conta ${suffix}`,
    kind: "checking",
    currency: "BRL",
    openingBalanceMinor: 0,
  });
  const reference = new Date("2042-03-31T12:00:00.000Z");
  const baseline = await buildFinancialSummary(CONTEXT, reference);

  await createTransactionForContext(CONTEXT, {
    accountId: account.id,
    kind: "income",
    status: "posted",
    amountMinor: 5_000,
    currency: "BRL",
    occurredOn: "2042-03-10",
    plannedOn: "2042-03-10",
    effectiveOn: "2042-03-10",
    description: `FIN-E2E-003 receita ${suffix}`,
  });
  await createTransactionForContext(CONTEXT, {
    accountId: account.id,
    kind: "expense",
    status: "posted",
    amountMinor: 2_000,
    currency: "BRL",
    occurredOn: "2042-03-11",
    plannedOn: "2042-03-11",
    effectiveOn: "2042-03-11",
    description: `FIN-E2E-003 despesa ${suffix}`,
  });

  assertCurrencyDelta(await buildFinancialSummary(CONTEXT, reference), baseline, "BRL", {
    availableBalanceMinor: 3_000,
    incomeMinor: 5_000,
    expensesMinor: 2_000,
    plannedCommitmentsMinor: 0,
  });
}

async function invariantTransferDoesNotChangeEconomicResult(): Promise<void> {
  const suffix = token();
  const source = await createAccountForContext(CONTEXT, {
    name: `FIN-E2E-004 origem ${suffix}`,
    kind: "checking",
    currency: "BRL",
    openingBalanceMinor: 0,
  });
  const destination = await createAccountForContext(CONTEXT, {
    name: `FIN-E2E-004 destino ${suffix}`,
    kind: "checking",
    currency: "BRL",
    openingBalanceMinor: 0,
  });
  const reference = new Date("2043-04-30T12:00:00.000Z");
  const baseline = await buildFinancialSummary(CONTEXT, reference);

  await createTransactionForContext(CONTEXT, {
    accountId: source.id,
    destinationAccountId: destination.id,
    kind: "transfer",
    status: "posted",
    amountMinor: 2_400,
    currency: "BRL",
    occurredOn: "2043-04-10",
    plannedOn: "2043-04-10",
    effectiveOn: "2043-04-10",
    description: `FIN-E2E-004 transferencia ${suffix}`,
  });

  assertCurrencyDelta(await buildFinancialSummary(CONTEXT, reference), baseline, "BRL", {
    availableBalanceMinor: 0,
    incomeMinor: 0,
    expensesMinor: 0,
    plannedCommitmentsMinor: 0,
  });
}

async function invariantVoidPreservesTraceAndReversesFinancialEffect(): Promise<void> {
  const suffix = token();
  const account = await createAccountForContext(CONTEXT, {
    name: `FIN-E2E-005 conta ${suffix}`,
    kind: "checking",
    currency: "BRL",
    openingBalanceMinor: 0,
  });
  const reference = new Date("2044-05-31T12:00:00.000Z");
  const baseline = await buildFinancialSummary(CONTEXT, reference);
  const expense = await createTransactionForContext(CONTEXT, {
    accountId: account.id,
    kind: "expense",
    status: "posted",
    amountMinor: 1_800,
    currency: "BRL",
    occurredOn: "2044-05-12",
    plannedOn: "2044-05-12",
    effectiveOn: "2044-05-12",
    description: `FIN-E2E-005 despesa estornavel ${suffix}`,
  });

  assertCurrencyDelta(await buildFinancialSummary(CONTEXT, reference), baseline, "BRL", {
    availableBalanceMinor: -1_800,
    incomeMinor: 0,
    expensesMinor: 1_800,
    plannedCommitmentsMinor: 0,
  });

  await voidTransactionForContext(CONTEXT, expense.id);
  const persisted = await getTransactionForContext(CONTEXT, expense.id);

  assert.equal(persisted.id, expense.id);
  assert.equal(persisted.status, "voided");
  assert.equal(persisted.accountId, expense.accountId);
  assert.equal(persisted.amountMinor, expense.amountMinor);
  assert.equal(persisted.currency, expense.currency);
  assert.equal(persisted.description, expense.description);
  assert.ok(persisted.voidedAt);
  assertCurrencyDelta(await buildFinancialSummary(CONTEXT, reference), baseline, "BRL", {
    availableBalanceMinor: 0,
    incomeMinor: 0,
    expensesMinor: 0,
    plannedCommitmentsMinor: 0,
  });
}

async function invariantPlannedCommitmentMaterializesWithoutDuplication(): Promise<void> {
  const suffix = token();
  const account = await createAccountForContext(CONTEXT, {
    name: `FIN-E2E-006 conta ${suffix}`,
    kind: "checking",
    currency: "BRL",
    openingBalanceMinor: 0,
  });
  const reference = new Date("2045-06-30T12:00:00.000Z");
  const baseline = await buildFinancialSummary(CONTEXT, reference);
  const planned = await createTransactionForContext(CONTEXT, {
    accountId: account.id,
    kind: "expense",
    status: "planned",
    amountMinor: 1_200,
    currency: "BRL",
    occurredOn: "2045-06-15",
    plannedOn: "2045-06-20",
    effectiveOn: null,
    description: `FIN-E2E-006 compromisso ${suffix}`,
  });

  assertCurrencyDelta(await buildFinancialSummary(CONTEXT, reference), baseline, "BRL", {
    availableBalanceMinor: 0,
    incomeMinor: 0,
    expensesMinor: 0,
    plannedCommitmentsMinor: 1_200,
  });

  const reconciled = await updateTransactionForContext(CONTEXT, planned.id, {
    status: "reconciled",
    effectiveOn: "2045-06-22",
  });

  assert.equal(reconciled.id, planned.id);
  assert.equal(reconciled.plannedOn, "2045-06-20");
  assert.equal(reconciled.effectiveOn, "2045-06-22");
  assertCurrencyDelta(await buildFinancialSummary(CONTEXT, reference), baseline, "BRL", {
    availableBalanceMinor: -1_200,
    incomeMinor: 0,
    expensesMinor: 1_200,
    plannedCommitmentsMinor: 0,
  });
}

async function invariantMixedCurrencyProfileNeverProducesSingleAggregate(): Promise<void> {
  const suffix = token();
  const brlAccount = await createAccountForContext(CONTEXT, {
    name: `FIN-E2E-007 BRL ${suffix}`,
    kind: "checking",
    currency: "BRL",
    openingBalanceMinor: 0,
  });
  const usdAccount = await createAccountForContext(CONTEXT, {
    name: `FIN-E2E-007 USD ${suffix}`,
    kind: "checking",
    currency: "USD",
    openingBalanceMinor: 0,
  });
  const reference = new Date("2046-07-31T12:00:00.000Z");
  const baseline = await buildFinancialSummary(CONTEXT, reference);

  await createTransactionForContext(CONTEXT, {
    accountId: brlAccount.id,
    kind: "income",
    status: "posted",
    amountMinor: 1_100,
    currency: "BRL",
    occurredOn: "2046-07-10",
    plannedOn: "2046-07-10",
    effectiveOn: "2046-07-10",
    description: `FIN-E2E-007 BRL ${suffix}`,
  });
  await createTransactionForContext(CONTEXT, {
    accountId: usdAccount.id,
    kind: "expense",
    status: "posted",
    amountMinor: 700,
    currency: "USD",
    occurredOn: "2046-07-11",
    plannedOn: "2046-07-11",
    effectiveOn: "2046-07-11",
    description: `FIN-E2E-007 USD ${suffix}`,
  });

  const summary = await buildFinancialSummary(CONTEXT, reference);
  assertCurrencyDelta(summary, baseline, "BRL", {
    availableBalanceMinor: 1_100,
    incomeMinor: 1_100,
    expensesMinor: 0,
    plannedCommitmentsMinor: 0,
  });
  assertCurrencyDelta(summary, baseline, "USD", {
    availableBalanceMinor: -700,
    incomeMinor: 0,
    expensesMinor: 700,
    plannedCommitmentsMinor: 0,
  });
  assert.equal(summary.currencyBlocks.some((block) => block.currency === "BRL"), true);
  assert.equal(summary.currencyBlocks.some((block) => block.currency === "USD"), true);
  assert.equal("currency" in summary, false);
  assert.equal("availableBalanceMinor" in summary, false);
  assert.equal("incomeMinor" in summary, false);
  assert.equal("expensesMinor" in summary, false);
  assert.equal("plannedCommitmentsMinor" in summary, false);
}

async function invariantCurrencyFilterDoesNotLeakAcrossProfiles(): Promise<void> {
  const suffix = token();
  const usdAccount = await createAccountForContext(CONTEXT, {
    name: `FIN-E2E-008 USD ${suffix}`,
    kind: "checking",
    currency: "USD",
    openingBalanceMinor: 0,
  });
  const brlAccount = await createAccountForContext(CONTEXT, {
    name: `FIN-E2E-008 BRL ${suffix}`,
    kind: "checking",
    currency: "BRL",
    openingBalanceMinor: 0,
  });
  const siblingUsdAccount = await createAccountForContext(SIBLING_CONTEXT, {
    name: `FIN-E2E-008 sibling USD ${suffix}`,
    kind: "checking",
    currency: "USD",
    openingBalanceMinor: 0,
  });
  const now = new Date("2047-08-20T12:00:00.000Z");
  const question = "resumo 2047-08 em USD";
  const baselineExpense = await readAssistantExpense(CONTEXT, question, now);

  await createTransactionForContext(CONTEXT, {
    accountId: usdAccount.id,
    kind: "expense",
    status: "posted",
    amountMinor: 1_700,
    currency: "USD",
    occurredOn: "2047-08-10",
    plannedOn: "2047-08-10",
    effectiveOn: "2047-08-10",
    description: `FIN-E2E-008 USD ${suffix}`,
  });
  await createTransactionForContext(CONTEXT, {
    accountId: brlAccount.id,
    kind: "expense",
    status: "posted",
    amountMinor: 2_600,
    currency: "BRL",
    occurredOn: "2047-08-11",
    plannedOn: "2047-08-11",
    effectiveOn: "2047-08-11",
    description: `FIN-E2E-008 BRL ${suffix}`,
  });
  await createTransactionForContext(SIBLING_CONTEXT, {
    accountId: siblingUsdAccount.id,
    kind: "expense",
    status: "posted",
    amountMinor: 900_000,
    currency: "USD",
    occurredOn: "2047-08-12",
    plannedOn: "2047-08-12",
    effectiveOn: "2047-08-12",
    description: `FIN-E2E-008 sibling USD ${suffix}`,
  });

  const filteredExpense = await readAssistantExpense(CONTEXT, question, now);
  assert.equal(filteredExpense - baselineExpense, 1_700);
}

async function invariantMutationRetryDoesNotDuplicateEffects(): Promise<void> {
  const suffix = token();
  const paymentAccount = await createAccountForContext(CONTEXT, {
    name: `FIN-E2E-009 conta ${suffix}`,
    kind: "checking",
    currency: "BRL",
    openingBalanceMinor: 10_000,
  });
  const card = await createCardForContext(CONTEXT, {
    name: `FIN-E2E-009 cartao ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    paymentAccountId: paymentAccount.id,
  });
  const purchase = await registerCardPurchaseForContext(CONTEXT, card.id, {
    occurredOn: "2048-06-15",
    amountMinor: 3_000,
    description: `FIN-E2E-009 compra ${suffix}`,
  });
  await closeInvoiceForContext(CONTEXT, purchase.invoice.id);
  const payment = await payInvoiceForContext(CONTEXT, purchase.invoice.id, paymentAccount.id, {
    paidOn: "2048-07-10",
    amountMinor: purchase.invoice.totalAmountMinor,
    description: `FIN-E2E-009 pagamento ${suffix}`,
  });
  const reference = new Date("2048-07-31T12:00:00.000Z");
  const beforeRetry = await buildFinancialSummary(CONTEXT, reference);
  const paymentCountBefore = await countInvoicePaymentTransactions(
    purchase.invoice.id,
    paymentAccount.id,
  );

  await assert.rejects(
    () =>
      payInvoiceForContext(CONTEXT, purchase.invoice.id, paymentAccount.id, {
        paidOn: "2048-07-10",
        amountMinor: purchase.invoice.totalAmountMinor,
        description: `FIN-E2E-009 pagamento retry ${suffix}`,
      }),
    (error: unknown) => hasCode(error, "CARD_INVOICE_ALREADY_PAID"),
  );

  const persistedInvoice = await getInvoiceForContext(CONTEXT, purchase.invoice.id);
  const afterRetry = await buildFinancialSummary(CONTEXT, reference);
  const paymentCountAfter = await countInvoicePaymentTransactions(
    purchase.invoice.id,
    paymentAccount.id,
  );

  assert.equal(persistedInvoice.paymentTransactionId, payment.transaction.id);
  assert.equal(paymentCountBefore, 1);
  assert.equal(paymentCountAfter, paymentCountBefore);
  assert.deepEqual(afterRetry.currencyBlocks, beforeRetry.currencyBlocks);
}

async function readAssistantExpense(
  context: TenantContext,
  question: string,
  now: Date,
): Promise<number> {
  const resolution = await resolveFinancialAssistantData(context, question, now);
  assert.equal(resolution.kind, "evidence");
  if (resolution.kind !== "evidence") {
    assert.fail(`Expected evidence resolution, received ${resolution.kind}.`);
  }
  assert.equal(resolution.filters.currency, "USD");
  assert.deepEqual(
    [resolution.filters.periodStartOn, resolution.filters.periodEndOn],
    ["2047-08-01", "2047-08-31"],
  );
  assert.ok(resolution.evidence);
  const expense = resolution.evidence.metrics.find((metric) => metric.key === "expense");
  assert.ok(expense);
  return expense.amountMinor ?? 0;
}

async function countInvoicePaymentTransactions(
  invoiceId: string,
  accountId: string,
): Promise<number> {
  const rows = await query<{ count: number }>(
    `select count(*)::int as "count"
       from "Transaction"
      where "organizationId" = $1
        and "financialProfileId" = $2
        and "invoiceId" = $3
        and "accountId" = $4`,
    [CONTEXT.organizationId, CONTEXT.financialProfileId, invoiceId, accountId],
  );
  return rows[0]?.count ?? 0;
}

interface ExpectedBlockDelta {
  availableBalanceMinor: number;
  incomeMinor: number;
  expensesMinor: number;
  plannedCommitmentsMinor: number;
}

function assertCurrencyDelta(
  summary: DashboardSummary,
  baseline: DashboardSummary,
  currency: string,
  expected: ExpectedBlockDelta,
): void {
  const current = blockFor(summary, currency);
  const before = blockFor(baseline, currency);

  assert.deepEqual(
    {
      availableBalanceMinor: current.availableBalanceMinor - before.availableBalanceMinor,
      incomeMinor: current.incomeMinor - before.incomeMinor,
      expensesMinor: current.expensesMinor - before.expensesMinor,
      plannedCommitmentsMinor: current.plannedCommitmentsMinor - before.plannedCommitmentsMinor,
    },
    expected,
  );
}

function blockFor(summary: DashboardSummary, currency: string): DashboardCurrencyBlock {
  return (
    summary.currencyBlocks.find((block) => block.currency === currency) ?? {
      currency,
      availableBalanceMinor: 0,
      incomeMinor: 0,
      expensesMinor: 0,
      plannedCommitmentsMinor: 0,
    }
  );
}

function hasCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}

function token(): string {
  return randomUUID().slice(0, 8);
}
