import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

import { closePool } from "./db.js";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for HTTP integration tests.");
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

    const acceptedContent = ofxWithPadding(1_100_000);
    assert.ok(
      Buffer.byteLength(JSON.stringify(importPayload(accountId, acceptedContent))) > 1_000_000,
    );
    assert.ok(Buffer.byteLength(acceptedContent, "utf8") < 5 * 1024 * 1024);
    const accepted = await requestJson(baseUrl, "/api/import-batches/ofx/preview", {
      token,
      body: importPayload(accountId, acceptedContent),
    });
    assert.equal(accepted.status, 200);
    assert.equal(readBody<{ persisted: boolean }>(accepted).persisted, false);

    const oversizedContent = ofxWithPadding(5 * 1024 * 1024);
    assert.ok(Buffer.byteLength(oversizedContent, "utf8") > 5 * 1024 * 1024);
    const oversized = await requestJson(baseUrl, "/api/import-batches/ofx/preview", {
      token,
      body: importPayload(accountId, oversizedContent),
    });
    assert.equal(oversized.status, 400);
    assert.equal(readErrorCode(oversized), "IMPORT_FILE_TOO_LARGE");

    const defaultBoundary = await requestJson(baseUrl, "/api/session", {
      body: {
        email: "demo@solverfin.example.invalid",
        password: "x".repeat(1_100_000),
      },
    });
    assert.equal(defaultBoundary.status, 413);
    assert.equal(readErrorCode(defaultBoundary), "API_REQUEST_BODY_TOO_LARGE");
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((resolve) => child.once("exit", () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}

async function login(baseUrl: string): Promise<string> {
  const response = await requestJson(baseUrl, "/api/session", {
    body: { email: "demo@solverfin.example.invalid", password: "SolverFinDemo!2026" },
  });
  assert.equal(response.status, 201);
  return readBody<{ session: { token: string } }>(response).session.token;
}

async function createAccount(baseUrl: string, token: string): Promise<string> {
  const response = await requestJson(baseUrl, "/api/accounts", {
    token,
    body: {
      name: `Conta limite HTTP ${Date.now().toString(36)}`,
      kind: "checking",
      openingBalanceMinor: 0,
    },
  });
  assert.equal(response.status, 201);
  return readBody<{ account: { id: string } }>(response).account.id;
}

function importPayload(accountId: string, content: string): Record<string, unknown> {
  return {
    originalFileName: "limite-http.ofx",
    content,
    accountId,
    consentAccepted: true,
  };
}

function ofxWithPadding(paddingBytes: number): string {
  return [
    "OFXHEADER:100\nDATA:OFXSGML\n",
    "<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST>",
    "<STMTTRN><DTPOSTED>20260720<TRNAMT>-1.23<FITID>http-limit<NAME>Limite HTTP</STMTTRN>",
    `<IGNORED>${"x".repeat(paddingBytes)}</IGNORED>`,
    "</BANKTRANLIST></STMTRS></OFX>",
  ].join("");
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

async function waitForServer(
  child: ReturnType<typeof spawn>,
  logs: string[],
): Promise<void> {
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
