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
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for OFX amount precision tests.");
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
    const suffix = Date.now().toString(36);

    const validContent = buildOfx([
      { amount: "10.25", fitId: `${suffix}-valid-positive`, name: `Valid positive ${suffix}` },
      { amount: "-10.25", fitId: `${suffix}-valid-negative`, name: `Valid negative ${suffix}` },
    ]);
    const validPreview = await requestJson(baseUrl, "/api/import-batches/ofx/preview", {
      token,
      body: ofxPayload(accountId, `valid-${suffix}.ofx`, validContent),
    });
    assert.equal(validPreview.status, 200);
    assert.deepEqual(
      readBody<{
        state: string;
        suggestions: Array<{ amountMinor: number; direction: string; kind: string }>;
      }>(validPreview).suggestions.map((suggestion) => ({
        amountMinor: suggestion.amountMinor,
        direction: suggestion.direction,
        kind: suggestion.kind,
      })),
      [
        { amountMinor: 1025, direction: "inflow", kind: "income" },
        { amountMinor: 1025, direction: "outflow", kind: "expense" },
      ],
    );

    const invalidFileName = `invalid-precision-${suffix}.ofx`;
    const invalidMarker = `Invalid precision ${suffix}`;
    const invalidContent = buildOfx([
      { amount: "0.005", fitId: `${suffix}-three-positive`, name: `${invalidMarker} one` },
      { amount: "-0.005", fitId: `${suffix}-three-negative`, name: `${invalidMarker} two` },
      { amount: "1.999", fitId: `${suffix}-rounding`, name: `${invalidMarker} three` },
      { amount: "1,234", fitId: `${suffix}-comma`, name: `${invalidMarker} four` },
      { amount: "12.340", fitId: `${suffix}-trailing`, name: `${invalidMarker} five` },
    ]);
    const before = await countEffects(invalidFileName, suffix, invalidMarker);

    const invalidPreview = await requestJson(baseUrl, "/api/import-batches/ofx/preview", {
      token,
      body: ofxPayload(accountId, invalidFileName, invalidContent),
    });
    assert.equal(invalidPreview.status, 200);
    const invalidPreviewBody = readBody<{
      state: string;
      batch: { validRows: number; problemRows: number };
      suggestions: unknown[];
      problems: Array<{ rowNumber: number; code: string }>;
    }>(invalidPreview);
    assert.equal(invalidPreviewBody.state, "blocked");
    assert.equal(invalidPreviewBody.batch.validRows, 0);
    assert.equal(invalidPreviewBody.batch.problemRows, 5);
    assert.equal(invalidPreviewBody.suggestions.length, 0);
    assert.deepEqual(
      invalidPreviewBody.problems
        .filter((problem) => problem.code === "IMPORT_ROW_NUMBER_INVALID")
        .map((problem) => problem.rowNumber),
      [1, 2, 3, 4, 5],
    );
    assert.deepEqual(await countEffects(invalidFileName, suffix, invalidMarker), before);

    const invalidCreation = await requestJson(baseUrl, "/api/import-batches/ofx", {
      token,
      body: ofxPayload(accountId, invalidFileName, invalidContent),
    });
    assert.equal(invalidCreation.status, 422);
    assert.equal(readErrorCode(invalidCreation), "IMPORT_OFX_NO_VALID_ROWS");
    assert.deepEqual(await countEffects(invalidFileName, suffix, invalidMarker), before);
    assert.equal(logs.join("").includes("0.005"), false);
    assert.equal(logs.join("").includes("1,234"), false);
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((resolve) => child.once("exit", () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}

function buildOfx(rows: ReadonlyArray<{ amount: string; fitId: string; name: string }>): string {
  const transactions = rows
    .map(
      (row) =>
        "<STMTTRN>" +
        "<DTPOSTED>20260730</DTPOSTED>" +
        `<TRNAMT>${row.amount}</TRNAMT>` +
        `<FITID>${row.fitId}</FITID>` +
        `<NAME>${row.name}</NAME>` +
        "</STMTTRN>",
    )
    .join("");
  return `<OFX><STMTRS><CURDEF>BRL</CURDEF><BANKTRANLIST>${transactions}</BANKTRANLIST></STMTRS></OFX>`;
}

function ofxPayload(
  accountId: string,
  originalFileName: string,
  content: string,
): Record<string, unknown> {
  return { originalFileName, content, accountId, consentAccepted: true };
}

async function countEffects(
  originalFileName: string,
  fitIdMarker: string,
  descriptionMarker: string,
): Promise<{ batches: number; suggestions: number; transactions: number }> {
  const batches = await query<{ total: number }>(
    `select count(*)::int as total from "ImportBatch" where "originalFileName" = $1`,
    [originalFileName],
  );
  const suggestions = await query<{ total: number }>(
    `select count(*)::int as total from "AiSuggestion" where "payload"::text like $1`,
    [`%${fitIdMarker}%`],
  );
  const transactions = await query<{ total: number }>(
    `select count(*)::int as total from "Transaction" where "description" like $1`,
    [`${descriptionMarker}%`],
  );
  return {
    batches: batches[0]?.total ?? 0,
    suggestions: suggestions[0]?.total ?? 0,
    transactions: transactions[0]?.total ?? 0,
  };
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
      name: `Conta precisao OFX ${Date.now().toString(36)}`,
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
