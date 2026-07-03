import assert from "node:assert/strict";

import { handleCreditCardAccountsApiRequest } from "./credit-card-accounts-router.js";
import { closePool } from "./db.js";
import { handleMvpApiRequest } from "./mvp.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";

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

  await runDeletesUnusedAccount(token);
  await runRejectsAccountUsedAsCardPaymentAccount(token);
  await runDeletesUnusedCreditCardAccount(token);
  await runRejectsUsedCreditCardAccount(token);
}

async function runDeletesUnusedAccount(token: string): Promise<void> {
  const suffix = Date.now().toString(36);
  const createResponse = await apiRequest(token, "POST", "/api/accounts", {
    name: `Conta sem uso ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
    institutionKey: "c6",
  });
  assert.equal(createResponse.statusCode, 201);
  const account = readAccount(createResponse);

  const deleteResponse = await apiRequest(token, "DELETE", `/api/accounts/${account.id}`);

  assert.equal(deleteResponse.statusCode, 200);
  assert.equal(readBody<{ accountId: string }>(deleteResponse).accountId, account.id);
}

async function runRejectsAccountUsedAsCardPaymentAccount(token: string): Promise<void> {
  const suffix = Date.now().toString(36);
  const accountResponse = await apiRequest(token, "POST", "/api/accounts", {
    name: `Conta vinculada ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  assert.equal(accountResponse.statusCode, 201);
  const account = readAccount(accountResponse);

  const cardResponse = await apiRequest(token, "POST", "/api/credit-card-accounts", {
    name: `Cartao com conta vinculada ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    paymentAccountId: account.id,
    instruments: [{ type: "physical", holder: "primary", name: "Fisico titular" }],
  });
  assert.equal(cardResponse.statusCode, 201);
  const card = readCreditCardAccount(cardResponse);

  const blockedDeleteResponse = await apiRequest(
    token,
    "DELETE",
    `/api/accounts/${account.id}`,
  );

  assert.equal(blockedDeleteResponse.statusCode, 400);
  assert.equal(readErrorCode(blockedDeleteResponse), "ACCOUNT_IN_USE");

  const cardDeleteResponse = await apiRequest(
    token,
    "DELETE",
    `/api/credit-card-accounts/${card.id}`,
  );
  assert.equal(cardDeleteResponse.statusCode, 200);

  const accountDeleteResponse = await apiRequest(
    token,
    "DELETE",
    `/api/accounts/${account.id}`,
  );
  assert.equal(accountDeleteResponse.statusCode, 200);
}

async function runDeletesUnusedCreditCardAccount(token: string): Promise<void> {
  const suffix = Date.now().toString(36);
  const createResponse = await apiRequest(token, "POST", "/api/credit-card-accounts", {
    name: `Cartao sem uso ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    creditLimitMinor: 50_000,
    instruments: [
      {
        type: "physical",
        holder: "primary",
        name: "Fisico titular",
        maskedIdentifier: "**** 1212",
      },
      {
        type: "virtual",
        holder: "primary",
        name: "Virtual titular",
        maskedIdentifier: "**** 3434",
      },
    ],
  });
  assert.equal(createResponse.statusCode, 201);
  const card = readCreditCardAccount(createResponse);

  const deleteResponse = await apiRequest(
    token,
    "DELETE",
    `/api/credit-card-accounts/${card.id}`,
  );

  assert.equal(deleteResponse.statusCode, 200);
  assert.equal(
    readBody<{ creditCardAccountId: string }>(deleteResponse).creditCardAccountId,
    card.id,
  );
}

async function runRejectsUsedCreditCardAccount(token: string): Promise<void> {
  const suffix = Date.now().toString(36);
  const createResponse = await apiRequest(token, "POST", "/api/credit-card-accounts", {
    name: `Cartao usado ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    creditLimitMinor: 50_000,
    instruments: [
      {
        type: "physical",
        holder: "primary",
        name: "Fisico usado",
        maskedIdentifier: "**** 5656",
      },
    ],
  });
  assert.equal(createResponse.statusCode, 201);
  const card = readCreditCardAccount(createResponse);

  const purchaseResponse = await apiRequest(
    token,
    "POST",
    `/api/credit-card-accounts/${card.id}/purchases`,
    {
      occurredOn: "2026-06-21",
      amountMinor: 1_999,
      description: `Compra antes de excluir ${suffix}`,
    },
  );
  assert.equal(purchaseResponse.statusCode, 201);

  const deleteResponse = await apiRequest(
    token,
    "DELETE",
    `/api/credit-card-accounts/${card.id}`,
  );

  assert.equal(deleteResponse.statusCode, 400);
  assert.equal(readErrorCode(deleteResponse), "CARD_ACCOUNT_IN_USE");
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
  const creditCardAccountsResponse = await handleCreditCardAccountsApiRequest(request);
  const response = creditCardAccountsResponse ?? (await handleApiRequest(request));

  return (
    response ?? {
      statusCode: 404,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        error: {
          code: "API_ROUTE_NOT_FOUND",
          message: "Rota de API nao encontrada.",
        },
      },
    }
  );
}

function readAccount(response: Pick<ApiResponse, "body">): ApiAccount {
  return readBody<{ account: ApiAccount }>(response).account;
}

function readCreditCardAccount(response: Pick<ApiResponse, "body">): ApiCreditCardAccount {
  return readBody<{ creditCardAccount: ApiCreditCardAccount }>(response).creditCardAccount;
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
  name: string;
}

interface ApiCreditCardAccount {
  id: string;
  name: string;
}
