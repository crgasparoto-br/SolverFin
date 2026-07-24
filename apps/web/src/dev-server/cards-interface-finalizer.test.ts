import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { finalizeCardsInterface } from "./cards-interface-finalizer.js";

describe("cards interface finalizer", () => {
  it("adds native initial focus and a definitive search target", () => {
    const html =
      '<html><body><main data-cards-interface-enhanced><input type="search" data-purchase-search /><dialog data-modal="purchase"><form><input name="amountMinor" data-money inputmode="decimal" /></form></dialog></main></body></html>';
    const finalized = finalizeCardsInterface(html);

    assert.match(
      finalized,
      /name="amountMinor" data-money autofocus data-cards-initial-focus/,
    );
    assert.match(finalized, /data-purchase-search data-cards-search-target/);
    assert.match(finalized, /style="height:44px;min-height:44px"/);
    assert.equal(finalizeCardsInterface(finalized), finalized);
  });
});
