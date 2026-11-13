import assert from "node:assert/strict";
import test from "node:test";

import { waitForQueueRefresh } from "./issue-565-review-queue-waits.mjs";

test("review queue refresh waits for a completed response before using the selected card", async () => {
  let attempts = 0;
  const cdp = {
    async send(method, { expression }) {
      assert.equal(method, "Runtime.evaluate");
      assert.match(expression, /Fila atualizada/);
      attempts += 1;
      return { result: { value: { visible: attempts >= 2 } } };
    },
  };
  await waitForQueueRefresh(cdp);
  assert.equal(attempts, 2, "the first in-progress state cannot release the click");
});

test("review queue refresh rejects an unresolved load rather than silently proceeding", async () => {
  const cdp = {
    async send() {
      return { result: { value: { visible: false } } };
    },
  };
  await assert.rejects(
    waitForQueueRefresh(cdp, 1),
    /Review queue refresh did not finish before conflict validation/,
  );
});
