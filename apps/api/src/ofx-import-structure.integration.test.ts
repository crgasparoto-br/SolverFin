import assert from "node:assert/strict";

import { closePool } from "./db.js";
import { handleImportBatchesApiRequest } from "./import-batches-router.js";
import { handleMvpApiRequest } from "./mvp.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

async function main(): Promise<void> {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required for OFX structure integration tests.",
  );
  const token = await loginAndReadToken();
  const suffix = Date.now().toString(36);
  const accountId = await createAccount(token, suffix);
  const transaction = `<STMTTRN><DTPOSTED>20260729<TRNAMT>-1<FITID>${suffix}-scope<NAME>Escopo`;

  await assertInvalidPreview(
    token,
    accountId,
    `<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST></BANKTRANLIST>${transaction}</STMTRS></OFX>`,
  );
  await assertInvalidPreview(
    token,
    accountId,
    `<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST><!-- ${transaction} --></BANKTRANLIST></STMTRS></OFX>`,
  );
  await assertInvalidPreview(
    token,
    accountId,
    [
      `<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST>${transaction}</BANKTRANLIST></STMTRS>`,
      `<CCSTMTRS><CURDEF>BRL<BANKTRANLIST>${transaction}</BANKTRANLIST></CCSTMTRS></OFX>`,
    ].join(""),
  );

  const valid = await apiRequest(token, "POST", "/api/import-batches/ofx/preview", {
    originalFileName: `valid-${suffix}.ofx`,
    content: `<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST>${transaction}</BANKTRANLIST></STMTRS></OFX>`,
    accountId,
    consentAccepted: true,
  });
  assert.equal(valid.statusCode, 200);
  assert.equal(readBody<{ preview?: never; state?: string }>(valid).state, "ready");
}

async function assertInvalidPreview(
  token: string,
  accountId: string,
  content: string,
): Promise<void> {
  const response = await apiRequest(token, "POST", "/api/import-batches/ofx/preview", {
    originalFileName: "invalid-structure.ofx",
    content,
    accountId,
    consentAccepted: true,
  });
  assert.equal(response.statusCode, 422);
  assert.equal(readBody<{ error?: { code?: string } }>(response).error?.code, "IMPORT_OFX_INVALID");
}

async function createAccount(token: string, suffix: string): Promise<string> {
  const response = await apiRequest(token, "POST", "/api/accounts", {
    name: `Conta estrutura OFX ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ account: { id: string } }>(response).account.id;
}

async function loginAndReadToken(): Promise<string> {
  const response = await handleMvpApiRequest({
    method: "POST",
    path: "/api/session",
    body: { email: "demo@solverfin.example.invalid", password: "SolverFinDemo!2026" },
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
  const response =
    (await handleImportBatchesApiRequest(request)) ?? (await handleApiRequest(request));
  assert.ok(response, `${method} ${path} should be handled`);
  return response;
}

function readBody<T>(response: Pick<ApiResponse, "body">): T {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);
  return response.body as T;
}
