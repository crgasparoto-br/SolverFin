import assert from "node:assert/strict";

import { closePool, getPool } from "./db.js";
import { handleInstallmentsApiRequest } from "./installments-router.js";
import { handleMvpApiRequest } from "./mvp.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";

const PERSONAL_PROFILE_ID = "33333333-3333-4333-8333-333333333331";
const MEI_PROFILE_ID = "33333333-3333-4333-8333-333333333332";
const UNMATCHED_ACCOUNT_ID = "00000000-0000-4000-8000-000000000000";

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
  const account = await createAccount(token, suffix);
  const category = await createCategory(token, suffix);
  const recurrence = await createRecurrence(token, suffix, account.id, category.id);

  await generateInstallments(token, recurrence.id);
  const installmentRefs = await assertListsGeneratedInstallments(
    token,
    recurrence.id,
    account.id,
    category.id,
  );
  const editableInstallment = installmentRefs[0] ?? assert.fail("Expected editable installment.");
  const concurrentInstallment =
    installmentRefs[1] ?? assert.fail("Expected concurrent installment.");
  await assertRejectsGenericTransactionMutation(token, editableInstallment);
  await assertUpdatesEligibleInstallment(
    token,
    editableInstallment.installmentId,
    category.id,
    suffix,
  );
  await assertRejectsInvalidInstallmentPatch(token, editableInstallment.installmentId);
  await assertRejectsOutOfProfileInstallmentPatch(token, editableInstallment.installmentId);
  await assertRevalidatesConcurrentStateChange(token, concurrentInstallment, suffix);
  await assertFiltersTenantProfile(token, recurrence.id);
  await assertRejectsInvalidFilters(token);
}

