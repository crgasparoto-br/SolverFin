import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const rootPackageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const apiPackageJson = JSON.parse(
  await readFile(new URL("../apps/api/package.json", import.meta.url), "utf8"),
);
const webPackageJson = JSON.parse(
  await readFile(new URL("../apps/web/package.json", import.meta.url), "utf8"),
);
const rootScripts = rootPackageJson.scripts ?? {};
const apiScripts = apiPackageJson.scripts ?? {};
const webScripts = webPackageJson.scripts ?? {};

assert.equal(
  rootScripts["db:deploy"],
  "prisma migrate deploy --schema ./prisma",
  "db:deploy must keep using Prisma migrate deploy against the multifile schema",
);
assert.equal(
  rootScripts["start:api"],
  "npm run start --workspace @solverfin/api",
  "start:api must delegate to the API workspace start lifecycle",
);
assert.equal(
  apiScripts.prestart,
  "npm --prefix ../.. run db:deploy",
  "the API workspace must apply pending migrations before starting the backend server",
);
assert.equal(
  apiScripts.start,
  "node dist/server.js",
  "the API start lifecycle must execute the built backend artifact after prestart",
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

console.log("[startup-check] pending Prisma migrations run before API and web servers start");
