import type { IncomingMessage, ServerResponse } from "node:http";

import { apiError, readJsonBody, resolveCorrelationId, sendJson } from "./http.js";
import { clearSessionCookie, serializeSessionCookie } from "./session.js";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:4000";

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
  token: string | undefined,
): Promise<void> {
  const correlationId = resolveCorrelationId(request);

  if (
    request.method === "POST" &&
    (url.pathname === "/api/session" || url.pathname === "/api/users")
  ) {
    await handleSessionCreatingRequest(request, response, url.pathname, correlationId);
    return;
  }

  if (request.method === "DELETE" && url.pathname === "/api/session") {
    if (token) {
      await fetch(`${apiBaseUrl}/api/session`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }

    response.writeHead(204, { "set-cookie": clearSessionCookie() });
    response.end();
    return;
  }

  if (!token) {
    sendJson(
      response,
      401,
      apiError("AUTH_SESSION_REQUIRED", "Entre para continuar.", correlationId),
    );
    return;
  }

  await proxyToApi(request, response, url, token);
}

export async function proxyToApi(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  token: string,
): Promise<void> {
  const body = await readJsonBody(request);
  let upstreamResponse: Response;

  try {
    upstreamResponse = await fetch(`${apiBaseUrl}${url.pathname}${url.search}`, {
      method: request.method ?? "GET",
      headers: {
        authorization: `Bearer ${token}`,
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

  response.writeHead(upstreamResponse.status, {
    "content-type":
      upstreamResponse.headers.get("content-type") ?? "application/json; charset=utf-8",
  });
  response.end(text);
}

export async function apiGet<T>(token: string, path: string): Promise<ApiSuccess<T> | ApiFailure> {
  try {
    const upstreamResponse = await fetch(`${apiBaseUrl}${path}`, {
      headers: { authorization: `Bearer ${token}` },
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

  response.setHeader("set-cookie", serializeSessionCookie(resultBody.session));
  sendJson(response, upstreamResult.status, resultBody);
}
