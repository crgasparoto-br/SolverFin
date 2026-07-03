import assert from "node:assert/strict";

import { handleCreditCardAccountsApiRequest } from "./credit-card-accounts-router.js";
import { closePool } from "./db.js";
import { handleMvpApiRequest } from "./mvp.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";

const PERSONAL_PROFILE_ID = "33333333-3333-4333-8333-333333333331";

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

  await runRejectsAccountWithoutActiveInstrument(token);
  await runRejectsInstrumentLimitsAboveAccountLimit(token);
  await runPreservesRecurrenceInstrumentAfterDefaultChange(token);
  await runCreditCardAccountInstrumentLifecycle(token);
}

async function runRejectsAccountWithoutActiveInstrument(token: string): Promise<void> {
  const response = await apiRequest(token, "POST", "/api/credit-card-accounts", {
    name: "Cartao sem instrumento ativo",
    closingDay: 20,
    dueDay: 10,
    instruments: [],
  });

  assert.equal(response.statusCode, 400);
  assert.equal(readErrorCode(response), "CARD_INSTRUMENT_REQUIRED");
}

async function runRejectsInstrumentLimitsAboveAccountLimit(token: string): Promise<void> {
  const response = await apiRequest(token, "POST", "/api/credit-card-accounts", {
    name: "Cartao limite instrumentos",
    closingDay: 20,
    dueDay: 10,
    creditLimitMinor: 10_000,
    instruments: [
      {
        type: "physical",
        holder: "primary",
        creditLimitMinor: 7_000,
      },
      {
        type: "virtual",
        holder: "additional",
        creditLimitMinor: 4_000,
      },
    ],
  });

  assert.equal(response.statusCode, 400);
  assert.equal(readErrorCode(response), "CARD_INSTRUMENT_LIMIT_EXCEEDS_CARD_LIMIT");
}

