import assert from "node:assert/strict";

import { closePool } from "./db.js";
import { handleInstallmentsApiRequest } from "./installments-router.js";
import { handleMvpApiRequest } from "./mvp.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";
import { handleTransactionGroupActionsApiRequest } from "./transaction-group-actions-router.js";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for the grouping guard test.");
  const token = await loginAndReadToken();
  const suffix = Date.now().toString(36);
  const accountId = await createAccount(token, suffix);
  const categoryId = await createCategory(token, suffix);
  const installment = await createCanonicalInstallment(token, suffix, accountId, categoryId);
  const ordinaryOne = await createPlannedTransaction(token, suffix, accountId, categoryId, 1);
  const ordinaryTwo = await createPlannedTransaction(token, suffix, accountId, categoryId, 2);

  const ordinaryGuard = await guardRequest(token, "POST", "/api/transaction-groups", {
    memberIds: [ordinaryOne, ordinaryTwo],
    description: "Grupo comum",
    displayOn: "2026-07-15",
  });
  assert.equal(ordinaryGuard, undefined);

  const blockedCreate = await request(token, "POST", "/api/transaction-groups", {
    memberIds: [installment.transactionId, ordinaryOne],
    description: "Grupo com parcela",
    displayOn: "2026-07-15",
  });
  assert.equal(blockedCreate.statusCode, 409);
  assert.equal(readErrorCode(blockedCreate), "TRANSACTION_GROUP_INSTALLMENT_MEMBER_INELIGIBLE");

  const legacyGroupResponse = await genericRequest(token, "POST", "/api/transaction-groups", {
    memberIds: [installment.transactionId, ordinaryOne],
    description: "Grupo legado com parcela",
    displayOn: "2026-07-15",
  });
  assert.equal(legacyGroupResponse.statusCode, 201);
  const legacyGroup = readBody<{ group: { id: string } }>(legacyGroupResponse).group;

  const blockedLegacyEdit = await request(
    token,
    "PATCH",
    `/api/transaction-groups/${legacyGroup.id}/members/${installment.transactionId}`,
    { amountMinor: 1 },
  );
  assert.equal(blockedLegacyEdit.statusCode, 409);
  assert.equal(
    readErrorCode(blockedLegacyEdit),
    "TRANSACTION_GROUP_INSTALLMENT_MEMBER_INELIGIBLE",
  );

  const ungroupGuard = await guardRequest(
    token,
    "DELETE",
    `/api/transaction-groups/${legacyGroup.id}`,
  );
  assert.equal(ungroupGuard, undefined);
}

async function createAccount(token: string, suffix: string): Promise<string> {
  const response = await request(token, "POST", "/api/accounts", {
    name: `Conta guard ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ account: { id: string } }>(response).account.id;
}

async function createCategory(token: string, suffix: string): Promise<string> {
  const response = await request(token, "POST", "/api/categories", {
    name: `Categoria guard ${suffix}`,
    kind: "expense",
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ category: { id: string } }>(response).category.id;
}

async function createCanonicalInstallment(
  token: string,
  suffix: string,
  accountId: string,
  categoryId: string,
): Promise<{ installmentId: string; transactionId: string }> {
  const recurrenceResponse = await request(token, "POST", "/api/recurrences", {
    frequency: "monthly",
    startOn: "2026-07-15",
    endOn: "2026-07-15",
    amountMinor: 12000,
    description: `Parcela guard ${suffix}`,
    kind: "expense",
    accountId,
    categoryId,
  });
  assert.equal(recurrenceResponse.statusCode, 201);
  const recurrenceId = readBody<{ recurrence: { id: string } }>(recurrenceResponse).recurrence.id;

  const generationResponse = await request(
    token,
    "POST",
    `/api/recurrences/${recurrenceId}/generate-installments`,
    { through: "2026-07-15", maxOccurrences: 1 },
  );
  assert.equal(generationResponse.statusCode, 201);

  const installmentsResponse = await request(
    token,
    "GET",
    `/api/installments?recurrenceId=${recurrenceId}&status=all`,
  );
  assert.equal(installmentsResponse.statusCode, 200);
  const installment = readBody<{
    installments: Array<{ id: string; transaction?: { id?: string } }>;
  }>(installmentsResponse).installments[0];
  assert.ok(installment?.id);
  assert.ok(installment.transaction?.id);
  return { installmentId: installment.id, transactionId: installment.transaction.id };
}

async function createPlannedTransaction(
  token: string,
  suffix: string,
  accountId: string,
  categoryId: string,
  index: number,
): Promise<string> {
  const response = await request(token, "POST", "/api/transactions", {
    kind: "expense",
    status: "planned",
    amountMinor: 12000 + index,
    occurredOn: "2026-07-15",
    plannedOn: "2026-07-15",
    accountId,
    categoryId,
    description: `Lançamento comum ${suffix} ${index}`,
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ transaction: { id: string } }>(response).transaction.id;
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

async function request(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResponse> {
  const guarded = await guardRequest(token, method, path, body);
  if (guarded) return guarded;

  const apiRequest = buildRequest(token, method, path, body);
  return (
    (await handleInstallmentsApiRequest(apiRequest)) ??
    (await handleApiRequest(apiRequest)) ??
    notFound()
  );
}

async function genericRequest(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResponse> {
  return (await handleApiRequest(buildRequest(token, method, path, body))) ?? notFound();
}

async function guardRequest(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResponse | undefined> {
  return handleTransactionGroupActionsApiRequest(buildRequest(token, method, path, body));
}

function buildRequest(token: string, method: string, path: string, body?: unknown): ApiRequest {
  const url = new URL(path, "http://solverfin.integration.test");
  return {
    method,
    pathname: url.pathname,
    query: url.searchParams,
    headers: { authorization: `Bearer ${token}` },
    body,
  };
}

function notFound(): ApiResponse {
  return {
    statusCode: 404,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: { error: { code: "API_ROUTE_NOT_FOUND" } },
  };
}

function readBody<TBody>(response: Pick<ApiResponse, "body">): TBody {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);
  return response.body as TBody;
}

function readErrorCode(response: ApiResponse): string | undefined {
  return readBody<{ error?: { code?: string } }>(response).error?.code;
}
