import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
    await removeRollbackFailureTrigger().catch(() => undefined);
    await closePool();
  });

let rollbackTriggerName = "";
let rollbackFunctionName = "";

// prettier-ignore
async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for attachment boundary tests.");
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
    const transactionId = await createTransaction(baseUrl, token, accountId);
    const otherProfileId = await readSiblingProfileId(accountId);

    await validatesAuthenticatedPublicBoundary({
      baseUrl,
      token,
      transactionId,
      otherProfileId,
    });
    await validatesStorageMetadataRollback({ baseUrl, token, transactionId });
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((resolve) => child.once("exit", () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}

// prettier-ignore
async function validatesAuthenticatedPublicBoundary(input: {
  baseUrl: string;
  token: string;
  transactionId: string;
  otherProfileId: string;
}): Promise<void> {
  const content = Buffer.from(`attachment-public-boundary-${Date.now().toString(36)}`);
  const fileName = `public-boundary-${Date.now().toString(36)}.txt`;
  const uploadBody = attachmentPayload(input.transactionId, fileName, content);

  const unauthenticated = await requestJson(
    input.baseUrl,
    `/api/attachments?linkedEntityKind=transaction&linkedEntityId=${encodeURIComponent(input.transactionId)}`,
    { method: "GET" },
  );
  assert.equal(unauthenticated.status, 401);
  assert.equal(readErrorCode(unauthenticated), "AUTH_SESSION_REQUIRED");

  const created = await requestJson(input.baseUrl, "/api/attachments", {
    method: "POST",
    token: input.token,
    body: uploadBody,
  });
  assert.equal(created.status, 201);
  const createdBody = readBody<{ attachment: { id: string; status: string; fileName: string } }>(
    created,
  );
  const attachmentId = createdBody.attachment.id;
  assert.equal(createdBody.attachment.status, "active");
  assert.equal(createdBody.attachment.fileName, fileName);
  assert.equal(JSON.stringify(created.body).includes("storageKey"), false);

  const listed = await requestJson(
    input.baseUrl,
    `/api/attachments?linkedEntityKind=transaction&linkedEntityId=${encodeURIComponent(input.transactionId)}`,
    { method: "GET", token: input.token },
  );
  assert.equal(listed.status, 200);
  const listedBody = readBody<{ attachments: Array<{ id: string }> }>(listed);
  assert.equal(listedBody.attachments.some((item) => item.id === attachmentId), true);
  assert.equal(JSON.stringify(listed.body).includes("storageKey"), false);

  const opened = await requestRaw(
    input.baseUrl,
    `/api/attachments/${encodeURIComponent(attachmentId)}/content`,
    input.token,
  );
  assert.equal(opened.status, 200);
  assert.equal(opened.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(opened.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await opened.arrayBuffer()), content);

  const foreignList = await requestJson(
    input.baseUrl,
    `/api/attachments?linkedEntityKind=transaction&linkedEntityId=${encodeURIComponent(input.transactionId)}&profileId=${encodeURIComponent(input.otherProfileId)}`,
    { method: "GET", token: input.token },
  );
  assert.equal(foreignList.status, 404);
  assert.equal(readErrorCode(foreignList), "ATTACHMENT_LINKED_ENTITY_NOT_FOUND");

  const foreignContent = await requestJson(
    input.baseUrl,
    `/api/attachments/${encodeURIComponent(attachmentId)}/content?profileId=${encodeURIComponent(input.otherProfileId)}`,
    { method: "GET", token: input.token },
  );
  assert.equal(foreignContent.status, 404);
  assert.equal(readErrorCode(foreignContent), "ATTACHMENT_NOT_FOUND");

  const deleted = await requestJson(
    input.baseUrl,
    `/api/attachments/${encodeURIComponent(attachmentId)}`,
    { method: "DELETE", token: input.token },
  );
  assert.equal(deleted.status, 200);
  assert.equal(readBody<{ attachment: { status: string } }>(deleted).attachment.status, "deleted");

  const repeatedDelete = await requestJson(
    input.baseUrl,
    `/api/attachments/${encodeURIComponent(attachmentId)}`,
    { method: "DELETE", token: input.token },
  );
  assert.equal(repeatedDelete.status, 200);
  assert.equal(
    readBody<{ attachment: { status: string } }>(repeatedDelete).attachment.status,
    "deleted",
  );

  const afterDelete = await requestJson(
    input.baseUrl,
    `/api/attachments?linkedEntityKind=transaction&linkedEntityId=${encodeURIComponent(input.transactionId)}`,
    { method: "GET", token: input.token },
  );
  assert.equal(afterDelete.status, 200);
  assert.equal(
    readBody<{ attachments: Array<{ id: string }> }>(afterDelete).attachments.some(
      (item) => item.id === attachmentId,
    ),
    false,
  );

  const deletedContent = await requestJson(
    input.baseUrl,
    `/api/attachments/${encodeURIComponent(attachmentId)}/content`,
    { method: "GET", token: input.token },
  );
  assert.equal(deletedContent.status, 404);
  assert.equal(readErrorCode(deletedContent), "ATTACHMENT_NOT_FOUND");
}

// prettier-ignore
async function validatesStorageMetadataRollback(input: {
  baseUrl: string;
  token: string;
  transactionId: string;
}): Promise<void> {
  const suffix = Date.now().toString(36).replace(/[^a-z0-9]/gi, "");
  rollbackFunctionName = `att_fail_${suffix}`;
  rollbackTriggerName = `${rollbackFunctionName}_trigger`;
  const fileName = `rollback-${suffix}.txt`;
  const content = Buffer.from(`attachment-rollback-${suffix}`);
  const contentSha256 = createHash("sha256").update(content).digest("hex");

  await query(`
    create function ${rollbackFunctionName}() returns trigger as $$
    begin
      if new."fileName" = '${fileName}' then
        raise exception 'forced attachment metadata failure';
      end if;
      return new;
    end;
    $$ language plpgsql;
    create trigger ${rollbackTriggerName}
      before insert on "Attachment"
      for each row execute function ${rollbackFunctionName}();
  `);

  try {
    const failed = await requestJson(input.baseUrl, "/api/attachments", {
      method: "POST",
      token: input.token,
      body: attachmentPayload(input.transactionId, fileName, content),
    });
    assert.equal(failed.status, 500);
    assert.equal(readErrorCode(failed), "API_UNEXPECTED_ERROR");
    assert.equal(
      readBody<{ error?: { message?: string } }>(failed).error?.message,
      "Não foi possível concluir a ação. Tente novamente.",
    );
    assert.equal(JSON.stringify(failed.body).includes("forced attachment metadata failure"), false);

    const metadataRows = await query<{ count: string }>(
      `select count(*)::text as "count" from "Attachment" where "contentSha256" = $1`,
      [contentSha256],
    );
    const objectRows = await query<{ count: string }>(
      `select count(*)::text as "count" from "AttachmentObject" where "contentSha256" = $1`,
      [contentSha256],
    );
    assert.equal(metadataRows[0]?.count, "0", "metadata must roll back after injected failure");
    assert.equal(objectRows[0]?.count, "0", "stored bytes must roll back with metadata");
  } finally {
    await removeRollbackFailureTrigger();
  }
}

// prettier-ignore
function attachmentPayload(
  transactionId: string,
  fileName: string,
  content: Buffer,
): Record<string, unknown> {
  return {
    kind: "receipt",
    fileName,
    mimeType: "text/plain",
    linkedEntityKind: "transaction",
    linkedEntityId: transactionId,
    contentBase64: content.toString("base64"),
  };
}

// prettier-ignore
async function createAccount(baseUrl: string, token: string): Promise<string> {
  const response = await requestJson(baseUrl, "/api/accounts", {
    method: "POST",
    token,
    body: {
      name: `Conta anexos boundary ${Date.now().toString(36)}`,
      kind: "checking",
      openingBalanceMinor: 0,
      currency: "BRL",
    },
  });
  assert.equal(response.status, 201);
  return readBody<{ account: { id: string } }>(response).account.id;
}

// prettier-ignore
async function createTransaction(
  baseUrl: string,
  token: string,
  accountId: string,
): Promise<string> {
  const response = await requestJson(baseUrl, "/api/transactions", {
    method: "POST",
    token,
    body: {
      accountId,
      kind: "expense",
      amountMinor: 1_234,
      occurredOn: "2026-10-03",
      plannedOn: "2026-10-03",
      effectiveOn: "2026-10-03",
      status: "posted",
      description: `Anexo boundary ${Date.now().toString(36)}`,
    },
  });
  assert.equal(response.status, 201);
  return readBody<{ transaction: { id: string } }>(response).transaction.id;
}

// prettier-ignore
async function readSiblingProfileId(accountId: string): Promise<string> {
  const scopeRows = await query<{ organizationId: string; financialProfileId: string }>(
    `select "organizationId", "financialProfileId" from "Account" where "id" = $1`,
    [accountId],
  );
  const scope = scopeRows[0];
  assert.ok(scope, "created account scope must be persisted");

  const siblingRows = await query<{ id: string }>(
    `select sibling."id"
       from "FinancialProfile" current_profile
       join "FinancialProfile" sibling
         on sibling."organizationId" = current_profile."organizationId"
        and sibling."ownerUserId" = current_profile."ownerUserId"
        and sibling."id" <> current_profile."id"
      where current_profile."id" = $1
      order by sibling."id" asc
      limit 1`,
    [scope.financialProfileId],
  );
  const siblingProfileId = siblingRows[0]?.id;
  assert.ok(siblingProfileId, "demo seed must provide a sibling profile for isolation coverage");
  return siblingProfileId;
}

// prettier-ignore
async function login(baseUrl: string): Promise<string> {
  const response = await requestJson(baseUrl, "/api/session", {
    method: "POST",
    body: {
      email: "demo@solverfin.example.invalid",
      password: "SolverFinDemo!2026",
    },
  });
  assert.equal(response.status, 201);
  return readBody<{ session: { token: string } }>(response).session.token;
}

// prettier-ignore
async function requestJson(
  baseUrl: string,
  pathname: string,
  input: { method: string; token?: string; body?: unknown },
): Promise<{ status: number; headers: Headers; body: unknown }> {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: input.method,
    headers: {
      accept: "application/json",
      ...(input.body === undefined ? {} : { "content-type": "application/json" }),
      ...(input.token === undefined ? {} : { authorization: `Bearer ${input.token}` }),
    },
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, headers: response.headers, body };
}

// prettier-ignore
async function requestRaw(baseUrl: string, pathname: string, token: string): Promise<Response> {
  return fetch(`${baseUrl}${pathname}`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

// prettier-ignore
function readBody<T>(response: { body: unknown }): T {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);
  return response.body as T;
}

// prettier-ignore
function readErrorCode(response: { body: unknown }): string | undefined {
  return readBody<{ error?: { code?: string } }>(response).error?.code;
}

// prettier-ignore
async function removeRollbackFailureTrigger(): Promise<void> {
  if (!process.env.DATABASE_URL || !rollbackFunctionName || !rollbackTriggerName) return;
  await query(`drop trigger if exists ${rollbackTriggerName} on "Attachment"`);
  await query(`drop function if exists ${rollbackFunctionName}()`);
  rollbackTriggerName = "";
  rollbackFunctionName = "";
}

// prettier-ignore
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

// prettier-ignore
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
