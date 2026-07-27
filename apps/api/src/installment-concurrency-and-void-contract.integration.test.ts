import assert from "node:assert/strict";

import { closePool, getPool } from "./db.js";
import { handleInstallmentsApiRequest } from "./installments-router.js";
import { handleMvpApiRequest } from "./mvp.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";
import { handleTransactionBulkActionsApiRequest } from "./transaction-bulk-actions-router.js";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests.");

  const token = await loginAndReadToken();
  const suffix = Date.now().toString(36);
  const account = await createAccount(token, suffix);
  const originalCategory = await createCategory(token, `original-${suffix}`);
  const updatedCategory = await createCategory(token, `updated-${suffix}`);
  const recurrence = await createRecurrence(token, suffix, account.id, originalCategory.id);

  await generateInstallments(token, recurrence.id);
  const installments = await listInstallments(token, recurrence.id);
  assert.equal(installments.length >= 3, true, "Expected at least three canonical installments.");

  const concurrent = installments[0] ?? assert.fail("Missing concurrency installment.");
  const individualVoid = installments[1] ?? assert.fail("Missing individual void installment.");
  const bulkVoid = installments[2] ?? assert.fail("Missing bulk void installment.");

  await assertConcurrentReconciliationPreservesPatch(token, concurrent, updatedCategory.id, suffix);
  await assertIndividualLogicalVoidKeepsInstallmentHistory(token, individualVoid);
  await assertBulkLogicalVoidKeepsInstallmentHistory(token, bulkVoid);
}

async function assertConcurrentReconciliationPreservesPatch(
  token: string,
  installment: ApiInstallment,
  categoryId: string,
  suffix: string,
): Promise<void> {
  const transactionId = requireTransactionId(installment);
  const blocker = await getPool().connect();
  let blockerOpen = false;

  const description = `Parcela concorrente preservada ${suffix}`;
  const note = `Observacao concorrente preservada ${suffix}`;

  try {
    await blocker.query("BEGIN");
    blockerOpen = true;
    await blocker.query(
      `select "id" from "Transaction"
        where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
        for update`,
      [transactionId, installment.organizationId, installment.financialProfileId],
    );

    const installmentPatch = apiRequest(token, "PATCH", `/api/installments/${installment.id}`, {
      description,
      note,
      categoryId,
    });
    await waitForBlockedQuery('%from "Transaction"%for update%');

    const reconciliation = apiRequest(token, "PATCH", `/api/transactions/${transactionId}`, {
      status: "reconciled",
    });
    await waitForBlockedQuery('update "Transaction" set%');

    await blocker.query("COMMIT");
    blockerOpen = false;

    const [patchResponse, reconciliationResponse] = await Promise.all([
      installmentPatch,
      reconciliation,
    ]);
    assert.equal(patchResponse.statusCode, 200);
    assert.equal(reconciliationResponse.statusCode, 200);

    const current = await readInstallment(token, installment.id);
    assert.equal(current.transaction?.status, "reconciled");
    assert.equal(current.transaction?.description, description);
    assert.equal(current.transaction?.note, note);
    assert.equal(current.transaction?.categoryId, categoryId);
    assert.equal(current.editBlockedReason, "transaction_status_locked");
  } finally {
    if (blockerOpen) await blocker.query("ROLLBACK");
    blocker.release();
  }
}

async function assertIndividualLogicalVoidKeepsInstallmentHistory(
  token: string,
  installment: ApiInstallment,
): Promise<void> {
  const transactionId = requireTransactionId(installment);
  const response = await apiRequest(token, "POST", `/api/transactions/${transactionId}/void`);
  assert.equal(response.statusCode, 200);
  assert.equal(
    readBody<{ transaction: { status: string } }>(response).transaction.status,
    "voided",
  );

  const current = await readInstallment(token, installment.id);
  assert.equal(current.status, "planned");
  assert.equal(current.transaction?.status, "voided");
  assert.equal(current.editable, false);
  assert.equal(current.editBlockedReason, "transaction_status_locked");
}

async function assertBulkLogicalVoidKeepsInstallmentHistory(
  token: string,
  installment: ApiInstallment,
): Promise<void> {
  const transactionId = requireTransactionId(installment);
  const response = await apiRequest(token, "POST", "/api/transactions/bulk-actions", {
    action: "void",
    transactionIds: [transactionId],
    groupIds: [],
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    readBody<{ affectedTransactionIds: string[] }>(response).affectedTransactionIds,
    [transactionId],
  );

  const current = await readInstallment(token, installment.id);
  assert.equal(current.status, "planned");
  assert.equal(current.transaction?.status, "voided");
  assert.equal(current.editable, false);
  assert.equal(current.editBlockedReason, "transaction_status_locked");
}

async function waitForBlockedQuery(pattern: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await getPool().query<{ count: string }>(
      `select count(*)::text as "count"
         from pg_stat_activity
        where datname = current_database()
          and pid <> pg_backend_pid()
          and wait_event_type = 'Lock'
          and query ilike $1`,
      [pattern],
    );
    if (Number(result.rows[0]?.count ?? 0) > 0) return;
    await delay(25);
  }

  assert.fail(`Timed out waiting for blocked query matching ${pattern}.`);
}

async function createAccount(token: string, suffix: string): Promise<{ id: string }> {
  const response = await apiRequest(token, "POST", "/api/accounts", {
    name: `Conta concorrencia ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ account: { id: string } }>(response).account;
}

async function createCategory(token: string, suffix: string): Promise<{ id: string }> {
  const response = await apiRequest(token, "POST", "/api/categories", {
    name: `Categoria concorrencia ${suffix}`,
    kind: "expense",
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ category: { id: string } }>(response).category;
}

async function createRecurrence(
  token: string,
  suffix: string,
  accountId: string,
  categoryId: string,
): Promise<{ id: string }> {
  const response = await apiRequest(token, "POST", "/api/recurrences", {
    frequency: "monthly",
    startOn: "2026-06-05",
    amountMinor: 12345,
    description: `Parcela concorrencia ${suffix}`,
    kind: "expense",
    accountId,
    categoryId,
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ recurrence: { id: string } }>(response).recurrence;
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

async function listInstallments(token: string, recurrenceId: string): Promise<ApiInstallment[]> {
  const response = await apiRequest(
    token,
    "GET",
    `/api/installments?recurrenceId=${recurrenceId}&status=all`,
  );
  assert.equal(response.statusCode, 200);
  return readBody<{ installments: ApiInstallment[] }>(response).installments;
}

async function readInstallment(token: string, installmentId: string): Promise<ApiInstallment> {
  const response = await apiRequest(
    token,
    "GET",
    `/api/installments?installmentId=${installmentId}&status=all`,
  );
  assert.equal(response.statusCode, 200);
  return (
    readBody<{ installments: ApiInstallment[] }>(response).installments[0] ??
    assert.fail("Expected installment to remain queryable.")
  );
}

function requireTransactionId(installment: ApiInstallment): string {
  return installment.transaction?.id ?? assert.fail("Expected linked transaction.");
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
    (await handleTransactionBulkActionsApiRequest(request)) ??
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

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

interface ApiInstallment {
  id: string;
  organizationId: string;
  financialProfileId: string;
  status: string;
  editable: boolean;
  editBlockedReason?: string;
  transaction?: {
    id?: string;
    status?: string;
    description?: string;
    note?: string;
    categoryId?: string;
  };
}
