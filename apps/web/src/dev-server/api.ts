import type { IncomingMessage, ServerResponse } from "node:http";

import { apiError, readJsonBody, resolveCorrelationId, sendJson } from "./http.js";
import {
  materializeAccountStatementRecurrences,
  materializeCardInvoiceRecurrences,
  RecurrenceMaterializationError,
} from "./recurrence-materialization.js";
import {
  buildUpstreamAuthenticationHeaders,
  clearSessionCookie,
  serializeSessionCookie,
} from "./session.js";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:4000";
const publicOidcPaths = new Set(["/api/auth/oidc/start", "/api/auth/oidc/callback"]);
const RECURRENCE_MATERIALIZATION_PATH = "/api/recurrence-materialization";
const API_SESSION_COOKIE_PREFIXES = ["__Host-solverfin_session=", "solverfin_session="];

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: string;
}

export async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  credential: string | undefined,
): Promise<void> {
  const correlationId = resolveCorrelationId(request);

  if (publicOidcPaths.has(url.pathname) && request.method === "GET") {
    await proxyToApi(request, response, url, credential, true);
    return;
  }

  if (
    request.method === "POST" &&
    (url.pathname === "/api/session" || url.pathname === "/api/users")
  ) {
    await handleSessionCreatingRequest(request, response, url.pathname, correlationId);
    return;
  }

  if (request.method === "DELETE" && url.pathname === "/api/session") {
    await handleLogout(request, response, credential);
    return;
  }

  if (!credential) {
    sendJson(
      response,
      401,
      apiError("AUTH_SESSION_REQUIRED", "Entre para continuar.", correlationId),
    );
    return;
  }

  if (request.method === "POST" && url.pathname === RECURRENCE_MATERIALIZATION_PATH) {
    await handleRecurrenceMaterialization(request, response, url, credential, correlationId);
    return;
  }

  await proxyToApi(request, response, url, credential);
}

