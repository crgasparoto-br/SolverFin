import assert from "node:assert/strict";

import { handleCardAdditionalLinksApiRequest } from "./card-additional-links-router.js";
import { closePool } from "./db.js";
import { handleImportBatchesApiRequest } from "./import-batches-router.js";
import { handleMvpApiRequest } from "./mvp.js";
import { handlePayablesReceivablesApiRequest } from "./payables-receivables-router.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";

const PERSONAL_PROFILE_ID = "33333333-3333-4333-8333-333333333331";
const MEI_PROFILE_ID = "33333333-3333-4333-8333-333333333332";
const UNKNOWN_PROFILE_ID = "33333333-3333-4333-8333-333333333399";

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

  const token = await loginAndReadToken();
  const fixtures = await createPersonalFinancialFlow(token);
  const payablesReceivables = await createPersonalPayablesReceivablesFlow(token, fixtures);
  const importBatch = await createPersonalCsvImportFlow(token, fixtures);
  const cardInvoice = await createPersonalCardInvoiceFlow(token, fixtures);
  await createCardAdditionalLinksSummaryFlow(token, fixtures);
  await createCardRecurrenceFlow(token, fixtures);

  await assertPersonalProfileListsOnlyPersonalData(
    token,
    fixtures,
    payablesReceivables,
    importBatch,
    cardInvoice,
  );
  await assertMeiProfileDoesNotExposePersonalData(
    token,
    fixtures,
    payablesReceivables,
    importBatch,
    cardInvoice,
  );
  await assertUnknownProfileIsRejected(token);
}

async function createPersonalFinancialFlow(token: string): Promise<PersonalFixtures> {
  const suffix = Date.now().toString(36);

  const accountResponse = await apiRequest(token, "POST", "/api/accounts", {
    name: `Conta integracao ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 12345,
    institutionKey: "inter",
  });
  assert.equal(accountResponse.statusCode, 201);
  const createdAccount = readBody<{ account: ApiAccount }>(accountResponse).account;

  assert.equal(createdAccount.financialProfileId, PERSONAL_PROFILE_ID);
  assert.equal(createdAccount.openingBalanceMinor, 12345);
  assert.equal(createdAccount.institutionKey, "inter");

  const accountUpdateResponse = await apiRequest(
    token,
    "PATCH",
    `/api/accounts/${createdAccount.id}`,
    { institutionKey: "caixa" },
  );
  assert.equal(accountUpdateResponse.statusCode, 200);
  const account = readBody<{ account: ApiAccount }>(accountUpdateResponse).account;

  assert.equal(account.id, createdAccount.id);
  assert.equal(account.institutionKey, "caixa");

  const categoryResponse = await apiRequest(token, "POST", "/api/categories", {
    name: `Categoria integracao ${suffix}`,
    kind: "expense",
  });
  assert.equal(categoryResponse.statusCode, 201);
  const category = readBody<{ category: ApiCategory }>(categoryResponse).category;

  assert.equal(category.financialProfileId, PERSONAL_PROFILE_ID);
  assert.equal(category.kind, "expense");

  const cardResponse = await apiRequest(token, "POST", "/api/cards", {
    name: `Cartao integracao ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    creditLimitMinor: 100000,
    paymentAccountId: account.id,
    institutionKey: "porto_bank",
    brandKey: "visa",
  });
  assert.equal(cardResponse.statusCode, 201);
  const createdCard = readBody<{ card: ApiCard }>(cardResponse).card;

  assert.equal(createdCard.financialProfileId, PERSONAL_PROFILE_ID);
  assert.equal(createdCard.paymentAccountId, account.id);
  assert.equal(createdCard.institutionKey, "porto_bank");
  assert.equal(createdCard.brandKey, "visa");

  const cardUpdateResponse = await apiRequest(token, "PATCH", `/api/cards/${createdCard.id}`, {
    brandKey: "mastercard",
  });
  assert.equal(cardUpdateResponse.statusCode, 200);
  const card = readBody<{ card: ApiCard }>(cardUpdateResponse).card;

  assert.equal(card.id, createdCard.id);
  assert.equal(card.brandKey, "mastercard");

  const transactionResponse = await apiRequest(token, "POST", "/api/transactions", {
    kind: "expense",
    amountMinor: 9876,
    occurredOn: "2026-06-17",
    accountId: account.id,
    categoryId: category.id,
    description: `Lancamento integracao ${suffix}`,
  });
  assert.equal(transactionResponse.statusCode, 201);
  const transaction = readBody<{ transaction: ApiTransaction }>(transactionResponse).transaction;

  assert.equal(transaction.financialProfileId, PERSONAL_PROFILE_ID);
  assert.equal(transaction.accountId, account.id);
  assert.equal(transaction.categoryId, category.id);

  return { account, card, category, transaction };
}

