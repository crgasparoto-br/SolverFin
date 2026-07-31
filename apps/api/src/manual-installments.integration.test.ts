import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { closePool, getPool } from "./db.js";
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
  const account = await createAccount(token, `Conta parcelada ${suffix}`, "BRL");
  const category = await createCategory(token, `Categoria parcelada ${suffix}`);

  await validatesCanonicalAtomicCreation(token, account.id, category.id);
  await validatesConcurrentReplay(token, account.id, category.id);
  await validatesInitialSequenceAndPlannedDates(token, account.id);
  await validatesCurrencyAndPayloadErrors(token, account.id, suffix);
  await validatesRollbackDoesNotConsumeKey(token, account.id, category.id);
}

async function validatesCanonicalAtomicCreation(
  token: string,
  accountId: string,
  categoryId: string,
): Promise<void> {
  const idempotencyKey = randomUUID();
  const payload = {
    accountId,
    categoryId,
    kind: "expense",
    status: "posted",
    description: "Notebook ficticio",
    note: "Compra de teste minimizada",
    plannedOn: "2026-01-31",
    effectiveOn: "2026-01-30",
    amountMinor: 10_000,
    amountMode: "total",
    totalInstallments: 3,
    initialSequenceNumber: 1,
    idempotencyKey,
  };
  const response = await apiRequest(token, "POST", "/api/installments", payload);
  assert.equal(response.statusCode, 201);
  const created = readBody<ManualCreationResponse>(response);

  assert.equal(created.idempotentReplay, false);
  assert.deepEqual(
    created.installments.map((item) => item.sequenceNumber),
    [1, 2, 3],
  );
  assert.deepEqual(
    created.installments.map((item) => item.dueOn),
    ["2026-01-31", "2026-02-28", "2026-03-31"],
  );
  assert.deepEqual(
    created.installments.map((item) => item.transaction.effectiveOn),
    ["2026-01-30", "2026-02-28", "2026-03-30"],
  );
  assert.deepEqual(
    created.installments.map((item) => item.amountMinor),
    [3333, 3333, 3334],
  );
  created.installments.forEach((item) => {
    assert.equal(item.totalInstallments, 3);
    assert.equal(item.transaction.source, "installment");
    assert.equal(item.transaction.installmentId, item.id);
    assert.equal(item.transaction.description, "Notebook ficticio");
    assert.equal(item.transaction.note, "Compra de teste minimizada");
    assert.equal(item.transaction.categoryId, categoryId);
  });

  const ids = created.installments.map((item) => item.id);
  const auditBefore = await countInstallmentAudits(ids);
  const replay = await apiRequest(token, "POST", "/api/installments", payload);
  assert.equal(replay.statusCode, 200);
  const replayed = readBody<ManualCreationResponse>(replay);
  assert.equal(replayed.idempotentReplay, true);
  assert.deepEqual(
    replayed.installments.map((item) => item.id),
    ids,
  );
  assert.equal(await countInstallmentAudits(ids), auditBefore);

  const conflict = await apiRequest(token, "POST", "/api/installments", {
    ...payload,
    amountMinor: 10_001,
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(readErrorCode(conflict), "INSTALLMENT_IDEMPOTENCY_CONFLICT");
}

async function validatesConcurrentReplay(
  token: string,
  accountId: string,
  categoryId: string,
): Promise<void> {
  const payload = {
    accountId,
    categoryId,
    kind: "income",
    status: "reconciled",
    description: "Recebimento parcelado ficticio",
    note: null,
    plannedOn: "2026-04-15",
    effectiveOn: null,
    amountMinor: 2500,
    amountMode: "per_installment",
    totalInstallments: 2,
    initialSequenceNumber: 1,
    idempotencyKey: randomUUID(),
  };
  const responses = await Promise.all([
    apiRequest(token, "POST", "/api/installments", payload),
    apiRequest(token, "POST", "/api/installments", payload),
  ]);
  assert.deepEqual(responses.map((response) => response.statusCode).sort(), [200, 201]);
  const bodies = responses.map((response) => readBody<ManualCreationResponse>(response));
  assert.deepEqual(
    bodies[0]?.installments.map((item) => item.id),
    bodies[1]?.installments.map((item) => item.id),
  );
  assert.equal(
    bodies
      .flatMap((body) => body.installments)
      .every((item) => Boolean(item.transaction.reconciledAt)),
    true,
  );
}

async function validatesInitialSequenceAndPlannedDates(
  token: string,
  accountId: string,
): Promise<void> {
  const response = await apiRequest(token, "POST", "/api/installments", {
    accountId,
    categoryId: null,
    kind: "expense",
    status: "planned",
    description: "Servico ficticio",
    note: "",
    plannedOn: "2028-02-29",
    effectiveOn: "2028-02-28",
    amountMinor: 1200,
    amountMode: "per_installment",
    totalInstallments: 4,
    initialSequenceNumber: 3,
    idempotencyKey: randomUUID(),
  });
  assert.equal(response.statusCode, 201);
  const body = readBody<ManualCreationResponse>(response);
  assert.deepEqual(
    body.installments.map((item) => [item.sequenceNumber, item.totalInstallments, item.dueOn]),
    [
      [3, 4, "2028-02-29"],
      [4, 4, "2028-03-29"],
    ],
  );
  body.installments.forEach((item) => {
    assert.equal(item.transaction.effectiveOn, undefined);
    assert.equal(item.transaction.occurredOn, item.transaction.plannedOn);
  });
}

async function validatesCurrencyAndPayloadErrors(
  token: string,
  accountId: string,
  suffix: string,
): Promise<void> {
  const usdAccount = await createAccount(token, `Conta USD ${suffix}`, "USD");
  const mismatch = await apiRequest(token, "POST", "/api/installments", {
    accountId,
    destinationAccountId: usdAccount.id,
    kind: "transfer",
    status: "posted",
    description: "Transferencia ficticia",
    plannedOn: "2026-05-10",
    amountMinor: 5000,
    amountMode: "per_installment",
    totalInstallments: 2,
    initialSequenceNumber: 1,
    idempotencyKey: randomUUID(),
  });
  assert.equal(mismatch.statusCode, 400);
  assert.equal(readErrorCode(mismatch), "TRANSACTION_DESTINATION_ACCOUNT_INVALID");

  const missingKey = await apiRequest(token, "POST", "/api/installments", {
    accountId,
    kind: "expense",
    status: "planned",
    description: "Sem chave",
    plannedOn: "2026-05-10",
    amountMinor: 100,
    amountMode: "total",
    totalInstallments: 2,
    initialSequenceNumber: 1,
  });
  assert.equal(missingKey.statusCode, 400);
  assert.equal(readErrorCode(missingKey), "INSTALLMENT_IDEMPOTENCY_REQUIRED");

  const impossibleTotal = await apiRequest(token, "POST", "/api/installments", {
    accountId,
    kind: "expense",
    status: "planned",
    description: "Total invalido",
    plannedOn: "2026-05-10",
    amountMinor: 1,
    amountMode: "total",
    totalInstallments: 2,
    initialSequenceNumber: 1,
    idempotencyKey: randomUUID(),
  });
  assert.equal(impossibleTotal.statusCode, 400);
  assert.equal(readErrorCode(impossibleTotal), "INSTALLMENT_PAYLOAD_INVALID");
}

async function validatesRollbackDoesNotConsumeKey(
  token: string,
  accountId: string,
  categoryId: string,
): Promise<void> {
  const key = randomUUID();
  const markerAmount = 919_191;
  await getPool().query(`
    create or replace function issue_553_fail_second_installment() returns trigger as $$
    begin
      if new."sequenceNumber" = 2 and new."amountMinor" = ${markerAmount} then
        raise exception 'issue-553-forced-rollback';
      end if;
      return new;
    end;
    $$ language plpgsql;
    drop trigger if exists issue_553_fail_second_installment on "Installment";
    create trigger issue_553_fail_second_installment
      before insert on "Installment"
      for each row execute function issue_553_fail_second_installment();
  `);

  try {
    const failed = await apiRequest(token, "POST", "/api/installments", {
      accountId,
      categoryId,
      kind: "expense",
      status: "planned",
      description: "Rollback ficticio",
      plannedOn: "2026-06-30",
      amountMinor: markerAmount,
      amountMode: "per_installment",
      totalInstallments: 2,
      initialSequenceNumber: 1,
      idempotencyKey: key,
    });
    assert.equal(failed.statusCode, 500);

    const installments = await getPool().query<{ count: string }>(
      `select count(*)::text as count from "Installment" where "amountMinor" = $1`,
      [markerAmount],
    );
    const requests = await getPool().query<{ count: string }>(
      `select count(*)::text as count from "InstallmentCreationRequest" where "idempotencyKey" = $1`,
      [key],
    );
    assert.equal(installments.rows[0]?.count, "0");
    assert.equal(requests.rows[0]?.count, "0");
  } finally {
    await getPool().query(`
      drop trigger if exists issue_553_fail_second_installment on "Installment";
      drop function if exists issue_553_fail_second_installment();
    `);
  }
}

async function countInstallmentAudits(ids: string[]): Promise<number> {
  const result = await getPool().query<{ count: string }>(
    `select count(*)::text as count
       from "AuditLogEntry"
      where "entityKind" = 'INSTALLMENT' and "entityId" = any($1::uuid[])`,
    [ids],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function createAccount(
  token: string,
  name: string,
  currency: string,
): Promise<{ id: string }> {
  const response = await apiRequest(token, "POST", "/api/accounts", {
    name,
    kind: "checking",
    currency,
    openingBalanceMinor: 0,
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ account: { id: string } }>(response).account;
}

async function createCategory(token: string, name: string): Promise<{ id: string }> {
  const response = await apiRequest(token, "POST", "/api/categories", {
    name,
    kind: "expense",
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ category: { id: string } }>(response).category;
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

function readErrorCode(response: ApiResponse): string | undefined {
  return readBody<{ error?: { code?: string } }>(response).error?.code;
}

interface ManualCreationResponse {
  idempotentReplay: boolean;
  installments: Array<{
    id: string;
    sequenceNumber: number;
    totalInstallments: number;
    dueOn: string;
    amountMinor: number;
    transaction: {
      id: string;
      installmentId: string;
      source: string;
      description: string;
      note?: string;
      categoryId?: string;
      occurredOn: string;
      plannedOn: string;
      effectiveOn?: string;
      reconciledAt?: string;
    };
  }>;
}
