import assert from "node:assert/strict";

import { handleAccountRemunerationApiRequest } from "./account-remuneration-router.js";
import { resetAccountRemunerationTestData } from "./account-remuneration-test-support.js";
import { closePool } from "./db.js";
import { handleMvpApiRequest } from "./mvp.js";
import { importCdiRates } from "./repositories/account-remuneration-service.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";

const COMPETENCE_ON = "2037-06-01";
const PROCESSING_ON = "2037-06-02";
const MASTER_EMAIL = "demo@solverfin.example.invalid";
const previousMasterEmails = process.env.SOLVERFIN_MASTER_EMAILS;

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (previousMasterEmails === undefined) delete process.env.SOLVERFIN_MASTER_EMAILS;
    else process.env.SOLVERFIN_MASTER_EMAILS = previousMasterEmails;
    await closePool();
  });

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for remuneration router tests.");
  await resetAccountRemunerationTestData();
  process.env.SOLVERFIN_MASTER_EMAILS = MASTER_EMAIL;

  const token = await loginAndReadToken();
  const suffix = Date.now().toString(36);
  const accountResponse = await apiRequest(token, "POST", "/api/accounts", {
    name: `Conta remuneração API ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 1_000_000,
  });
  assert.equal(accountResponse.statusCode, 201);
  const account = readBody<{ account: { id: string } }>(accountResponse).account;

  const configurationResponse = await apiRequest(
    token,
    "PUT",
    `/api/account-remuneration/configurations/${account.id}`,
    { enabled: true, remunerationPercent: 100, startsOn: COMPETENCE_ON },
  );
  assert.equal(configurationResponse.statusCode, 200);

  const listConfigurationResponse = await apiRequest(
    token,
    "GET",
    "/api/account-remuneration/configurations",
  );
  assert.equal(listConfigurationResponse.statusCode, 200);
  assert.ok(
    readBody<{ configurations: Array<{ accountId: string; enabled: boolean }> }>(
      listConfigurationResponse,
    ).configurations.some(
      (configuration) => configuration.accountId === account.id && configuration.enabled,
    ),
  );

  await importCdiRates(
    { startsOn: COMPETENCE_ON, endsOn: COMPETENCE_ON },
    async () =>
      new Response(JSON.stringify([{ data: "01/06/2037", valor: "0,055131" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );

  const processingResponse = await apiRequest(
    token,
    "POST",
    "/api/admin/account-remunerations/process",
    { processedOn: PROCESSING_ON },
  );
  assert.equal(processingResponse.statusCode, 200);

  const transactionsResponse = await apiRequest(
    token,
    "GET",
    `/api/transactions?accountId=${account.id}&status=all`,
  );
  assert.equal(transactionsResponse.statusCode, 200);
  const remuneration = readBody<{
    transactions: Array<{
      id: string;
      source: string;
      amountMinor: number;
      accountRemuneration?: {
        competenceOn: string;
        balanceBaseMinor: number;
        originalAmountMinor: number;
        manuallyAdjusted: boolean;
      };
    }>;
  }>(transactionsResponse).transactions.find(
    (transaction) => transaction.source === "account_remuneration",
  );
  assert.ok(remuneration);
  assert.equal(remuneration.accountRemuneration?.competenceOn, COMPETENCE_ON);
  assert.equal(remuneration.accountRemuneration?.balanceBaseMinor, 1_000_000);
  assert.equal(remuneration.accountRemuneration?.manuallyAdjusted, false);

  const adjustedResponse = await apiRequest(
    token,
    "PATCH",
    `/api/transactions/${remuneration.id}`,
    { amountMinor: remuneration.amountMinor + 1 },
  );
  assert.equal(adjustedResponse.statusCode, 200);
  const adjusted = readBody<{
    transaction: {
      amountMinor: number;
      accountRemuneration?: { originalAmountMinor: number; manuallyAdjusted: boolean };
    };
  }>(adjustedResponse).transaction;
  assert.equal(adjusted.amountMinor, remuneration.amountMinor + 1);
  assert.equal(
    adjusted.accountRemuneration?.originalAmountMinor,
    remuneration.accountRemuneration?.originalAmountMinor,
  );
  assert.equal(adjusted.accountRemuneration?.manuallyAdjusted, true);

  const idempotentAccountUpdate = await apiRequest(token, "PATCH", `/api/accounts/${account.id}`, {
    name: `Conta remuneração atualizada ${suffix}`,
    openingBalanceMinor: 1_000_000,
  });
  assert.equal(idempotentAccountUpdate.statusCode, 200);

  const changedOpeningBalance = await apiRequest(token, "PATCH", `/api/accounts/${account.id}`, {
    openingBalanceMinor: 1_000_001,
  });
  assert.equal(changedOpeningBalance.statusCode, 400);
  assert.equal(readError(changedOpeningBalance).code, "ACCOUNT_OPENING_BALANCE_LOCKED");
  assert.match(readError(changedOpeningBalance).message ?? "", /movimentações/);

  const blockedCurrencyChange = await apiRequest(token, "PATCH", `/api/accounts/${account.id}`, {
    currency: "USD",
  });
  assert.equal(blockedCurrencyChange.statusCode, 409);
  assert.equal(
    readError(blockedCurrencyChange).code,
    "ACCOUNT_REMUNERATION_MUST_BE_DISABLED",
  );
  assert.match(readError(blockedCurrencyChange).message ?? "", /Desative.*CDI/);

  const blockedArchive = await apiRequest(
    token,
    "POST",
    `/api/accounts/${account.id}/archive`,
  );
  assert.equal(blockedArchive.statusCode, 409);
  assert.equal(readError(blockedArchive).code, "ACCOUNT_REMUNERATION_MUST_BE_DISABLED");
  assert.match(readError(blockedArchive).message ?? "", /Desative.*CDI/);

  const statusResponse = await apiRequest(token, "GET", "/api/admin/financial-indexes/status");
  assert.equal(statusResponse.statusCode, 200);
  const status = readBody<{
    status: { pendingCompetences: number; configurationsWithoutRates: number };
  }>(statusResponse).status;
  assert.equal(typeof status.pendingCompetences, "number");
  assert.equal(typeof status.configurationsWithoutRates, "number");

  const disableConfigurationResponse = await apiRequest(
    token,
    "PUT",
    `/api/account-remuneration/configurations/${account.id}`,
    { enabled: false, remunerationPercent: 100, startsOn: COMPETENCE_ON },
  );
  assert.equal(disableConfigurationResponse.statusCode, 200);
  const disabledConfiguration = readBody<{
    configuration: { enabled: boolean; remunerationPercent?: number; startsOn?: string };
  }>(disableConfigurationResponse).configuration;
  assert.equal(disabledConfiguration.enabled, false);
  assert.equal(disabledConfiguration.remunerationPercent, 100);
  assert.equal(disabledConfiguration.startsOn, COMPETENCE_ON);

  const allowedCurrencyChange = await apiRequest(token, "PATCH", `/api/accounts/${account.id}`, {
    currency: "USD",
  });
  assert.equal(allowedCurrencyChange.statusCode, 200);

  process.env.SOLVERFIN_MASTER_EMAILS = "";
  const forbiddenResponse = await apiRequest(token, "GET", "/api/admin/financial-indexes/status");
  assert.equal(forbiddenResponse.statusCode, 403);
}

async function loginAndReadToken(): Promise<string> {
  const response = await handleMvpApiRequest({
    method: "POST",
    path: "/api/session",
    body: { email: MASTER_EMAIL, password: "SolverFinDemo!2026" },
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
  const response =
    (await handleAccountRemunerationApiRequest(request)) ?? (await handleApiRequest(request));

  return (
    response ?? {
      statusCode: 404,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: { error: { code: "API_ROUTE_NOT_FOUND" } },
    }
  );
}

function readBody<TBody>(response: Pick<ApiResponse, "body">): TBody {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);
  return response.body as TBody;
}

function readError(response: Pick<ApiResponse, "body">): { code?: string; message?: string } {
  return readBody<{ error?: { code?: string; message?: string } }>(response).error ?? {};
}
