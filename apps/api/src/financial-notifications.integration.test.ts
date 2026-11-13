import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { TenantContext } from "@solverfin/domain";
import type { PoolClient } from "pg";

import { closePool, getPool, query } from "./db.js";
import {
  countUnreadFinancialNotificationsForContext,
  getFinancialNotificationNavigationForContext,
  listFinancialNotificationPreferencesForContext,
  listFinancialNotificationsForContext,
  publishFinancialNotificationForContext,
  setFinancialNotificationPreferenceForContext,
  setFinancialNotificationReadStateForContext,
  type FinancialNotificationEvent,
} from "./financial-notifications.js";
import { retryFinancialNotificationDeliveryForContext } from "./financial-notification-outbox.js";
import { handleFinancialNotificationsApiRequest } from "./financial-notifications-router.js";
import { handleMvpApiRequest } from "./mvp.js";
import type { ApiRequest, ApiResponse } from "./router.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SEEDED_PROFILE_ID = "33333333-3333-4333-8333-333333333331";
const FIXTURE_TYPE = "financial.insight.available.v1";
const fixtures: TenantContext[] = [];
let additionalUserId: string | undefined;

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const context of fixtures.reverse()) await cleanup(context);
    if (additionalUserId) {
      await query('delete from "User" where "id"=$1', [additionalUserId]);
    }
    await closePool();
  });

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "An integration database is required");
  const organization = (
    await query<{ organizationId: string }>(
      'select "organizationId" from "FinancialProfile" where "id"=$1',
      [SEEDED_PROFILE_ID],
    )
  )[0]?.organizationId;
  assert.ok(organization);
  const context = await createProfile(organization, USER_ID);
  const other = await createProfile(organization, USER_ID);
  const token = await login();

  const initialPreferences = await listFinancialNotificationPreferencesForContext(context);
  assert.equal(initialPreferences.length, 12);
  assert.equal(initialPreferences.filter((p) => p.channel === "in_app" && p.enabled).length, 4);
  assert.equal(initialPreferences.filter((p) => p.channel !== "in_app" && p.enabled).length, 0);

  const event = fixture("1");
  const concurrent = await Promise.all(
    Array.from({ length: 6 }, () => publishFinancialNotificationForContext(context, event)),
  );
  assert.equal(
    concurrent.filter((row) => row.created).length,
    1,
    "concurrent publications are deduped",
  );
  const id = concurrent[0]?.notification?.id;
  assert.ok(id);
  assert.ok(concurrent.every((row) => row.notification?.id === id));
  const page = await listFinancialNotificationsForContext(context, { limit: 20, offset: 0 });
  assert.equal(page.total, 1);
  assert.equal(page.unreadCount, 1);
  assert.equal(page.items[0]?.id, id);
  assert.equal("fingerprint" in (page.items[0] ?? {}), false, "fingerprint remains private");
  assert.equal("organizationId" in (page.items[0] ?? {}), false);
  assert.equal(await countUnreadFinancialNotificationsForContext(context), 1);

  await assert.rejects(
    () =>
      publishFinancialNotificationForContext(context, {
        ...event,
        facts: { code: "insight_available", severity: "critical" },
      }),
    { code: "NOTIFICATION_FINGERPRINT_CONFLICT", statusCode: 409 },
  );
  assert.equal(
    (await listFinancialNotificationsForContext(context, { limit: 20, offset: 0 })).total,
    1,
  );
  await assert.rejects(
    () =>
      publishFinancialNotificationForContext(context, {
        ...fixture("missing-source"),
        resource: { kind: "ai_suggestion", id: randomUUID() },
      }),
    { statusCode: 404 },
  );
  assert.equal(
    (await listFinancialNotificationsForContext(context, { limit: 20, offset: 0 })).total,
    1,
  );

  const read = await setFinancialNotificationReadStateForContext(context, id, true);
  assert.ok(read.readAt);
  const repeatedRead = await setFinancialNotificationReadStateForContext(context, id, true);
  assert.equal(repeatedRead.readAt, read.readAt, "repeated read must not update its timestamp");
  assert.equal(await countUnreadFinancialNotificationsForContext(context), 0);
  await setFinancialNotificationReadStateForContext(context, id, false);
  await setFinancialNotificationReadStateForContext(context, id, false);
  assert.equal(await countUnreadFinancialNotificationsForContext(context), 1);
  assert.deepEqual(await getFinancialNotificationNavigationForContext(context, id), {
    available: false,
    href: null,
  });

  assert.equal(
    (await listFinancialNotificationsForContext(other, { limit: 20, offset: 0 })).total,
    0,
  );
  await assert.rejects(
    () => setFinancialNotificationReadStateForContext(other, id, true),
    { statusCode: 404 },
    "cross-profile mutations must fail closed",
  );
  await assert.rejects(() => getFinancialNotificationNavigationForContext(other, id), {
    statusCode: 404,
  });

  additionalUserId = randomUUID();
  await query(
    [
      'insert into "User" ("id","email","displayName","status","createdAt","updatedAt")',
      "values ($1,$2,$3,'ACTIVE',now(),now())",
    ].join(" "),
    [additionalUserId, "notifications-" + additionalUserId + "@example.invalid", "Test recipient"],
  );
  const foreignUser = { ...context, userId: additionalUserId };
  await assert.rejects(
    () => listFinancialNotificationsForContext(foreignUser, { limit: 20, offset: 0 }),
    { statusCode: 404 },
    "even an existing user in the same organization cannot read the owner profile",
  );
  await assert.rejects(
    () => publishFinancialNotificationForContext(foreignUser, fixture("forged")),
    { statusCode: 404 },
  );
  await assert.rejects(
    () =>
      setFinancialNotificationPreferenceForContext(foreignUser, {
        type: FIXTURE_TYPE,
        channel: "in_app",
        enabled: false,
      }),
    { statusCode: 404 },
  );

  const disabled = await setFinancialNotificationPreferenceForContext(context, {
    type: FIXTURE_TYPE,
    channel: "in_app",
    enabled: false,
  });
  assert.equal(disabled.enabled, false);
  const suppressed = await publishFinancialNotificationForContext(context, fixture("disabled"));
  assert.deepEqual(suppressed, { notification: null, created: false, suppressed: true });
  await setFinancialNotificationPreferenceForContext(context, {
    type: FIXTURE_TYPE,
    channel: "in_app",
    enabled: true,
  });
  assert.equal(
    (await publishFinancialNotificationForContext(context, fixture("enabled"))).created,
    true,
  );

  const externalType = "financial.invoice.due.v1";
  const externalFacts = { code: "invoice_due" as const, severity: "warning" as const };
  await setFinancialNotificationPreferenceForContext(context, {
    type: externalType,
    channel: "in_app",
    enabled: false,
  });
  const allDisabled: FinancialNotificationEvent = {
    ...fixture("all-disabled"),
    type: externalType,
    facts: externalFacts,
  };
  assert.deepEqual(await publishFinancialNotificationForContext(context, allDisabled), {
    notification: null,
    created: false,
    suppressed: true,
  });
  await setFinancialNotificationPreferenceForContext(context, {
    type: externalType,
    channel: "push",
    enabled: true,
  });
  const pushOnly: FinancialNotificationEvent = {
    ...fixture("push-only"),
    type: externalType,
    facts: externalFacts,
  };
  assert.deepEqual(await publishFinancialNotificationForContext(context, pushOnly), {
    notification: null,
    created: true,
    suppressed: false,
  });
  const pushOnlyRows = await query<{ id: string; inAppVisible: boolean }>(
    'select "id","inAppVisible" from "FinancialNotification" where "financialProfileId"=$1 and "fingerprint"=$2',
    [context.financialProfileId, pushOnly.fingerprint],
  );
  assert.equal(pushOnlyRows.length, 1);
  assert.equal(pushOnlyRows[0]?.inAppVisible, false);
  const pushOnlyId = pushOnlyRows[0]?.id;
  assert.ok(pushOnlyId);
  const pushOnlyChannels = await query<{ channel: string }>(
    'select "channel" from "FinancialNotificationDelivery" where "notificationId"=$1 order by "channel"',
    [pushOnlyId],
  );
  assert.deepEqual(
    pushOnlyChannels.map((row) => row.channel),
    ["push"],
  );
  assert.equal(
    (await listFinancialNotificationsForContext(context, { limit: 20, offset: 0 })).total,
    2,
  );
  assert.equal(await countUnreadFinancialNotificationsForContext(context), 2);
  await assert.rejects(
    () => setFinancialNotificationReadStateForContext(context, pushOnlyId, true),
    {
      statusCode: 404,
    },
  );
  await assert.rejects(() => getFinancialNotificationNavigationForContext(context, pushOnlyId), {
    statusCode: 404,
  });
  const hiddenReadResponse = await dispatch(
    token,
    "PATCH",
    "/api/notifications/" + pushOnlyId + "/read?profileId=" + context.financialProfileId,
    { read: true },
  );
  assert.equal(hiddenReadResponse.statusCode, 404);

  // A preference change cannot retroactively reveal an external-only event or enqueue a retry.
  await setFinancialNotificationPreferenceForContext(context, {
    type: externalType,
    channel: "in_app",
    enabled: true,
  });
  assert.deepEqual(await publishFinancialNotificationForContext(context, pushOnly), {
    notification: null,
    created: false,
    suppressed: false,
  });
  assert.equal(
    (await listFinancialNotificationsForContext(context, { limit: 20, offset: 0 })).total,
    2,
  );
  assert.deepEqual(
    (
      await query<{ channel: string }>(
        'select "channel" from "FinancialNotificationDelivery" where "notificationId"=$1',
        [pushOnlyId],
      )
    ).map((row) => row.channel),
    ["push"],
  );
  const external = await publishFinancialNotificationForContext(context, {
    ...fixture("push"),
    type: externalType,
    facts: { code: "invoice_due", severity: "warning", effectiveOn: "2026-11-22" },
  });
  assert.equal(external.created, true);
  const notificationId = external.notification?.id;
  assert.ok(notificationId);
  await setFinancialNotificationPreferenceForContext(context, {
    type: externalType,
    channel: "in_app",
    enabled: false,
  });
  assert.ok(
    (await listFinancialNotificationsForContext(context, { limit: 20, offset: 0 })).items.some(
      (item) => item.id === notificationId,
    ),
    "disabling in-app must not delete previously visible history",
  );
  await setFinancialNotificationPreferenceForContext(context, {
    type: externalType,
    channel: "in_app",
    enabled: true,
  });
  const delivery = (
    await query<{ id: string }>(
      'select "id" from "FinancialNotificationDelivery" where "notificationId"=$1 and "channel"=$2',
      [notificationId, "push"],
    )
  )[0]?.id;
  assert.ok(delivery);
  let calls = 0;
  const keys: string[] = [];
  const fakeAdapter = {
    channel: "push" as const,
    async deliver(payload: { idempotencyKey: string }) {
      calls += 1;
      keys.push(payload.idempotencyKey);
      if (calls === 1) throw new Error("provider payload must not be persisted");
    },
  };
  assert.equal(
    await retryFinancialNotificationDeliveryForContext(context, delivery, fakeAdapter),
    "disabled",
  );
  assert.equal(calls, 0, "external delivery must be disabled by default");
  const started = new Date("2035-01-01T00:00:00.000Z");
  assert.equal(
    await retryFinancialNotificationDeliveryForContext(context, delivery, fakeAdapter, {
      externalDeliveryEnabled: true,
      now: started,
    }),
    "retry",
  );
  assert.equal(
    await retryFinancialNotificationDeliveryForContext(context, delivery, fakeAdapter, {
      externalDeliveryEnabled: true,
      now: started,
    }),
    "not_due",
    "backoff is durable, not process memory",
  );
  assert.equal(
    await retryFinancialNotificationDeliveryForContext(context, delivery, fakeAdapter, {
      externalDeliveryEnabled: true,
      now: new Date("2035-01-01T00:03:00.000Z"),
    }),
    "delivered",
  );
  assert.equal(calls, 2);
  assert.deepEqual(keys, [delivery, delivery], "retry uses stable provider idempotency key");
  assert.equal(
    await retryFinancialNotificationDeliveryForContext(context, delivery, fakeAdapter, {
      externalDeliveryEnabled: true,
      now: new Date("2035-01-01T00:05:00.000Z"),
    }),
    "delivered",
  );
  assert.equal(calls, 2);

  const after = await query<{ lastErrorCode: string | null; state: string }>(
    'select "lastErrorCode","state" from "FinancialNotificationDelivery" where "id"=$1',
    [delivery],
  );
  assert.equal(after[0]?.state, "delivered");
  assert.equal(after[0]?.lastErrorCode, null);
  const restart = await publishFinancialNotificationForContext(context, {
    ...fixture("restart"),
    type: externalType,
    facts: { code: "invoice_due", severity: "warning" },
  });
  const restartId = (
    await query<{ id: string }>(
      'select "id" from "FinancialNotificationDelivery" where "notificationId"=$1',
      [restart.notification?.id],
    )
  )[0]?.id;
  assert.ok(restartId);
  await query(
    [
      'update "FinancialNotificationDelivery" set "state"=$2,',
      '"lockedUntil"=$3,"leaseToken"=$4 where "id"=$1',
    ].join(" "),
    [restartId, "leased", "2000-01-01T00:00:00.000Z", randomUUID()],
  );
  let restartCalls = 0;
  const restartAdapter = {
    channel: "push" as const,
    async deliver() {
      restartCalls += 1;
    },
  };
  assert.equal(
    await retryFinancialNotificationDeliveryForContext(context, restartId, restartAdapter, {
      externalDeliveryEnabled: true,
      now: new Date("2035-01-02T00:00:00.000Z"),
    }),
    "delivered",
    "expired lease is recoverable from durable state after restart",
  );
  assert.equal(restartCalls, 1);

  // Fault at the second authorization read, after a lease has been committed:
  // the old catch(() => false) incorrectly marked this delivery as disabled.
  const transient = await publishFinancialNotificationForContext(context, {
    ...fixture("transient-recheck"),
    type: externalType,
    facts: { code: "invoice_due", severity: "warning" },
  });
  const transientId = (
    await query<{ id: string }>(
      'select "id" from "FinancialNotificationDelivery" where "notificationId"=$1',
      [transient.notification?.id],
    )
  )[0]?.id;
  assert.ok(transientId);
  const pool = getPool();
  const originalQueries = new Map<PoolClient, PoolClient["query"]>();
  let scopeChecks = 0;
  let transientCalls = 0;
  const interceptAcquire = (client: PoolClient): void => {
    if (originalQueries.has(client)) return;
    const originalQuery = client.query;
    const realQuery = originalQuery.bind(client) as (
      sql: string,
      params?: readonly unknown[],
    ) => Promise<unknown>;
    originalQueries.set(client, originalQuery);
    client.query = ((sql: string, params?: readonly unknown[]) => {
      if (typeof sql === "string" && sql.includes('select p."id" from "FinancialProfile" p')) {
        scopeChecks += 1;
        if (scopeChecks === 2) {
          return Promise.reject(new Error("forced transient notification recheck outage"));
        }
      }
      return realQuery(sql, params);
    }) as PoolClient["query"];
  };
  const transientAdapter = {
    channel: "push" as const,
    async deliver() {
      transientCalls += 1;
    },
  };
  pool.on("acquire", interceptAcquire);
  try {
    await assert.rejects(
      () =>
        retryFinancialNotificationDeliveryForContext(context, transientId, transientAdapter, {
          externalDeliveryEnabled: true,
          now: new Date("2035-01-04T00:00:00.000Z"),
        }),
      /forced transient notification recheck outage/,
    );
  } finally {
    pool.off("acquire", interceptAcquire);
    for (const [client, originalQuery] of originalQueries) client.query = originalQuery;
  }
  assert.equal(scopeChecks, 2, "the injected outage must hit the post-lease recheck");
  assert.equal(transientCalls, 0, "no adapter can run after a failed authorization read");
  const leased = (
    await query<{ state: string; attempts: number; leaseToken: string | null }>(
      'select "state","attempts","leaseToken" from "FinancialNotificationDelivery" where "id"=$1',
      [transientId],
    )
  )[0];
  assert.equal(leased?.state, "leased", "transient failures must not disable a delivery");
  assert.equal(leased?.attempts, 1);
  assert.ok(leased?.leaseToken);
  assert.equal(
    await retryFinancialNotificationDeliveryForContext(context, transientId, transientAdapter, {
      externalDeliveryEnabled: true,
      now: new Date("2035-01-04T00:00:30.000Z"),
    }),
    "not_due",
    "an active durable lease must prevent concurrent retries",
  );
  assert.equal(
    await retryFinancialNotificationDeliveryForContext(context, transientId, transientAdapter, {
      externalDeliveryEnabled: true,
      now: new Date("2035-01-04T00:02:00.000Z"),
    }),
    "delivered",
    "an expired lease must be reclaimable after a transient database error",
  );
  assert.equal(transientCalls, 1);

  const revoked = await publishFinancialNotificationForContext(context, {
    ...fixture("revoked"),
    type: externalType,
    facts: { code: "invoice_due", severity: "info" },
  });
  const revokedId = (
    await query<{ id: string }>(
      'select "id" from "FinancialNotificationDelivery" where "notificationId"=$1',
      [revoked.notification?.id],
    )
  )[0]?.id;
  assert.ok(revokedId);
  await setFinancialNotificationPreferenceForContext(context, {
    type: externalType,
    channel: "push",
    enabled: false,
  });
  assert.equal(
    await retryFinancialNotificationDeliveryForContext(context, revokedId, restartAdapter, {
      externalDeliveryEnabled: true,
      now: new Date("2035-01-03T00:00:00.000Z"),
    }),
    "disabled",
  );
  assert.equal(restartCalls, 1);

  const apiList = await dispatch(
    token,
    "GET",
    "/api/notifications?profileId=" + context.financialProfileId,
  );
  assert.equal(apiList.statusCode, 200);
  // A-79302: assert the authenticated public response, after JSON serialization,
  // rather than only inspecting the internal projection or the HTTP status.
  const publicPage = JSON.parse(JSON.stringify(apiList.body)) as {
    items: Array<Record<string, unknown>>;
    total: number;
    unreadCount: number;
    nextOffset: number | null;
  };
  assert.deepEqual(
    Object.keys(publicPage).sort(),
    ["items", "total", "unreadCount", "nextOffset"].sort(),
  );
  assert.ok(publicPage.items.some((item) => item.id === id));
  const allowedPublicKeys = ["id", "type", "occurredAt", "createdAt", "readAt", "facts"];
  for (const item of publicPage.items) {
    assert.deepEqual(Object.keys(item).sort(), [...allowedPublicKeys].sort());
    assert.ok(item.facts && typeof item.facts === "object" && !Array.isArray(item.facts));
    assert.ok(
      Object.keys(item.facts).every((key) =>
        ["code", "severity", "currency", "amountMinor", "effectiveOn"].includes(key),
      ),
      "financial facts must use only the structured public contract",
    );
  }
  const assertNoPrivateFields = (payload: unknown): void => {
    const serialized = JSON.stringify(payload);
    for (const field of [
      "fingerprint",
      "organizationId",
      "financialProfileId",
      "recipientUserId",
      "resourceId",
      "resourceKind",
      "inAppVisible",
      "leaseToken",
    ]) {
      assert.ok(!serialized.includes('"' + field + '":'), `public payload leaked ${field}`);
    }
    for (const value of [
      event.fingerprint,
      context.userId,
      context.organizationId,
      context.financialProfileId,
    ]) {
      assert.ok(!serialized.includes(value), "public payload leaked private identity data");
    }
  };
  assertNoPrivateFields(publicPage);
  assert.throws(
    () => assertNoPrivateFields({ ...publicPage, fingerprint: event.fingerprint }),
    /public payload leaked fingerprint/,
    "negative control must detect a router projection regression",
  );
  const wrongPage = await dispatch(token, "GET", "/api/notifications?limit=0");
  assert.equal(wrongPage.statusCode, 400);
  const malicious = await dispatch(
    token,
    "PUT",
    "/api/notifications/preferences?profileId=" + context.financialProfileId,
    { type: FIXTURE_TYPE, channel: "in_app", enabled: true, userId: other.userId },
  );
  assert.equal(malicious.statusCode, 400);
  assertNoPrivateFields(JSON.parse(JSON.stringify(malicious.body)));
  const crossProfile = await dispatch(
    token,
    "PATCH",
    "/api/notifications/" + id + "/read?profileId=" + other.financialProfileId,
    { read: true },
  );
  assert.equal(crossProfile.statusCode, 404);
  assertNoPrivateFields(JSON.parse(JSON.stringify(crossProfile.body)));
  assertNoPrivateFields(JSON.parse(JSON.stringify(wrongPage.body)));
  const unauthenticated = await dispatch(
    "",
    "GET",
    "/api/notifications?profileId=" + context.financialProfileId,
  );
  assert.ok(unauthenticated.statusCode === 401 || unauthenticated.statusCode === 403);
  assertNoPrivateFields(JSON.parse(JSON.stringify(unauthenticated.body)));
  // A-79301: a real budget is navigable before deletion and safely unavailable afterwards.
  // This fixture runs after the existing count/idempotency assertions, leaving them unchanged.
  const sourceId = randomUUID();
  const sourceCategoryId = randomUUID();
  await query(
    [
      'insert into "Category"',
      '("id","organizationId","financialProfileId","name","kind","status","createdAt","updatedAt")',
      "values ($1,$2,$3,'Notification source fixture','EXPENSE','ACTIVE',now(),now())",
    ].join(" "),
    [sourceCategoryId, context.organizationId, context.financialProfileId],
  );
  await query(
    [
      'insert into "Budget"',
      '("id","organizationId","financialProfileId","categoryId","status","periodStartOn","periodEndOn",',
      '"plannedAmountMinor","currency","createdAt","updatedAt","createdByUserId","updatedByUserId")',
      "values ($1,$2,$3,$4,'ACTIVE','2026-11-01'::date,'2026-11-30'::date,10000,'BRL',now(),now(),$5,$5)",
    ].join(" "),
    [sourceId, context.organizationId, context.financialProfileId, sourceCategoryId, USER_ID],
  );
  const sourceEvent: FinancialNotificationEvent = {
    ...fixture("source-revocation"),
    type: "financial.budget.threshold.v1",
    facts: { code: "budget_threshold", severity: "warning" },
    resource: { kind: "budget", id: sourceId },
  };
  const publishedSource = await publishFinancialNotificationForContext(context, sourceEvent);
  const sourceNotificationId = publishedSource.notification?.id;
  assert.ok(sourceNotificationId, "an initially accessible resource must produce a notification");
  const navigationPath =
    "/api/notifications/" +
    sourceNotificationId +
    "/navigation?profileId=" +
    context.financialProfileId;
  const liveNavigation = await dispatch(token, "GET", navigationPath);
  assert.equal(liveNavigation.statusCode, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(liveNavigation.body)), {
    available: true,
    href: "/orcamentos",
  });
  const otherNavigation = await dispatch(
    token,
    "GET",
    "/api/notifications/" +
      sourceNotificationId +
      "/navigation?profileId=" +
      other.financialProfileId,
  );
  assert.equal(otherNavigation.statusCode, 404, "another profile cannot read the notification");
  assertNoPrivateFields(JSON.parse(JSON.stringify(otherNavigation.body)));

  // Deleting the source after a valid notification must never grant a stale link.
  await query('delete from "Budget" where "id"=$1', [sourceId]);
  await query('delete from "Category" where "id"=$1', [sourceCategoryId]);
  const removedNavigation = await dispatch(token, "GET", navigationPath);
  assert.equal(removedNavigation.statusCode, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(removedNavigation.body)), {
    available: false,
    href: null,
  });
  assert.deepEqual(
    await getFinancialNotificationNavigationForContext(context, sourceNotificationId),
    { available: false, href: null },
  );
  const survivingPage = await dispatch(
    token,
    "GET",
    "/api/notifications?profileId=" + context.financialProfileId,
  );
  assert.equal(survivingPage.statusCode, 200);
  assert.ok(
    (JSON.parse(JSON.stringify(survivingPage.body)) as { items: Array<{ id: string }> }).items.some(
      (item) => item.id === sourceNotificationId,
    ),
    "deleting the origin must not delete the delivered notification history",
  );
  assertNoPrivateFields(JSON.parse(JSON.stringify(survivingPage.body)));
  assert.ok(
    !JSON.stringify(survivingPage.body).includes(sourceEvent.fingerprint),
    "the source fingerprint must stay private after deletion",
  );

  // A-79304: full history remains reachable after the former 10,000-offset ceiling.
  // A single set-based insert keeps the PostgreSQL integration test inexpensive.
  const largeHistory = await createProfile(organization, USER_ID);
  await query(
    [
      'insert into "FinancialNotification"',
      '("id","organizationId","financialProfileId","recipientUserId","eventType",',
      '"fingerprint","facts","occurredAt","updatedAt")',
      "select gen_random_uuid(), $1, $2, $3, $4,",
      "'sha256-' || lpad(to_hex(n), 64, '0'),",
      `'{"code":"insight_available","severity":"info"}'::jsonb,`,
      "'2026-11-12T12:00:00.000Z'::timestamptz + n * interval '1 second', now()",
      "from generate_series(1, 10021) as n",
    ].join(" "),
    [largeHistory.organizationId, largeHistory.financialProfileId, USER_ID, FIXTURE_TYPE],
  );
  const largeHistoryPath =
    "/api/notifications?limit=20&profileId=" + largeHistory.financialProfileId;
  const firstDeepPage = await dispatch(token, "GET", largeHistoryPath + "&offset=10000");
  assert.equal(firstDeepPage.statusCode, 200);
  const deepPage = firstDeepPage.body as {
    total: number;
    items: unknown[];
    nextOffset: number | null;
  };
  assert.equal(deepPage.total, 10021);
  assert.equal(deepPage.items.length, 20);
  assert.equal(deepPage.nextOffset, 10020);
  const lastPage = await dispatch(
    token,
    "GET",
    largeHistoryPath + "&offset=" + deepPage.nextOffset,
  );
  assert.equal(lastPage.statusCode, 200, "the advertised next offset must be accepted");
  const lastPageBody = lastPage.body as {
    total: number;
    items: unknown[];
    nextOffset: number | null;
  };
  assert.equal(lastPageBody.total, 10021);
  assert.equal(lastPageBody.items.length, 1);
  assert.equal(
    lastPageBody.nextOffset,
    null,
    "the last page cannot advertise an inaccessible link",
  );
  assert.equal(
    (await dispatch(token, "GET", largeHistoryPath + "&offset=9007199254740992")).statusCode,
    400,
    "unsafe offsets must remain invalid",
  );
  assert.equal(
    (await dispatch(token, "GET", largeHistoryPath + "&offset=1e4")).statusCode,
    400,
    "non-decimal offsets must remain invalid",
  );
  const isolatedPage = await dispatch(
    token,
    "GET",
    "/api/notifications?limit=20&offset=10020&profileId=" + other.financialProfileId,
  );
  assert.equal(isolatedPage.statusCode, 200);
  assert.equal(
    (isolatedPage.body as { total: number }).total,
    0,
    "a different permitted profile cannot see this large history",
  );

  console.log(
    "Issue 693: persistence, isolation, idempotency, origin liveness, public JSON and deep pagination OK",
  );
}

