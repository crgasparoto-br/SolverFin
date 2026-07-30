import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

import { closePool, query } from "./db.js";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for CSV boundary tests.");
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
    const beforeInvalid = await countCsvBatches();

    for (const pathname of ["/api/import-batches/csv/preview", "/api/import-batches/csv"]) {
      const missing = await requestJson(baseUrl, pathname, {
        token,
        body: csvPayloadWithoutContent(accountId),
      });
      assert.equal(missing.status, 400);
      assert.equal(readErrorCode(missing), "IMPORT_FIELD_REQUIRED");

      for (const content of ["", "   \r\n\t  "]) {
        const invalid = await requestJson(baseUrl, pathname, {
          token,
          body: csvPayload(accountId, content),
        });
        assert.equal(invalid.status, 400);
        assert.equal(readErrorCode(invalid), "IMPORT_FIELD_REQUIRED");
      }
    }

    assert.equal(await countCsvBatches(), beforeInvalid);

    const suffix = Date.now().toString(36);
    const canonicalCsv = [
      "data,descricao,valor",
      `30/07/2026,Compra CSV ${suffix},-10.25`,
    ].join("\n");
    const paddedCsv = `  \r\n${canonicalCsv}\r\n\t  `;

    const canonicalPreview = await requestJson(baseUrl, "/api/import-batches/csv/preview", {
      token,
      body: csvPayload(accountId, canonicalCsv),
    });
    const paddedPreview = await requestJson(baseUrl, "/api/import-batches/csv/preview", {
      token,
      body: csvPayload(accountId, paddedCsv),
    });
    assert.equal(canonicalPreview.status, 200);
    assert.equal(paddedPreview.status, 200);
    assert.equal(
      readBody<{ batch: { contentHash: string } }>(canonicalPreview).batch.contentHash,
      readBody<{ batch: { contentHash: string } }>(paddedPreview).batch.contentHash,
    );

    const created = await requestJson(baseUrl, "/api/import-batches/csv", {
      token,
      body: csvPayload(accountId, canonicalCsv),
    });
    const duplicate = await requestJson(baseUrl, "/api/import-batches/csv", {
      token,
      body: csvPayload(accountId, paddedCsv),
    });
    assert.equal(created.status, 201);
    assert.equal(duplicate.status, 200);
    assert.equal(readBody<{ duplicateBatch: boolean }>(duplicate).duplicateBatch, true);
    assert.equal(
      readBody<{ importBatch: { id: string } }>(created).importBatch.id,
      readBody<{ importBatch: { id: string } }>(duplicate).importBatch.id,
    );

    const canonicalOfx = [
      "<OFX><STMTRS><CURDEF>BRL</CURDEF><BANKTRANLIST><STMTTRN>",
      "<DTPOSTED>20260730</DTPOSTED><TRNAMT>-10.25</TRNAMT>",
      `<FITID>${suffix}-raw-ofx</FITID><NAME>Compra OFX</NAME>`,
      "</STMTTRN></BANKTRANLIST></STMTRS></OFX>",
    ].join("");
    const paddedOfx = `  \r\n${canonicalOfx}\r\n\t  `;
    const canonicalOfxPreview = await requestJson(baseUrl, "/api/import-batches/ofx/preview", {
      token,
      body: ofxPayload(accountId, canonicalOfx),
    });
    const paddedOfxPreview = await requestJson(baseUrl, "/api/import-batches/ofx/preview", {
      token,
      body: ofxPayload(accountId, paddedOfx),
    });
    assert.equal(canonicalOfxPreview.status, 200);
    assert.equal(paddedOfxPreview.status, 200);
    assert.notEqual(
      readBody<{ batch: { contentHash: string } }>(canonicalOfxPreview).batch.contentHash,
      readBody<{ batch: { contentHash: string } }>(paddedOfxPreview).batch.contentHash,
    );
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((resolve) => child.once("exit", () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}

function csvPayload(accountId: string, content: string): Record<string, unknown> {
  return {
    originalFileName: "csv-boundary-regression.csv",
    content,
    accountId,
    consentAccepted: true,
  };
}

function csvPayloadWithoutContent(accountId: string): Record<string, unknown> {
  return {
    originalFileName: "csv-boundary-regression.csv",
    accountId,
    consentAccepted: true,
  };
}

function ofxPayload(accountId: string, content: string): Record<string, unknown> {
  return {
    originalFileName: "ofx-raw-sibling.ofx",
    content,
    accountId,
    consentAccepted: true,
  };
}

async function countCsvBatches(): Promise<number> {
  const rows = await query<{ total: number }>(
    `select count(*)::int as total from "ImportBatch" where "sourceKind" = 'CSV'`,
  );
  return rows[0]?.total ?? 0;
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
      name: `Conta regressao CSV ${Date.now().toString(36)}`,
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
