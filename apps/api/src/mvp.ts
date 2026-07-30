import { AuthError, getBearerSessionId, type AuthenticatedUser } from "./auth.js";
import { isMasterUser } from "./admin-auth.js";
import {
  authenticateProductiveUser,
  authenticateUser,
  logoutSession,
  registerUser,
  renewSession,
  requireAuthenticatedRequest,
} from "./auth-service.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import type { ApiHeaders } from "./http-headers.js";
import { completeOidcCallback, startOidcLogin, type OidcCallbackInput } from "./oidc-flow.js";
import { clearSessionCookie, readSessionCookie, serializeSessionCookie } from "./session-cookie.js";

export interface MvpApiRequest {
  method: "GET" | "POST" | "DELETE";
  path:
    | "/api/session"
    | "/api/session/oidc"
    | "/api/session/renew"
    | "/api/auth/oidc/start"
    | "/api/auth/oidc/callback"
    | "/api/users"
    | "/api/me"
    | "/api/financial-summary";
  query?: URLSearchParams;
  headers?: Readonly<Record<string, string | undefined>>;
  body?: unknown;
}

export interface MvpApiResponse {
  statusCode: number;
  headers: ApiHeaders;
  body: unknown;
}

export interface FinancialSummaryItem {
  id: string;
  description: string;
  kind: "income" | "expense" | "planned" | "suggested";
  amountMinor: number;
  occurredOn: string;
  status: "posted" | "planned" | "suggested";
}

export interface FinancialSummaryResponse {
  profile: {
    id: string;
    name: string;
    kind: "personal";
  };
  currency: "BRL";
  availableBalanceMinor: number;
  incomeMinor: number;
  expensesMinor: number;
  plannedCommitmentsMinor: number;
  recentItems: readonly FinancialSummaryItem[];
  reviewNotes: readonly string[];
  generatedAt: string;
}

export async function handleMvpApiRequest(request: MvpApiRequest): Promise<MvpApiResponse> {
  const headers = request.headers ?? {};
  const correlationId = resolveCorrelationId(headers);

  if (request.method === "GET" && request.path === "/api/auth/oidc/callback") {
    try {
      const callbackInput: OidcCallbackInput = {};
      const state = request.query?.get("state");
      const code = request.query?.get("code");
      const error = request.query?.get("error");

      if (state !== null && state !== undefined) callbackInput.state = state;
      if (code !== null && code !== undefined) callbackInput.code = code;
      if (error !== null && error !== undefined) callbackInput.error = error;

      const result = await completeOidcCallback(callbackInput);

      return {
        statusCode: 303,
        headers: {
          location: result.returnTo,
          "cache-control": "no-store",
          "set-cookie": serializeSessionCookie(
            result.login.session.id,
            result.login.session.expiresAt,
          ),
        },
        body: undefined,
      };
    } catch {
      return {
        statusCode: 303,
        headers: {
          location: "/login?erro=autenticacao",
          "cache-control": "no-store",
        },
        body: undefined,
      };
    }
  }

  try {
    if (request.method === "GET" && request.path === "/api/auth/oidc/start") {
      const result = await startOidcLogin(request.query?.get("returnTo"));
      return {
        statusCode: 302,
        headers: { location: result.location, "cache-control": "no-store" },
        body: undefined,
      };
    }

    if (request.method === "POST" && request.path === "/api/session") {
      return await createSession(request.body);
    }

    if (request.method === "POST" && request.path === "/api/session/oidc") {
      return await createOidcSession(request.body);
    }

    if (request.method === "POST" && request.path === "/api/users") {
      return await createUser(request.body);
    }

    if (request.method === "POST" && request.path === "/api/session/renew") {
      const token = requireCookieSession(headers.cookie);
      const rotated = await renewSession(token);
      return {
        statusCode: 204,
        headers: { "set-cookie": serializeSessionCookie(rotated.token, rotated.expiresAt) },
        body: undefined,
      };
    }

    if (request.method === "DELETE" && request.path === "/api/session") {
      const token = readSessionCookie(headers.cookie) ?? getBearerSessionId(headers.authorization);
      if (token) await logoutSession(token);

      return {
        statusCode: 204,
        headers: { "set-cookie": clearSessionCookie() },
        body: undefined,
      };
    }

    if (request.method === "GET" && request.path === "/api/me") {
      const user = await requireAuthenticatedRequest(headers);
      return jsonResponse(200, { user: serializeUser(user) });
    }

    if (request.method === "GET" && request.path === "/api/financial-summary") {
      await requireAuthenticatedRequest(headers);
      return jsonResponse(200, buildDemoFinancialSummary());
    }

    return jsonResponse(404, {
      error: {
        code: "API_ROUTE_NOT_FOUND",
        message: "Rota de API nao encontrada.",
        correlationId,
      },
    });
  } catch (error) {
    const response = buildApiErrorResponse({ error, correlationId });
    return jsonResponse(response.statusCode, response.body);
  }
}