async function createPersonalPayablesReceivablesFlow(
  token: string,
  fixtures: Pick<PersonalFixtures, "account" | "category">,
): Promise<PayablesReceivablesFixtures> {
  const suffix = Date.now().toString(36);
  const payableResponse = await apiRequest(token, "POST", "/api/payables-receivables", {
    kind: "payable",
    amountMinor: 24680,
    dueOn: "2026-06-25",
    accountId: fixtures.account.id,
    categoryId: fixtures.category.id,
    description: `Conta a pagar integracao ${suffix}`,
  });
  assert.equal(payableResponse.statusCode, 201);
  const payable = readBody<{ payableReceivable: ApiPayableReceivable }>(
    payableResponse,
  ).payableReceivable;

  assert.equal(payable.financialProfileId, PERSONAL_PROFILE_ID);
  assert.equal(payable.kind, "payable");
  assert.equal(payable.status, "pending");

  const settledResponse = await apiRequest(
    token,
    "POST",
    `/api/payables-receivables/${payable.id}/settle`,
    {
      settledOn: "2026-06-26",
      accountId: fixtures.account.id,
      categoryId: fixtures.category.id,
      description: `Pagamento integracao ${suffix}`,
    },
  );
  assert.equal(settledResponse.statusCode, 200);
  const settled = readBody<{
    payableReceivable: ApiPayableReceivable;
    transaction: ApiTransaction;
  }>(settledResponse);

  assert.equal(settled.payableReceivable.status, "settled");
  assert.equal(settled.payableReceivable.settlementTransactionId, settled.transaction.id);
  assert.equal(settled.transaction.kind, "expense");

  const receivableResponse = await apiRequest(token, "POST", "/api/payables-receivables", {
    kind: "receivable",
    amountMinor: 13579,
    dueOn: "2026-06-27",
    accountId: fixtures.account.id,
    description: `Conta a receber integracao ${suffix}`,
  });
  assert.equal(receivableResponse.statusCode, 201);
  const receivable = readBody<{ payableReceivable: ApiPayableReceivable }>(
    receivableResponse,
  ).payableReceivable;

  const cancelledResponse = await apiRequest(
    token,
    "POST",
    `/api/payables-receivables/${receivable.id}/cancel`,
  );
  assert.equal(cancelledResponse.statusCode, 200);
  const cancelled = readBody<{ payableReceivable: ApiPayableReceivable }>(
    cancelledResponse,
  ).payableReceivable;

  assert.equal(cancelled.status, "cancelled");
  assert.ok(cancelled.cancelledAt);

  return { payable: settled.payableReceivable, receivable: cancelled };
}

async function createPersonalCsvImportFlow(
  token: string,
  fixtures: Pick<PersonalFixtures, "account" | "category">,
): Promise<ImportFixtures> {
  const suffix = Date.now().toString(36);
  const csvContent = [
    "date,description,amount,kind,accountId,categoryId",
    `2026-06-18,Compra mercado integracao ${suffix},-123.45,expense,${fixtures.account.id},${fixtures.category.id}`,
    `19/06/2026,Receita integracao ${suffix},2500.00,income,${fixtures.account.id},`,
  ].join("\n");

  const importResponse = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: `extrato-${suffix}.csv`,
    content: csvContent,
  });
  assert.equal(importResponse.statusCode, 201);
  const imported = readBody<{
    importBatch: ApiImportBatch;
    suggestions: ApiAiSuggestion[];
    problems: ApiImportProblem[];
  }>(importResponse);

  assert.equal(imported.importBatch.financialProfileId, PERSONAL_PROFILE_ID);
  assert.equal(imported.importBatch.sourceKind, "csv");
  assert.equal(imported.importBatch.status, "reviewing");
  assert.equal(imported.suggestions.length, 2);
  assert.equal(imported.problems.length, 0);
  assertEveryProfile(imported.suggestions, PERSONAL_PROFILE_ID);
  assert.equal(
    imported.suggestions.every(
      (suggestion) => suggestion.sourceEntityId === imported.importBatch.id,
    ),
    true,
  );

  const detailResponse = await apiRequest(
    token,
    "GET",
    `/api/import-batches/${imported.importBatch.id}`,
  );
  assert.equal(detailResponse.statusCode, 200);
  const detail = readBody<{ importBatch: ApiImportBatch; suggestions: ApiAiSuggestion[] }>(
    detailResponse,
  );

  assert.equal(detail.importBatch.id, imported.importBatch.id);
  assert.equal(detail.suggestions.length, 2);

  const invalidResponse = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: `extrato-invalido-${suffix}.csv`,
    content: "data,valor\n2026-06-18,10.00",
  });
  assert.equal(invalidResponse.statusCode, 400);
  assert.equal(readErrorCode(invalidResponse), "IMPORT_CSV_HEADER_INVALID");

  return { batch: imported.importBatch };
}