function fixture(seed: string): FinancialNotificationEvent {
  return {
    type: FIXTURE_TYPE,
    fingerprint: "sha256-" + Buffer.from(seed).toString("hex").padEnd(64, "0").slice(0, 64),
    occurredAt: "2026-11-12T12:00:00.000Z",
    facts: { code: "insight_available", severity: "info" },
  };
}

async function createProfile(organizationId: string, userId: string): Promise<TenantContext> {
  const profileId = randomUUID();
  await query(
    [
      'insert into "FinancialProfile"',
      '("id","organizationId","ownerUserId","name","kind","status","createdAt","updatedAt")',
      "values ($1,$2,$3,$4,'PERSONAL','ACTIVE',now(),now())",
    ].join(" "),
    [profileId, organizationId, userId, "Notifications " + profileId],
  );
  const context: TenantContext = {
    userId,
    organizationId,
    financialProfileId: profileId,
    financialProfileKind: "personal",
  };
  fixtures.push(context);
  return context;
}

async function cleanup(context: TenantContext): Promise<void> {
  const params = [context.organizationId, context.financialProfileId];
  const scope = 'where "organizationId"=$1 and "financialProfileId"=$2';
  await query('delete from "FinancialNotificationDelivery" ' + scope, params);
  await query('delete from "FinancialNotificationPreference" ' + scope, params);
  await query('delete from "FinancialNotification" ' + scope, params);
  await query('delete from "AuditLogEntry" ' + scope, params);
  await query('delete from "FinancialProfile" where "organizationId"=$1 and "id"=$2', params);
}

async function login(): Promise<string> {
  const response = await handleMvpApiRequest({
    method: "POST",
    path: "/api/session",
    body: { email: "demo@solverfin.example.invalid", password: "SolverFinDemo!2026" },
  });
  assert.equal(response.statusCode, 201);
  return (response.body as { session: { token: string } }).session.token;
}

async function dispatch(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResponse> {
  const url = new URL(path, "https://solverfin.invalid");
  const request: ApiRequest = {
    method,
    pathname: url.pathname,
    query: url.searchParams,
    headers: token ? { authorization: "Bearer " + token } : {},
    body,
  };
  const response = await handleFinancialNotificationsApiRequest(request);
  assert.ok(response);
  return response;
}
