import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { config } from "dotenv";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SAFE_DATABASE_NAME = /(^|[_-])(ci|test|tests|integration)([_-]|$)/i;

export function assertIntegrationDatabaseEnvironment(environment = process.env) {
  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required for integration tests. Use an isolated disposable test database.",
    );
  }

  if (environment.NODE_ENV !== "test") {
    throw new Error(
      "Integration tests are destructive and require NODE_ENV=test before any database access.",
    );
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL for integration tests.");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("Integration tests require a PostgreSQL DATABASE_URL.");
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  const explicitlyAllowed =
    environment.SOLVERFIN_ALLOW_DESTRUCTIVE_INTEGRATION_TESTS === "true";

  if (!SAFE_DATABASE_NAME.test(databaseName) && !explicitlyAllowed) {
    throw new Error(
      `Refusing destructive integration tests against database "${databaseName || "(empty)"}". ` +
        "Use a database name containing ci, test or integration, or explicitly set " +
        "SOLVERFIN_ALLOW_DESTRUCTIVE_INTEGRATION_TESTS=true only for a disposable database.",
    );
  }

  return { databaseName, explicitlyAllowed };
}

function loadRepositoryEnvironment() {
  if (process.env.DATABASE_URL) return;
  const envPath = resolve(repositoryRoot, ".env");
  if (existsSync(envPath)) config({ path: envPath });
}

function isDirectExecution() {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint) && import.meta.url === pathToFileURL(resolve(entrypoint)).href;
}

if (isDirectExecution()) {
  loadRepositoryEnvironment();
  const result = assertIntegrationDatabaseEnvironment();
  console.log(`[integration-db-guard] isolated database accepted: ${result.databaseName}`);
}