async function createPersonalCardInvoiceFlow(
  token: string,
  fixtures: Pick<PersonalFixtures, "account" | "card" | "category">,
): Promise<CardInvoiceFixtures> {
  const suffix = Date.now().toString(36);
  const purchaseResponse = await apiRequest(
    token,
    "POST",
    `/api/cards/${fixtures.card.id}/purchases`,
    {
      occurredOn: "2026-06-19",
      amountMinor: 3210,
      description: `Compra cartao integracao ${suffix}`,
      categoryId: fixtures.category.id,
    },
  );
  assert.equal(purchaseResponse.statusCode, 201);
  const purchaseResult = readBody<{
    transaction: ApiTransaction;
    invoice: ApiInvoice;
    installments: unknown[];
  }>(purchaseResponse);

  assert.equal(purchaseResult.transaction.financialProfileId, PERSONAL_PROFILE_ID);
  assert.equal(purchaseResult.transaction.cardId, fixtures.card.id);
  assert.equal(purchaseResult.transaction.invoiceId, purchaseResult.invoice.id);
  assert.equal(purchaseResult.transaction.amountMinor, 3210);
  assert.equal(purchaseResult.invoice.financialProfileId, PERSONAL_PROFILE_ID);
  assert.equal(purchaseResult.invoice.cardId, fixtures.card.id);
  assert.equal(purchaseResult.invoice.totalAmountMinor, 3210);
  assert.equal(purchaseResult.invoice.status, "open");

  const summaryResponse = await apiRequest(
    token,
    "GET",
    `/api/invoices/${purchaseResult.invoice.id}/summary`,
  );
  assert.equal(summaryResponse.statusCode, 200);
  const summary = readBody<{ summary: ApiInvoiceSummary }>(summaryResponse).summary;

  assert.equal(summary.invoiceId, purchaseResult.invoice.id);
  assert.equal(summary.financialProfileId, PERSONAL_PROFILE_ID);
  assert.equal(summary.cardId, fixtures.card.id);
  assert.equal(summary.status, "open");
  assert.equal(summary.totalExpensesMinor, 3210);
  assert.equal(summary.totalPaidMinor, 0);
  assert.equal(summary.amountDueMinor, 3210);
  assert.equal(summary.unreconciledExpensesMinor, 3210);
  assert.equal(summary.purchasesCount, 1);
  assert.equal(summary.cardTotals.length, 1);
  assert.equal(summary.cardTotals[0]?.limitTotalMinor, 100000);
  assert.equal(summary.cardTotals[0]?.limitUsedMinor, 3210);
  assert.equal(summary.cardTotals[0]?.limitAvailableMinor, 96790);

  const invoicePurchasesResponse = await apiRequest(
    token,
    "GET",
    `/api/invoices/${purchaseResult.invoice.id}/purchases?search=cartao&reconciliation=unreconciled`,
  );
  assert.equal(invoicePurchasesResponse.statusCode, 200);
  const invoicePurchases = readBody<{ purchases: ApiCardPurchase[] }>(
    invoicePurchasesResponse,
  ).purchases;

  assert.equal(hasId(invoicePurchases, purchaseResult.transaction.id), true);
  assertEveryProfile(invoicePurchases, PERSONAL_PROFILE_ID);
  assert.equal(invoicePurchases[0]?.invoiceId, purchaseResult.invoice.id);

  const periodPurchasesResponse = await apiRequest(
    token,
    "GET",
    `/api/card-purchases?cardId=${fixtures.card.id}&occurredFrom=2026-06-01&occurredTo=2026-06-30`,
  );
  assert.equal(periodPurchasesResponse.statusCode, 200);
  const periodPurchases = readBody<{ purchases: ApiCardPurchase[] }>(
    periodPurchasesResponse,
  ).purchases;

  assert.equal(hasId(periodPurchases, purchaseResult.transaction.id), true);
  assertEveryProfile(periodPurchases, PERSONAL_PROFILE_ID);

  const closeResponse = await apiRequest(
    token,
    "POST",
    `/api/invoices/${purchaseResult.invoice.id}/close`,
  );
  assert.equal(closeResponse.statusCode, 200);
  const closedSummary = readBody<{ summary: ApiInvoiceSummary }>(closeResponse).summary;

  assert.equal(closedSummary.status, "closed");
  assert.equal(closedSummary.amountDueMinor, 3210);

  const payResponse = await apiRequest(
    token,
    "POST",
    `/api/invoices/${purchaseResult.invoice.id}/pay`,
    {
      paymentAccountId: fixtures.account.id,
      paidOn: "2026-07-10",
      amountMinor: 3210,
      description: `Pagamento fatura integracao ${suffix}`,
    },
  );
  assert.equal(payResponse.statusCode, 200);
  const paid = readBody<{ invoice: ApiInvoice; transaction: ApiTransaction }>(payResponse);

  assert.equal(paid.invoice.status, "paid");
  assert.equal(paid.transaction.financialProfileId, PERSONAL_PROFILE_ID);
  assert.equal(paid.transaction.accountId, fixtures.account.id);
  assert.equal(paid.transaction.invoiceId, purchaseResult.invoice.id);
  assert.equal(paid.transaction.amountMinor, 3210);

  return {
    invoice: paid.invoice,
    payment: paid.transaction,
    purchase: purchaseResult.transaction,
  };
}

