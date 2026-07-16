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
  /\.statement-row\.account-remuneration-row \.description\{[^}]*display:grid[^}]*grid-template-columns:max-content minmax\(0,1fr\)/,
);
assert.match(
  source,
  /\.statement-row\.account-remuneration-row \.description>strong\{grid-column:1;grid-row:1\}/,
);
assert.match(source, /\.account-remuneration-summary\{[^}]*grid-column:1 \/ -1[^}]*grid-row:2/);
assert.match(source, /\.account-remuneration-audit\{[^}]*grid-column:2[^}]*grid-row:1/);
assert.match(source, /\.account-remuneration-audit\[open\]\{grid-column:1 \/ -1;grid-row:3/);
assert.match(
  source,
  /<details class="account-remuneration-audit">[\s\S]*<span class="account-remuneration-summary">Competência/,
);
assert.match(
  source,
  /\.account-remuneration-audit summary\{[^}]*font-size:\.625rem[^}]*white-space:nowrap/,
);
assert.match(source, /\.account-remuneration-audit summary::after\{display:none\}/);
