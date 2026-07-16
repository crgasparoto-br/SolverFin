import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const scripts = packageJson.scripts ?? {};

assert.equal(
  scripts["db:deploy"],
  "prisma migrate deploy --schema ./prisma",
  "db:deploy must keep using Prisma migrate deploy against the multifile schema",
);
assert.equal(
  scripts["start:web"],
  "npm run db:deploy && npm run start --workspace @solverfin/web",
  "start:web must apply pending migrations before starting the SSR server",
);

console.log("[startup-check] pending Prisma migrations run before the web server starts");
