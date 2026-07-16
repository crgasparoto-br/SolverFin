import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const source = readFileSync(
  path.join(repoRoot, "apps", "web", "src", "dev-server", "list-sorting-enhancement.ts"),
  "utf8",
);

assert.match(
  source,
  /\.statement-row\.account-remuneration-row \.description\{display:block\}/,
);
assert.match(
  source,
  /\.account-remuneration-audit\{[^}]*display:inline-block[^}]*margin:0 0 0 6px/,
);
assert.match(
  source,
  /\.account-remuneration-audit\[open\]\{display:block;margin-left:0\}/,
);
assert.match(
  source,
  /<details class="account-remuneration-audit">[\s\S]*<span class="account-remuneration-summary">Competência/,
);
