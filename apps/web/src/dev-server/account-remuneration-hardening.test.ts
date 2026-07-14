import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const accountsEnhancement = readFileSync(
  path.join(repoRoot, "apps", "web", "src", "dev-server", "accounts-cards-enhancement.ts"),
  "utf8",
);
const statementEnhancement = readFileSync(
  path.join(repoRoot, "apps", "web", "src", "dev-server", "list-sorting-enhancement.ts"),
  "utf8",
);

assert.match(accountsEnhancement, /Remuneração da conta/);
assert.match(accountsEnhancement, /Percentual de remuneração sobre o CDI/);
assert.match(accountsEnhancement, /remunerationIndexKind/);
assert.match(accountsEnhancement, /\/api\/account-remuneration\/configurations\//);
assert.match(accountsEnhancement, /form\.addEventListener\("submit"[\s\S]*true\)/);
assert.match(accountsEnhancement, /Contas fora de BRL permanecem não elegíveis/);

assert.match(statementEnhancement, /transaction\.source !== "account_remuneration"/);
assert.match(statementEnhancement, /data-remuneration-protected/);
assert.match(statementEnhancement, /Somente valor, categoria, situação e data efetiva/);
assert.match(statementEnhancement, /clone\.remove\(\)/);
assert.match(statementEnhancement, /Remuneração CDI/);