async function createCardAdditionalLinksSummaryFlow(
  token: string,
  fixtures: Pick<PersonalFixtures, "account">,
): Promise<void> {
  const suffix = Date.now().toString(36);

  const primaryCardResponse = await apiRequest(token, "POST", "/api/cards", {
    name: `Cartao principal familia ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    creditLimitMinor: 200000,
    paymentAccountId: fixtures.account.id,
  });
  assert.equal(primaryCardResponse.statusCode, 201);
  const primaryCard = readBody<{ card: ApiCard }>(primaryCardResponse).card;

  const additionalCardResponse = await apiRequest(token, "POST", "/api/cards", {
    name: `Cartao adicional familia ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    creditLimitMinor: 50000,
    paymentAccountId: fixtures.account.id,
  });
  assert.equal(additionalCardResponse.statusCode, 201);
  const additionalCard = readBody<{ card: ApiCard }>(additionalCardResponse).card;

  const unlinkedCardResponse = await apiRequest(token, "POST", "/api/cards", {
    name: `Cartao sem vinculo familia ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    creditLimitMinor: 30000,
    paymentAccountId: fixtures.account.id,
  });
  assert.equal(unlinkedCardResponse.statusCode, 201);
  const unlinkedCard = readBody<{ card: ApiCard }>(unlinkedCardResponse).card;

  const linkResponse = await apiRequest(token, "POST", "/api/card-additional-links", {
    groupCardId: primaryCard.id,
    cardId: additionalCard.id,
  });
  assert.equal(linkResponse.statusCode, 201);

  const primaryPurchaseResponse = await apiRequest(
    token,
    "POST",
    `/api/cards/${primaryCard.id}/purchases`,
    {
      occurredOn: "2026-06-19",
      amountMinor: 5000,
      description: `Compra principal familia ${suffix}`,
    },
  );
  assert.equal(primaryPurchaseResponse.statusCode, 201);
  const primaryPurchase = readBody<{ invoice: ApiInvoice }>(primaryPurchaseResponse);

  const additionalPurchaseResponse = await apiRequest(
    token,
    "POST",
    `/api/cards/${additionalCard.id}/purchases`,
    {
      occurredOn: "2026-06-19",
      amountMinor: 1500,
      description: `Compra adicional familia ${suffix}`,
    },
  );
  assert.equal(additionalPurchaseResponse.statusCode, 201);

  const unlinkedPurchaseResponse = await apiRequest(
    token,
    "POST",
    `/api/cards/${unlinkedCard.id}/purchases`,
    {
      occurredOn: "2026-06-19",
      amountMinor: 999,
      description: `Compra sem vinculo familia ${suffix}`,
    },
  );
  assert.equal(unlinkedPurchaseResponse.statusCode, 201);

  const summaryResponse = await apiRequest(
    token,
    "GET",
    `/api/invoices/${primaryPurchase.invoice.id}/summary`,
  );
  assert.equal(summaryResponse.statusCode, 200);
  const summary = readBody<{ summary: ApiInvoiceSummary }>(summaryResponse).summary;

  assert.equal(summary.cardTotals.length, 2);
  const primaryTotal = summary.cardTotals.find((total) => total.cardId === primaryCard.id);
  const additionalTotal = summary.cardTotals.find((total) => total.cardId === additionalCard.id);

  assert.equal(primaryTotal?.invoiceTotalMinor, 5000);
  assert.equal(primaryTotal?.limitTotalMinor, 200000);
  assert.equal(additionalTotal?.invoiceTotalMinor, 1500);
  assert.equal(additionalTotal?.limitTotalMinor, 50000);
  assert.equal(
    summary.cardTotals.some((total) => total.cardId === unlinkedCard.id),
    false,
  );
}

async function createCardRecurrenceFlow(
  token: string,
  fixtures: Pick<PersonalFixtures, "account" | "category">,
): Promise<void> {
  const suffix = Date.now().toString(36);

  const cardResponse = await apiRequest(token, "POST", "/api/cards", {
    name: `Cartao assinatura ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    paymentAccountId: fixtures.account.id,
  });
  assert.equal(cardResponse.statusCode, 201);
  const card = readBody<{ card: ApiCard }>(cardResponse).card;

  const missingTargetResponse = await apiRequest(token, "POST", "/api/recurrences", {
    frequency: "monthly",
    startOn: "2026-06-05",
    amountMinor: 4990,
    description: `Assinatura sem cartao/conta ${suffix}`,
  });
  assert.equal(missingTargetResponse.statusCode, 400);
  assert.equal(readErrorCode(missingTargetResponse), "RECURRENCE_TARGET_REQUIRED");

  const conflictingTargetResponse = await apiRequest(token, "POST", "/api/recurrences", {
    frequency: "monthly",
    startOn: "2026-06-05",
    amountMinor: 4990,
    description: `Assinatura com conta e cartao ${suffix}`,
    accountId: fixtures.account.id,
    cardId: card.id,
  });
  assert.equal(conflictingTargetResponse.statusCode, 400);
  assert.equal(readErrorCode(conflictingTargetResponse), "RECURRENCE_TARGET_CONFLICT");

  const recurrenceResponse = await apiRequest(token, "POST", "/api/recurrences", {
    frequency: "monthly",
    startOn: "2026-06-05",
    amountMinor: 4990,
    description: `Assinatura no cartao ${suffix}`,
    cardId: card.id,
    categoryId: fixtures.category.id,
  });
  assert.equal(recurrenceResponse.statusCode, 201);
  const recurrence = readBody<{ recurrence: ApiRecurrence }>(recurrenceResponse).recurrence;

  assert.equal(recurrence.financialProfileId, PERSONAL_PROFILE_ID);
  assert.equal(recurrence.cardId, card.id);
  assert.equal(recurrence.accountId, undefined);

  const generateResponse = await apiRequest(
    token,
    "POST",
    `/api/recurrences/${recurrence.id}/generate-installments`,
    { through: "2026-08-05" },
  );
  assert.equal(generateResponse.statusCode, 201);
  const installments = readBody<{ installments: ApiInstallment[] }>(generateResponse).installments;

  assert.equal(installments.length, 3);
  installments.forEach((installment) => {
    assert.equal(installment.cardId, card.id);
    assert.equal(installment.recurrenceId, recurrence.id);
  });
}

