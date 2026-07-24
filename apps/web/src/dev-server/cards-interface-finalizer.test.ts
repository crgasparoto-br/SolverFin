import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { finalizeCardsInterface } from "./cards-interface-finalizer.js";

describe("cards interface finalizer", () => {
  it("injects a reliable mobile target and immediate modal focus controller", () => {
    const html =
      '<html><body><main data-cards-interface-enhanced><button data-open-modal="purchase">Nova compra</button><dialog data-modal="purchase"><input name="amountMinor" /></dialog></main></body></html>';
    const finalized = finalizeCardsInterface(html);

    assert.match(finalized, /data-cards-interface-finalized/);
    assert.match(finalized, /purchase-search input\{\s+height:44px;\s+min-height:44px/);
    assert.match(finalized, /data-cards-interface-finalizer/);
    assert.match(finalized, /button\.addEventListener\("click", \(\) => \{/);
    assert.match(finalized, /textarea:not\(\[disabled\]\)/);
    assert.equal(finalizeCardsInterface(finalized), finalized);
  });

  it("does not change unrelated pages", () => {
    const html = "<html><body><main><h1>Outra tela</h1></main></body></html>";
    assert.equal(finalizeCardsInterface(html), html);
  });
});
