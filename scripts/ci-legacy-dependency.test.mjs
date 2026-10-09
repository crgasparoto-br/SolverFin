import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("active CI workflows do not invoke the legacy orchestrator runtime", () => {
  const workflows = readdirSync(".github/workflows").filter((name) => /\.ya?ml$/.test(name));
  for (const name of workflows) {
    const body = readFileSync(join(".github/workflows", name), "utf8");
    assert.doesNotMatch(
      body,
      /(?:node|npm|npx|bash|sh|python(?:3)?)\s+[^\n#]*\.delivery-v2\//i,
      name,
    );
    assert.doesNotMatch(body, /delivery-orchestrator\/(?:src|scripts|bin)\//i, name);
  }
});

test("root npm scripts do not invoke the legacy runtime", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
    assert.doesNotMatch(
      command,
      /\.delivery-v2\/|delivery-orchestrator\/(?:src|scripts|bin)\//i,
      name,
    );
  }
});

test("workspace scripts do not invoke the legacy runtime", () => {
  for (const folder of ["apps", "packages"]) {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const filename = join(folder, entry.name, "package.json");
      let body;
      try {
        body = readFileSync(filename, "utf8");
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      const manifest = JSON.parse(body);
      for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
        assert.doesNotMatch(
          command,
          /[.]delivery-v2[/]|delivery-orchestrator[/](src|scripts|bin)[/]/i,
          filename + ":" + name,
        );
      }
    }
  }
});

test("STANDARD and CRITICAL formatting gates fail closed", () => {
  const workflow = readFileSync(".github/workflows/delivery-v2-ci.yml", "utf8");
  for (const [job, next] of [
    ["standard_validation", "critical_validation"],
    ["critical_validation", "gate"],
  ]) {
    const section = workflow.split(`  ${job}:\n`)[1]?.split(`  ${next}:\n`)[0];
    assert.ok(section, `${job} exists`);
    assert.match(section, /run: npm run format:check(?:\n|$)/);
    assert.doesNotMatch(section, /npm run format:check\\s*\\|\\|/);
  }
});