async function assertPersonalProfileListsOnlyPersonalData(
  token: string,
  fixtures: PersonalFixtures,
  payablesReceivables: PayablesReceivablesFixtures,
  importFixtures: ImportFixtures,
  cardInvoice: CardInvoiceFixtures,
): Promise<void> {
  const accountsResponse = await apiRequest(token, "GET", "/api/accounts?status=all");
  const cardsResponse = await apiRequest(token, "GET", "/api/cards?status=all");
  const categoriesResponse = await apiRequest(token, "GET", "/api/categories?status=all");
  const transactionsResponse = await apiRequest(token, "GET", "/api/transactions?status=all");
  const payablesReceivablesResponse = await apiRequest(
    token,
    "GET",
    "/api/payables-receivables?status=all",
  );
  const importBatchesResponse = await apiRequest(token, "GET", "/api/import-batches?status=all");
  const cardPurchasesResponse = await apiRequest(token, "GET", "/api/card-purchases");

  const accounts = readBody<{ accounts: ApiAccount[] }>(accountsResponse).accounts;
  const cards = readBody<{ cards: ApiCard[] }>(cardsResponse).cards;
  const categories = readBody<{ categories: ApiCategory[] }>(categoriesResponse).categories;
  const transactions = readBody<{ transactions: ApiTransaction[] }>(
    transactionsResponse,
  ).transactions;
  const listedPayablesReceivables = readBody<{
    payablesReceivables: ApiPayableReceivable[];
  }>(payablesReceivablesResponse).payablesReceivables;
  const importBatches = readBody<{ importBatches: ApiImportBatch[] }>(
    importBatchesResponse,
  ).importBatches;
  const cardPurchases = readBody<{ purchases: ApiCardPurchase[] }>(cardPurchasesResponse).purchases;

  const listedAccount = accounts.find((account) => account.id === fixtures.account.id);
  const listedCard = cards.find((card) => card.id === fixtures.card.id);

  assert.equal(hasId(accounts, fixtures.account.id), true);
  assert.equal(hasId(cards, fixtures.card.id), true);
  assert.equal(hasId(categories, fixtures.category.id), true);
  assert.equal(hasId(transactions, fixtures.transaction.id), true);
  assert.equal(hasId(transactions, cardInvoice.purchase.id), true);
  assert.equal(hasId(transactions, cardInvoice.payment.id), true);
  assert.equal(hasId(cardPurchases, cardInvoice.purchase.id), true);
  assert.equal(hasId(listedPayablesReceivables, payablesReceivables.payable.id), true);
  assert.equal(hasId(listedPayablesReceivables, payablesReceivables.receivable.id), true);
  assert.equal(hasId(importBatches, importFixtures.batch.id), true);
  assert.equal(listedAccount?.institutionKey, "caixa");
  assert.equal(listedCard?.institutionKey, "porto_bank");
  assert.equal(listedCard?.brandKey, "mastercard");
  assertEveryProfile(accounts, PERSONAL_PROFILE_ID);
  assertEveryProfile(cards, PERSONAL_PROFILE_ID);
  assertEveryProfile(categories, PERSONAL_PROFILE_ID);
  assertEveryProfile(transactions, PERSONAL_PROFILE_ID);
  assertEveryProfile(cardPurchases, PERSONAL_PROFILE_ID);
  assertEveryProfile(listedPayablesReceivables, PERSONAL_PROFILE_ID);
  assertEveryProfile(importBatches, PERSONAL_PROFILE_ID);
}

