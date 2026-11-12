import assert from "node:assert/strict";

import { closePool, query } from "./db.js";
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
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for OFX CURDEF integration tests.");
  const token = await loginAndReadToken();
  const suffix = Date.now().toString(36);
  const accountId = await createAccount(token, suffix);
  const transaction = `<STMTTRN><DTPOSTED>20260729<TRNAMT>-1<FITID>${suffix}-curdef<NAME>Escopo`;
  const beforeInvalidPreviews = await countOfxBatches();

  const invalidDocuments = [
    `<OFX><STMTRS><CURDEF></CURDEF><BANKTRANLIST>${transaction}</BANKTRANLIST></STMTRS></OFX>`,
    `<OFX><STMTRS><CURDEF></CURDEF><CURDEF></CURDEF><BANKTRANLIST>${transaction}</BANKTRANLIST></STMTRS></OFX>`,
    `<OFX><STMTRS><CURDEF></CURDEF><CURDEF>BRL</CURDEF><BANKTRANLIST>${transaction}</BANKTRANLIST></STMTRS></OFX>`,
  ];

  for (const content of invalidDocuments) {
    const response = await apiRequest(token, "POST", "/api/import-batches/ofx/preview", {
      originalFileName: `invalid-curdef-${suffix}.ofx`,
      content,
      accountId,
      consentAccepted: true,
    });
    assert.equal(response.statusCode, 422);
    assert.equal(readErrorCode(response), "IMPORT_OFX_INVALID");
  }

  assert.equal(await countOfxBatches(), beforeInvalidPreviews);

  const absentCurrency = await apiRequest(token, "POST", "/api/import-batches/ofx/preview", {
    originalFileName: `absent-curdef-${suffix}.ofx`,
    content: `<OFX><STMTRS><BANKTRANLIST>${transaction}</BANKTRANLIST></STMTRS></OFX>`,
    accountId,
    consentAccepted: true,
  });
  assert.equal(absentCurrency.statusCode, 200);
  const preview = readBody<{
    state: string;
    persisted: boolean;
    suggestions: Array<{ currency: string }>;
  }>(absentCurrency);
  assert.equal(preview.state, "ready");
  assert.equal(preview.persisted, false);
  assert.equal(preview.suggestions[0]?.currency, "BRL");
  assert.equal(await countOfxBatches(), beforeInvalidPreviews);
}

async function countOfxBatches(): Promise<number> {
  const rows = await query<{ total: number }>(
    `select count(*)::int as total from "ImportBatch" where "sourceKind" = 'OFX'`,
  );
  return rows[0]?.total ?? 0;
}

async function createAccount(token: string, suffix: string): Promise<string> {
  const response = await apiRequest(token, "POST", "/api/accounts", {
    name: `Conta cardinalidade CURDEF ${suffix}`,
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

function readErrorCode(response: ApiResponse): string | undefined {
  return readBody<{ error?: { code?: string } }>(response).error?.code;
}
