import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import { handleMvpApiRequest } from "./mvp.js";
import { createAccountForContext } from "./repositories/accounts.js";
import { createTransactionForContext } from "./repositories/transactions.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";

const CONTEXT: TenantContext = {
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
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for the integration test.");

  const token = await loginAndReadToken();
  const suffix = `${Date.now().toString(36)}${process.pid.toString(36)}`;
  const source = await createAccountForContext(CONTEXT, {
    name: `Future commitment BRL ${suffix}`,
    kind: "checking",
    currency: "BRL",
    openingBalanceMinor: 0,
  });
  const destination = await createAccountForContext(CONTEXT, {
    name: `Future commitment USD ${suffix}`,
    kind: "checking",
    currency: "USD",
    openingBalanceMinor: 0,
  });
  const transfer = await createTransactionForContext(CONTEXT, {
    accountId: source.id,
    destinationAccountId: destination.id,
    kind: "transfer",
    status: "planned",
    amountMinor: 53_832,
    destinationAmountMinor: 10_000,
    currency: "BRL",
    occurredOn: "2037-11-12",
    plannedOn: "2037-11-12",
    description: `Future commitment cross currency ${suffix}`,
  });

  const brl = await getAgenda(token, "BRL");
  const usd = await getAgenda(token, "USD");
  const brlCommitment = brl.commitments.find((item) => item.id === `transaction:${transfer.id}`);
  const usdCommitment = usd.commitments.find((item) => item.id === `transaction:${transfer.id}`);

  assert.ok(brlCommitment);
  assert.ok(usdCommitment);
  assert.equal(brlCommitment.id, usdCommitment.id);
  assert.deepEqual(brlCommitment.monetaryEffects, [
    {
      id: `transaction:${transfer.id}:source`,
      role: "source_account",
      amountMinor: -53_832,
      currency: "BRL",
      accountId: source.id,
    },
  ]);
  assert.deepEqual(usdCommitment.monetaryEffects, [
    {
      id: `transaction:${transfer.id}:destination`,
      role: "destination_account",
      amountMinor: 10_000,
      currency: "USD",
      accountId: destination.id,
    },
  ]);

  const recurrenceId = randomUUID();
  const installmentId = randomUUID();
  await query(
    `insert into "Recurrence"
      ("id", "organizationId", "financialProfileId", "accountId", "status", "kind", "frequency",
       "interval", "startOn", "amountMinor", "currency", "description")
     values ($1, $2, $3, $4, 'ACTIVE', 'EXPENSE', 'MONTHLY', 1, $5, $6, 'BRL', $7)`,
    [
      recurrenceId,
      CONTEXT.organizationId,
      CONTEXT.financialProfileId,
      source.id,
      "2037-11-25",
      7_500,
      `Future commitment recurrence ${suffix}`,
    ],
  );
  await query(
    `insert into "Installment"
      ("id", "organizationId", "financialProfileId", "recurrenceId", "status", "sequenceNumber",
       "totalInstallments", "dueOn", "amountMinor", "currency")
     values ($1, $2, $3, $4, 'PLANNED', 1, 1, $5, $6, 'BRL')`,
    [
      installmentId,
      CONTEXT.organizationId,
      CONTEXT.financialProfileId,
      recurrenceId,
      "2037-11-25",
      7_500,
    ],
  );

  const markerAgendaResponse = await apiRequest(
    token,
    "GET",
    "/api/future-commitments?from=2037-11-01&to=2037-11-30",
  );
  assert.equal(markerAgendaResponse.statusCode, 200);
  const markerAgenda = readBody<ApiFutureCommitmentAgenda>(markerAgendaResponse);
  assert.equal(
    markerAgenda.commitments.some(
      (item) => item.id === `recurrence:${recurrenceId}:2037-11-25`,
    ),
    false,
    "an existing installment must suppress the same recurrence/date projection even without a linked Transaction",
  );

  const invalid = await apiRequest(
    token,
    "GET",
    "/api/future-commitments?from=2037-11-30&to=2037-11-01",
  );
  assert.equal(invalid.statusCode, 400);
  assert.equal(readErrorCode(invalid), "FUTURE_COMMITMENT_PERIOD_INVALID");
}

async function getAgenda(token: string, currency: string): Promise<ApiFutureCommitmentAgenda> {
  const response = await apiRequest(
    token,
    "GET",
    `/api/future-commitments?from=2037-11-01&to=2037-11-30&currency=${currency}`,
  );
  assert.equal(response.statusCode, 200);
  const body = readBody<ApiFutureCommitmentAgenda>(response);
  assert.equal(body.currency, currency);
  return body;
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
  const response = await handleApiRequest(request);
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

interface ApiFutureCommitmentAgenda {
  currency?: string;
  commitments: Array<{
    id: string;
    monetaryEffects: Array<{
      id: string;
      role: string;
      amountMinor: number;
      currency: string;
      accountId?: string;
    }>;
  }>;
}