export function buildDemoFinancialSummary(): FinancialSummaryResponse {
  return {
    profile: {
      id: "33333333-3333-4333-8333-333333333331",
      name: "Pessoal Demo",
      kind: "personal",
    },
    currency: "BRL",
    availableBalanceMinor: 631150,
    incomeMinor: 520000,
    expensesMinor: 8650,
    plannedCommitmentsMinor: 4200,
    recentItems: [
      {
        id: "88888888-8888-4888-8888-888888888801",
        description: "Receita mensal ficticia",
        kind: "income",
        amountMinor: 520000,
        occurredOn: "2026-06-05",
        status: "posted",
      },
      {
        id: "88888888-8888-4888-8888-888888888802",
        description: "Compra de mercado ficticia",
        kind: "expense",
        amountMinor: 8650,
        occurredOn: "2026-06-07",
        status: "posted",
      },
      {
        id: "88888888-8888-4888-8888-888888888803",
        description: "Transporte previsto ficticio",
        kind: "planned",
        amountMinor: 4200,
        occurredOn: "2026-06-18",
        status: "planned",
      },
    ],
    reviewNotes: [
      "Dados demonstrativos do perfil Pessoal Demo.",
      "Sugestoes e previsoes devem ser revisadas antes de qualquer decisao financeira.",
    ],
    generatedAt: new Date().toISOString(),
  };
}

async function createSession(body: unknown): Promise<MvpApiResponse> {
  if (!isLoginBody(body)) {
    throw new AuthError("AUTH_INVALID_CREDENTIALS", "Invalid email or password.");
  }

  const result = await authenticateUser(body);
  return localLoginResponse(result);
}

async function createOidcSession(body: unknown): Promise<MvpApiResponse> {
  if (!isOidcSessionBody(body)) {
    throw new AuthError("AUTH_INVALID_CREDENTIALS", "Invalid authentication provider response.");
  }

  const result = await authenticateProductiveUser(body);
  return localLoginResponse(result);
}

async function createUser(body: unknown): Promise<MvpApiResponse> {
  if (!isRegisterBody(body)) {
    throw new AuthError(
      "AUTH_INVALID_REGISTRATION",
      "Informe nome, email valido e senha com pelo menos 8 caracteres.",
      400,
    );
  }

  const result = await registerUser(body);
  return localLoginResponse(result);
}

function localLoginResponse(result: {
  user: AuthenticatedUser;
  session: { id: string; expiresAt: Date };
}): MvpApiResponse {
  return {
    statusCode: 201,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "set-cookie": serializeSessionCookie(result.session.id, result.session.expiresAt),
    },
    body: serializeLoginResult(result),
  };
}

function requireCookieSession(cookie: string | undefined): string {
  const token = readSessionCookie(cookie);
  if (!token) {
    throw new AuthError("AUTH_SESSION_REQUIRED", "Authentication session is required.", 401);
  }
  return token;
}

function serializeLoginResult(result: {
  user: AuthenticatedUser;
  session: { id: string; expiresAt: Date };
}) {
  return {
    user: serializeUser(result.user),
    session: {
      token: result.session.id,
      expiresAt: result.session.expiresAt.toISOString(),
    },
  };
}

function serializeUser(user: AuthenticatedUser) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    isMaster: isMasterUser(user),
  };
}

function isLoginBody(body: unknown): body is { email: string; password: string } {
  return (
    typeof body === "object" &&
    body !== null &&
    "email" in body &&
    "password" in body &&
    typeof body.email === "string" &&
    typeof body.password === "string"
  );
}

function isOidcSessionBody(body: unknown): body is {
  idToken: string;
  state: string;
  expectedState: string;
} {
  return (
    typeof body === "object" &&
    body !== null &&
    "idToken" in body &&
    "state" in body &&
    "expectedState" in body &&
    typeof body.idToken === "string" &&
    typeof body.state === "string" &&
    typeof body.expectedState === "string"
  );
}

function isRegisterBody(body: unknown): body is {
  displayName: string;
  email: string;
  password: string;
} {
  return isLoginBody(body) && "displayName" in body && typeof body.displayName === "string";
}

function jsonResponse(statusCode: number, body: unknown): MvpApiResponse {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body,
  };
}
