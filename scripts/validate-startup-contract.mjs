import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const rootPackageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const webPackageJson = JSON.parse(
  await readFile(new URL("../apps/web/package.json", import.meta.url), "utf8"),
);
const rootScripts = rootPackageJson.scripts ?? {};
const webScripts = webPackageJson.scripts ?? {};

assert.equal(
  rootScripts["db:deploy"],
  "prisma migrate deploy --schema ./prisma",
  "db:deploy must keep using Prisma migrate deploy against the multifile schema",
);
assert.equal(
  rootScripts["start:web"],
  "npm run start --workspace @solverfin/web",
  "start:web must delegate to the web workspace start lifecycle",
);
assert.equal(
  webScripts.prestart,
  "npm --prefix ../.. run db:deploy",
  "the web workspace must apply pending migrations before starting the SSR server",
);
assert.equal(
  webScripts.start,
  "node dist/dev-server.js",
  "the web start lifecycle must execute the built SSR artifact after prestart",
);

console.log("[startup-check] pending Prisma migrations run before the web server starts");
