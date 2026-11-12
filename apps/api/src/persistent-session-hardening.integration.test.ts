import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

import { AuthError } from "./auth.js";
import { requireAuthenticatedRequest } from "./auth-service.js";
import { closePool, getPool, query } from "./db.js";
import {
  authenticatePersistentSession,
  logoutPersistentSession,
  renewPersistentSession,
} from "./persistent-session.js";

const productiveEnv = {
  NODE_ENV: "production",
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SESSION_IDLE_TIMEOUT_MINUTES: "30",
};

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL?.includes("solverfin_ci"));

  await validationLosesToConcurrentRotation();
  await validationLosesToConcurrentLogout();
  await validationLosesToConcurrentDisable();
  await rotationRollsBackWhenAuditFails();
  await logoutCommitsWhenAuditFails();
  await sessionEventsPreserveCorrelation();
  await disabledUserRejectionIsCorrelated();
}

async function validationLosesToConcurrentRotation(): Promise<void> {
  const fixture = await createSessionFixture("validation-rotation");
  await assertValidationRejectedAfterLockedChange(
    fixture,
    async (client) => {
      await client.query(`update "ApplicationSession" set "tokenHash" = $2 where "id" = $1`, [
        fixture.sessionId,
        hashToken("rotated-by-concurrent-request"),
      ]);
    },
    "AUTH_SESSION_INVALID",
  );
}

async function validationLosesToConcurrentLogout(): Promise<void> {
  const fixture = await createSessionFixture("validation-logout");
  await assertValidationRejectedAfterLockedChange(
    fixture,
    async (client) => {
      await client.query(
        `update "ApplicationSession"
         set "revokedAt" = CURRENT_TIMESTAMP, "revocationReason" = 'logout'
         where "id" = $1`,
        [fixture.sessionId],
      );
    },
    "AUTH_SESSION_INVALID",
  );
}

async function validationLosesToConcurrentDisable(): Promise<void> {
  const fixture = await createSessionFixture("validation-disable");
  await assertValidationRejectedAfterLockedChange(
    fixture,
    async (client) => {
      await client.query(
        `update "User" set "status" = 'DISABLED', "updatedAt" = CURRENT_TIMESTAMP where "id" = $1`,
        [fixture.userId],
      );
    },
    "AUTH_USER_DISABLED",
  );
}

