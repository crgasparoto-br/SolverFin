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
  const suffix = `${Date.now().toString(36)}_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  const profileA = await createProfile(token, `Auditoria parcelas A ${suffix}`);
  const profileB = await createProfile(token, `Auditoria parcelas B ${suffix}`);
  const accountA = await createAccount(token, profileA.id, `Conta auditoria A ${suffix}`);
  const accountB = await createAccount(token, profileB.id, `Conta auditoria B ${suffix}`);
  const categoryB = await createCategory(token, profileB.id, `Categoria auditoria B ${suffix}`);

  await validatesCrossProfileReferencesAreNonEnumerating(token, {
    profileAId: profileA.id,
    accountAId: accountA.id,
    accountBId: accountB.id,
    categoryBId: categoryB.id,
  });
  await validatesRedactedFailureRollsBackEveryPersistenceSurface(
    token,
    profileA.id,
    accountA.id,
    suffix,
  );
}

async function validatesCrossProfileReferencesAreNonEnumerating(
  token: string,
  fixtures: {
    profileAId: string;
    accountAId: string;
    accountBId: string;
    categoryBId: string;
  },
): Promise<void> {
  const scenarios = [
    {
      name: "source account",
      crossProfilePayload: buildPayload(fixtures.accountBId, randomUUID()),
      missingPayload: buildPayload(randomUUID(), randomUUID()),
    },
    {
      name: "category",
      crossProfilePayload: {
        ...buildPayload(fixtures.accountAId, randomUUID()),
        categoryId: fixtures.categoryBId,
      },
      missingPayload: {
        ...buildPayload(fixtures.accountAId, randomUUID()),
        categoryId: randomUUID(),
      },
    },
    {
      name: "destination account",
      crossProfilePayload: {
        ...buildPayload(fixtures.accountAId, randomUUID()),
        kind: "transfer",
        destinationAccountId: fixtures.accountBId,
      },
      missingPayload: {
        ...buildPayload(fixtures.accountAId, randomUUID()),
        kind: "transfer",
        destinationAccountId: randomUUID(),
      },
    },
  ];

  for (const scenario of scenarios) {
    const before = await readPersistenceCounts();
    const crossProfile = await apiRequest(
      token,
      "POST",
      `/api/installments?profileId=${fixtures.profileAId}`,
      scenario.crossProfilePayload,
    );
    const missing = await apiRequest(
      token,
      "POST",
      `/api/installments?profileId=${fixtures.profileAId}`,
      scenario.missingPayload,
    );

    const crossProfileError = readPublicErrorContract(crossProfile);
    const missingError = readPublicErrorContract(missing);
    assert.deepEqual(
      crossProfileError,
      missingError,
      `${scenario.name} must not reveal whether the referenced resource exists in another profile`,
    );
    assert.equal(crossProfileError.statusCode, 404);
    assert.equal(crossProfileError.code, "TENANT_RESOURCE_NOT_FOUND");

    const after = await readPersistenceCounts();
    assert.deepEqual(
      after,
      before,
      `${scenario.name} rejection must not persist financial, audit or idempotency effects`,
    );

    const keys = [
      scenario.crossProfilePayload.idempotencyKey,
      scenario.missingPayload.idempotencyKey,
    ];
    const requests = await getPool().query<{ count: string }>(
      `select count(*)::text as count
         from "InstallmentCreationRequest"
        where "idempotencyKey" = any($1::uuid[])`,
      [keys],
    );
    assert.equal(requests.rows[0]?.count, "0");
  }
}

async function validatesRedactedFailureRollsBackEveryPersistenceSurface(
  token: string,
  profileId: string,
  accountId: string,
  suffix: string,
): Promise<void> {
  const key = randomUUID();
  const markerAmount = 919_193;
  const description = `Rollback adversarial ${suffix}`;
  const functionName = `issue_553_audit_${suffix.replace(/[^a-z0-9_]/gi, "")}`;
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
    const before = await readPersistenceCounts();
    const failed = await apiRequest(token, "POST", `/api/installments?profileId=${profileId}`, {
      accountId,
      kind: "expense",
      status: "planned",
      description,
      plannedOn: "2026-08-31",
      amountMinor: markerAmount,
      amountMode: "per_installment",
      totalInstallments: 2,
      initialSequenceNumber: 1,
      idempotencyKey: key,
    });

    assert.equal(failed.statusCode, 500);
    const body = readBody<{
      error?: { code?: string; message?: string; correlationId?: string };
    }>(failed);
    assert.equal(body.error?.code, "API_UNEXPECTED_ERROR");
    assert.equal(body.error?.message, "Não foi possível concluir a ação. Tente novamente.");
    assert.match(body.error?.correlationId ?? "", /^corr-/);

    const publicResponse = JSON.stringify(body);
    sensitiveMarkers.forEach((marker) => assert.equal(publicResponse.includes(marker), false));

    const after = await readPersistenceCounts();
    assert.deepEqual(
      after,
      before,
      "failure on the second installment must roll back installments, transactions, audits and idempotency identity",
    );

    const installments = await getPool().query<{ count: string }>(
      `select count(*)::text as count from "Installment" where "amountMinor" = $1`,
      [markerAmount],
    );
    const transactions = await getPool().query<{ count: string }>(
      `select count(*)::text as count
         from "Transaction"
        where "amountMinor" = $1 and "description" = $2`,
      [markerAmount, description],
    );
    const requests = await getPool().query<{ count: string }>(
      `select count(*)::text as count
         from "InstallmentCreationRequest"
        where "idempotencyKey" = $1`,
      [key],
    );

    assert.equal(installments.rows[0]?.count, "0");
    assert.equal(transactions.rows[0]?.count, "0");
    assert.equal(requests.rows[0]?.count, "0");
  } finally {
    await getPool().query(`
      drop trigger if exists ${triggerName} on "Installment";
      drop function if exists ${functionName}();
    `);
  }
}

function buildPayload(accountId: string, idempotencyKey: string) {
  return {
    accountId,
    kind: "expense",
    status: "planned",
    description: "Parcelamento adversarial por perfil",
    plannedOn: "2026-08-10",
    amountMinor: 2400,
    amountMode: "per_installment",
    totalInstallments: 2,
    initialSequenceNumber: 1,
    idempotencyKey,
  };
}

async function readPersistenceCounts(): Promise<PersistenceCounts> {
  const result = await getPool().query<PersistenceCountRow>(`
    select
      (select count(*) from "Installment")::text as "installments",
      (select count(*) from "Transaction")::text as "transactions",
      (select count(*) from "AuditLogEntry")::text as "auditLogs",
      (select count(*) from "InstallmentCreationRequest")::text as "creationRequests"
  `);
  const row = result.rows[0] ?? assert.fail("Expected persistence counts.");

  return {
    installments: Number(row.installments),
    transactions: Number(row.transactions),
    auditLogs: Number(row.auditLogs),
    creationRequests: Number(row.creationRequests),
  };
}

function readPublicErrorContract(response: ApiResponse): PublicErrorContract {
  const body = readBody<{ error?: { code?: string; message?: string } }>(response);

  return {
    statusCode: response.statusCode,
    code: body.error?.code,
    message: body.error?.message,
  };
}

async function createProfile(token: string, name: string): Promise<{ id: string }> {
  const response = await apiRequest(token, "POST", "/api/financial-profiles", {
    name,
    kind: "family",
  });

  assert.equal(response.statusCode, 201);
  return readBody<{ profile: { id: string } }>(response).profile;
}

async function createAccount(
  token: string,
  profileId: string,
  name: string,
): Promise<{ id: string }> {
  const response = await apiRequest(token, "POST", `/api/accounts?profileId=${profileId}`, {
    name,
    kind: "checking",
    currency: "BRL",
    openingBalanceMinor: 0,
  });

  assert.equal(response.statusCode, 201);
  return readBody<{ account: { id: string } }>(response).account;
}

async function createCategory(
  token: string,
  profileId: string,
  name: string,
): Promise<{ id: string }> {
  const response = await apiRequest(token, "POST", `/api/categories?profileId=${profileId}`, {
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

interface PersistenceCountRow {
  installments: string;
  transactions: string;
  auditLogs: string;
  creationRequests: string;
}

interface PersistenceCounts {
  installments: number;
  transactions: number;
  auditLogs: number;
  creationRequests: number;
}

interface PublicErrorContract {
  statusCode: number;
  code: string | undefined;
  message: string | undefined;
}
