import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { closePool } from "./db.js";
import { handleInstallmentsApiRequest } from "./installments-router.js";
import { handleMvpApiRequest } from "./mvp.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL);
  const token = await loginAndReadToken();
  const suffix = Date.now().toString(36);
  const sourceAccount = await createAccount(token, `Origem transferencia parcelada ${suffix}`);
  const destinationAccount = await createAccount(
    token,
    `Destino transferencia parcelada ${suffix}`,
  );

  const created = await apiRequest(token, "POST", "/api/installments", {
    accountId: sourceAccount.id,
    destinationAccountId: destinationAccount.id,
    kind: "transfer",
    status: "planned",
    description: "Transferencia parcelada visivel nas duas contas",
    note: "Contrato operacional da parcela",
    plannedOn: "2026-09-15",
    amountMinor: 4200,
    amountMode: "per_installment",
    totalInstallments: 2,
    initialSequenceNumber: 1,
    idempotencyKey: randomUUID(),
  });

  assert.equal(created.statusCode, 201);
  const createdBody = readBody<ManualCreationResponse>(created);
  assert.equal(createdBody.installments.length, 2);
  assert.equal(
    createdBody.installments.every(
      (item) =>
        item.transaction.accountId === sourceAccount.id &&
        item.transaction.destinationAccountId === destinationAccount.id,
    ),
    true,
  );

  const sourceView = await listByAccount(token, sourceAccount.id);
  const destinationView = await listByAccount(token, destinationAccount.id);
  const expectedIds = createdBody.installments.map((item) => item.id).sort();

  assert.deepEqual(sourceView.map((item) => item.id).sort(), expectedIds);
  assert.deepEqual(destinationView.map((item) => item.id).sort(), expectedIds);
  assert.deepEqual(
    destinationView.map((item) => item.sequenceNumber).sort((left, right) => left - right),
    [1, 2],
  );

  const installmentId = destinationView[0]?.id;
  assert.ok(installmentId);
  const updated = await apiRequest(token, "PATCH", `/api/installments/${installmentId}`, {
    description: "Transferencia parcelada ajustada pela conta destino",
  });
  assert.equal(updated.statusCode, 200);

  const destinationReload = await listByAccount(token, destinationAccount.id);
  const updatedInstallment = destinationReload.find((item) => item.id === installmentId);
  assert.equal(
    updatedInstallment?.transaction?.description,
    "Transferencia parcelada ajustada pela conta destino",
  );
}

async function listByAccount(token: string, accountId: string): Promise<InstallmentItem[]> {
  const response = await apiRequest(
    token,
    "GET",
    `/api/installments?accountId=${accountId}&operationalFrom=2026-09-01&operationalTo=2026-10-31&status=all`,
  );
  assert.equal(response.statusCode, 200);
  return readBody<{ installments: InstallmentItem[] }>(response).installments;
}

async function createAccount(token: string, name: string): Promise<{ id: string }> {
  const response = await apiRequest(token, "POST", "/api/accounts", {
    name,
    kind: "checking",
    currency: "BRL",
    openingBalanceMinor: 0,
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ account: { id: string } }>(response).account;
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

  return (
    (await handleInstallmentsApiRequest(request)) ??
    (await handleApiRequest(request)) ?? {
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

interface ManualCreationResponse {
  installments: Array<{
    id: string;
    transaction: {
      accountId: string;
      destinationAccountId?: string;
    };
  }>;
}

interface InstallmentItem {
  id: string;
  sequenceNumber: number;
  transaction?: {
    description?: string;
  };
}
