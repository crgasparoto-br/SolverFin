import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

transactionsRoutePassesRequestUrlToRenderer();

function transactionsRoutePassesRequestUrlToRenderer(): void {
  const source = readFileSync(path.join(repoRoot, "apps", "web", "src", "dev-server.ts"), "utf8");

  assert.match(
    source,
    /url\.pathname === "\/lancamentos"[\s\S]*renderTransactionsPage\(token, url\)/,
    "the account statement route must pass the request URL so accountId and month filters are preserved",
  );
}
