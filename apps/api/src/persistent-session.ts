import { createHash, randomBytes, randomUUID } from "node:crypto";

import { AuthError, type AuthenticatedUser } from "./auth.js";
import { query, withTransaction, type QueryExecutor } from "./db.js";
import { readSessionCookie } from "./session-cookie.js";

const DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES = 30;
const LOGOUT_AUDIT_SAVEPOINT = "solverfin_logout_audit";

interface ActiveSessionRow {
  id: string;
  userId: string;
  expiresAt: Date;
  email: string;
  displayName: string;
}

interface RejectedSessionRow extends ActiveSessionRow {
  lastSeenAt: Date;
  revokedAt: Date | null;
  revocationReason: string | null;
  status: string;
}

interface SessionOperationOptions {
  env?: Readonly<Record<string, string | undefined>>;
  now?: Date;
  correlationId?: string | undefined;
}

export async function authenticatePersistentSession(
  headers: Readonly<Record<string, string | undefined>>,
  options: SessionOperationOptions = {},
): Promise<AuthenticatedUser> {
  const env = options.env ?? process.env;
  const token = readSessionCookie(headers.cookie, env);
  if (!token) {
    throw new AuthError("AUTH_SESSION_REQUIRED", "Authentication session is required.", 401);
  }
  if (!env.DATABASE_URL) {
    throw new AuthError("AUTH_SESSION_INVALID", "Authentication session is unavailable.", 503);
  }

  const now = options.now ?? new Date();
  const idleBoundary = new Date(now.getTime() - resolveSessionIdleTimeoutMs(env));
  const rows = await query<ActiveSessionRow>(
    `update "ApplicationSession" as session
     set "lastSeenAt" = $2
     from "User" as app_user
     where session."tokenHash" = $1
       and session."userId" = app_user."id"
       and session."revokedAt" is null
       and session."expiresAt" > $2
       and session."lastSeenAt" > $3
       and app_user."status" = 'ACTIVE'
     returning session."id", session."userId", session."expiresAt",
               app_user."email", app_user."displayName"`,
    [hashSessionToken(token), now, idleBoundary],
  );
  const session = rows[0];

  if (!session) {
    return rejectInactiveSession(token, now, idleBoundary, options.correlationId);
  }

  return {
    id: session.userId,
    email: session.email,
    displayName: session.displayName,
    status: "active",
  };
}

export async function renewPersistentSession(
  sessionToken: string,
  options: SessionOperationOptions = {},
): Promise<{ token: string; expiresAt: Date }> {
  const env = options.env ?? process.env;
  if (!env.DATABASE_URL) {
    throw new AuthError("AUTH_SESSION_INVALID", "Authentication session is unavailable.", 503);
  }

  const now = options.now ?? new Date();
  const nextToken = randomBytes(32).toString("base64url");
  const idleBoundary = new Date(now.getTime() - resolveSessionIdleTimeoutMs(env));

  return withTransaction(async (executeQuery) => {
    const rows = await executeQuery<ActiveSessionRow>(
      `update "ApplicationSession" as session
       set "tokenHash" = $2, "lastSeenAt" = $3
       from "User" as app_user
       where session."tokenHash" = $1
         and session."userId" = app_user."id"
         and session."revokedAt" is null
         and session."expiresAt" > $3
         and session."lastSeenAt" > $4
         and app_user."status" = 'ACTIVE'
       returning session."id", session."userId", session."expiresAt",
                 app_user."email", app_user."displayName"`,
      [hashSessionToken(sessionToken), hashSessionToken(nextToken), now, idleBoundary],
    );
    const session = rows[0];

    if (!session) {
      throw new AuthError("AUTH_SESSION_INVALID", "Authentication session is invalid.", 401);
    }

    await insertSecurityAuditEvent(executeQuery, {
      action: "session_rotated",
      result: "success",
      userId: session.userId,
      sessionId: session.id,
      correlationId: options.correlationId,
    });

    return { token: nextToken, expiresAt: session.expiresAt };
  });
}

export async function logoutPersistentSession(
  sessionToken: string,
  options: SessionOperationOptions = {},
): Promise<void> {
  const env = options.env ?? process.env;
  if (!env.DATABASE_URL) return;

  await withTransaction(async (executeQuery) => {
    const rows = await executeQuery<{ id: string; userId: string }>(
      `update "ApplicationSession"
       set "revokedAt" = coalesce("revokedAt", $2),
           "revocationReason" = coalesce("revocationReason", 'logout')
       where "tokenHash" = $1 and "revokedAt" is null
       returning "id", "userId"`,
      [hashSessionToken(sessionToken), options.now ?? new Date()],
    );
    const session = rows[0];
    if (!session) return;

    await executeQuery(`SAVEPOINT ${LOGOUT_AUDIT_SAVEPOINT}`);
    try {
      await insertSecurityAuditEvent(executeQuery, {
        action: "logout",
        result: "success",
        userId: session.userId,
        sessionId: session.id,
        correlationId: options.correlationId,
      });
      await executeQuery(`RELEASE SAVEPOINT ${LOGOUT_AUDIT_SAVEPOINT}`);
    } catch {
      await executeQuery(`ROLLBACK TO SAVEPOINT ${LOGOUT_AUDIT_SAVEPOINT}`);
      await executeQuery(`RELEASE SAVEPOINT ${LOGOUT_AUDIT_SAVEPOINT}`);
    }
  });
}

