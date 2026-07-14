import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const pageSource = readFileSync(
  path.join(repoRoot, "apps", "web", "src", "dev-server", "admin-financial-indexes-page.ts"),
  "utf8",
);

assert.match(pageSource, /Fonte oficial BCB SGS 12/);
assert.match(pageSource, /\/api\/admin\/financial-indexes\/cdi\/import/);
assert.match(pageSource, /\/api\/admin\/account-remunerations\/process/);
assert.match(pageSource, /A importação é idempotente/);
assert.match(pageSource, /Último processamento/);
assert.match(pageSource, /Falhas/);
