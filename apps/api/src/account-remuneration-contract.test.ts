import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const repositorySource = readFileSync(
  path.join(repoRoot, "apps", "api", "src", "repositories", "account-remuneration.ts"),
  "utf8",
);
const migrationSource = readFileSync(
  path.join(
    repoRoot,
    "prisma",
    "migrations",
    "20260714170000_add_cdi_account_remuneration",
    "migration.sql",
  ),
  "utf8",
);

assert.match(repositorySource, /bcdata\.sgs\.12/);
assert.match(repositorySource, /on conflict \("kind", "referenceOn"\) do nothing/);
assert.match(repositorySource, /pg_try_advisory_xact_lock/);
assert.match(repositorySource, /"effectiveOn" is not null/);
assert.match(repositorySource, /Rendimento previsto —/);
assert.match(repositorySource, /not exists \(\s*select 1 from "AccountRemuneration"/);

assert.match(migrationSource, /AccountRemuneration_competence_key/);
assert.match(migrationSource, /originalAmountMinor/);
assert.match(migrationSource, /manuallyAdjusted/);
assert.match(migrationSource, /Transaction_account_remuneration_adjustment_trigger/);
