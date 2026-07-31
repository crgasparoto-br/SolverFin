import type { IncomingMessage, ServerResponse } from "node:http";

import { apiError, readJsonBody, resolveCorrelationId, sendJson } from "./http.js";
import {
  materializeAccountStatementRecurrences,
  materializeCardInvoiceRecurrences,
  RecurrenceMaterializationError,
} from "./recurrence-materialization.js";
import {
  buildUpstreamAuthenticationHeaders,
  clearApiSessionCookies,
  clearOidcBindingCookies,
  clearSessionCookie,
  isDemoAuthenticationAllowed,
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

  if (isLocalAuthenticationRoute(request.method, url.pathname) && !isDemoAuthenticationAllowed()) {
    await rejectLocalAuthenticationRequest(response, url.pathname, correlationId);
    return;
  }

  if (publicOidcPaths.has(url.pathname) && request.method === "GET") {
    await proxyToApi(
      request,
      response,
      url,
      credential ?? request.headers.cookie,
      true,
    );
    return;
  }

  if (isLocalAuthenticationRoute(request.method, url.pathname)) {
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
    if (isOidcCallback(url)) {
      sendOidcCallbackFailure(response, url);
      return;
    }

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

  if (isOidcCallback(url) && !isExpectedOidcCallbackResponse(upstreamResponse)) {
    sendOidcCallbackFailure(response, url);
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

export function resolveOidcCallbackLocation(input: {
  requestPath: string;
  status: number;
  location: string;
  setCookies: readonly string[];
}): string {
  const completedOidcSession =
    input.requestPath === "/api/auth/oidc/callback" &&
    input.status === 303 &&
    containsApiSessionCookie(input.setCookies);

  return completedOidcSession ? buildOidcCompletionLocation(input.location) : input.location;
}

function isLocalAuthenticationRoute(method: string | undefined, pathname: string): boolean {
  return method === "POST" && (pathname === "/api/session" || pathname === "/api/users");
}

async function rejectLocalAuthenticationRequest(
  response: ServerResponse,
  pathname: string,
  correlationId: string,
): Promise<void> {
  try {
    await fetch(`${apiBaseUrl}${pathname}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
  } catch {
    // The public boundary still fails closed when the API is unavailable.
  }

  sendJson(
    response,
    403,
    apiError(
      "AUTH_LOCAL_AUTH_DISABLED",
      "A autenticação local não está disponível neste ambiente.",
      correlationId,
    ),
  );
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
  const browserCookieClears = [...clearApiSessionCookies(), clearSessionCookie()];

  if (!credential) {
    response.writeHead(204, { "set-cookie": browserCookieClears });
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
    response.writeHead(204, {
      "set-cookie": mergeSetCookies(readSetCookies(upstream), browserCookieClears),
    });
  } catch {
    response.writeHead(204, { "set-cookie": browserCookieClears });
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

  if (location) {
    headers.location = resolveOidcCallbackLocation({
      requestPath: requestUrl.pathname,
      status: upstream.status,
      location,
      setCookies,
    });
  }
  if (isOidcCallback(requestUrl)) headers["cache-control"] = "no-store";
  else if (cacheControl) headers["cache-control"] = cacheControl;
  if (setCookies.length > 0) headers["set-cookie"] = setCookies;

  return headers;
}

function isOidcCallback(url: URL): boolean {
  return url.pathname === "/api/auth/oidc/callback";
}

function isExpectedOidcCallbackResponse(response: Response): boolean {
  return response.status === 303 && Boolean(response.headers.get("location"));
}

function sendOidcCallbackFailure(response: ServerResponse, url: URL): void {
  const cookies = clearOidcBindingCookies(url.searchParams.get("state"));
  response.writeHead(303, {
    location: "/login?erro=autenticacao",
    "cache-control": "no-store",
    ...(cookies.length > 0 ? { "set-cookie": cookies } : {}),
  });
  response.end();
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

function mergeSetCookies(...groups: readonly string[][]): string[] {
  const cookiesByName = new Map<string, string>();

  for (const cookie of groups.flat()) {
    const name = cookie.slice(0, cookie.indexOf("=")).trim();
    if (name) cookiesByName.set(name, cookie);
  }

  return [...cookiesByName.values()];
}

function readSetCookies(response: Response): string[] {
  const headersWithCookies = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headersWithCookies.getSetCookie?.();
  if (values && values.length > 0) return values;

  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}