export async function proxyToApi(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  credential?: string,
  preserveRedirect = false,
): Promise<void> {
  const body = await readJsonBody(request);
  let upstreamResponse: Response;

  try {
    upstreamResponse = await fetch(`${apiBaseUrl}${url.pathname}${url.search}`, {
      method: request.method ?? "GET",
      redirect: preserveRedirect ? "manual" : "follow",
      headers: {
        ...(credential ? buildUpstreamAuthenticationHeaders(credential) : {}),
        ...(request.headers.origin ? { origin: request.headers.origin } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    sendJson(
      response,
      502,
      apiError(
        "API_UNREACHABLE",
        "Nao foi possivel conectar com a API.",
        resolveCorrelationId(request),
      ),
    );
    return;
  }

  const text = await upstreamResponse.text();
  const headers = collectProxyResponseHeaders(upstreamResponse, url);
  response.writeHead(upstreamResponse.status, headers);
  response.end(text);
}

export async function apiGet<T>(
  credential: string,
  path: string,
): Promise<ApiSuccess<T> | ApiFailure> {
  try {
    const upstreamResponse = await fetch(`${apiBaseUrl}${path}`, {
      headers: buildUpstreamAuthenticationHeaders(credential),
    });

    if (!upstreamResponse.ok) {
      const errorBody = (await upstreamResponse.json().catch(() => undefined)) as
        | { error?: { message?: string } }
        | undefined;

      return {
        ok: false,
        error: errorBody?.error?.message ?? "Nao foi possivel carregar os dados.",
      };
    }

    return { ok: true, data: (await upstreamResponse.json()) as T };
  } catch {
    return { ok: false, error: "Nao foi possivel conectar com a API." };
  }
}

async function handleRecurrenceMaterialization(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  credential: string,
  correlationId: string,
): Promise<void> {
  try {
    const surface = url.searchParams.get("surface");

    if (surface === "card") {
      await materializeCardInvoiceRecurrences(credential, url, request.headers.origin);
    } else if (surface === "account") {
      await materializeAccountStatementRecurrences(credential, url, request.headers.origin);
    } else {
      sendJson(
        response,
        400,
        apiError(
          "RECURRENCE_MATERIALIZATION_INVALID",
          "Informe a superfície de recorrência a atualizar.",
          correlationId,
        ),
      );
      return;
    }

    response.writeHead(204, { "cache-control": "no-store" });
    response.end();
  } catch (error) {
    const known = error instanceof RecurrenceMaterializationError ? error : undefined;
    sendJson(
      response,
      known?.statusCode ?? 502,
      apiError(
        known?.code ?? "RECURRENCE_MATERIALIZATION_FAILED",
        known?.message ?? "Não foi possível atualizar os lançamentos recorrentes.",
        correlationId,
      ),
    );
  }
}

async function handleLogout(
  request: IncomingMessage,
  response: ServerResponse,
  credential: string | undefined,
): Promise<void> {
  if (!credential) {
    response.writeHead(204, { "set-cookie": clearSessionCookie() });
    response.end();
    return;
  }

  try {
    const upstream = await fetch(`${apiBaseUrl}/api/session`, {
      method: "DELETE",
      redirect: "manual",
      headers: {
        ...buildUpstreamAuthenticationHeaders(credential),
        ...(request.headers.origin ? { origin: request.headers.origin } : {}),
      },
    });
    const setCookies = readSetCookies(upstream);
    response.writeHead(204, {
      "set-cookie": [...setCookies, clearSessionCookie()],
    });
  } catch {
    response.writeHead(204, { "set-cookie": clearSessionCookie() });
  }

  response.end();
}

async function handleSessionCreatingRequest(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  correlationId: string,
): Promise<void> {
  const body = await readJsonBody(request);
  let upstreamResult: Response;

  try {
    upstreamResult = await fetch(`${apiBaseUrl}${pathname}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    sendJson(
      response,
      502,
      apiError("API_UNREACHABLE", "Nao foi possivel conectar com a API.", correlationId),
    );
    return;
  }

  const resultBody = (await upstreamResult.json()) as {
    session?: { token: string; expiresAt: string };
  };

  if (!upstreamResult.ok || !resultBody.session) {
    sendJson(response, upstreamResult.status, resultBody);
    return;
  }

  const upstreamCookies = readSetCookies(upstreamResult);
  response.setHeader("set-cookie", [
    ...upstreamCookies,
    serializeSessionCookie(resultBody.session),
  ]);
  sendJson(response, upstreamResult.status, resultBody);
}

function collectProxyResponseHeaders(
  upstream: Response,
  requestUrl: URL,
): Record<string, string | string[]> {
  const headers: Record<string, string | string[]> = {
    "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
  };
  const location = upstream.headers.get("location");
  const cacheControl = upstream.headers.get("cache-control");
  const setCookies = readSetCookies(upstream);
  const completedOidcSession =
    requestUrl.pathname === "/api/auth/oidc/callback" &&
    upstream.status === 303 &&
    containsApiSessionCookie(setCookies);

  if (location) {
    headers.location = completedOidcSession ? buildOidcCompletionLocation(location) : location;
  }
  if (cacheControl) headers["cache-control"] = cacheControl;
  if (setCookies.length > 0) headers["set-cookie"] = setCookies;

  return headers;
}

function containsApiSessionCookie(setCookies: readonly string[]): boolean {
  return setCookies.some((cookie) =>
    API_SESSION_COOKIE_PREFIXES.some((prefix) => cookie.startsWith(prefix)),
  );
}

function buildOidcCompletionLocation(returnTo: string): string {
  if (!isInternalReturnTo(returnTo)) return "/login?erro=autenticacao";

  return `/login?${new URLSearchParams({ auth: "complete", returnTo }).toString()}`;
}

function isInternalReturnTo(value: string): boolean {
  return (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("#") &&
    !value.includes("\\") &&
    !/^[a-z][a-z0-9+.-]*:/i.test(value)
  );
}

function readSetCookies(response: Response): string[] {
  const headersWithCookies = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headersWithCookies.getSetCookie?.();
  if (values && values.length > 0) return values;

  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}
