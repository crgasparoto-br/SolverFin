import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer as createHttpServer, type Server } from "node:http";
import { createServer as createNetServer } from "node:net";
import { fileURLToPath } from "node:url";

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const delegatedRequests: Array<{ path: string; body: string }> = [];
  const fakeApi = await startFakeApi(delegatedRequests);
  const port = await reservePort();
  const child = spawnWebServer(port, fakeApi.url);
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

    assert.deepEqual(delegatedRequests, [
      { path: "/api/session", body: "{}" },
      { path: "/api/users", body: "{}" },
    ]);

    const invalidProductiveCookie = `__Host-solverfin_session=${"A".repeat(43)}`;
    const invalidSession = await fetch(`${baseUrl}/dashboard`, {
      headers: { cookie: invalidProductiveCookie },
      redirect: "manual",
    });
    assert.equal(invalidSession.status, 302);
    assert.equal(invalidSession.headers.get("location"), "/login?erro=sessao");
    assert.match(invalidSession.headers.get("set-cookie") ?? "", /__Host-solverfin_session=;/);
    assert.deepEqual(delegatedRequests.at(-1), { path: "/api/me", body: "" });

    await closeServer(fakeApi.server);

    const fallback = await fetch(`${baseUrl}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    assert.equal(fallback.status, 403);
    assert.equal(await readErrorCode(fallback), "AUTH_LOCAL_AUTH_DISABLED");

    for (const cookie of ["sf_session_token=legacy-token", "solverfin_session=local-token"]) {
      const response = await fetch(`${baseUrl}/dashboard`, {
        headers: { cookie },
        redirect: "manual",
      });

      assert.equal(response.status, 302);
      assert.equal(response.headers.get("location"), "/login");
    }
  } finally {
    await closeServer(fakeApi.server);
    await stopChild(child);
  }
}

function spawnWebServer(port: number, apiBaseUrl: string): ReturnType<typeof spawn> {
  const serverPath = fileURLToPath(new URL("../dev-server.js", import.meta.url));
  return spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      AUTH_ALLOW_DEMO: "false",
      HOST: "127.0.0.1",
      PORT: String(port),
      API_BASE_URL: apiBaseUrl,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function startFakeApi(
  requests: Array<{ path: string; body: string }>,
): Promise<{ server: Server; url: string }> {
  const server = createHttpServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    requests.push({
      path: request.url ?? "",
      body: Buffer.concat(chunks).toString("utf8"),
    });
    response.writeHead(403, { "content-type": "application/json; charset=utf-8" });
    response.end(
      JSON.stringify({
        error: {
          code: "AUTH_LOCAL_AUTH_DISABLED",
          message: "A autenticação local não está disponível neste ambiente.",
          correlationId: "fake-api",
        },
      }),
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return { server, url: `http://127.0.0.1:${address.port}` };
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
  const server = createNetServer();
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

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
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
