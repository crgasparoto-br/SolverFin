import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

import { closePool, query } from "./db.js";

const MAX_OFX_BYTES = 5 * 1024 * 1024;

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
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for OFX boundary tests.");
  const port = await reservePort();
  const serverPath = fileURLToPath(new URL("./server.js", import.meta.url));
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, HOST: "127.0.0.1", API_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs: string[] = [];
  child.stdout.on("data", (chunk: Buffer) => logs.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk: Buffer) => logs.push(chunk.toString("utf8")));

  try {
    await waitForServer(child, logs);
    const baseUrl = `http://127.0.0.1:${port}`;
    const token = await login(baseUrl);
    const accountId = await createAccount(baseUrl, token);
    const before = await readOfxPersistedState();

    const structurallyInvalid = [
      [
        "<OFX><STMTRS><CURDEF>BRL</CURDEF><BANKTRANLIST><STMTTRN>",
        "<DTPOSTED>20260730</DTPOSTED><NAME><TRNAMT>-10</TRNAMT></NAME>",
        "<FITID>nested-field</FITID></STMTTRN></BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
      [
        "<OFX><STMTRS><CURDEF>BRL</CURDEF><BANKTRANLIST><MEMO>",
        "<STMTTRN><DTPOSTED>20260730</DTPOSTED><TRNAMT>-10</TRNAMT>",
        "<FITID>nested-transaction</FITID><NAME>Compra</NAME></STMTTRN>",
        "</MEMO></BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
      [
        "<OFX><STMTRS><MKTGINFO><CURDEF>BRL</CURDEF></MKTGINFO><BANKTRANLIST>",
        "<STMTTRN><DTPOSTED>20260730</DTPOSTED><TRNAMT>-10</TRNAMT>",
        "<FITID>nested-currency</FITID><NAME>Compra</NAME></STMTTRN>",
        "</BANKTRANLIST></STMTRS></OFX>",
      ].join(""),
    ];

    for (const content of structurallyInvalid) {
      await assertControlledFailure(
        baseUrl,
        token,
        accountId,
        "/api/import-batches/ofx/preview",
        content,
        422,
        "IMPORT_OFX_INVALID",
      );
      await assertControlledFailure(
        baseUrl,
        token,
        accountId,
        "/api/import-batches/ofx",
        content,
        422,
        "IMPORT_OFX_INVALID",
      );
    }

    for (const content of ["", "   \r\n\t  "]) {
      await assertControlledFailure(
        baseUrl,
        token,
        accountId,
        "/api/import-batches/ofx/preview",
        content,
        400,
        "IMPORT_FILE_EMPTY",
      );
      await assertControlledFailure(
        baseUrl,
        token,
        accountId,
        "/api/import-batches/ofx",
        content,
        400,
        "IMPORT_FILE_EMPTY",
      );
    }

    const canonical = validOfx("raw-boundary");
    const exactLimit = padToBytes(canonical, MAX_OFX_BYTES);
    const overLimit = `${exactLimit} `;
    assert.equal(Buffer.byteLength(exactLimit, "utf8"), MAX_OFX_BYTES);
    assert.equal(Buffer.byteLength(overLimit, "utf8"), MAX_OFX_BYTES + 1);

    const exactPreview = await requestJson(baseUrl, "/api/import-batches/ofx/preview", {
      token,
      body: ofxPayload(accountId, exactLimit),
    });
    assert.equal(exactPreview.status, 200);
    assert.equal(readBody<{ persisted: boolean }>(exactPreview).persisted, false);

    const canonicalPreview = await requestJson(baseUrl, "/api/import-batches/ofx/preview", {
      token,
      body: ofxPayload(accountId, canonical),
    });
    assert.equal(canonicalPreview.status, 200);
    assert.notEqual(
      readBody<{ batch: { contentHash: string } }>(exactPreview).batch.contentHash,
      readBody<{ batch: { contentHash: string } }>(canonicalPreview).batch.contentHash,
    );

    await assertControlledFailure(
      baseUrl,
      token,
      accountId,
      "/api/import-batches/ofx/preview",
      overLimit,
      400,
      "IMPORT_FILE_TOO_LARGE",
    );
    await assertControlledFailure(
      baseUrl,
      token,
      accountId,
      "/api/import-batches/ofx",
      overLimit,
      400,
      "IMPORT_FILE_TOO_LARGE",
    );
    await assertControlledFailure(
      baseUrl,
      token,
      accountId,
      "/api/import-batches/ofx/preview",
      `${canonical}\u0000`,
      400,
      "IMPORT_FILE_ENCODING_INVALID",
    );

    assert.deepEqual(await readOfxPersistedState(), before);
    assert.doesNotMatch(logs.join(""), /nested-field|nested-transaction|nested-currency/);
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((resolve) => child.once("exit", () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}

async function assertControlledFailure(
  baseUrl: string,
  token: string,
  accountId: string,
  pathname: string,
  content: string,
  expectedStatus: number,
  expectedCode: string,
): Promise<void> {
  const response = await requestJson(baseUrl, pathname, {
    token,
    body: ofxPayload(accountId, content),
  });
  assert.equal(response.status, expectedStatus);
  assert.equal(readErrorCode(response), expectedCode);
  assert.doesNotMatch(
    JSON.stringify(response.body),
    /nested-field|nested-transaction|nested-currency/,
  );
}

function validOfx(fitId: string): string {
  return [
    "<OFX><STMTRS><CURDEF>BRL</CURDEF><BANKTRANLIST><STMTTRN>",
    "<DTPOSTED>20260730</DTPOSTED><TRNAMT>-10.25</TRNAMT>",
    `<FITID>${fitId}</FITID><NAME>Compra valida</NAME>`,
    "</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
  ].join("");
}

function padToBytes(content: string, targetBytes: number): string {
  const currentBytes = Buffer.byteLength(content, "utf8");
  assert.ok(currentBytes <= targetBytes);
  return `${content}${" ".repeat(targetBytes - currentBytes)}`;
}

function ofxPayload(accountId: string, content: string): Record<string, unknown> {
  return {
    originalFileName: "adversarial-boundary.ofx",
    content,
    accountId,
    consentAccepted: true,
  };
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

async function login(baseUrl: string): Promise<string> {
  const response = await requestJson(baseUrl, "/api/session", {
    body: {
      email: "demo@solverfin.example.invalid",
      password: "SolverFinDemo!2026",
    },
  });
  assert.equal(response.status, 201);
  return readBody<{ session: { token: string } }>(response).session.token;
}

async function createAccount(baseUrl: string, token: string): Promise<string> {
  const response = await requestJson(baseUrl, "/api/accounts", {
    token,
    body: {
      name: `Conta fronteira OFX ${Date.now().toString(36)}`,
      kind: "checking",
      openingBalanceMinor: 0,
    },
  });
  assert.equal(response.status, 201);
  return readBody<{ account: { id: string } }>(response).account.id;
}

async function requestJson(
  baseUrl: string,
  pathname: string,
  input: { token?: string; body: unknown },
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(input.token === undefined ? {} : { authorization: `Bearer ${input.token}` }),
    },
    body: JSON.stringify(input.body),
  });
  return { status: response.status, body: await response.json() };
}

function readBody<T>(response: { body: unknown }): T {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);
  return response.body as T;
}

function readErrorCode(response: { body: unknown }): string | undefined {
  return readBody<{ error?: { code?: string } }>(response).error?.code;
}

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function waitForServer(child: ReturnType<typeof spawn>, logs: string[]): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    if (logs.join("").includes("@solverfin/api listening")) return;
    if (child.exitCode !== null) {
      throw new Error(`API server exited before listening.\n${logs.join("")}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for API server.\n${logs.join("")}`);
}
