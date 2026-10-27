import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { closePool, getPool } from "./db.js";
import { handleFinancialProfilesApiRequest } from "./financial-profiles-router.js";
import { handleMvpApiRequest } from "./mvp.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";

interface TransactionResult {
  transaction: { id: string; financialProfileId: string; description: string };
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL);
  const token = await loginAndReadToken();
  const profileA = await createProfile(token);
  const profileB = await createProfile(token);
  const accountA = await createAccount(token, profileA);
  const accountB = await createAccount(token, profileB);
  const key = randomUUID();
  const payloadA = {
    accountId: accountA,
    occurredOn: "2026-10-27",
    plannedOn: "2026-10-27",
    effectiveOn: "2026-10-27",
    kind: "expense",
    status: "posted",
    description: "Assinatura de teste",
    amountMinor: 2990,
    idempotencyKey: key,
  };
  const pathA = `/api/transactions?profileId=${profileA}`;
  const pathB = `/api/transactions?profileId=${profileB}`;
  const responses = await Promise.all([
    request(token, "POST", pathA, payloadA),
    request(token, "POST", pathA, payloadA),
  ]);
  assert.deepEqual(responses.map((r) => r.statusCode).sort(), [200, 201]);
  const [first, duplicate] = responses.map((r) => body<TransactionResult>(r)) as [TransactionResult, TransactionResult];
  assert.equal(first.transaction.id, duplicate.transaction.id);
  assert.equal(first.transaction.financialProfileId, profileA);

  // Replay after an ambiguous network response still returns the original result.
  const replay = await request(token, "POST", pathA, payloadA);
  assert.equal(replay.statusCode, 200);
  assert.equal(body<TransactionResult>(replay).transaction.id, first.transaction.id);
  const rows = await getPool().query<{ id: string }>(
    'select "id" from "Transaction" where "id" = $1 and "financialProfileId" = $2',
    [first.transaction.id, profileA],
  );
  assert.equal(rows.rows.length, 1);
  const savedRequest = await getPool().query<{ id: string }>(
    'select "id" from "TransactionCreationRequest" where "financialProfileId" = $1 and "idempotencyKey" = $2',
    [profileA, key],
  );
  assert.equal(savedRequest.rows.length, 1);

  const conflicting = await request(token, "POST", pathA, { ...payloadA, amountMinor: 2991 });
  assert.equal(conflicting.statusCode, 409);
  assert.equal(errorCode(conflicting), "TRANSACTION_IDEMPOTENCY_CONFLICT");

  // A key can be reused in another profile without exposing or replacing this one.
  const other = await request(token, "POST", pathB, { ...payloadA, accountId: accountB });
  assert.equal(other.statusCode, 201);
  const otherId = body<TransactionResult>(other).transaction.id;
  assert.notEqual(otherId, first.transaction.id);
  assert.equal(body<TransactionResult>(other).transaction.financialProfileId, profileB);

  const invalidKey = await request(token, "POST", pathA, { ...payloadA, idempotencyKey: "bad-key" });
  assert.equal(invalidKey.statusCode, 400);
  assert.equal(errorCode(invalidKey), "TRANSACTION_IDEMPOTENCY_KEY_INVALID");

  // A transaction that fails validation must not consume its key.
  const failedKey = randomUUID();
  const rejected = await request(token, "POST", pathA, {
    ...payloadA,
    idempotencyKey: failedKey,
    amountMinor: -1,
  });
  assert.equal(rejected.statusCode, 400);
  const recovered = await request(token, "POST", pathA, {
    ...payloadA,
    idempotencyKey: failedKey,
    description: "Nova tentativa válida",
  });
  assert.equal(recovered.statusCode, 201);
  assert.notEqual(body<TransactionResult>(recovered).transaction.id, first.transaction.id);
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
  return body<{ session: { token: string } }>(response).session.token;
}

async function createProfile(token: string): Promise<string> {
  const result = await request(token, "POST", "/api/financial-profiles", {
    name: "Perfil idempotência " + randomUUID().slice(0, 8),
    kind: "family",
  });
  assert.equal(result.statusCode, 201);
  return body<{ profile: { id: string } }>(result).profile.id;
}

async function createAccount(token: string, profileId: string): Promise<string> {
  const result = await request(token, "POST", `/api/accounts?profileId=${profileId}`, {
    name: "Conta idempotência " + randomUUID().slice(0, 8),
    kind: "checking",
    currency: "BRL",
    openingBalanceMinor: 0,
  });
  assert.equal(result.statusCode, 201);
  return body<{ account: { id: string } }>(result).account.id;
}

async function request(
  token: string,
  method: string,
  path: string,
  requestBody?: unknown,
): Promise<ApiResponse> {
  const url = new URL(path, "http://solverfin.integration.test");
  const req: ApiRequest = {
    method,
    pathname: url.pathname,
    query: url.searchParams,
    headers: { authorization: `Bearer ${token}` },
    body: requestBody,
  };
  return (
    (await handleFinancialProfilesApiRequest(req)) ??
    (await handleApiRequest(req)) ?? {
      statusCode: 404,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: { error: { code: "API_ROUTE_NOT_FOUND" } },
    }
  );
}

function body<T>(response: { body: unknown }): T {
  return response.body as T;
}

function errorCode(response: ApiResponse): string | undefined {
  return body<{ error?: { code?: string } }>(response).error?.code;
}
