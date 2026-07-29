import assert from "node:assert/strict";

import { closePool, query } from "./db.js";
import { handleImportBatchesApiRequest } from "./import-batches-router.js";
import { handleMvpApiRequest } from "./mvp.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";

interface OfxPersistedState {
  batches: number;
  suggestions: number;
  transactions: number;
}

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
  const validContent =
    `<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST>${transaction}</BANKTRANLIST></STMTRS></OFX>`;
  const beforeInvalidRequests = await readOfxPersistedState();

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
  await assertInvalidPreview(
    token,
    accountId,
    `<OFX><STMTRS><BANKTRANLIST><CURDEF>USD${transaction}</BANKTRANLIST></STMTRS></OFX>`,
  );
  await assertInvalidPreview(
    token,
    accountId,
    `<OFX><STMTRS><BANKTRANLIST><STMTTRN><CURDEF>USD<DTPOSTED>20260729<TRNAMT>-1<FITID>${suffix}-nested<NAME>Escopo</BANKTRANLIST></STMTRS></OFX>`,
  );
  await assertInvalidPreview(
    token,
    accountId,
    `<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST><CURDEF>USD${transaction}</BANKTRANLIST></STMTRS></OFX>`,
  );

  const duplicateAmount =
    `<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST><STMTTRN><DTPOSTED>20260729<TRNAMT>-1<TRNAMT>-999<FITID>${suffix}-duplicate-amount<NAME>Escopo</BANKTRANLIST></STMTRS></OFX>`;
  const duplicateDate =
    `<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST><STMTTRN><DTPOSTED>20260729<DTPOSTED>20260730<TRNAMT>-1<FITID>${suffix}-duplicate-date<NAME>Escopo</BANKTRANLIST></STMTRS></OFX>`;
  await assertInvalidPreview(token, accountId, duplicateAmount);
  await assertInvalidCreation(token, accountId, duplicateAmount);
  await assertInvalidPreview(token, accountId, duplicateDate);
  await assertInvalidCreation(token, accountId, duplicateDate);

  await assertInvalidAccountId(
    token,
    "/api/import-batches/ofx/preview",
    validContent,
  );
  await assertInvalidAccountId(token, "/api/import-batches/ofx", validContent);

  assert.deepEqual(await readOfxPersistedState(), beforeInvalidRequests);

  const valid = await apiRequest(token, "POST", "/api/import-batches/ofx/preview", {
    originalFileName: `valid-${suffix}.ofx`,
    content: validContent,
    accountId,
    consentAccepted: true,
  });
  assert.equal(valid.statusCode, 200);
  assert.equal(readBody<{ preview?: never; state?: string }>(valid).state, "ready");

  const sampleTransactions = Array.from({ length: 11 }, (_, index) => {
    const rowNumber = index + 1;
    return `<STMTTRN><DTPOSTED>202607${String(rowNumber).padStart(2, "0")}<TRNAMT>-${rowNumber}<FITID>${suffix}-sample-${rowNumber}<NAME>Amostra ${rowNumber}`;
  }).join("");
  const sampledPreview = await apiRequest(token, "POST", "/api/import-batches/ofx/preview", {
    originalFileName: `sample-${suffix}.ofx`,
    content: `<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST>${sampleTransactions}</BANKTRANLIST></STMTRS></OFX>`,
    accountId,
    consentAccepted: true,
  });
  assert.equal(sampledPreview.statusCode, 200);
  const sampledBody = readBody<{
    state: string;
    persisted: boolean;
    batch: { totalRows: number; validRows: number };
    suggestions: Array<{ sourceRowNumber: number }>;
  }>(sampledPreview);
  assert.equal(sampledBody.state, "ready");
  assert.equal(sampledBody.persisted, false);
  assert.equal(sampledBody.batch.totalRows, 11);
  assert.equal(sampledBody.batch.validRows, 11);
  assert.equal(sampledBody.suggestions.length, 10);
  assert.deepEqual(
    sampledBody.suggestions.map((suggestion) => suggestion.sourceRowNumber),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );
  assert.deepEqual(await readOfxPersistedState(), beforeInvalidRequests);
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
  assert.equal(readErrorCode(response), "IMPORT_OFX_INVALID");
}

async function assertInvalidCreation(
  token: string,
  accountId: string,
  content: string,
): Promise<void> {
  const response = await apiRequest(token, "POST", "/api/import-batches/ofx", {
    originalFileName: "invalid-structure.ofx",
    content,
    accountId,
    consentAccepted: true,
  });
  assert.equal(response.statusCode, 422);
  assert.equal(readErrorCode(response), "IMPORT_OFX_INVALID");
}

async function assertInvalidAccountId(
  token: string,
  path: string,
  content: string,
): Promise<void> {
  const response = await apiRequest(token, "POST", path, {
    originalFileName: "invalid-account.ofx",
    content,
    accountId: "account-invalid",
    consentAccepted: true,
  });
  assert.equal(response.statusCode, 400);
  assert.equal(readErrorCode(response), "IMPORT_ACCOUNT_INVALID");
}

async function readOfxPersistedState(): Promise<OfxPersistedState> {
  const rows = await query<OfxPersistedState>(
    `select
       (select count(*)::int from "ImportBatch" where "sourceKind" = 'OFX') as batches,
       (select count(*)::int from "AiSuggestion" where "provider" = 'solverfin-import-ofx') as suggestions,
       (select count(*)::int
          from "Transaction" imported_transaction
          join "ImportBatch" batch on batch."id" = imported_transaction."importBatchId"
         where batch."sourceKind" = 'OFX') as transactions`,
  );
  const state = rows[0];
  assert.ok(state);
  return state;
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

function readErrorCode(response: Pick<ApiResponse, "body">): string | undefined {
  return readBody<{ error?: { code?: string } }>(response).error?.code;
}

function readBody<T>(response: Pick<ApiResponse, "body">): T {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);
  return response.body as T;
}
