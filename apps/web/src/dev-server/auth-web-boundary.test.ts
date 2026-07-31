import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer as createHttpServer, type Server } from "node:http";
import { createServer as createNetServer } from "node:net";
import { fileURLToPath } from "node:url";

interface DelegatedRequest {
  path: string;
  body: string;
  cookie?: string;
}

const productiveAuthEnv = {
  APP_ORIGIN: "https://app.example.invalid",
  OIDC_ISSUER_URL: "https://cognito-idp.sa-east-1.amazonaws.com/sa-east-1_example",
  OIDC_CLIENT_ID: "client-123",
  OIDC_AUDIENCE: "client-123",
  OIDC_AUTHORIZATION_URL:
    "https://solverfin-auth.auth.sa-east-1.amazoncognito.com/oauth2/authorize",
  OIDC_TOKEN_URL: "https://solverfin-auth.auth.sa-east-1.amazoncognito.com/oauth2/token",
  OIDC_JWKS_URI:
    "https://cognito-idp.sa-east-1.amazonaws.com/sa-east-1_example/.well-known/jwks.json",
  OIDC_REDIRECT_URI: "https://app.example.invalid/api/auth/oidc/callback",
  OIDC_LOGOUT_URL: "https://solverfin-auth.auth.sa-east-1.amazoncognito.com/logout",
  OIDC_RECOVERY_URL: "https://solverfin-auth.auth.sa-east-1.amazoncognito.com/forgotPassword",
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const delegatedRequests: DelegatedRequest[] = [];
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

    assert.deepEqual(
      delegatedRequests.map(({ path, body }) => ({ path, body })),
      [
        { path: "/api/session", body: "{}" },
        { path: "/api/users", body: "{}" },
      ],
    );

    const upstreamFailureState = "oidc-state-upstream-failure";
    const upstreamFailureBinding = oidcBindingCookie(upstreamFailureState, "C".repeat(43));
    const upstreamCallback = await fetch(
      `${baseUrl}/api/auth/oidc/callback?state=${encodeURIComponent(upstreamFailureState)}&code=provider-code`,
      {
        headers: { cookie: upstreamFailureBinding },
        redirect: "manual",
      },
    );
    assertOidcCallbackFailure(upstreamCallback, upstreamFailureState);
    assert.equal(delegatedRequests.at(-1)?.path.startsWith("/api/auth/oidc/callback?"), true);
    assert.equal(delegatedRequests.at(-1)?.cookie, upstreamFailureBinding);

    const productiveCookie = `__Host-solverfin_session=${"A".repeat(43)}`;
    const upstreamLogout = await fetch(`${baseUrl}/api/session`, {
      method: "DELETE",
      headers: {
        cookie: productiveCookie,
        origin: baseUrl,
      },
    });
    assert.equal(upstreamLogout.status, 204);
    assertSessionCookieClears(upstreamLogout);

    const anonymousLogout = await fetch(`${baseUrl}/api/session`, { method: "DELETE" });
    assert.equal(anonymousLogout.status, 204);
    assertSessionCookieClears(anonymousLogout);

    const invalidSession = await fetch(`${baseUrl}/dashboard`, {
      headers: { cookie: productiveCookie },
      redirect: "manual",
    });
    assert.equal(invalidSession.status, 302);
    assert.equal(invalidSession.headers.get("location"), "/login?erro=sessao");
    assert.match(invalidSession.headers.get("set-cookie") ?? "", /__Host-solverfin_session=;/);
    assert.deepEqual(
      { path: delegatedRequests.at(-1)?.path, body: delegatedRequests.at(-1)?.body },
      { path: "/api/me", body: "" },
    );

    await closeServer(fakeApi.server);

    const fallback = await fetch(`${baseUrl}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    assert.equal(fallback.status, 403);
    assert.equal(await readErrorCode(fallback), "AUTH_LOCAL_AUTH_DISABLED");

    const unavailableState = "oidc-state-api-unavailable";
    const unavailableCallback = await fetch(
      `${baseUrl}/api/auth/oidc/callback?state=${encodeURIComponent(unavailableState)}&code=provider-code`,
      {
        headers: { cookie: oidcBindingCookie(unavailableState, "D".repeat(43)) },
        redirect: "manual",
      },
    );
    assertOidcCallbackFailure(unavailableCallback, unavailableState);

    const unavailableLogout = await fetch(`${baseUrl}/api/session`, {
      method: "DELETE",
      headers: { cookie: productiveCookie, origin: baseUrl },
    });
    assert.equal(unavailableLogout.status, 204);
    assertSessionCookieClears(unavailableLogout);

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
      ...productiveAuthEnv,
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
  requests: DelegatedRequest[],
): Promise<{ server: Server; url: string }> {
  const server = createHttpServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    requests.push({
      path: request.url ?? "",
      body: Buffer.concat(chunks).toString("utf8"),
      ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
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

function assertSessionCookieClears(response: Response): void {
  const cookies = readSetCookies(response).join("\n");
  assert.match(cookies, /__Host-solverfin_session=;/);
  assert.match(cookies, /solverfin_session=;/);
  assert.match(cookies, /sf_session_token=;/);
  assert.match(cookies, /Max-Age=0/);
}

function assertOidcCallbackFailure(response: Response, state: string): void {
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/login?erro=autenticacao");
  assert.equal(response.headers.get("cache-control"), "no-store");
  const cookies = readSetCookies(response).join("\n");
  const key = hash(state).slice(0, 24);
  assert.match(cookies, new RegExp(`__Host-solverfin_oidc_${key}=;`));
  assert.match(cookies, new RegExp(`solverfin_oidc_${key}=;`));
}

function oidcBindingCookie(state: string, value: string): string {
  return `__Host-solverfin_oidc_${hash(state).slice(0, 24)}=${value}`;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function readSetCookies(response: Response): string[] {
  const headersWithCookies = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headersWithCookies.getSetCookie?.();
  if (values && values.length > 0) return values;
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
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