async function createAccount(token: string, suffix: string): Promise<ApiAccount> {
  const response = await apiRequest(token, "POST", "/api/accounts", {
    name: `Conta parcelas ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  assert.equal(response.statusCode, 201);

  return readBody<{ account: ApiAccount }>(response).account;
}

async function createCategory(token: string, suffix: string): Promise<ApiCategory> {
  const response = await apiRequest(token, "POST", "/api/categories", {
    name: `Categoria parcelas ${suffix}`,
    kind: "expense",
  });
  assert.equal(response.statusCode, 201);

  return readBody<{ category: ApiCategory }>(response).category;
}

async function createRecurrence(
  token: string,
  suffix: string,
  accountId: string,
  categoryId: string,
): Promise<ApiRecurrence> {
  const response = await apiRequest(token, "POST", "/api/recurrences", {
    frequency: "monthly",
    startOn: "2026-06-05",
    amountMinor: 12345,
    description: `Parcela recorrente ${suffix}`,
    kind: "expense",
    accountId,
    categoryId,
  });
  assert.equal(response.statusCode, 201);

  return readBody<{ recurrence: ApiRecurrence }>(response).recurrence;
}

async function generateInstallments(token: string, recurrenceId: string): Promise<void> {
  const response = await apiRequest(
    token,
    "POST",
    `/api/recurrences/${recurrenceId}/generate-installments`,
    { through: "2026-08-05" },
  );
  assert.equal(response.statusCode, 201);
}

async function assertListsGeneratedInstallments(
  token: string,
  recurrenceId: string,
  accountId: string,
  categoryId: string,
): Promise<InstallmentRef[]> {
  const response = await apiRequest(
    token,
    "GET",
    `/api/installments?accountId=${accountId}&recurrenceId=${recurrenceId}&status=planned&dueFrom=2026-06-01&dueTo=2026-08-31`,
  );
  assert.equal(response.statusCode, 200);
  const installments = readBody<{ installments: ApiInstallmentHistory[] }>(response).installments;

  assert.equal(installments.length >= 3, true);
  assertEveryProfile(installments, PERSONAL_PROFILE_ID);
  installments.forEach((installment) => {
    assert.equal(installment.recurrence?.id, recurrenceId);
    assert.equal(installment.transaction?.accountId, accountId);
    assert.equal(installment.category?.id, categoryId);
    assert.equal(installment.editable, true);
    assert.equal(installment.editBlockedReason, undefined);
  });

  const unmatchedResponse = await apiRequest(
    token,
    "GET",
    `/api/installments?accountId=${UNMATCHED_ACCOUNT_ID}&recurrenceId=${recurrenceId}`,
  );
  assert.equal(unmatchedResponse.statusCode, 200);
  assert.equal(
    readBody<{ installments: ApiInstallmentHistory[] }>(unmatchedResponse).installments.length,
    0,
  );

  return installments.map((installment) => ({
    installmentId: installment.id,
    transactionId:
      installment.transaction?.id ?? assert.fail("Expected linked transaction for installment."),
    originalDescription:
      installment.transaction?.description ?? assert.fail("Expected installment description."),
    amountMinor: installment.amountMinor,
  }));
}

async function assertRejectsGenericTransactionMutation(
  token: string,
  ref: InstallmentRef,
): Promise<void> {
  const response = await apiRequest(token, "PATCH", `/api/transactions/${ref.transactionId}`, {
    amountMinor: 1,
    description: "Tentativa de edição genérica",
  });

  assert.equal(response.statusCode, 409);
  assert.equal(readErrorCode(response), "INSTALLMENT_DIRECT_UPDATE_REQUIRED");

  const current = await readInstallment(token, ref.installmentId);
  assert.equal(current.amountMinor, ref.amountMinor);
  assert.equal(current.transaction?.description, ref.originalDescription);
}

async function assertRevalidatesConcurrentStateChange(
  token: string,
  ref: InstallmentRef,
  suffix: string,
): Promise<void> {
  const client = await getPool().connect();
  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query(
      `update "Transaction"
          set "status" = 'POSTED', "effectiveOn" = "plannedOn"
        where "id" = $1`,
      [ref.transactionId],
    );

    const patchPromise = apiRequest(token, "PATCH", `/api/installments/${ref.installmentId}`, {
      description: `Concorrência rejeitada ${suffix}`,
    });

    await delay(150);
    await client.query("COMMIT");
    transactionOpen = false;

    const response = await patchPromise;
    assert.equal(response.statusCode, 409);
    assert.equal(readErrorCode(response), "INSTALLMENT_EDIT_BLOCKED");

    const current = await readInstallment(token, ref.installmentId);
    assert.equal(current.transaction?.status, "posted");
    assert.equal(current.transaction?.description, ref.originalDescription);
  } finally {
    if (transactionOpen) await client.query("ROLLBACK");
    client.release();
  }
}

async function readInstallment(
  token: string,
  installmentId: string,
): Promise<ApiInstallmentHistory> {
  const response = await apiRequest(
    token,
    "GET",
    `/api/installments?installmentId=${installmentId}&status=all`,
  );
  assert.equal(response.statusCode, 200);

  return (
    readBody<{ installments: ApiInstallmentHistory[] }>(response).installments[0] ??
    assert.fail("Expected installment to be returned.")
  );
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function assertUpdatesEligibleInstallment(
  token: string,
  installmentId: string,
  categoryId: string,
  suffix: string,
): Promise<void> {
  const description = `Parcela ajustada ${suffix}`;
  const response = await apiRequest(token, "PATCH", `/api/installments/${installmentId}`, {
    description,
    note: "Observacao ficticia minimizada",
    categoryId,
  });
  assert.equal(response.statusCode, 200);
  const installment = readBody<{ installment: ApiInstallmentHistory }>(response).installment;

  assert.equal(installment.id, installmentId);
  assert.equal(installment.transaction?.description, description);
  assert.equal(installment.transaction?.categoryId, categoryId);
  assert.equal(installment.transaction?.note, "Observacao ficticia minimizada");
  assert.equal(installment.editable, true);

  const clearCategoryResponse = await apiRequest(
    token,
    "PATCH",
    `/api/installments/${installmentId}`,
    { categoryId: null },
  );
  assert.equal(clearCategoryResponse.statusCode, 200);
  const cleared = readBody<{ installment: ApiInstallmentHistory }>(
    clearCategoryResponse,
  ).installment;
  assert.equal(cleared.transaction?.categoryId, undefined);
  assert.equal(cleared.category, undefined);
}

async function assertRejectsInvalidInstallmentPatch(
  token: string,
  installmentId: string,
): Promise<void> {
  const response = await apiRequest(token, "PATCH", `/api/installments/${installmentId}`, {
    amountMinor: 1,
  });

  assert.equal(response.statusCode, 400);
  assert.equal(readErrorCode(response), "INSTALLMENT_PAYLOAD_INVALID");
}

async function assertRejectsOutOfProfileInstallmentPatch(
  token: string,
  installmentId: string,
): Promise<void> {
  const response = await apiRequest(
    token,
    "PATCH",
    `/api/installments/${installmentId}?profileId=${MEI_PROFILE_ID}`,
    { description: "Tentativa fora do perfil" },
  );

  assert.equal(response.statusCode, 404);
  assert.equal(readErrorCode(response), "TENANT_RESOURCE_NOT_FOUND");
}

async function assertFiltersTenantProfile(token: string, recurrenceId: string): Promise<void> {
  const response = await apiRequest(
    token,
    "GET",
    `/api/installments?recurrenceId=${recurrenceId}&profileId=${MEI_PROFILE_ID}`,
  );
  assert.equal(response.statusCode, 200);
  const installments = readBody<{ installments: ApiInstallmentHistory[] }>(response).installments;

  assert.equal(installments.length, 0);
}

async function assertRejectsInvalidFilters(token: string): Promise<void> {
  const invalidStatus = await apiRequest(token, "GET", "/api/installments?status=invalid");
  assert.equal(invalidStatus.statusCode, 400);
  assert.equal(readErrorCode(invalidStatus), "INSTALLMENTS_FILTER_INVALID");

  const invertedPeriod = await apiRequest(
    token,
    "GET",
    "/api/installments?dueFrom=2026-08-01&dueTo=2026-07-01",
  );
  assert.equal(invertedPeriod.statusCode, 400);
  assert.equal(readErrorCode(invertedPeriod), "INSTALLMENTS_FILTER_INVALID");
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
  const installmentsResponse = await handleInstallmentsApiRequest(request);
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

function readErrorCode(response: ApiResponse): string | undefined {
  return readBody<{ error?: { code?: string } }>(response).error?.code;
}

function assertEveryProfile(
  items: Array<{ financialProfileId: string }>,
  financialProfileId: string,
): void {
  assert.equal(
    items.every((item) => item.financialProfileId === financialProfileId),
    true,
  );
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
}

interface ApiCategory {
  id: string;
  financialProfileId: string;
}

interface ApiRecurrence {
  id: string;
  financialProfileId: string;
}

interface InstallmentRef {
  installmentId: string;
  transactionId: string;
  originalDescription: string;
  amountMinor: number;
}

interface ApiInstallmentHistory {
  id: string;
  financialProfileId: string;
  amountMinor: number;
  recurrence?: { id: string };
  transaction?: {
    id?: string;
    accountId?: string;
    categoryId?: string;
    description?: string;
    note?: string;
    status?: string;
  };
  category?: { id: string };
  editable: boolean;
  editBlockedReason?: string;
}
