import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const port = await reservePort();
  const child = spawnWebServer(port);
  const logs = collectLogs(child);

  try {
    await waitForServer(child, logs);
    const baseUrl = `http://127.0.0.1:${port}`;

    for (const pathname of ["/api/session", "/api/users"]) {
      const response = await fetch(`${baseUrl}${pathname}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      });

      assert.equal(response.status, 403);
      assert.equal(await readErrorCode(response), "AUTH_LOCAL_AUTH_DISABLED");
    }

    for (const cookie of ["sf_session_token=legacy-token", "solverfin_session=local-token"]) {
      const response = await fetch(`${baseUrl}/dashboard`, {
        headers: { cookie },
        redirect: "manual",
      });

      assert.equal(response.status, 302);
      assert.equal(response.headers.get("location"), "/login");
    }
  } finally {
    await stopChild(child);
  }
}

function spawnWebServer(port: number): ReturnType<typeof spawn> {
  const serverPath = fileURLToPath(new URL("../dev-server.js", import.meta.url));
  return spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      AUTH_ALLOW_DEMO: "false",
      HOST: "127.0.0.1",
      PORT: String(port),
      API_BASE_URL: "http://127.0.0.1:9",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function collectLogs(child: ReturnType<typeof spawn>): string[] {
  const logs: string[] = [];
  child.stdout?.on("data", (chunk: Buffer) => logs.push(chunk.toString("utf8")));
  child.stderr?.on("data", (chunk: Buffer) => logs.push(chunk.toString("utf8")));
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
  while (Date.now() - startedAt < 10_000) {
    if (logs.join("").includes("SolverFin web dev server running")) return;
    if (child.exitCode !== null) {
      throw new Error(`Web server exited before listening.\n${logs.join("")}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for web server.\n${logs.join("")}`);
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
