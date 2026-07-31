import { randomUUID } from "node:crypto";

import { AuthError, type AuthenticatedUser } from "./auth.js";
import { auditSecurityEvent } from "./auth-service.js";
import { query, type QueryExecutor } from "./db.js";
import type { OidcIdentity } from "./oidc.js";

interface ExternalUserRow {
  id: string;
  email: string;
  displayName: string;
  status: string;
  externalAuthProvider: string | null;
  externalAuthSubject: string | null;
}

interface ResolveExternalIdentityOptions {
  correlationId?: string | undefined;
}

export async function resolveProductiveExternalIdentityUser(
  identity: OidcIdentity,
  executeQuery: QueryExecutor = query,
  options: ResolveExternalIdentityOptions = {},
): Promise<AuthenticatedUser> {
  const email = normalizeEmail(identity.email ?? "");
  const displayName = normalizeDisplayName(identity.displayName ?? email);

  if (!isValidEmail(email) || displayName.length === 0) throw invalidCredentialsError();

  const byIdentity = await findByExternalIdentity(
    executeQuery,
    identity.provider,
    identity.subject,
    true,
  );
  if (byIdentity) {
    await assertExternalUserIsActive(byIdentity, executeQuery, options);
    await updateExternalUserSnapshot(executeQuery, byIdentity.id, email, displayName);
    await ensureInitialFinancialProfile(executeQuery, byIdentity.id, displayName);
    return mapExternalUserRow({ ...byIdentity, email, displayName });
  }

  const byEmail = await findByEmail(executeQuery, email, true);
  if (byEmail) {
    await assertExternalUserIsActive(byEmail, executeQuery, options);

    if (hasExternalIdentity(byEmail)) {
      if (!matchesIdentity(byEmail, identity)) throw invalidCredentialsError();
      await updateExternalUserSnapshot(executeQuery, byEmail.id, email, displayName);
      await ensureInitialFinancialProfile(executeQuery, byEmail.id, displayName);
      return mapExternalUserRow({ ...byEmail, email, displayName });
    }

    const linked = await executeQuery<ExternalUserRow>(
      `update "User"
       set "externalAuthProvider" = $2,
           "externalAuthSubject" = $3,
           "displayName" = $4,
           "updatedAt" = CURRENT_TIMESTAMP
       where "id" = $1
         and "externalAuthProvider" is null
         and "externalAuthSubject" is null
       returning "id", "email", "displayName", "status", "externalAuthProvider", "externalAuthSubject"`,
      [byEmail.id, identity.provider, identity.subject, displayName],
    );

    const linkedUser = linked[0];
    if (!linkedUser) {
      const current = await findByEmail(executeQuery, email, true);
      if (!current || !matchesIdentity(current, identity)) throw invalidCredentialsError();
      await assertExternalUserIsActive(current, executeQuery, options);
      await ensureInitialFinancialProfile(executeQuery, current.id, displayName);
      return mapExternalUserRow({ ...current, email, displayName });
    }

    await ensureInitialFinancialProfile(executeQuery, linkedUser.id, displayName);
    return mapExternalUserRow({ ...linkedUser, email, displayName });
  }

  const userId = randomUUID();
  const inserted = await executeQuery<ExternalUserRow>(
    `insert into "User"
     ("id", "email", "displayName", "status", "passwordHash", "externalAuthProvider", "externalAuthSubject", "createdAt", "updatedAt")
     values ($1, $2, $3, 'ACTIVE', NULL, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     on conflict do nothing
     returning "id", "email", "displayName", "status", "externalAuthProvider", "externalAuthSubject"`,
    [userId, email, displayName, identity.provider, identity.subject],
  );

  const created = inserted[0];
  if (created) {
    await createInitialFinancialProfile(executeQuery, created.id, displayName);
    return mapExternalUserRow(created);
  }

  const concurrentIdentity = await findByExternalIdentity(
    executeQuery,
    identity.provider,
    identity.subject,
    true,
  );
  if (concurrentIdentity) {
    await assertExternalUserIsActive(concurrentIdentity, executeQuery, options);
    await ensureInitialFinancialProfile(executeQuery, concurrentIdentity.id, displayName);
    return mapExternalUserRow(concurrentIdentity);
  }

  const concurrentEmail = await findByEmail(executeQuery, email, true);
  if (!concurrentEmail || !matchesIdentity(concurrentEmail, identity)) {
    throw invalidCredentialsError();
  }

  await assertExternalUserIsActive(concurrentEmail, executeQuery, options);
  await ensureInitialFinancialProfile(executeQuery, concurrentEmail.id, displayName);
  return mapExternalUserRow(concurrentEmail);
}

