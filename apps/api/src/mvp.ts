import { createHash, randomUUID } from "node:crypto";

import { AuthError, createAuthService, type AuthenticatedUser } from "./auth.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";

export interface MvpApiRequest {
  method: "GET" | "POST" | "DELETE";
  path: "/api/session" | "/api/me" | "/api/financial-summary";
  headers?: Readonly<Record<string, string | undefined>>;
  body?: unknown;
}

export interface MvpApiResponse {
  statusCode: number;
  headers: Readonly<Record<string, string>>;
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

const DEMO_PASSWORD_HASH = "c3fe12298b006ad7e54d9dac3006a98f406506a78e3100ca831c0f96c43f5b60";

const demoUser: AuthenticatedUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "demo@solverfin.example.invalid",
  displayName: "Usuario Demo SolverFin",
  status: "active",
};

const auth = createAuthService({
  users: [
    {
      user: demoUser,
      passwordHash: DEMO_PASSWORD_HASH,
    },
  ],
  verifyPassword: ({ password, passwordHash }) => hashPassword(password) === passwordHash,
  createSessionId: () => `sf_${randomUUID()}`,
  sessionTtlMs: resolveSessionTtlMs(),
});

export function handleMvpApiRequest(request: MvpApiRequest): MvpApiResponse {
  const correlationId = resolveCorrelationId(request.headers ?? {});

  try {
    if (request.method === "POST" && request.path === "/api/session") {
      return createSession(request.body);
    }

    if (request.method === "DELETE" && request.path === "/api/session") {
      const sessionId = requireBearerSession(request.headers?.authorization);
      auth.logout(sessionId);

      return jsonResponse(204, undefined);
    }

    if (request.method === "GET" && request.path === "/api/me") {
      const user = auth.requireAuthenticatedRequest(
        buildAuthHeaders(request.headers?.authorization),
      );

      return jsonResponse(200, { user: serializeUser(user) });
    }

    if (request.method === "GET" && request.path === "/api/financial-summary") {
      auth.requireAuthenticatedRequest(buildAuthHeaders(request.headers?.authorization));

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

function createSession(body: unknown): MvpApiResponse {
  if (!isLoginBody(body)) {
    throw new AuthError("AUTH_INVALID_CREDENTIALS", "Invalid email or password.");
  }

  const result = auth.login(body);

  return jsonResponse(201, {
    user: serializeUser(result.user),
    session: {
      token: result.session.id,
      expiresAt: result.session.expiresAt.toISOString(),
    },
  });
}

function requireBearerSession(authorization: string | undefined): string {
  const [scheme, token, extra] = authorization?.trim().split(/\s+/) ?? [];

  if (scheme?.toLowerCase() !== "bearer" || !token || extra) {
    throw new AuthError("AUTH_SESSION_REQUIRED", "Authentication session is required.");
  }

  return token;
}

function buildAuthHeaders(authorization: string | undefined): { authorization?: string } {
  return authorization === undefined ? {} : { authorization };
}

function serializeUser(user: AuthenticatedUser) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
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

function jsonResponse(statusCode: number, body: unknown): MvpApiResponse {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body,
  };
}

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

function resolveSessionTtlMs(): number {
  const ttlMinutes = Number(process.env.AUTH_SESSION_TTL_MINUTES ?? 60);

  if (!Number.isFinite(ttlMinutes) || ttlMinutes <= 0) {
    return 60 * 60 * 1000;
  }

  return ttlMinutes * 60 * 1000;
}
