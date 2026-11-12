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
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for OFX audit integration tests.");
  const token = await loginAndReadToken();
  const suffix = Date.now().toString(36);
  const accountId = await createAccount(token, suffix);
  const successSecret = `preview-audit-secret-${suffix}`;
  const failureSecret = `failure-audit-secret-${suffix}`;

  const preview = await apiRequest(token, "POST", "/api/import-batches/ofx/preview", {
    originalFileName: `audit-${suffix}.ofx`,
    content: ofx(
      `<STMTTRN><DTPOSTED>20260720<TRNAMT>-12.34<FITID>${suffix}-ok<NAME>Compra auditada<REFNUM>${successSecret}`,
    ),
    accountId,
    consentAccepted: true,
  });
  assert.equal(preview.statusCode, 200);

  const invalidPreview = await apiRequest(token, "POST", "/api/import-batches/ofx/preview", {
    originalFileName: `invalid-${suffix}.ofx`,
    content: `ARQUIVO-NAO-OFX<STMTTRN><DTPOSTED>20260720<TRNAMT>-1<FITID>${suffix}-invalid<REFNUM>${failureSecret}`,
    accountId,
    consentAccepted: true,
  });
  assert.equal(invalidPreview.statusCode, 422);
  assert.equal(readErrorCode(invalidPreview), "IMPORT_OFX_INVALID");
  assert.equal(JSON.stringify(invalidPreview.body).includes(failureSecret), false);

  const blockedCreation = await apiRequest(token, "POST", "/api/import-batches/ofx", {
    originalFileName: `blocked-${suffix}.ofx`,
    content: ofx(`<STMTTRN><DTPOSTED>bad<TRNAMT>0<FITID>${suffix}-blocked`),
    accountId,
    consentAccepted: true,
  });
  assert.equal(blockedCreation.statusCode, 422);
  assert.equal(readErrorCode(blockedCreation), "IMPORT_OFX_NO_VALID_ROWS");

  const auditRows = await query<{
    action: string;
    reason: string | null;
    redactedChanges: unknown;
  }>(
    `select "action", "reason", "redactedChanges"
     from "AuditLogEntry"
     where "occurredAt" >= now() - interval '5 minutes'
       and (
         "reason" = 'Preview OFX processado com consentimento explicito e sem persistir o arquivo bruto.'
         or "reason" like '%IMPORT_OFX_INVALID%'
         or "reason" like '%IMPORT_OFX_NO_VALID_ROWS%'
       )
     order by "occurredAt" asc`,
  );

  assert.ok(
    auditRows.some(
      (row) =>
        row.action === "CREATE" &&
        row.reason ===
          "Preview OFX processado com consentimento explicito e sem persistir o arquivo bruto.",
    ),
  );
  assert.ok(
    auditRows.some(
      (row) =>
        row.action === "REJECT" &&
        row.reason?.includes("fase preview") === true &&
        row.reason.includes("IMPORT_OFX_INVALID"),
    ),
  );
  assert.ok(
    auditRows.some(
      (row) =>
        row.action === "REJECT" &&
        row.reason?.includes("fase creation") === true &&
        row.reason.includes("IMPORT_OFX_NO_VALID_ROWS"),
    ),
  );

  const serializedAudit = JSON.stringify(auditRows);
  assert.equal(serializedAudit.includes(successSecret), false);
  assert.equal(serializedAudit.includes(failureSecret), false);
}

async function createAccount(token: string, suffix: string): Promise<string> {
  const response = await apiRequest(token, "POST", "/api/accounts", {
    name: `Conta auditoria OFX ${suffix}`,
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

function ofx(transactions: string): string {
  return `OFXHEADER:100\nDATA:OFXSGML\n<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST>${transactions}</BANKTRANLIST></STMTRS></OFX>`;
}
