import assert from "node:assert/strict";

import {
  assertExplicitRuntimeEnvironment,
  isLocalRuntimeEnvironment,
} from "./runtime-environment.js";

assert.equal(assertExplicitRuntimeEnvironment({ NODE_ENV: "production" }), "production");
assert.equal(assertExplicitRuntimeEnvironment({ NODE_ENV: " TEST " }), "test");
assert.equal(isLocalRuntimeEnvironment("development"), true);
assert.equal(isLocalRuntimeEnvironment("local"), true);
assert.equal(isLocalRuntimeEnvironment("test"), true);
assert.equal(isLocalRuntimeEnvironment("production"), false);

for (const value of [undefined, "", "preview", "staging", "prod"]) {
  assert.throws(
    () => assertExplicitRuntimeEnvironment({ NODE_ENV: value }),
    /NODE_ENV must be explicitly configured/,
  );
}
