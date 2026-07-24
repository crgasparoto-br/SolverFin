import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { finalizeCardsInterface } from "./cards-interface-finalizer.js";

describe("cards interface finalizer", () => {
  it("adds native initial focus and a definitive search target", () => {
    const html =
      '<html><head><title>Cartões de Crédito - SolverFin</title></head><body><main data-cards-interface-enhanced><input type="search" data-purchase-search /><dialog data-modal="purchase"><form><input type="hidden" name="currentPurchaseId" /><input name="amountMinor" /></form></dialog></main></body></html>';
    const finalized = finalizeCardsInterface(html);

    assert.match(finalized, /<input autofocus name="amountMinor"/);
    assert.match(finalized, /data-cards-search-target/);
    assert.match(finalized, /style="height:44px;min-height:44px"/);
    assert.equal(finalizeCardsInterface(finalized), finalized);
  });
});