async function rejectInactiveSession(
  token: string,
  now: Date,
  idleBoundary: Date,
  correlationId: string | undefined,
): Promise<never> {
  const rows = await query<RejectedSessionRow>(
    `select session."id", session."userId", session."lastSeenAt", session."expiresAt",
            session."revokedAt", session."revocationReason",
            app_user."email", app_user."displayName", app_user."status"
     from "ApplicationSession" as session
     inner join "User" as app_user on app_user."id" = session."userId"
     where session."tokenHash" = $1
     limit 1`,
    [hashSessionToken(token)],
  );
  const session = rows[0];

  if (!session) {
    throw new AuthError("AUTH_SESSION_INVALID", "Authentication session is invalid.", 401);
  }

  if (session.status.toLowerCase() === "disabled") {
    await revokeSessionIfActive(session.id, "user_disabled", now);
    await auditSecurityEventBestEffort({
      action: "user_disabled",
      result: "denied",
      userId: session.userId,
      sessionId: session.id,
      correlationId,
      metadata: { reason: "user_disabled" },
    });
    throw new AuthError("AUTH_USER_DISABLED", "User is not active.", 403);
  }

  if (session.revokedAt !== null) {
    await auditSecurityEventBestEffort({
      action: "session_revoked_rejected",
      result: "denied",
      userId: session.userId,
      sessionId: session.id,
      correlationId,
      metadata: session.revocationReason ? { reason: session.revocationReason } : undefined,
    });
    throw new AuthError("AUTH_SESSION_INVALID", "Authentication session is invalid.", 401);
  }

  if (session.expiresAt.getTime() <= now.getTime()) {
    await revokeSessionIfActive(session.id, "expired", now);
    await auditSecurityEventBestEffort({
      action: "session_expired",
      result: "denied",
      userId: session.userId,
      sessionId: session.id,
      correlationId,
    });
    throw new AuthError("AUTH_SESSION_EXPIRED", "Authentication session expired.", 401);
  }

  if (session.lastSeenAt.getTime() <= idleBoundary.getTime()) {
    await revokeSessionIfActive(session.id, "idle_timeout", now);
    await auditSecurityEventBestEffort({
      action: "session_idle_timeout",
      result: "denied",
      userId: session.userId,
      sessionId: session.id,
      correlationId,
    });
    throw new AuthError("AUTH_SESSION_EXPIRED", "Authentication session expired.", 401);
  }

  throw new AuthError("AUTH_SESSION_INVALID", "Authentication session is invalid.", 401);
}

async function revokeSessionIfActive(id: string, reason: string, now: Date): Promise<void> {
  await query(
    `update "ApplicationSession"
     set "revokedAt" = coalesce("revokedAt", $2),
         "revocationReason" = coalesce("revocationReason", $3)
     where "id" = $1 and "revokedAt" is null`,
    [id, now, reason],
  );
}

async function auditSecurityEventBestEffort(input: SecurityAuditEventInput): Promise<void> {
  try {
    await insertSecurityAuditEvent(query, input);
  } catch {
    // Authentication decisions fail closed even when the audit sink is temporarily unavailable.
  }
}

interface SecurityAuditEventInput {
  action: string;
  result: string;
  userId?: string | undefined;
  sessionId?: string | undefined;
  correlationId?: string | undefined;
  metadata?: Readonly<Record<string, unknown>> | undefined;
}

async function insertSecurityAuditEvent(
  executeQuery: QueryExecutor,
  input: SecurityAuditEventInput,
): Promise<void> {
  await executeQuery(
    `insert into "SecurityAuditEvent"
     ("id", "userId", "sessionId", "occurredAt", "action", "result", "correlationId", "metadata")
     values ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6, $7)`,
    [
      randomUUID(),
      input.userId ?? null,
      input.sessionId ?? null,
      input.action,
      input.result,
      input.correlationId ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  );
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function resolveSessionIdleTimeoutMs(
  env: Readonly<Record<string, string | undefined>>,
): number {
  const value = Number(
    env.AUTH_SESSION_IDLE_TIMEOUT_MINUTES ?? DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES,
  );
  const minutes = Number.isFinite(value) && value > 0 ? value : DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES;
  return minutes * 60 * 1000;
}