async function assertMeiProfileDoesNotExposePersonalData(
  token: string,
  fixtures: MeiIsolationFixtures,
  payablesReceivables: PayablesReceivablesFixtures,
  importFixtures: ImportFixtures,
  cardInvoice: CardInvoiceFixtures,
): Promise<void> {
  const meiAccountsResponse = await apiRequest(
    token,
    "GET",
    `/api/accounts?status=all&profileId=${MEI_PROFILE_ID}`,
  );
  const meiCardsResponse = await apiRequest(
    token,
    "GET",
    `/api/cards?status=all&profileId=${MEI_PROFILE_ID}`,
  );
  const meiTransactionsResponse = await apiRequest(
    token,
    "GET",
    `/api/transactions?status=all&profileId=${MEI_PROFILE_ID}`,
  );
  const meiPayablesReceivablesResponse = await apiRequest(
    token,
    "GET",
    `/api/payables-receivables?status=all&profileId=${MEI_PROFILE_ID}`,
  );
  const meiImportBatchesResponse = await apiRequest(
    token,
    "GET",
    `/api/import-batches?status=all&profileId=${MEI_PROFILE_ID}`,
  );
  const meiCardPurchasesResponse = await apiRequest(
    token,
    "GET",
    `/api/card-purchases?profileId=${MEI_PROFILE_ID}`,
  );

  const meiAccounts = readBody<{ accounts: ApiAccount[] }>(meiAccountsResponse).accounts;
  const meiCards = readBody<{ cards: ApiCard[] }>(meiCardsResponse).cards;
  const meiTransactions = readBody<{ transactions: ApiTransaction[] }>(
    meiTransactionsResponse,
  ).transactions;
  const meiPayablesReceivables = readBody<{
    payablesReceivables: ApiPayableReceivable[];
  }>(meiPayablesReceivablesResponse).payablesReceivables;
  const meiImportBatches = readBody<{ importBatches: ApiImportBatch[] }>(
    meiImportBatchesResponse,
  ).importBatches;
  const meiCardPurchases = readBody<{ purchases: ApiCardPurchase[] }>(
    meiCardPurchasesResponse,
  ).purchases;

  assertEveryProfile(meiAccounts, MEI_PROFILE_ID);
  assertEveryProfile(meiCards, MEI_PROFILE_ID);
  assertEveryProfile(meiTransactions, MEI_PROFILE_ID);
  assertEveryProfile(meiPayablesReceivables, MEI_PROFILE_ID);
  assertEveryProfile(meiImportBatches, MEI_PROFILE_ID);
  assertEveryProfile(meiCardPurchases, MEI_PROFILE_ID);
  assert.equal(hasId(meiAccounts, fixtures.account.id), false);
  assert.equal(hasId(meiCards, fixtures.card.id), false);
  assert.equal(hasId(meiTransactions, fixtures.transaction.id), false);
  assert.equal(hasId(meiTransactions, cardInvoice.purchase.id), false);
  assert.equal(hasId(meiTransactions, cardInvoice.payment.id), false);
  assert.equal(hasId(meiCardPurchases, cardInvoice.purchase.id), false);
  assert.equal(hasId(meiPayablesReceivables, payablesReceivables.payable.id), false);
  assert.equal(hasId(meiImportBatches, importFixtures.batch.id), false);
  assert.equal(hasAccountNamed(meiAccounts, "Conta MEI demo"), true);

  const crossProfileUpdate = await apiRequest(
    token,
    "PATCH",
    `/api/accounts/${fixtures.account.id}?profileId=${MEI_PROFILE_ID}`,
    { name: "Tentativa de alteracao fora do perfil" },
  );

  assert.equal(crossProfileUpdate.statusCode, 404);
  assert.equal(readErrorCode(crossProfileUpdate), "TENANT_RESOURCE_NOT_FOUND");

  const crossProfileCard = await apiRequest(
    token,
    "GET",
    `/api/cards/${fixtures.card.id}?profileId=${MEI_PROFILE_ID}`,
  );

  assert.equal(crossProfileCard.statusCode, 404);
  assert.equal(readErrorCode(crossProfileCard), "TENANT_RESOURCE_NOT_FOUND");

  const crossProfilePayable = await apiRequest(
    token,
    "GET",
    `/api/payables-receivables/${payablesReceivables.payable.id}?profileId=${MEI_PROFILE_ID}`,
  );

  assert.equal(crossProfilePayable.statusCode, 404);
  assert.equal(readErrorCode(crossProfilePayable), "TENANT_RESOURCE_NOT_FOUND");

  const crossProfileImportBatch = await apiRequest(
    token,
    "GET",
    `/api/import-batches/${importFixtures.batch.id}?profileId=${MEI_PROFILE_ID}`,
  );

  assert.equal(crossProfileImportBatch.statusCode, 404);
  assert.equal(readErrorCode(crossProfileImportBatch), "TENANT_RESOURCE_NOT_FOUND");

  const crossProfileInvoice = await apiRequest(
    token,
    "GET",
    `/api/invoices/${cardInvoice.invoice.id}/summary?profileId=${MEI_PROFILE_ID}`,
  );

  assert.equal(crossProfileInvoice.statusCode, 404);
  assert.equal(readErrorCode(crossProfileInvoice), "TENANT_RESOURCE_NOT_FOUND");
}

