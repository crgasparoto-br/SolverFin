import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("active CI workflows do not invoke the legacy orchestrator runtime", () => {
  const workflows = readdirSync(".github/workflows").filter((name) => /\\.ya?ml$/.test(name));
  for (const name of workflows) {
    const body = readFileSync(join(".github/workflows", name), "utf8");
    assert.doesNotMatch(body, /(?:node|npm|npx|bash|sh|python(?:3)?)\\s+[^\\n#]*\\.delivery-v2\\//i, name);
    assert.doesNotMatch(body, /delivery-orchestrator\\/(?:src|scripts|bin)\\//i, name);
  }
});