async function runPreservesRecurrenceInstrumentAfterDefaultChange(token: string): Promise<void> {
  const suffix = Date.now().toString(36);
  const createResponse = await apiRequest(token, "POST", "/api/credit-card-accounts", {
    name: `Cartao recorrencia instrumento ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    creditLimitMinor: 50_000,
    instruments: [
      {
        type: "physical",
        holder: "primary",
        name: "Fisico recorrencia",
        maskedIdentifier: "**** 3333",
      },
      {
        type: "virtual",
        holder: "primary",
        name: "Virtual recorrencia",
        maskedIdentifier: "**** 4444",
      },
    ],
  });
  assert.equal(createResponse.statusCode, 201);
  const account = readCreditCardAccount(createResponse);
  const physicalInstrument = requireInstrument(account, "physical");
  const virtualInstrument = requireInstrument(account, "virtual");

  const recurrenceResponse = await apiRequest(token, "POST", "/api/recurrences", {
    frequency: "monthly",
    startOn: "2027-06-05",
    amountMinor: 1_234,
    description: `Recorrencia instrumento ${suffix}`,
    cardId: account.id,
    cardInstrumentId: physicalInstrument.id,
  });
  assert.equal(recurrenceResponse.statusCode, 201);
  const recurrence = readRecurrence(recurrenceResponse);

  assert.equal(recurrence.cardId, account.id);
  assert.equal(recurrence.cardInstrumentId, physicalInstrument.id);

  const defaultResponse = await apiRequest(
    token,
    "PATCH",
    `/api/credit-card-accounts/${account.id}/default-instrument`,
    { instrumentId: virtualInstrument.id },
  );
  assert.equal(defaultResponse.statusCode, 200);
  assert.equal(defaultInstrument(readCreditCardAccount(defaultResponse))?.id, virtualInstrument.id);

  const generationResponse = await apiRequest(
    token,
    "POST",
    `/api/recurrences/${recurrence.id}/generate-installments`,
    { through: "2027-06-05", maxOccurrences: 1 },
  );
  assert.equal(generationResponse.statusCode, 201);
  const generation = readRecurrenceGeneration(generationResponse);

  assert.equal(generation.transactions.length, 1);
  assert.equal(generation.transactions[0]?.cardId, account.id);
  assert.equal(generation.transactions[0]?.cardInstrumentId, physicalInstrument.id);
}

async function runCreditCardAccountInstrumentLifecycle(token: string): Promise<void> {
  const suffix = Date.now().toString(36);
  const createResponse = await apiRequest(token, "POST", "/api/credit-card-accounts", {
    name: `Cartao agrupador integracao ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    creditLimitMinor: 50_000,
    institutionKey: "c6",
    brandKey: "mastercard",
    instruments: [
      {
        type: "physical",
        holder: "primary",
        name: "Fisico titular",
        maskedIdentifier: "**** 1111",
        creditLimitMinor: 20_000,
      },
      {
        type: "virtual",
        holder: "additional",
        name: "Virtual adicional",
        maskedIdentifier: "**** 2222",
        creditLimitMinor: 10_000,
      },
    ],
  });
  assert.equal(createResponse.statusCode, 201);
  const createdAccount = readCreditCardAccount(createResponse);

  assert.equal(createdAccount.financialProfileId, PERSONAL_PROFILE_ID);
  assert.equal(createdAccount.status, "active");
  assert.equal(createdAccount.institutionKey, "c6");
  assert.equal(createdAccount.brandKey, "mastercard");
  assert.equal(createdAccount.instruments.length, 2);
  assert.equal(defaultInstrument(createdAccount)?.type, "physical");

  const physicalInstrument = requireInstrument(createdAccount, "physical");
  const virtualInstrument = requireInstrument(createdAccount, "virtual");

  assert.equal(physicalInstrument.holder, "primary");
  assert.equal(physicalInstrument.isDefault, true);
  assert.equal(virtualInstrument.holder, "additional");
  assert.equal(virtualInstrument.isDefault, false);

  const listResponse = await apiRequest(token, "GET", "/api/credit-card-accounts?status=all");
  assert.equal(listResponse.statusCode, 200);
  const listedAccounts = readCreditCardAccounts(listResponse);
  const listedAccount = listedAccounts.find((listed) => listed.id === createdAccount.id);

  assert.notEqual(listedAccount, undefined);
  assert.equal(listedAccount?.instruments.length, 2);

  const defaultResponse = await apiRequest(
    token,
    "PATCH",
    `/api/credit-card-accounts/${createdAccount.id}/default-instrument`,
    { instrumentId: virtualInstrument.id },
  );
  assert.equal(defaultResponse.statusCode, 200);
  const defaultAccount = readCreditCardAccount(defaultResponse);

  assert.equal(defaultInstrument(defaultAccount)?.id, virtualInstrument.id);

  const purchaseResponse = await apiRequest(
    token,
    "POST",
    `/api/credit-card-accounts/${createdAccount.id}/purchases`,
    {
      occurredOn: "2026-06-19",
      amountMinor: 4_321,
      description: `Compra instrumento integracao ${suffix}`,
      cardInstrumentId: virtualInstrument.id,
    },
  );
  assert.equal(purchaseResponse.statusCode, 201);
  const purchase = readPurchase(purchaseResponse);

  assert.equal(purchase.transaction.cardId, createdAccount.id);
  assert.equal(purchase.transaction.cardInstrumentId, virtualInstrument.id);
  assert.equal(purchase.invoice.cardId, createdAccount.id);
  assert.equal(purchase.invoice.totalAmountMinor, 4_321);

  const archiveDefaultResponse = await apiRequest(
    token,
    "POST",
    `/api/credit-card-instruments/${virtualInstrument.id}/archive`,
  );
  assert.equal(archiveDefaultResponse.statusCode, 200);
  const afterDefaultArchive = readCreditCardAccount(archiveDefaultResponse);

  assert.equal(afterDefaultArchive.status, "active");
  assert.equal(requireInstrument(afterDefaultArchive, "virtual").status, "archived");
  assert.equal(defaultInstrument(afterDefaultArchive)?.id, physicalInstrument.id);

  const archiveLastResponse = await apiRequest(
    token,
    "POST",
    `/api/credit-card-instruments/${physicalInstrument.id}/archive`,
  );
  assert.equal(archiveLastResponse.statusCode, 200);
  const blockedAccount = readCreditCardAccount(archiveLastResponse);

  assert.equal(blockedAccount.status, "blocked");
  assert.equal(
    blockedAccount.instruments.every((instrument) => instrument.status === "archived"),
    true,
  );
  assert.equal(defaultInstrument(blockedAccount), undefined);

  const blockedPurchaseResponse = await apiRequest(
    token,
    "POST",
    `/api/credit-card-accounts/${createdAccount.id}/purchases`,
    {
      occurredOn: "2026-06-20",
      amountMinor: 1_000,
      description: "Compra bloqueada por falta de instrumento ativo",
      cardInstrumentId: physicalInstrument.id,
    },
  );

  assert.equal(blockedPurchaseResponse.statusCode, 400);
  assert.equal(readErrorCode(blockedPurchaseResponse), "CARD_NOT_ACTIVE");
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

function requireInstrument(
  account: ApiCreditCardAccount,
  type: ApiCardInstrument["type"],
): ApiCardInstrument {
  const instrument = account.instruments.find((candidate) => candidate.type === type);

  if (instrument === undefined) {
    throw new Error(`Expected ${type} instrument.`);
  }

  return instrument;
}

function defaultInstrument(account: ApiCreditCardAccount): ApiCardInstrument | undefined {
  return account.instruments.find(
    (instrument) => instrument.status === "active" && instrument.isDefault,
  );
}

function readCreditCardAccount(response: Pick<ApiResponse, "body">): ApiCreditCardAccount {
  return readBody<{ creditCardAccount: ApiCreditCardAccount }>(response).creditCardAccount;
}

function readCreditCardAccounts(response: Pick<ApiResponse, "body">): ApiCreditCardAccount[] {
  return readBody<{ creditCardAccounts: ApiCreditCardAccount[] }>(response).creditCardAccounts;
}

function readPurchase(response: Pick<ApiResponse, "body">): {
  transaction: ApiTransaction;
  invoice: ApiInvoice;
} {
  return readBody<{ transaction: ApiTransaction; invoice: ApiInvoice }>(response);
}

function readRecurrence(response: Pick<ApiResponse, "body">): ApiRecurrence {
  return readBody<{ recurrence: ApiRecurrence }>(response).recurrence;
}

function readRecurrenceGeneration(response: Pick<ApiResponse, "body">): {
  transactions: ApiTransaction[];
} {
  return readBody<{ transactions: ApiTransaction[] }>(response);
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

interface ApiCreditCardAccount {
  id: string;
  financialProfileId: string;
  name: string;
  status: "active" | "archived" | "blocked";
  institutionKey?: string;
  brandKey?: string;
  instruments: ApiCardInstrument[];
}

interface ApiCardInstrument {
  id: string;
  type: "physical" | "virtual";
  holder: "primary" | "additional";
  status: "active" | "archived";
  isDefault: boolean;
}

interface ApiRecurrence {
  id: string;
  financialProfileId: string;
  cardId?: string;
  cardInstrumentId?: string;
}

interface ApiTransaction {
  id: string;
  financialProfileId: string;
  amountMinor?: number;
  cardId?: string;
  cardInstrumentId?: string;
  invoiceId?: string;
}

interface ApiInvoice {
  id: string;
  financialProfileId: string;
  cardId: string;
  status: string;
  totalAmountMinor: number;
}
