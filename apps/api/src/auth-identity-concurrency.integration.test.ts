import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { AuthError } from "./auth.js";
import { createPersistentApplicationSession } from "./auth-service.js";
import { closePool, query, withTransaction } from "./db.js";
import { resolveProductiveExternalIdentityUser } from "./external-identity.js";
import type { OidcIdentity } from "./oidc.js";

const provider = "https://cognito-idp.sa-east-1.amazonaws.com/sa-east-1_example";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL?.includes("solverfin_ci"));
  await validatesConcurrentCreationIsIdempotent();
  await validatesConflictingConcurrentLinkIsRejected();
  await validatesDisabledUserRevokesSessions();
}

async function validatesConcurrentCreationIsIdempotent(): Promise<void> {
  const suffix = randomUUID();
  const identity: OidcIdentity = {
    provider,
    subject: `same-subject-${suffix}`,
    email: `same-${suffix}@example.invalid`,
    displayName: "Concorrencia Idempotente",
  };

  const [first, second] = await Promise.all([
    withTransaction((executeQuery) =>
      resolveProductiveExternalIdentityUser(identity, executeQuery),
    ),
    withTransaction((executeQuery) =>
      resolveProductiveExternalIdentityUser(identity, executeQuery),
    ),
  ]);

  assert.equal(first.id, second.id);
  const users = await query<{ count: string }>(
    `select count(*)::text as count from "User"
     where "externalAuthProvider" = $1 and "externalAuthSubject" = $2`,
    [provider, identity.subject],
  );
  const organizations = await query<{ count: string }>(
    `select count(*)::text as count from "Organization" where "ownerUserId" = $1`,
    [first.id],
  );
  const profiles = await query<{ count: string }>(
    `select count(*)::text as count from "FinancialProfile" where "ownerUserId" = $1`,
    [first.id],
  );

  assert.equal(users[0]?.count, "1");
  assert.equal(organizations[0]?.count, "1");
  assert.equal(profiles[0]?.count, "1");
}

async function validatesConflictingConcurrentLinkIsRejected(): Promise<void> {
  const suffix = randomUUID();
  const userId = randomUUID();
  const email = `conflict-${suffix}@example.invalid`;
  await query(
    `insert into "User"
     ("id", "email", "displayName", "passwordHash", "status", "createdAt", "updatedAt")
     values ($1, $2, 'Usuario sem vinculo', NULL, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [userId, email],
  );

  const identities: OidcIdentity[] = [
    {
      provider,
      subject: `subject-a-${suffix}`,
      email,
      displayName: "Vinculo A",
    },
    {
      provider,
      subject: `subject-b-${suffix}`,
      email,
      displayName: "Vinculo B",
    },
  ];

  const outcomes = await Promise.allSettled(
    identities.map((identity) =>
      withTransaction((executeQuery) =>
        resolveProductiveExternalIdentityUser(identity, executeQuery),
      ),
    ),
  );
  const fulfilled = outcomes.filter(
    (outcome): outcome is PromiseFulfilledResult<{ id: string }> => outcome.status === "fulfilled",
  );
  const rejected = outcomes.filter(
    (outcome): outcome is PromiseRejectedResult => outcome.status === "rejected",
  );

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(
    rejected[0]?.reason instanceof AuthError &&
      rejected[0].reason.code === "AUTH_INVALID_CREDENTIALS",
  );

  const linked = await query<{
    externalAuthProvider: string | null;
    externalAuthSubject: string | null;
  }>(
    `select "externalAuthProvider", "externalAuthSubject" from "User" where "id" = $1`,
    [userId],
  );
  assert.equal(linked[0]?.externalAuthProvider, provider);
  assert.ok(identities.some((identity) => identity.subject === linked[0]?.externalAuthSubject));

  const organizations = await query<{ count: string }>(
    `select count(*)::text as count from "Organization" where "ownerUserId" = $1`,
    [userId],
  );
  const profiles = await query<{ count: string }>(
    `select count(*)::text as count from "FinancialProfile" where "ownerUserId" = $1`,
    [userId],
  );
  assert.equal(organizations[0]?.count, "1");
  assert.equal(profiles[0]?.count, "1");

  await assert.rejects(
    () =>
      query(
        `update "User" set "externalAuthSubject" = $2, "updatedAt" = CURRENT_TIMESTAMP where "id" = $1`,
        [userId, `replacement-${suffix}`],
      ),
    (error) => hasPgCode(error, "23514"),
  );
}

async function validatesDisabledUserRevokesSessions(): Promise<void> {
  const suffix = randomUUID();
  const userId = randomUUID();
  const identity: OidcIdentity = {
    provider,
    subject: `disabled-${suffix}`,
    email: `disabled-${suffix}@example.invalid`,
    displayName: "Usuario Desabilitado",
  };
  await query(
    `insert into "User"
     ("id", "email", "displayName", "passwordHash", "externalAuthProvider", "externalAuthSubject", "status", "createdAt", "updatedAt")
     values ($1, $2, $3, NULL, $4, $5, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [userId, identity.email, identity.displayName, provider, identity.subject],
  );

  const session = await createPersistentApplicationSession(
    {
      id: userId,
      email: identity.email ?? "",
      displayName: identity.displayName ?? "",
      status: "active",
    },
    query,
  );

  await query(
    `update "User" set "status" = 'DISABLED', "updatedAt" = CURRENT_TIMESTAMP where "id" = $1`,
    [userId],
  );

  const persisted = await query<{ revokedAt: Date | null; revocationReason: string | null }>(
    `select "revokedAt", "revocationReason" from "ApplicationSession" where "id" = $1`,
    [session.session.databaseId],
  );
  assert.ok(persisted[0]?.revokedAt);
  assert.equal(persisted[0]?.revocationReason, "user_disabled");

  await assert.rejects(
    () =>
      withTransaction((executeQuery) =>
        resolveProductiveExternalIdentityUser(identity, executeQuery),
      ),
    (error) => error instanceof AuthError && error.code === "AUTH_USER_DISABLED",
  );
}

function hasPgCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}
