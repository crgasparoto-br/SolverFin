import assert from "node:assert/strict";

import { closePool } from "./db.js";
import { handleMvpApiRequest } from "./mvp.js";
import { handleApiRequest, type ApiResponse } from "./router.js";

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

  const token = loginAndReadToken();
  const fixtures = await createPersonalFinancialFlow(token);

  await assertPersonalProfileListsOnlyPersonalData(token, fixtures);
  await assertMeiProfileDoesNotExposePersonalData(token, fixtures);
  await assertUnknownProfileIsRejected(token);
}

async function createPersonalFinancialFlow(token: string): Promise<{
  account: ApiAccount;
  category: ApiCategory;
  transaction: ApiTransaction;
}> {
  const suffix = Date.now().toString(36);

  const accountResponse = await apiRequest(token, "POST", "/api/accounts", {
    name: `Conta integracao ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 12345,
  });
  assert.equal(accountResponse.statusCode, 201);
  const account = readBody<{ account: ApiAccount }>(accountResponse).account;

  assert.equal(account.financialProfileId, PERSONAL_PROFILE_ID);
  assert.equal(account.openingBalanceMinor, 12345);

  const categoryResponse = await apiRequest(token, "POST", "/api/categories", {
    name: `Categoria integracao ${suffix}`,
    kind: "expense",
  });
  assert.equal(categoryResponse.statusCode, 201);
  const category = readBody<{ category: ApiCategory }>(categoryResponse)
    .category;

  assert.equal(category.financialProfileId, PERSONAL_PROFILE_ID);
  assert.equal(category.kind, "expense");

  const transactionResponse = await apiRequest(
    token,
    "POST",
    "/api/transactions",
    {
      kind: "expense",
      amountMinor: 9876,
      occurredOn: "2026-06-17",
      accountId: account.id,
      categoryId: category.id,
      description: `Lancamento integracao ${suffix}`,
    },
  );
  assert.equal(transactionResponse.statusCode, 201);
  const transaction = readBody<{ transaction: ApiTransaction }>(
    transactionResponse,
  ).transaction;

  assert.equal(transaction.financialProfileId, PERSONAL_PROFILE_ID);
  assert.equal(transaction.accountId, account.id);
  assert.equal(transaction.categoryId, category.id);

  return { account, category, transaction };
}

async function assertPersonalProfileListsOnlyPersonalData(
  token: string,
  fixtures: {
    account: ApiAccount;
    category: ApiCategory;
    transaction: ApiTransaction;
  },
): Promise<void> {
  const accounts = readBody<{ accounts: ApiAccount[] }>(
    await apiRequest(token, "GET", "/api/accounts?status=all"),
  ).accounts;
  const categories = readBody<{ categories: ApiCategory[] }>(
    await apiRequest(token, "GET", "/api/categories?status=all"),
  ).categories;
  const transactions = readBody<{ transactions: ApiTransaction[] }>(
    await apiRequest(token, "GET", "/api/transactions?status=all"),
  ).transactions;

  assert.ok(accounts.some((account) => account.id === fixtures.account.id));
  assert.ok(
    categories.some((category) => category.id === fixtures.category.id),
  );
  assert.ok(
    transactions.some(
      (transaction) => transaction.id === fixtures.transaction.id,
    ),
  );
  assert.ok(
    accounts.every(
      (account) => account.financialProfileId === PERSONAL_PROFILE_ID,
    ),
  );
  assert.ok(
    categories.every(
      (category) => category.financialProfileId === PERSONAL_PROFILE_ID,
    ),
  );
  assert.ok(
    transactions.every(
      (transaction) => transaction.financialProfileId === PERSONAL_PROFILE_ID,
    ),
  );
}

async function assertMeiProfileDoesNotExposePersonalData(
  token: string,
  fixtures: { account: ApiAccount; transaction: ApiTransaction },
): Promise<void> {
  const meiAccounts = readBody<{ accounts: ApiAccount[] }>(
    await apiRequest(
      token,
      "GET",
      `/api/accounts?status=all&profileId=${MEI_PROFILE_ID}`,
    ),
  ).accounts;
  const meiTransactions = readBody<{ transactions: ApiTransaction[] }>(
    await apiRequest(
      token,
      "GET",
      `/api/transactions?status=all&profileId=${MEI_PROFILE_ID}`,
    ),
  ).transactions;

  assert.ok(
    meiAccounts.every(
      (account) => account.financialProfileId === MEI_PROFILE_ID,
    ),
  );
  assert.ok(
    meiTransactions.every(
      (transaction) => transaction.financialProfileId === MEI_PROFILE_ID,
    ),
  );
  assert.equal(
    meiAccounts.some((account) => account.id === fixtures.account.id),
    false,
  );
  assert.equal(
    meiTransactions.some(
      (transaction) => transaction.id === fixtures.transaction.id,
    ),
    false,
  );
  assert.ok(meiAccounts.some((account) => account.name === "Conta MEI demo"));

  const crossProfileUpdate = await apiRequest(
    token,
    "PATCH",
    `/api/accounts/${fixtures.account.id}?profileId=${MEI_PROFILE_ID}`,
    { name: "Tentativa de alteracao fora do perfil" },
  );

  assert.equal(crossProfileUpdate.statusCode, 404);
  assert.equal(readErrorCode(crossProfileUpdate), "TENANT_RESOURCE_NOT_FOUND");
}

async function assertUnknownProfileIsRejected(token: string): Promise<void> {
  const response = await apiRequest(
    token,
    "GET",
    `/api/accounts?profileId=${UNKNOWN_PROFILE_ID}`,
  );

  assert.equal(response.statusCode, 403);
  assert.equal(readErrorCode(response), "TENANT_ACCESS_DENIED");
}

function loginAndReadToken(): string {
  const response = handleMvpApiRequest({
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
  const response = await handleApiRequest({
    method,
    pathname: url.pathname,
    query: url.searchParams,
    headers: { authorization: `Bearer ${token}` },
    body,
  });

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

function assertIntegrationDatabaseConfigured(): void {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required. Run `docker compose up -d postgres` before `npm run test:integration`.",
  );
}

interface ApiAccount {
  id: string;
  financialProfileId: string;
  name: string;
  openingBalanceMinor: number;
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
  categoryId?: string;
}
