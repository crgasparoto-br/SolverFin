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
  const account = await createAccount(token, `Conta limite publico ${suffix}`);

  await validatesMalformedResourceIdentifiers(token, account.id);
  await validatesPersistenceFailureRedactionAndRollback(token, account.id, suffix);
}

async function validatesMalformedResourceIdentifiers(
  token: string,
  accountId: string,
): Promise<void> {
  const basePayload = {
    accountId,
    kind: "expense",
    status: "planned",
    description: "Validacao de identificador",
    plannedOn: "2026-08-10",
    amountMinor: 100,
    amountMode: "per_installment",
    totalInstallments: 2,
    initialSequenceNumber: 1,
  };

  const invalidAccount = await apiRequest(token, "POST", "/api/installments", {
    ...basePayload,
    accountId: "nao-e-uuid",
    idempotencyKey: randomUUID(),
  });
  assertControlledPayloadError(invalidAccount);

  const invalidDestination = await apiRequest(token, "POST", "/api/installments", {
    ...basePayload,
    kind: "transfer",
    destinationAccountId: "destino-invalido",
    idempotencyKey: randomUUID(),
  });
  assertControlledPayloadError(invalidDestination);

  const invalidCategory = await apiRequest(token, "POST", "/api/installments", {
    ...basePayload,
    categoryId: "categoria-invalida",
    idempotencyKey: randomUUID(),
  });
  assertControlledPayloadError(invalidCategory);
}

async function validatesPersistenceFailureRedactionAndRollback(
  token: string,
  accountId: string,
  suffix: string,
): Promise<void> {
  const key = randomUUID();
  const markerAmount = 919_192;
  const functionName = `issue_553_redaction_${suffix.replace(/[^a-z0-9_]/gi, "")}`;
  const triggerName = `${functionName}_trigger`;
  const sensitiveMarkers = [
    "fingerprint=0123456789abcdef",
    `idempotencyKey=${key}`,
    `amountMinor=${markerAmount}`,
    "P0001",
  ];

  await getPool().query(`
    create function ${functionName}() returns trigger as $$
    begin
      if new."sequenceNumber" = 2 and new."amountMinor" = ${markerAmount} then
        raise exception 'issue-553-sensitive fingerprint=0123456789abcdef idempotencyKey=${key} amountMinor=${markerAmount}';
      end if;
      return new;
    end;
    $$ language plpgsql;
    create trigger ${triggerName}
      before insert on "Installment"
      for each row execute function ${functionName}();
  `);

  try {
    const failed = await apiRequest(token, "POST", "/api/installments", {
      accountId,
      kind: "expense",
      status: "planned",
      description: "Falha redigida",
      plannedOn: "2026-08-10",
      amountMinor: markerAmount,
      amountMode: "per_installment",
      totalInstallments: 2,
      initialSequenceNumber: 1,
      idempotencyKey: key,
    });

    assert.equal(failed.statusCode, 500);
    const body = readBody<{ error?: { code?: string; message?: string; correlationId?: string } }>(
      failed,
    );
    assert.equal(body.error?.code, "API_UNEXPECTED_ERROR");
    assert.equal(body.error?.message, "Não foi possível concluir a ação. Tente novamente.");
    assert.match(body.error?.correlationId ?? "", /^corr-/);

    const publicResponse = JSON.stringify(body);
    sensitiveMarkers.forEach((marker) => assert.equal(publicResponse.includes(marker), false));

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
      drop trigger if exists ${triggerName} on "Installment";
      drop function if exists ${functionName}();
    `);
  }
}

function assertControlledPayloadError(response: ApiResponse): void {
  assert.equal(response.statusCode, 400);
  const body = readBody<{ error?: { code?: string; message?: string } }>(response);
  assert.equal(body.error?.code, "INSTALLMENT_PAYLOAD_INVALID");
  assert.equal(JSON.stringify(body).includes("22P02"), false);
  assert.equal(
    JSON.stringify(body).toLowerCase().includes("invalid input syntax for type uuid"),
    false,
  );
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
