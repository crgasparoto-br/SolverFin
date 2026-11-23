import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSafeNotificationVisualDatabase,
  deletePopulatedNotificationFixtureRows,
} from "./notification-populated-fixtures.mjs";

const disposable = {
  NODE_ENV: "development",
  AUTH_ALLOW_DEMO: "true",
  DATABASE_URL: "postgresql://solverfin:placeholder@localhost:5432/solverfin_visual?schema=public",
};

test("populated Chrome fixtures are allowed only in disposable local demo database", () => {
  assert.doesNotThrow(() => assertSafeNotificationVisualDatabase(disposable));
  for (const environment of [
    { ...disposable, NODE_ENV: "production" },
    { ...disposable, AUTH_ALLOW_DEMO: "false" },
    { ...disposable, DATABASE_URL: undefined },
    { ...disposable, DATABASE_URL: "postgresql://u:p@remote.example.invalid/solverfin_visual" },
    { ...disposable, DATABASE_URL: "postgresql://u:p@localhost/solverfin" },
    { ...disposable, DATABASE_URL: "file:///tmp/solverfin_visual" },
  ]) {
    assert.throws(() => assertSafeNotificationVisualDatabase(environment));
  }
});

test("visual fixture cleanup removes all profile categories, never other profiles", async () => {
  const organizationId = "org-visual";
  const profileId = "isolated-visual-profile";
  const budgetId = "visual-budget";
  const categories = [
    { id: "explicit-category", organizationId, profileId },
    { id: "generated-category", organizationId, profileId },
    { id: "other-profile-category", organizationId, profileId: "unrelated-profile" },
  ];
  const statements = [];
  let parentDeleted = false;
  await deletePopulatedNotificationFixtureRows(
    async (sql, params) => {
      statements.push({ sql, params });
      if (sql.startsWith('delete from "Category"')) {
        assert.equal(
          sql,
          'delete from "Category" where "organizationId"=$1 and "financialProfileId"=$2',
        );
        assert.deepEqual(params, [organizationId, profileId]);
        for (let index = categories.length - 1; index >= 0; index -= 1) {
          if (
            categories[index].organizationId === params[0] &&
            categories[index].profileId === params[1]
          ) {
            categories.splice(index, 1);
          }
        }
      }
      if (sql.startsWith('delete from "FinancialProfile"')) {
        assert.equal(
          categories.some(
            (item) => item.organizationId === organizationId && item.profileId === profileId,
          ),
          false,
          "a sibling category would prevent the profile deletion through the real foreign key",
        );
        assert.deepEqual(params, [profileId, organizationId]);
        parentDeleted = true;
      }
    },
    { organizationId, profileId, budgetId },
  );
  assert.equal(parentDeleted, true);
  assert.deepEqual(
    categories.map((item) => item.id),
    ["other-profile-category"],
  );
  assert.deepEqual(
    statements.map((statement) => statement.sql.match(/^delete from "([^"]+)"/)[1]),
    [
      "FinancialNotificationDelivery",
      "FinancialNotificationPreference",
      "AuditLogEntry",
      "FinancialNotification",
      "Budget",
      "Category",
      "FinancialProfile",
    ],
  );
  assert.deepEqual(statements[4].params, [budgetId, organizationId, profileId]);
});
