import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

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
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for OFX remediation tests.");
  const token = await loginAndReadToken();
  const suffix = Date.now().toString(36);
  const firstAccountId = await createAccount(token, `OFX concorrente A ${suffix}`);
  const secondAccountId = await createAccount(token, `OFX concorrente B ${suffix}`);

  const content = ofx(
    `<STMTTRN><DTPOSTED>20260730<TRNAMT>-31.45<FITID>${suffix}-configuration<NAME>Concorrencia ${suffix}`,
  );
  const [firstResponse, secondResponse] = await Promise.all([
    createOfx(token, `configuration-a-${suffix}.ofx`, content, firstAccountId),
    createOfx(token, `configuration-b-${suffix}.ofx`, content, secondAccountId),
  ]);

  assert.equal(firstResponse.statusCode, 201);
  assert.equal(secondResponse.statusCode, 201);
  const first = readBody<ImportDetail>(firstResponse);
  const second = readBody<ImportDetail>(secondResponse);
  assert.notEqual(first.importBatch.id, second.importBatch.id);
  assert.notEqual(first.importBatch.sourceHash, second.importBatch.sourceHash);
  assert.equal(countConfigurationWarnings([first, second]), 1);

  const persistedDetails = await Promise.all([
    apiRequest(token, "GET", `/api/import-batches/${first.importBatch.id}`),
    apiRequest(token, "GET", `/api/import-batches/${second.importBatch.id}`),
  ]);
  assert.equal(persistedDetails[0].statusCode, 200);
  assert.equal(persistedDetails[1].statusCode, 200);
  assert.equal(
    countConfigurationWarnings(
      persistedDetails.map((response) => readBody<ImportDetail>(response)),
    ),
    1,
  );

  const bankMessageId = randomUUID();
  const manualId = randomUUID();
  await insertNonStatementBatch(first.importBatch, bankMessageId, "BANK_MESSAGE", suffix);
  await insertNonStatementBatch(first.importBatch, manualId, "MANUAL", suffix);

  const defaultListingResponse = await apiRequest(token, "GET", "/api/import-batches?status=all");
  assert.equal(defaultListingResponse.statusCode, 200);
  const defaultListing = readBody<{ importBatches: ImportBatchRecord[] }>(
    defaultListingResponse,
  ).importBatches;
  assert.ok(defaultListing.some((batch) => batch.id === first.importBatch.id));
  assert.ok(defaultListing.some((batch) => batch.id === second.importBatch.id));
  assert.equal(
    defaultListing.some((batch) => batch.id === bankMessageId),
    false,
  );
  assert.equal(
    defaultListing.some((batch) => batch.id === manualId),
    false,
  );
  assert.ok(
    defaultListing.every((batch) => batch.sourceKind === "csv" || batch.sourceKind === "ofx"),
  );

  const ofxListingResponse = await apiRequest(
    token,
    "GET",
    "/api/import-batches?sourceKind=ofx&status=all",
  );
  assert.equal(ofxListingResponse.statusCode, 200);
  assert.ok(
    readBody<{ importBatches: ImportBatchRecord[] }>(ofxListingResponse).importBatches.every(
      (batch) => batch.sourceKind === "ofx",
    ),
  );
}

async function createOfx(
  token: string,
  originalFileName: string,
  content: string,
  accountId: string,
): Promise<ApiResponse> {
  return apiRequest(token, "POST", "/api/import-batches/ofx", {
    originalFileName,
    content,
    accountId,
    consentAccepted: true,
  });
}

async function createAccount(token: string, name: string): Promise<string> {
  const response = await apiRequest(token, "POST", "/api/accounts", {
    name,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ account: { id: string } }>(response).account.id;
}

async function insertNonStatementBatch(
  reference: ImportBatchRecord,
  id: string,
  sourceKind: "BANK_MESSAGE" | "MANUAL",
  suffix: string,
): Promise<void> {
  await query(
    `insert into "ImportBatch"
      ("id", "organizationId", "financialProfileId", "sourceKind", "status", "originalFileName",
       "sourceHash", "receivedAt", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, 'REVIEWING', $5, $6, now(), now(), now())`,
    [
      id,
      reference.organizationId,
      reference.financialProfileId,
      sourceKind,
      `${sourceKind.toLowerCase()}-${suffix}`,
      `audit-remediation-${sourceKind.toLowerCase()}-${suffix}`,
    ],
  );
}

function countConfigurationWarnings(details: readonly ImportDetail[]): number {
  return details.filter((detail) =>
    detail.problems.some((problem) => problem.code === "IMPORT_BATCH_CONFIGURATION_CHANGED"),
  ).length;
}

function ofx(transactions: string): string {
  return `OFXHEADER:100\nDATA:OFXSGML\n<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST>${transactions}</BANKTRANLIST></STMTRS></OFX>`;
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

interface ImportProblemRecord {
  code: string;
}

interface ImportBatchRecord {
  id: string;
  organizationId: string;
  financialProfileId: string;
  sourceHash: string;
  sourceKind: string;
}

interface ImportDetail {
  importBatch: ImportBatchRecord;
  problems: ImportProblemRecord[];
}
