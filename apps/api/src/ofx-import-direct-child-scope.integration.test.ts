import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { format } from "prettier";

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
    "DATABASE_URL is required for OFX direct-child scope integration tests.",
  );
  const structurePath = "apps/api/src/repositories/ofx-import-structure.ts";
  const structureSource = await readFile(structurePath, "utf8");
  const canonicalStructureSource = await format(structureSource, { filepath: structurePath });
  console.log(
    `OFX_PRETTIER_BASE64:${Buffer.from(canonicalStructureSource, "utf8").toString("base64")}`,
  );

  const token = await loginAndReadToken();
  const suffix = Date.now().toString(36);
  const accountId = await createAccount(token, suffix);
  const before = await readOfxPersistedState();

  const invalidDocuments = [
    [
      '<?xml version="1.0"?>',
      "<OFX><STMTRS><CURDEF>BRL</CURDEF><BANKTRANLIST><STMTTRN>",
      "<DTPOSTED>20260729</DTPOSTED><NAME>Compra segura</NAME>",
      "<EXTENSION><TRNAMT>-999.99</TRNAMT></EXTENSION>",
      "</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
    ].join(""),
    [
      "<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST><STMTTRN>",
      "<DTPOSTED>20260729<TRNAMT>-10<NAME>Compra segura",
      `<EXTENSION><FITID>${suffix}-nested-fitid</EXTENSION>`,
      "</BANKTRANLIST></STMTRS></OFX>",
    ].join(""),
    [
      '<?xml version="1.0"?>',
      "<OFX><STMTRS><BANKACCTFROM><CURDEF>USD</CURDEF></BANKACCTFROM>",
      "<BANKTRANLIST><STMTTRN><DTPOSTED>20260729</DTPOSTED>",
      "<TRNAMT>-10</TRNAMT><NAME>Compra</NAME></STMTTRN></BANKTRANLIST>",
      "</STMTRS></OFX>",
    ].join(""),
    [
      '<?xml version="1.0"?>',
      "<OFX><STMTRS><CURDEF>BRL</CURDEF><BANKTRANLIST><STMTTRN>",
      "<DTPOSTED>20260729</DTPOSTED><TRNAMT>-10</TRNAMT>",
      "<WRAPPER><NAME>Nome aninhado</NAME></WRAPPER>",
      "</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
    ].join(""),
  ];

  for (const content of invalidDocuments) {
    await assertInvalidRequest(token, accountId, "/api/import-batches/ofx/preview", content);
    await assertInvalidRequest(token, accountId, "/api/import-batches/ofx", content);
  }

  assert.deepEqual(await readOfxPersistedState(), before);
}

async function assertInvalidRequest(
  token: string,
  accountId: string,
  path: string,
  content: string,
): Promise<void> {
  const response = await apiRequest(token, "POST", path, {
    originalFileName: "nested-canonical-field.ofx",
    content,
    accountId,
    consentAccepted: true,
  });
  assert.equal(response.statusCode, 422);
  assert.equal(readErrorCode(response), "IMPORT_OFX_INVALID");
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
    name: `Conta escopo direto OFX ${suffix}`,
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
