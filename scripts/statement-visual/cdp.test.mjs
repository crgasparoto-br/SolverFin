import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { screenshot } from "./cdp.mjs";

test("screenshot retries one transient Chrome compositor timeout and preserves evidence", async () => {
  const dir = await mkdtemp(join(tmpdir(), "solverfin-cdp-test-"));
  const path = join(dir, "dashboard.png");
  const expected = Buffer.from("mock-png-bytes");
  let calls = 0;
  const cdp = {
    async send(method, params) {
      assert.equal(method, "Page.captureScreenshot");
      assert.equal(params.format, "png");
      calls += 1;
      if (calls === 1) throw new Error("CDP command timeout: Page.captureScreenshot");
      return { data: expected.toString("base64") };
    },
  };

  try {
    await screenshot(cdp, path);
    assert.equal(calls, 2);
    assert.deepEqual(await readFile(path), expected);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("screenshot fails closed when Chrome repeatedly times out", async () => {
  let calls = 0;
  const cdp = {
    async send() {
      calls += 1;
      throw new Error("CDP command timeout: Page.captureScreenshot");
    },
  };
  await assert.rejects(
    screenshot(cdp, "unused.png"),
    /CDP command timeout: Page.captureScreenshot/,
  );
  assert.equal(calls, 2);
});

test("screenshot does not retry non-transient Chrome protocol errors", async () => {
  let calls = 0;
  const cdp = {
    async send() {
      calls += 1;
      throw new Error("Invalid CDP target");
    },
  };
  await assert.rejects(screenshot(cdp, "unused.png"), /Invalid CDP target/);
  assert.equal(calls, 1);
});
