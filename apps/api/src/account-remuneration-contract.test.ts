import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = resolveRepoRoot();
const serviceSource = readFileSync(
  path.join(repoRoot, "apps", "api", "src", "repositories", "account-remuneration-service.ts"),
  "utf8",
);
const compatibilitySource = readFileSync(
  path.join(repoRoot, "apps", "api", "src", "repositories", "account-remuneration.ts"),
  "utf8",
);
const v2CompatibilitySource = readFileSync(
  path.join(repoRoot, "apps", "api", "src", "repositories", "account-remuneration-v2.ts"),
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

assert.match(serviceSource, /bcdata\.sgs\.12/);
assert.match(serviceSource, /on conflict \("kind", "referenceOn"\) do nothing/);
assert.match(serviceSource, /solverfin:cdi-import/);
assert.match(serviceSource, /FINANCIAL_INDEX_IMPORT_ALREADY_RUNNING/);
assert.match(serviceSource, /nenhuma consulta externa foi necessária/);
assert.match(serviceSource, /solverfin:account-remuneration/);
assert.match(serviceSource, /"effectiveOn" is not null/);
assert.match(serviceSource, /Rendimento previsto —/);
assert.match(serviceSource, /SKIPPED_NON_POSITIVE_BALANCE/);
assert.match(serviceSource, /SKIPPED_ZERO_AMOUNT/);
assert.match(serviceSource, /not exists \(\s*select 1 from "AccountRemuneration"/);

assert.match(compatibilitySource, /export \* from "\.\/account-remuneration-service\.js"/);
assert.doesNotMatch(compatibilitySource, /function processAccountRemunerations/);
assert.match(v2CompatibilitySource, /export \* from "\.\/account-remuneration-service\.js"/);
assert.doesNotMatch(v2CompatibilitySource, /function processAccountRemunerations/);

assert.match(migrationSource, /AccountRemuneration_competence_key/);
assert.match(migrationSource, /originalAmountMinor/);
assert.match(migrationSource, /manuallyAdjusted/);
assert.match(migrationSource, /Transaction_account_remuneration_adjustment_trigger/);

function resolveRepoRoot(): string {
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, "apps", "api"))) return cwd;
  const workspaceRoot = path.resolve(cwd, "..", "..");
  if (existsSync(path.join(workspaceRoot, "apps", "api"))) return workspaceRoot;
  throw new Error(`Unable to resolve repository root from ${cwd}.`);
}
