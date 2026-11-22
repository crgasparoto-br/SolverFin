import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

const DEMO_USER_ID = "11111111-1111-4111-8111-111111111111";
const DEMO_PROFILE_ID = "33333333-3333-4333-8333-333333333331";

/** Never write visual fixtures to a real user's or a general development database. */
export function assertSafeNotificationVisualDatabase(environment = process.env) {
  assert.equal(environment.NODE_ENV, "development", "Visual fixtures require development mode.");
  assert.equal(environment.AUTH_ALLOW_DEMO, "true", "Visual fixtures require demo authentication.");
  assert.ok(environment.DATABASE_URL, "Visual fixtures require an isolated database URL.");
  const url = new URL(environment.DATABASE_URL);
  assert.ok(
    ["postgres:", "postgresql:"].includes(url.protocol) &&
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
      decodeURIComponent(url.pathname) === "/solverfin_visual",
    "Visual fixtures are restricted to the local disposable solverfin_visual database.",
  );
}


/**
 * Remove every row belonging to the isolated temporary profile. Other
 * fixture flows may create additional categories in the same profile.
 * Deleting only the known fixture category leaves a foreign-key orphan.
 */
export async function deletePopulatedNotificationFixtureRows(query, { organizationId, profileId, budgetId }) {
  const scope = 'where "organizationId"=$1 and "financialProfileId"=$2';
  const params = [organizationId, profileId];
  for (const table of [
    "FinancialNotificationDelivery",
    "FinancialNotificationPreference",
    "AuditLogEntry",
    "FinancialNotification",
  ]) {
    await query('delete from "' + table + '" ' + scope, params);
  }
  await query(
    'delete from "Budget" where "id"=$1 and "organizationId"=$2 and "financialProfileId"=$3',
    [budgetId, organizationId, profileId],
  );
  // Delete *all* categories in this disposable profile, including defaults
  // added by profile initialization, before deleting the parent profile.
  await query('delete from "Category" ' + scope, params);
  await query('delete from "FinancialProfile" where "id"=$1 and "organizationId"=$2', [
    profileId,
    organizationId,
  ]);
}

/**
 * Populate a disposable financial profile through the existing internal publisher.
 * No event is created through a public HTTP route or in production.
 */
export async function createPopulatedNotificationFixtures() {
  assertSafeNotificationVisualDatabase();
  const { query, closePool } = await import("../../apps/api/dist/db.js");
  const { publishFinancialNotificationForContext, setFinancialNotificationReadStateForContext } =
    await import("../../apps/api/dist/financial-notifications.js");

  const profileId = randomUUID();
  const categoryId = randomUUID();
  const budgetId = randomUUID();
  let context;
  let profileCreated = false;

  async function cleanup() {
    if (!profileCreated || !context) return;
    await deletePopulatedNotificationFixtureRows(query, {
      organizationId: context.organizationId,
      profileId: context.financialProfileId,
      budgetId,
    });
    profileCreated = false;
  }

  try {
    const seeded = await query(
      'select "organizationId" from "FinancialProfile" where "id"=$1 and "ownerUserId"=$2',
      [DEMO_PROFILE_ID, DEMO_USER_ID],
    );
    const organizationId = seeded[0]?.organizationId;
    assert.ok(organizationId, "The seeded demo tenant is missing.");
    context = {
      userId: DEMO_USER_ID,
      organizationId,
      financialProfileId: profileId,
      financialProfileKind: "personal",
    };
    await query(
      [
        'insert into "FinancialProfile"',
        '("id","organizationId","ownerUserId","name","kind","status","createdAt","updatedAt")',
        "values ($1,$2,$3,'QA visual notifications','PERSONAL','ACTIVE',now(),now())",
      ].join(" "),
      [profileId, organizationId, DEMO_USER_ID],
    );
    profileCreated = true;
    await query(
      [
        'insert into "Category"',
        '("id","organizationId","financialProfileId","name","kind","status","createdAt","updatedAt")',
        "values ($1,$2,$3,'QA visual notifications','EXPENSE','ACTIVE',now(),now())",
      ].join(" "),
      [categoryId, organizationId, profileId],
    );
    await query(
      [
        'insert into "Budget"',
        '("id","organizationId","financialProfileId","categoryId","status","periodStartOn","periodEndOn",',
        '"plannedAmountMinor","currency","createdAt","updatedAt","createdByUserId","updatedByUserId")',
        "values ($1,$2,$3,$4,'ACTIVE','2026-11-01'::date,'2026-11-30'::date,120000,'BRL',now(),now(),$5,$5)",
      ].join(" "),
      [budgetId, organizationId, profileId, categoryId, DEMO_USER_ID],
    );
    const cases = [
      {
        key: "budget",
        type: "financial.budget.threshold.v1",
        facts: {
          code: "budget_threshold",
          severity: "warning",
          currency: "BRL",
          amountMinor: 123456789,
          effectiveOn: "2026-11-30",
        },
        resource: { kind: "budget", id: budgetId },
      },
      {
        key: "invoice",
        type: "financial.invoice.due.v1",
        facts: {
          code: "invoice_due",
          severity: "critical",
          currency: "USD",
          amountMinor: 8450,
          effectiveOn: "2026-12-15",
        },
      },
      {
        key: "insight",
        type: "financial.insight.available.v1",
        facts: { code: "insight_available", severity: "info" },
      },
    ];
    const ids = {};
    for (const [index, sample] of cases.entries()) {
      const event = {
        type: sample.type,
        fingerprint:
          "sha256-" +
          createHash("sha256")
            .update(profileId + ":" + sample.key)
            .digest("hex"),
        occurredAt: new Date(Date.UTC(2026, 10, 20, 12, 0, index)).toISOString(),
        facts: sample.facts,
        ...(sample.resource ? { resource: sample.resource } : {}),
      };
      const result = await publishFinancialNotificationForContext(context, event);
      assert.equal(result.created, true, "A visual notification was not published.");
      assert.ok(result.notification?.id, "The visual notification is not visible in-app.");
      ids[sample.key] = result.notification.id;
    }
    await setFinancialNotificationReadStateForContext(context, ids.insight, true);
    return {
      profileId,
      ids,
      count: cases.length,
      unreadCount: cases.length - 1,
      cleanup: async () => {
        try {
          await cleanup();
        } finally {
          await closePool();
        }
      },
    };
  } catch (error) {
    try {
      await cleanup();
    } finally {
      await closePool();
    }
    throw error;
  }
}
