import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const pageSource = readFileSync(
  path.join(repoRoot, "apps", "web", "src", "dev-server", "account-remuneration-page.ts"),
  "utf8",
);

assert.match(pageSource, /Percentual de remuneração sobre o CDI/);
assert.match(pageSource, /\/api\/account-remuneration\/configurations\//);
assert.match(pageSource, /saldo final do dia anterior/);
assert.match(pageSource, /somente para contas em BRL/);
assert.match(pageSource, /categoryId/);
assert.match(pageSource, /method: "PUT"/);
