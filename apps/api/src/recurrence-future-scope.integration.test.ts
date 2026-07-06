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

  await runUpdatesOnlyOpenFutureCardRecurrenceOccurrences(token);
}

async function runUpdatesOnlyOpenFutureCardRecurrenceOccurrences(token: string): Promise<void> {
  const suffix = Date.now().toString(36);
  const createResponse = await apiRequest(token, "POST", "/api/credit-card-accounts", {
    name: `Cartao escopo recorrencia ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    creditLimitMinor: 90_000,
    instruments: [
      {
        type: "physical",
        holder: "primary",
        name: "Fisico recorrencia",
        maskedIdentifier: "**** 7070",
      },
      {
        type: "virtual",
        holder: "primary",
        name: "Virtual recorrencia",
        maskedIdentifier: "**** 8080",
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
    amountMinor: 1_000,
    description: `Recorrencia futura ${suffix}`,
    cardId: account.id,
    cardInstrumentId: physicalInstrument.id,
  });
  assert.equal(recurrenceResponse.statusCode, 201);
  const recurrence = readRecurrence(recurrenceResponse);

  const generationResponse = await apiRequest(
    token,
    "POST",
    `/api/recurrences/${recurrence.id}/generate-installments`,
    { through: "2027-08-05", maxOccurrences: 3 },
  );
  assert.equal(generationResponse.statusCode, 201);
  const generation = readRecurrenceGeneration(generationResponse);

  assert.equal(generation.transactions.length, 3);
  const [openJune, lockedJuly, openAugust] = generation.transactions;
  assert.ok(openJune?.invoiceId);
  assert.ok(lockedJuly?.invoiceId);
  assert.ok(openAugust?.invoiceId);

  const closeResponse = await apiRequest(
    token,
    "POST",
    `/api/invoices/${lockedJuly.invoiceId}/close`,
  );
  assert.equal(closeResponse.statusCode, 200);

  const updateResponse = await apiRequest(token, "PATCH", `/api/recurrences/${recurrence.id}`, {
    amountMinor: 2_500,
    description: `Recorrencia futura editada ${suffix}`,
    cardInstrumentId: virtualInstrument.id,
    editScope: "recurrence_and_future_pending",
  });
  assert.equal(updateResponse.statusCode, 200);
  const update = readRecurrenceUpdate(updateResponse);

  assert.equal(update.recurrence.cardInstrumentId, virtualInstrument.id);
  assert.equal(update.futurePendingUpdate.updatedCount, 2);
  assert.equal(update.futurePendingUpdate.skippedCount, 1);
  assert.equal(update.futurePendingUpdate.skipped[0]?.transactionId, lockedJuly.id);
  assert.equal(update.futurePendingUpdate.skipped[0]?.invoiceId, lockedJuly.invoiceId);
  assert.equal(update.futurePendingUpdate.skipped[0]?.reason, "invoice_locked");

  const updatedJune = readTransaction(
    await apiRequest(token, "GET", `/api/transactions/${openJune.id}`),
  );
  const preservedJuly = readTransaction(
    await apiRequest(token, "GET", `/api/transactions/${lockedJuly.id}`),
  );
  const updatedAugust = readTransaction(
    await apiRequest(token, "GET", `/api/transactions/${openAugust.id}`),
  );

  assert.equal(updatedJune.amountMinor, 2_500);
  assert.equal(updatedJune.description, `Recorrencia futura editada ${suffix}`);
  assert.equal(updatedJune.cardInstrumentId, virtualInstrument.id);
  assert.equal(preservedJuly.amountMinor, 1_000);
  assert.equal(preservedJuly.description, `Recorrencia futura ${suffix}`);
  assert.equal(preservedJuly.cardInstrumentId, physicalInstrument.id);
  assert.equal(updatedAugust.amountMinor, 2_500);
  assert.equal(updatedAugust.description, `Recorrencia futura editada ${suffix}`);
  assert.equal(updatedAugust.cardInstrumentId, virtualInstrument.id);
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

function readCreditCardAccount(response: Pick<ApiResponse, "body">): ApiCreditCardAccount {
  return readBody<{ creditCardAccount: ApiCreditCardAccount }>(response).creditCardAccount;
}

function readRecurrence(response: Pick<ApiResponse, "body">): ApiRecurrence {
  return readBody<{ recurrence: ApiRecurrence }>(response).recurrence;
}

function readRecurrenceGeneration(response: Pick<ApiResponse, "body">): {
  transactions: ApiTransaction[];
} {
  return readBody<{ transactions: ApiTransaction[] }>(response);
}

function readRecurrenceUpdate(response: Pick<ApiResponse, "body">): ApiRecurrenceUpdateResponse {
  return readBody<ApiRecurrenceUpdateResponse>(response);
}

function readTransaction(response: Pick<ApiResponse, "body">): ApiTransaction {
  return readBody<{ transaction: ApiTransaction }>(response).transaction;
}

function readBody<TBody>(response: Pick<ApiResponse, "body">): TBody {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);

  return response.body as TBody;
}

function assertIntegrationDatabaseConfigured(): void {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required. Run `docker compose up -d postgres` before `npm run test:integration`.",
  );
}

interface ApiCreditCardAccount {
  id: string;
  instruments: ApiCardInstrument[];
}

interface ApiCardInstrument {
  id: string;
  type: "physical" | "virtual";
}

interface ApiRecurrence {
  id: string;
  cardInstrumentId?: string;
}

interface ApiRecurrenceUpdateResponse {
  recurrence: ApiRecurrence;
  futurePendingUpdate: {
    updatedCount: number;
    skippedCount: number;
    skipped: Array<{
      installmentId: string;
      sequenceNumber: number;
      reason: string;
      transactionId?: string;
      invoiceId?: string;
    }>;
  };
}

interface ApiTransaction {
  id: string;
  amountMinor?: number;
  cardInstrumentId?: string;
  invoiceId?: string;
  description?: string;
}
