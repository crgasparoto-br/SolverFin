import { createHash, randomUUID } from "node:crypto";

import {
  AuthError,
  createAuthService,
  type AuthUserCredentials,
  type AuthenticatedUser,
  type LoginInput,
  type LoginResult,
} from "./auth.js";
import { query, withTransaction } from "./db.js";

const DEMO_PASSWORD_HASH = "c3fe12298b006ad7e54d9dac3006a98f406506a78e3100ca831c0f96c43f5b60";
const LOCAL_DEMO_ENVIRONMENTS = new Set(["development", "local", "test"]);
const MIN_PASSWORD_LENGTH = 8;

export const demoUser: AuthenticatedUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "demo@solverfin.example.invalid",
  displayName: "Usuario Demo SolverFin",
  status: "active",
};

interface UserCredentialsRow {
  id: string;
  email: string;
  displayName: string;
  status: string;
  passwordHash: string;
}

export interface RegisterUserInput extends LoginInput {
  displayName: string;
}

assertDemoAuthAllowed();

export const auth = createAuthService({
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

export async function authenticateUser(input: LoginInput): Promise<LoginResult> {
  try {
    return auth.login(input);
  } catch (error) {
    if (!(error instanceof AuthError) || error.code !== "AUTH_INVALID_CREDENTIALS") {
      throw error;
    }
  }

  const credentials = await findUserCredentialsByEmail(input.email);

  if (!credentials) {
    throw invalidCredentialsError();
  }

  auth.upsertUserCredentials(credentials);

  return auth.login(input);
}

export async function registerUser(input: RegisterUserInput): Promise<LoginResult> {
  const email = normalizeEmail(input.email);
  const displayName = normalizeDisplayName(input.displayName);
  const password = input.password.trim();

  if (!isValidEmail(email) || displayName.length === 0 || password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(
      "AUTH_INVALID_REGISTRATION",
      "Informe nome, email valido e senha com pelo menos 8 caracteres.",
      400,
    );
  }

  const passwordHash = hashPassword(password);
  const userId = randomUUID();
  const organizationId = randomUUID();
  const financialProfileId = randomUUID();

  try {
    await withTransaction(async (executeQuery) => {
      const existing = await executeQuery<{ id: string }>(
        `select "id" from "User" where lower("email") = lower($1) limit 1`,
        [email],
      );

      if (existing.length > 0) {
        throw new AuthError(
          "AUTH_USER_ALREADY_EXISTS",
          "Ja existe uma conta com esse email. Entre com a senha cadastrada.",
          409,
        );
      }

      await executeQuery(
        `insert into "User" ("id", "email", "displayName", "status", "passwordHash", "createdAt", "updatedAt")
         values ($1, $2, $3, 'ACTIVE', $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [userId, email, displayName, passwordHash],
      );

      await executeQuery(
        `insert into "Organization" ("id", "ownerUserId", "name", "createdAt", "updatedAt")
         values ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [organizationId, userId, `Organizacao de ${displayName}`],
      );

      await executeQuery(
        `insert into "FinancialProfile"
         ("id", "organizationId", "ownerUserId", "name", "kind", "status", "createdAt", "updatedAt")
         values ($1, $2, $3, 'Pessoal', 'PERSONAL', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [financialProfileId, organizationId, userId],
      );
    });
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }

    if (isUniqueViolation(error)) {
      throw new AuthError(
        "AUTH_USER_ALREADY_EXISTS",
        "Ja existe uma conta com esse email. Entre com a senha cadastrada.",
        409,
      );
    }

    throw error;
  }

  auth.upsertUserCredentials({
    user: { id: userId, email, displayName, status: "active" },
    passwordHash,
  });

  return auth.login({ email, password });
}

export function assertDemoAuthAllowed(
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  if (isDemoAuthAllowed(env)) {
    return;
  }

  throw new Error(
    "Demo authentication is blocked outside local/test environments. Configure production authentication or set AUTH_ALLOW_DEMO=true only for an explicit non-production demo.",
  );
}

export function isDemoAuthAllowed(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const nodeEnv = (env.NODE_ENV ?? "development").trim().toLowerCase();

  if (LOCAL_DEMO_ENVIRONMENTS.has(nodeEnv)) {
    return true;
  }

  return (env.AUTH_ALLOW_DEMO ?? "").trim().toLowerCase() === "true";
}

async function findUserCredentialsByEmail(email: string): Promise<AuthUserCredentials | undefined> {
  if (!process.env.DATABASE_URL) {
    return undefined;
  }

  const rows = await query<UserCredentialsRow>(
    `select "id", "email", "displayName", "status", "passwordHash"
     from "User"
     where lower("email") = lower($1)
     limit 1`,
    [normalizeEmail(email)],
  );
  const row = rows[0];

  return row ? mapUserCredentialsRow(row) : undefined;
}

function mapUserCredentialsRow(row: UserCredentialsRow): AuthUserCredentials {
  return {
    user: {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      status: row.status.toLowerCase() === "disabled" ? "disabled" : "active",
    },
    passwordHash: row.passwordHash,
  };
}

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeDisplayName(displayName: string): string {
  return displayName.trim().replace(/\s+/g, " ").slice(0, 160);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320;
}

function invalidCredentialsError(): AuthError {
  return new AuthError("AUTH_INVALID_CREDENTIALS", "Invalid email or password.");
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

function resolveSessionTtlMs(): number {
  const ttlMinutes = Number(process.env.AUTH_SESSION_TTL_MINUTES ?? 60);

  if (!Number.isFinite(ttlMinutes) || ttlMinutes <= 0) {
    return 60 * 60 * 1000;
  }

  return ttlMinutes * 60 * 1000;
}
