import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { finalizeCardsInterface } from "./cards-interface-finalizer.js";

describe("cards interface finalizer", () => {
  it("adds native initial focus and a definitive mobile search target", () => {
    const html =
      '<html><head><title>Cartões de Crédito - SolverFin</title></head><body><main data-cards-interface-enhanced><dialog data-modal="purchase"><form><input type="hidden" name="currentPurchaseId" /><input name="amountMinor" /></form></dialog></main></body></html>';
    const finalized = finalizeCardsInterface(html);

    assert.match(finalized, /<input autofocus name="amountMinor"/);
    assert.match(finalized, /data-cards-interface-finalized/);
    assert.match(finalized, /purchase-search input\{\s+height:44px!important;/);
    assert.match(finalized, /min-height:44px!important;/);
    assert.equal(finalizeCardsInterface(finalized), finalized);
  });

  it("does not change unrelated pages", () => {
    const html =
      "<html><head><title>Outra tela - SolverFin</title></head><body><main></main></body></html>";
    assert.equal(finalizeCardsInterface(html), html);
  });
});
