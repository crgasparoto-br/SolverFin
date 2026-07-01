import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const currentDir = dirname(fileURLToPath(import.meta.url));

const migratedShellModules = [
  "accounts-cards-page.js",
  "payables-receivables-page.js",
  "settings-page.js",
] as const;

describe("migrated SSR shell pages", () => {
  for (const moduleFileName of migratedShellModules) {
    it(`${moduleFileName} keeps using the shared authenticated shell`, () => {
      const source = readFileSync(join(currentDir, moduleFileName), "utf8");

      assert.match(source, /renderAuthenticatedShellDocument/);
      assert.doesNotMatch(source, /data-logout/);
      assert.doesNotMatch(source, /privateRoutes/);
    });
  }
});
