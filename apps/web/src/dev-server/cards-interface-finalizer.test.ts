import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { finalizeCardsInterface } from "./cards-interface-finalizer.js";

describe("cards interface finalizer", () => {
  it("adds an idempotent DOM controller for search sizing and modal focus", () => {
    const html =
      '<html><body><main data-cards-interface-enhanced><input type="search" data-purchase-search /><button data-open-modal="purchase">Nova compra</button><dialog data-modal="purchase"><input name="amountMinor" /></dialog></main></body></html>';
    const finalized = finalizeCardsInterface(html);

    assert.match(finalized, /data-cards-interface-finalizer/);
    assert.match(finalized, /input\[data-purchase-search\]/);
    assert.match(finalized, /search\.style\.height = "44px"/);
    assert.match(finalized, /queueMicrotask/);
    assert.match(finalized, /input:not\(\[type=hidden\]\):not\(\[disabled\]\)/);
    assert.equal(finalizeCardsInterface(finalized), finalized);
  });
});
