import assert from "node:assert/strict";

import { assertIntegrationDatabaseEnvironment } from "./assert-integration-database.mjs";

const safe = assertIntegrationDatabaseEnvironment({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://solverfin:secret@localhost:5432/solverfin_ci?schema=public",
});
assert.equal(safe.databaseName, "solverfin_ci");
assert.equal(safe.explicitlyAllowed, false);

assert.throws(
  () =>
    assertIntegrationDatabaseEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://solverfin:secret@localhost:5432/solverfin_ci",
    }),
  /NODE_ENV=test/,
);

assert.throws(
  () =>
    assertIntegrationDatabaseEnvironment({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://solverfin:secret@localhost:5432/solverfin",
    }),
  /Refusing destructive integration tests/,
);

const explicit = assertIntegrationDatabaseEnvironment({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://solverfin:secret@localhost:5432/disposable",
  SOLVERFIN_ALLOW_DESTRUCTIVE_INTEGRATION_TESTS: "true",
});
assert.equal(explicit.databaseName, "disposable");
assert.equal(explicit.explicitlyAllowed, true);

assert.throws(
  () => assertIntegrationDatabaseEnvironment({ NODE_ENV: "test", DATABASE_URL: "not-a-url" }),
  /valid PostgreSQL URL/,
);

console.log("[integration-db-guard-check] destructive integration database guard validated");