async function assertUnknownProfileIsRejected(token: string): Promise<void> {
  const response = await apiRequest(token, "GET", `/api/accounts?profileId=${UNKNOWN_PROFILE_ID}`);

  assert.equal(response.statusCode, 403);
  assert.equal(readErrorCode(response), "TENANT_ACCESS_DENIED");
}

async function loginAndReadToken(): Promise<string> {
  const response = await handleMvpApiRequest({
    method: "POST",
    path: "/api/session",
    body: {
      email: "demo@solverfin.example.invalid",
      password: "SolverFinDemo!2026",
    },
  });

  assert.equal(response.statusCode, 201);

  return readBody<{ session: { token: string } }>(response).session.token;
}

async function apiRequest(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResponse> {
  const url = new URL(path, "http://solverfin.integration.test");
  const request: ApiRequest = {
    method,
    pathname: url.pathname,
    query: url.searchParams,
    headers: { authorization: `Bearer ${token}` },
    body,
  };
  const importBatchesResponse = await handleImportBatchesApiRequest(request);
  const payablesReceivablesResponse =
    importBatchesResponse ?? (await handlePayablesReceivablesApiRequest(request));
  const cardAdditionalLinksResponse =
    payablesReceivablesResponse ?? (await handleCardAdditionalLinksApiRequest(request));
  const response = cardAdditionalLinksResponse ?? (await handleApiRequest(request));

  assert.ok(response, `${method} ${path} should be handled by the API router`);

  return response;
}

function readBody<TBody>(response: Pick<ApiResponse, "body">): TBody {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);

  return response.body as TBody;
}

