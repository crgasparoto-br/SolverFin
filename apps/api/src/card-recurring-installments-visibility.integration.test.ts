import assert from "node:assert/strict";

import { handleCreditCardAccountsApiRequest } from "./credit-card-accounts-router.js";
import { closePool } from "./db.js";
import { handleInstallmentsApiRequest } from "./installments-router.js";
import { handleMvpApiRequest } from "./mvp.js";
import { handleApiRequest } from "./router.js";
import type { ApiRequest, ApiResponse } from "./router.js";

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
  const suffix = Date.now().toString(36);
  const card = await createCreditCardAccount(token, suffix);
  const instrument = card.instruments[0] ?? assert.fail("Expected active card instrument.");
  const recurrence = await createCardRecurrence(token, suffix, card.id, instrument.id);

  await generateInstallment(token, recurrence.id);
  await assertTechnicalInstallmentExistsByRecurrence(token, recurrence.id, card.id);
  await assertCardInvoiceListingHidesTechnicalInstallment(token, card.id);
}

async function createCreditCardAccount(
  token: string,
  suffix: string,
): Promise<ApiCreditCardAccount> {
  const response = await apiRequest(token, "POST", "/api/credit-card-accounts", {
    name: `Cartao parcelas recorrentes ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    creditLimitMinor: 80_000,
    instruments: [
      {
        type: "physical",
        holder: "primary",
        name: "Fisico recorrencia",
        maskedIdentifier: "**** 5151",
      },
    ],
  });
  assert.equal(response.statusCode, 201);

  return readBody<{ creditCardAccount: ApiCreditCardAccount }>(response).creditCardAccount;
}

async function createCardRecurrence(
  token: string,
  suffix: string,
  cardId: string,
  cardInstrumentId: string,
): Promise<ApiRecurrence> {
  const response = await apiRequest(token, "POST", "/api/recurrences", {
    frequency: "monthly",
    startOn: "2027-10-05",
    amountMinor: 2_468,
    description: `Recorrencia cartao parcelas ${suffix}`,
    cardId,
    cardInstrumentId,
  });
  assert.equal(response.statusCode, 201);

  return readBody<{ recurrence: ApiRecurrence }>(response).recurrence;
}

async function generateInstallment(token: string, recurrenceId: string): Promise<void> {
  const response = await apiRequest(
    token,
    "POST",
    `/api/recurrences/${recurrenceId}/generate-installments`,
    { through: "2027-10-05", maxOccurrences: 1 },
  );
  assert.equal(response.statusCode, 201);
}

async function assertTechnicalInstallmentExistsByRecurrence(
  token: string,
  recurrenceId: string,
  cardId: string,
): Promise<void> {
  const response = await apiRequest(
    token,
    "GET",
    `/api/installments?recurrenceId=${recurrenceId}&status=all`,
  );
  assert.equal(response.statusCode, 200);
  const installments = readBody<{ installments: ApiInstallmentHistory[] }>(response).installments;

  assert.equal(installments.length, 1);
  assert.equal(installments[0]?.transaction?.cardId, cardId);
  assert.notEqual(installments[0]?.transaction?.invoiceId, undefined);
}

async function assertCardInvoiceListingHidesTechnicalInstallment(
  token: string,
  cardId: string,
): Promise<void> {
  const response = await apiRequest(
    token,
    "GET",
    `/api/installments?cardId=${cardId}&status=all&dueFrom=2027-10-01&dueTo=2027-10-20`,
  );
  assert.equal(response.statusCode, 200);
  const installments = readBody<{ installments: ApiInstallmentHistory[] }>(response).installments;

  assert.equal(installments.length, 0);
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
  const installmentsResponse =
    creditCardAccountsResponse ?? (await handleInstallmentsApiRequest(request));
  const response = installmentsResponse ?? (await handleApiRequest(request));

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
}

interface ApiRecurrence {
  id: string;
}

interface ApiInstallmentHistory {
  transaction?: {
    cardId?: string;
    invoiceId?: string;
  };
}
