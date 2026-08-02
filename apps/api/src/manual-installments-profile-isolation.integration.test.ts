import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { closePool, getPool } from "./db.js";
import { handleFinancialProfilesApiRequest } from "./financial-profiles-router.js";
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
  const profileA = await createProfile(token, "Familia idempotencia A");
  const profileB = await createProfile(token, "Familia idempotencia B");
  const accountA = await createAccount(token, profileA.id, "Conta perfil A");
  const accountB = await createAccount(token, profileB.id, "Conta perfil B");
  const idempotencyKey = randomUUID();

  const payloadA = buildPayload(accountA.id, idempotencyKey);
  const payloadB = buildPayload(accountB.id, idempotencyKey);

  const createdA = await apiRequest(
    token,
    "POST",
    `/api/installments?profileId=${profileA.id}`,
    payloadA,
  );
  const createdB = await apiRequest(
    token,
    "POST",
    `/api/installments?profileId=${profileB.id}`,
    payloadB,
  );

  assert.equal(createdA.statusCode, 201);
  assert.equal(createdB.statusCode, 201);

  const bodyA = readBody<ManualCreationResponse>(createdA);
  const bodyB = readBody<ManualCreationResponse>(createdB);

  assert.equal(bodyA.idempotentReplay, false);
  assert.equal(bodyB.idempotentReplay, false);
  assert.equal(bodyA.installments.length, 2);
  assert.equal(bodyB.installments.length, 2);
  assert.equal(
    bodyA.installments.every((item) => item.financialProfileId === profileA.id),
    true,
  );
  assert.equal(
    bodyB.installments.every((item) => item.financialProfileId === profileB.id),
    true,
  );
  const bodyBIds = new Set(bodyB.installments.map((item) => item.id));
  assert.equal(
    bodyA.installments.some((item) => bodyBIds.has(item.id)),
    false,
  );

  const replayA = await apiRequest(
    token,
    "POST",
    `/api/installments?profileId=${profileA.id}`,
    payloadA,
  );
  const replayB = await apiRequest(
    token,
    "POST",
    `/api/installments?profileId=${profileB.id}`,
    payloadB,
  );

  assert.equal(replayA.statusCode, 200);
  assert.equal(replayB.statusCode, 200);
  assert.equal(readBody<ManualCreationResponse>(replayA).idempotentReplay, true);
  assert.equal(readBody<ManualCreationResponse>(replayB).idempotentReplay, true);
  assert.deepEqual(
    readBody<ManualCreationResponse>(replayA).installments.map((item) => item.id),
    bodyA.installments.map((item) => item.id),
  );
  assert.deepEqual(
    readBody<ManualCreationResponse>(replayB).installments.map((item) => item.id),
    bodyB.installments.map((item) => item.id),
  );

  await assertProfileListIsolation(token, profileA.id, accountA.id, bodyA, bodyB);
  await assertProfileListIsolation(token, profileB.id, accountB.id, bodyB, bodyA);
  await assertDurableKeyIsScopedToBothProfiles(idempotencyKey, profileA.id, profileB.id);
}

function buildPayload(accountId: string, idempotencyKey: string) {
  return {
    accountId,
    kind: "expense",
    status: "planned",
    description: "Parcelamento isolado por perfil",
    plannedOn: "2026-08-10",
    amountMinor: 2400,
    amountMode: "per_installment",
    totalInstallments: 2,
    initialSequenceNumber: 1,
    idempotencyKey,
  };
}

async function assertProfileListIsolation(
  token: string,
  profileId: string,
  accountId: string,
  expected: ManualCreationResponse,
  other: ManualCreationResponse,
): Promise<void> {
  const response = await apiRequest(
    token,
    "GET",
    `/api/installments?profileId=${profileId}&accountId=${accountId}&status=all`,
  );

  assert.equal(response.statusCode, 200);
  const listed = readBody<{ installments: ManualCreationItem[] }>(response).installments;
  const expectedIds = expected.installments.map((item) => item.id).sort();
  const otherIds = new Set(other.installments.map((item) => item.id));

  assert.deepEqual(listed.map((item) => item.id).sort(), expectedIds);
  assert.equal(
    listed.every((item) => item.financialProfileId === profileId),
    true,
  );
  assert.equal(
    listed.some((item) => otherIds.has(item.id)),
    false,
  );
}

async function assertDurableKeyIsScopedToBothProfiles(
  idempotencyKey: string,
  profileAId: string,
  profileBId: string,
): Promise<void> {
  const rows = await getPool().query<{ financialProfileId: string }>(
    `select "financialProfileId"
       from "InstallmentCreationRequest"
      where "idempotencyKey" = $1
      order by "financialProfileId"`,
    [idempotencyKey],
  );

  assert.deepEqual(
    rows.rows.map((row) => row.financialProfileId).sort(),
    [profileAId, profileBId].sort(),
  );
}

async function createProfile(token: string, label: string): Promise<{ id: string }> {
  const response = await apiRequest(token, "POST", "/api/financial-profiles", {
    name: `${label} ${Date.now().toString(36)} ${randomUUID().slice(0, 8)}`,
    kind: "family",
  });

  assert.equal(response.statusCode, 201);
  return readBody<{ profile: { id: string } }>(response).profile;
}

async function createAccount(
  token: string,
  profileId: string,
  label: string,
): Promise<{ id: string }> {
  const response = await apiRequest(token, "POST", `/api/accounts?profileId=${profileId}`, {
    name: `${label} ${randomUUID().slice(0, 8)}`,
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
    (await handleFinancialProfilesApiRequest(request)) ??
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
  idempotentReplay: boolean;
  installments: ManualCreationItem[];
}

interface ManualCreationItem {
  id: string;
  financialProfileId: string;
}
