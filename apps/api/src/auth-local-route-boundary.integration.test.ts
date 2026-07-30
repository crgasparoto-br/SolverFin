import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

import { closePool } from "./db.js";

const productiveEnv = {
  NODE_ENV: "production",
  APP_ORIGIN: "https://app.example.invalid",
  OIDC_ISSUER_URL: "https://cognito-idp.sa-east-1.amazonaws.com/sa-east-1_example",
  OIDC_CLIENT_ID: "client-123",
  OIDC_AUTHORIZATION_URL:
    "https://solverfin-auth.auth.sa-east-1.amazoncognito.com/oauth2/authorize",
  OIDC_TOKEN_URL: "https://solverfin-auth.auth.sa-east-1.amazoncognito.com/oauth2/token",
  OIDC_JWKS_URI:
    "https://cognito-idp.sa-east-1.amazonaws.com/sa-east-1_example/.well-known/jwks.json",
  OIDC_REDIRECT_URI: "https://app.example.invalid/api/auth/oidc/callback",
  OIDC_ATTEMPT_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  AUTH_ALLOW_DEMO: "false",
};

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for HTTP integration tests.");
  await rejectsLocalRoutesBeforeParsingBody();
  await rejectsMissingRuntimeEnvironmentBeforeListening();
}

async function rejectsLocalRoutesBeforeParsingBody(): Promise<void> {
  const port = await reservePort();
  const child = spawnServer({ ...productiveEnv, API_PORT: String(port) });
  const logs = collectLogs(child);

  try {
    await waitForServer(child, logs);
    const baseUrl = `http://127.0.0.1:${port}`;

    for (const pathname of ["/api/session", "/api/users"]) {
      const malformed = await fetch(`${baseUrl}${pathname}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      });
      assert.equal(malformed.status, 403);
      assert.equal(await readErrorCode(malformed), "AUTH_LOCAL_AUTH_DISABLED");

      const validJson = await fetch(`${baseUrl}${pathname}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      assert.equal(validJson.status, 403);
      assert.equal(await readErrorCode(validJson), "AUTH_LOCAL_AUTH_DISABLED");
    }
  } finally {
    await stopChild(child);
  }
}

async function rejectsMissingRuntimeEnvironmentBeforeListening(): Promise<void> {
  const port = await reservePort();
  const child = spawnServer({ ...productiveEnv, NODE_ENV: "", API_PORT: String(port) });
  const logs = collectLogs(child);

  await waitForExit(child);
  assert.notEqual(child.exitCode, 0);
  assert.match(logs.join(""), /NODE_ENV must be explicitly configured/);
}

function spawnServer(overrides: Record<string, string>): ReturnType<typeof spawn> {
  const serverPath = fileURLToPath(new URL("./server.js", import.meta.url));
  return spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      ...overrides,
      HOST: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function collectLogs(child: ReturnType<typeof spawn>): string[] {
  const logs: string[] = [];
  child.stdout.on("data", (chunk: Buffer) => logs.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk: Buffer) => logs.push(chunk.toString("utf8")));
  return logs;
}

async function readErrorCode(response: Response): Promise<string | undefined> {
  const body = (await response.json()) as { error?: { code?: string } };
  return body.error?.code;
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

async function waitForExit(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null) return;
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("API server did not fail closed.")), 5_000),
    ),
  ]);
}

async function stopChild(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}