function readErrorCode(response: ApiResponse): string | undefined {
  return readBody<{ error?: { code?: string } }>(response).error?.code;
}

function hasId(items: Array<{ id: string }>, id: string): boolean {
  return items.some((item) => item.id === id);
}

function hasAccountNamed(accounts: ApiAccount[], name: string): boolean {
  return accounts.some((account) => account.name === name);
}

function assertEveryProfile(
  items: Array<{ financialProfileId: string }>,
  financialProfileId: string,
): void {
  assert.equal(
    items.every((item) => item.financialProfileId === financialProfileId),
    true,
  );
}

function assertIntegrationDatabaseConfigured(): void {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required. Run `docker compose up -d postgres` before `npm run test:integration`.",
  );
}

interface PersonalFixtures {
  account: ApiAccount;
  card: ApiCard;
  category: ApiCategory;
  transaction: ApiTransaction;
}

interface PayablesReceivablesFixtures {
  payable: ApiPayableReceivable;
  receivable: ApiPayableReceivable;
}

interface ImportFixtures {
  batch: ApiImportBatch;
}

interface CardInvoiceFixtures {
  invoice: ApiInvoice;
  payment: ApiTransaction;
  purchase: ApiTransaction;
}

type MeiIsolationFixtures = Pick<PersonalFixtures, "account" | "card" | "transaction">;

interface ApiAccount {
  id: string;
  financialProfileId: string;
  name: string;
  openingBalanceMinor: number;
  institutionKey?: string;
}

interface ApiCard {
  id: string;
  financialProfileId: string;
  name: string;
  paymentAccountId?: string;
  institutionKey?: string;
  brandKey?: string;
}

interface ApiCategory {
  id: string;
  financialProfileId: string;
  name: string;
  kind: string;
}

interface ApiTransaction {
  id: string;
  financialProfileId: string;
  accountId?: string;
  amountMinor?: number;
  cardId?: string;
  categoryId?: string;
  invoiceId?: string;
  kind?: string;
  status?: string;
}

interface ApiInvoice {
  id: string;
  financialProfileId: string;
  cardId: string;
  status: string;
  totalAmountMinor: number;
}

interface ApiInvoiceSummary {
  invoiceId: string;
  financialProfileId: string;
  cardId: string;
  status: string;
  totalExpensesMinor: number;
  totalPaidMinor: number;
  amountDueMinor: number;
  reconciledExpensesMinor: number;
  unreconciledExpensesMinor: number;
  purchasesCount: number;
  cardTotals: ApiInvoiceCardTotal[];
}

interface ApiInvoiceCardTotal {
  cardId: string;
  limitTotalMinor: number;
  limitUsedMinor: number;
  limitAvailableMinor: number;
  invoiceTotalMinor: number;
  invoiceAmountDueMinor: number;
}

interface ApiCardPurchase {
  id: string;
  financialProfileId: string;
  cardId: string;
  invoiceId?: string;
  status: string;
  amountMinor: number;
  occurredOn: string;
}

interface ApiRecurrence {
  id: string;
  financialProfileId: string;
  accountId?: string;
  cardId?: string;
  status: string;
  frequency: string;
  amountMinor: number;
}

interface ApiInstallment {
  id: string;
  recurrenceId?: string;
  cardId?: string;
  sequenceNumber: number;
  totalInstallments: number;
  dueOn: string;
  amountMinor: number;
  status: string;
}

interface ApiPayableReceivable {
  id: string;
  financialProfileId: string;
  kind: string;
  status: string;
  accountId?: string;
  categoryId?: string;
  settlementTransactionId?: string;
  cancelledAt?: string;
}

interface ApiImportBatch {
  id: string;
  financialProfileId: string;
  sourceKind: string;
  status: string;
  originalFileName?: string;
  sourceHash: string;
}

interface ApiAiSuggestion {
  id: string;
  financialProfileId: string;
  kind: string;
  status: string;
  sourceEntityId?: string;
  explanation: string;
}

interface ApiImportProblem {
  rowNumber: number;
  severity: string;
  code: string;
  message: string;
}