async function assertValidationRejectedAfterLockedChange(
  fixture: SessionFixture,
  change: (client: PoolClient) => Promise<void>,
  expectedCode: string,
): Promise<void> {
  const client = await getPool().connect();
  let settled = false;

  try {
    await client.query("BEGIN");
    await client.query(`select "id" from "ApplicationSession" where "id" = $1 for update`, [
      fixture.sessionId,
    ]);

    const validation = requireAuthenticatedRequest(
      { cookie: cookieHeader(fixture.token) },
      productiveEnv,
    ).then(
      (value) => {
        settled = true;
        return { status: "fulfilled" as const, value };
      },
      (error: unknown) => {
        settled = true;
        return { status: "rejected" as const, error };
      },
    );

    await sleep(100);
    assert.equal(settled, false, "Validation should be waiting on the locked session row.");

    await change(client);
    await client.query("COMMIT");

    const outcome = await validation;
    if (outcome.status !== "rejected") {
      assert.fail("Session validation succeeded after a concurrent security transition.");
    }
    assert.ok(outcome.error instanceof AuthError);
    assert.equal(outcome.error.code, expectedCode);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function rotationRollsBackWhenAuditFails(): Promise<void> {
  const fixture = await createSessionFixture("rotation-audit-failure");
  await installAuditFailureTrigger("session_rotated");

  try {
    await assert.rejects(() =>
      renewPersistentSession(fixture.token, {
        env: productiveEnv,
        correlationId: "corr-rotation-audit-failure",
      }),
    );
  } finally {
    await removeAuditFailureTrigger();
  }

  const persisted = await query<{ tokenHash: string }>(
    `select "tokenHash" from "ApplicationSession" where "id" = $1`,
    [fixture.sessionId],
  );
  assert.equal(persisted[0]?.tokenHash, hashToken(fixture.token));
  assert.equal(
    (
      await authenticatePersistentSession(
        { cookie: cookieHeader(fixture.token) },
        { env: productiveEnv },
      )
    ).id,
    fixture.userId,
  );
}

async function logoutCommitsWhenAuditFails(): Promise<void> {
  const fixture = await createSessionFixture("logout-audit-failure");
  await installAuditFailureTrigger("logout");

  try {
    await logoutPersistentSession(fixture.token, {
      env: productiveEnv,
      correlationId: "corr-logout-audit-failure",
    });
  } finally {
    await removeAuditFailureTrigger();
  }

  const persisted = await query<{ revokedAt: Date | null; revocationReason: string | null }>(
    `select "revokedAt", "revocationReason" from "ApplicationSession" where "id" = $1`,
    [fixture.sessionId],
  );
  assert.ok(persisted[0]?.revokedAt);
  assert.equal(persisted[0]?.revocationReason, "logout");
  await assert.rejects(
    () =>
      authenticatePersistentSession(
        { cookie: cookieHeader(fixture.token) },
        { env: productiveEnv },
      ),
    (error) => error instanceof AuthError && error.code === "AUTH_SESSION_INVALID",
  );
}

async function sessionEventsPreserveCorrelation(): Promise<void> {
  const fixture = await createSessionFixture("correlation");
  const rotated = await renewPersistentSession(fixture.token, {
    env: productiveEnv,
    correlationId: "corr-session-rotation",
  });
  await logoutPersistentSession(rotated.token, {
    env: productiveEnv,
    correlationId: "corr-session-logout",
  });

  const events = await query<{ action: string; correlationId: string | null }>(
    `select "action", "correlationId"
     from "SecurityAuditEvent"
     where "sessionId" = $1 and "action" in ('session_rotated', 'logout')
     order by "occurredAt", "action"`,
    [fixture.sessionId],
  );

  assert.deepEqual(events, [
    { action: "session_rotated", correlationId: "corr-session-rotation" },
    { action: "logout", correlationId: "corr-session-logout" },
  ]);
}

async function disabledUserRejectionIsCorrelated(): Promise<void> {
  const fixture = await createSessionFixture("disabled-audit");
  await query(
    `update "User" set "status" = 'DISABLED', "updatedAt" = CURRENT_TIMESTAMP where "id" = $1`,
    [fixture.userId],
  );

  await assert.rejects(
    () =>
      authenticatePersistentSession(
        { cookie: cookieHeader(fixture.token) },
        {
          env: productiveEnv,
          correlationId: "corr-disabled-user",
        },
      ),
    (error) => error instanceof AuthError && error.code === "AUTH_USER_DISABLED",
  );

  const events = await query<{ correlationId: string | null }>(
    `select "correlationId"
     from "SecurityAuditEvent"
     where "userId" = $1 and "action" = 'user_disabled'
     order by "occurredAt" desc
     limit 1`,
    [fixture.userId],
  );
  assert.equal(events[0]?.correlationId, "corr-disabled-user");
}

interface SessionFixture {
  label: string;
  userId: string;
  sessionId: string;
  token: string;
}

async function createSessionFixture(label: string): Promise<SessionFixture> {
  const suffix = randomUUID();
  const userId = randomUUID();
  const sessionId = randomUUID();
  const token = `${label}-${suffix}`.replace(/-/g, "_");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);

  await query(
    `insert into "User"
     ("id", "email", "displayName", "passwordHash", "status", "createdAt", "updatedAt")
     values ($1, $2, $3, NULL, 'ACTIVE', $4, $4)`,
    [userId, `${label}-${suffix}@example.invalid`, `Issue 551 ${label}`, now],
  );
  await query(
    `insert into "ApplicationSession"
     ("id", "userId", "tokenHash", "transport", "createdAt", "lastSeenAt", "expiresAt")
     values ($1, $2, $3, 'cookie', $4, $4, $5)`,
    [sessionId, userId, hashToken(token), now, expiresAt],
  );

  return { label, userId, sessionId, token };
}

async function installAuditFailureTrigger(action: string): Promise<void> {
  await removeAuditFailureTrigger();
  await query(`
    create function "issue551RejectAudit"()
    returns trigger
    language plpgsql
    as $$
    begin
      if NEW."action" = '${action}' then
        raise exception 'issue 551 injected audit failure';
      end if;
      return NEW;
    end;
    $$
  `);
  await query(`
    create trigger "issue551_reject_audit"
    before insert on "SecurityAuditEvent"
    for each row execute function "issue551RejectAudit"()
  `);
}

async function removeAuditFailureTrigger(): Promise<void> {
  await query(`drop trigger if exists "issue551_reject_audit" on "SecurityAuditEvent"`);
  await query(`drop function if exists "issue551RejectAudit"()`);
}

function cookieHeader(token: string): string {
  return `__Host-solverfin_session=${token}`;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
