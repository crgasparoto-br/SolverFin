import assert from "node:assert/strict";

import { handleCreditCardAccountsApiRequest } from "./credit-card-accounts-router.js";
import { closePool, query } from "./db.js";
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
  const account = await createCreditCardAccount(token, suffix);
  const physicalInstrument = requireInstrument(account, "physical");
  const virtualInstrument = requireInstrument(account, "virtual");
  const recurrence = await createCardRecurrence(token, suffix, account.id, physicalInstrument.id);

  await generateInstallments(token, recurrence.id);

  const occurrences = await readOccurrences(recurrence.id);
  assert.equal(occurrences.length, 4);

  const eligibleOccurrence = requireSequence(occurrences, 1);
  const paidOccurrence = requireSequence(occurrences, 2);
  const cancelledOccurrence = requireSequence(occurrences, 3);
  const missingTransactionOccurrence = requireSequence(occurrences, 4);

  await markInvoiceStatus(paidOccurrence.invoiceId, "PAID");
  await markInvoiceStatus(cancelledOccurrence.invoiceId, "CANCELLED");
  await deleteTransaction(missingTransactionOccurrence.transactionId);

  const updateResponse = await apiRequest(token, "PATCH", `/api/recurrences/${recurrence.id}`, {
    editScope: "recurrence_and_future_pending",
    amountMinor: 3_333,
    description: `Recorrencia atualizada ${suffix}`,
    cardInstrumentId: virtualInstrument.id,
  });
  assert.equal(updateResponse.statusCode, 200);
  const update = readBody<{ futurePendingUpdate?: ApiFuturePendingUpdate }>(updateResponse)
    .futurePendingUpdate;

  assert.notEqual(update, undefined);
  assert.equal(update?.updatedCount, 1);
  assert.equal(update?.skippedCount, 3);
  assert.deepEqual(
    update?.skipped.map((item) => item.reason).sort(),
    ["invoice_locked", "invoice_locked", "transaction_missing"],
  );

  const refreshed = await readOccurrences(recurrence.id);
  const refreshedEligible = requireSequence(refreshed, 1);
  const refreshedPaid = requireSequence(refreshed, 2);
  const refreshedCancelled = requireSequence(refreshed, 3);
  const refreshedMissingTransaction = requireSequence(refreshed, 4);

  assert.equal(refreshedEligible.installmentAmountMinor, 3_333);
  assert.equal(refreshedEligible.installmentCardInstrumentId, virtualInstrument.id);
  assert.equal(refreshedEligible.transactionAmountMinor, 3_333);
  assert.equal(refreshedEligible.transactionDescription, `Recorrencia atualizada ${suffix}`);
  assert.equal(refreshedEligible.transactionCardInstrumentId, virtualInstrument.id);

  assertOccurrencePreserved(refreshedPaid, physicalInstrument.id);
  assertOccurrencePreserved(refreshedCancelled, physicalInstrument.id);
  assert.equal(refreshedMissingTransaction.transactionId, null);
  assert.equal(refreshedMissingTransaction.installmentAmountMinor, 1_111);
  assert.equal(refreshedMissingTransaction.installmentCardInstrumentId, physicalInstrument.id);
}

async function createCreditCardAccount(
  token: string,
  suffix: string,
): Promise<ApiCreditCardAccount> {
  const response = await apiRequest(token, "POST", "/api/credit-card-accounts", {
    name: `Cartao futuras pendentes ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    creditLimitMinor: 80_000,
    instruments: [
      {
        type: "physical",
        holder: "primary",
        name: "Fisico futuras",
        maskedIdentifier: "**** 6161",
      },
      {
        type: "virtual",
        holder: "primary",
        name: "Virtual futuras",
        maskedIdentifier: "**** 7171",
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
    startOn: "2027-11-05",
    amountMinor: 1_111,
    description: `Recorrencia futuras pendentes ${suffix}`,
    cardId,
    cardInstrumentId,
  });
  assert.equal(response.statusCode, 201);

  return readBody<{ recurrence: ApiRecurrence }>(response).recurrence;
}

async function generateInstallments(token: string, recurrenceId: string): Promise<void> {
  const response = await apiRequest(
    token,
    "POST",
    `/api/recurrences/${recurrenceId}/generate-installments`,
    { through: "2028-02-05", maxOccurrences: 4 },
  );
  assert.equal(response.statusCode, 201);
}

async function readOccurrences(recurrenceId: string): Promise<OccurrenceRow[]> {
  return query<OccurrenceRow>(
    `select
        i."id" as "installmentId",
        i."sequenceNumber",
        i."amountMinor" as "installmentAmountMinor",
        i."cardInstrumentId" as "installmentCardInstrumentId",
        t."id" as "transactionId",
        t."amountMinor" as "transactionAmountMinor",
        t."description" as "transactionDescription",
        t."cardInstrumentId" as "transactionCardInstrumentId",
        inv."id" as "invoiceId",
        inv."status" as "invoiceStatus"
       from "Installment" i
       left join "Transaction" t on t."installmentId" = i."id"
       left join "Invoice" inv on inv."id" = t."invoiceId"
       where i."recurrenceId" = $1
       order by i."sequenceNumber" asc`,
    [recurrenceId],
  );
}

async function markInvoiceStatus(invoiceId: string | null, status: string): Promise<void> {
  assert.notEqual(invoiceId, null);

  await query(`update "Invoice" set "status" = $1 where "id" = $2`, [status, invoiceId]);
}

async function deleteTransaction(transactionId: string | null): Promise<void> {
  assert.notEqual(transactionId, null);

  await query(`delete from "Transaction" where "id" = $1`, [transactionId]);
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

function requireSequence(occurrences: OccurrenceRow[], sequenceNumber: number): OccurrenceRow {
  const occurrence = occurrences.find((candidate) => candidate.sequenceNumber === sequenceNumber);

  if (occurrence === undefined) {
    throw new Error(`Expected occurrence sequence ${sequenceNumber}.`);
  }

  return occurrence;
}

function assertOccurrencePreserved(
  occurrence: OccurrenceRow,
  cardInstrumentId: string,
): void {
  assert.equal(occurrence.installmentAmountMinor, 1_111);
  assert.equal(occurrence.installmentCardInstrumentId, cardInstrumentId);
  assert.equal(occurrence.transactionAmountMinor, 1_111);
  assert.equal(occurrence.transactionCardInstrumentId, cardInstrumentId);
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
}

interface ApiFuturePendingUpdate {
  updatedCount: number;
  skippedCount: number;
  skipped: Array<{ reason: string }>;
}

interface OccurrenceRow {
  installmentId: string;
  sequenceNumber: number;
  installmentAmountMinor: number;
  installmentCardInstrumentId: string | null;
  transactionId: string | null;
  transactionAmountMinor: number | null;
  transactionDescription: string | null;
  transactionCardInstrumentId: string | null;
  invoiceId: string | null;
  invoiceStatus: string | null;
}