async function findByExternalIdentity(
  executeQuery: QueryExecutor,
  provider: string,
  subject: string,
  lock: boolean,
): Promise<ExternalUserRow | undefined> {
  const rows = await executeQuery<ExternalUserRow>(
    `select "id", "email", "displayName", "status", "externalAuthProvider", "externalAuthSubject"
     from "User"
     where "externalAuthProvider" = $1 and "externalAuthSubject" = $2
     limit 1${lock ? " for update" : ""}`,
    [provider, subject],
  );
  return rows[0];
}

async function findByEmail(
  executeQuery: QueryExecutor,
  email: string,
  lock: boolean,
): Promise<ExternalUserRow | undefined> {
  const rows = await executeQuery<ExternalUserRow>(
    `select "id", "email", "displayName", "status", "externalAuthProvider", "externalAuthSubject"
     from "User"
     where lower("email") = lower($1)
     limit 1${lock ? " for update" : ""}`,
    [email],
  );
  return rows[0];
}

async function updateExternalUserSnapshot(
  executeQuery: QueryExecutor,
  userId: string,
  email: string,
  displayName: string,
): Promise<void> {
  await executeQuery(
    `update "User"
     set "email" = $2,
         "displayName" = $3,
         "updatedAt" = CURRENT_TIMESTAMP
     where "id" = $1`,
    [userId, email, displayName],
  );
}

async function ensureInitialFinancialProfile(
  executeQuery: QueryExecutor,
  userId: string,
  displayName: string,
): Promise<void> {
  const activeProfiles = await executeQuery<{ id: string }>(
    `select "id" from "FinancialProfile"
     where "ownerUserId" = $1 and "status" = 'ACTIVE'
     limit 1`,
    [userId],
  );

  if (activeProfiles.length === 0) {
    await createInitialFinancialProfile(executeQuery, userId, displayName);
  }
}

async function createInitialFinancialProfile(
  executeQuery: QueryExecutor,
  userId: string,
  displayName: string,
): Promise<void> {
  const organizationId = randomUUID();
  const financialProfileId = randomUUID();

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
}

async function assertExternalUserIsActive(
  row: ExternalUserRow,
  executeQuery: QueryExecutor,
  options: ResolveExternalIdentityOptions,
): Promise<void> {
  if (row.status.toLowerCase() !== "disabled") return;

  const revoked = await executeQuery<{ id: string }>(
    `update "ApplicationSession"
     set "revokedAt" = coalesce("revokedAt", CURRENT_TIMESTAMP),
         "revocationReason" = coalesce("revocationReason", 'user_disabled')
     where "userId" = $1 and "revokedAt" is null
     returning "id"`,
    [row.id],
  );

  await auditSecurityEvent({
    action: "user_disabled",
    result: "denied",
    userId: row.id,
    correlationId: options.correlationId,
    metadata: { revokedSessions: revoked.length },
  }).catch(() => undefined);

  throw new AuthError("AUTH_USER_DISABLED", "User is not active.", 403);
}

function hasExternalIdentity(row: ExternalUserRow): boolean {
  return row.externalAuthProvider !== null || row.externalAuthSubject !== null;
}

function matchesIdentity(row: ExternalUserRow, identity: OidcIdentity): boolean {
  return (
    row.externalAuthProvider === identity.provider && row.externalAuthSubject === identity.subject
  );
}

function mapExternalUserRow(row: ExternalUserRow): AuthenticatedUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    status: row.status.toLowerCase() === "disabled" ? "disabled" : "active",
  };
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
  return new AuthError("AUTH_INVALID_CREDENTIALS", "Invalid authentication provider response.");
}
