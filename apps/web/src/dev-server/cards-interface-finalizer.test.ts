import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { finalizeCardsInterface } from "./cards-interface-finalizer.js";

describe("cards interface finalizer", () => {
  it("adds an idempotent DOM controller for displayed results, search sizing and modal focus", () => {
    const html =
      '<html><body><main data-cards-interface-enhanced><input type="search" data-purchase-search /><p data-purchase-results-status></p><div class="purchase-list" aria-label="Compras da fatura"><details data-instrument-purchase-group open><article data-purchase-item></article></details><div data-purchase-filter-empty hidden></div></div><button data-reconciliation-toggle="reconciled">Conciliadas</button><button data-open-modal="purchase">Nova compra</button><dialog data-modal="purchase"><input name="amountMinor" /></dialog></main></body></html>';
    const finalized = finalizeCardsInterface(html);

    assert.match(finalized, /data-cards-interface-finalizer/);
    assert.match(finalized, /input\[data-purchase-search\]/);
    assert.match(finalized, /search\.style\.height = "44px"/);
    assert.match(finalized, /rowMatchesFilters/);
    assert.match(finalized, /rowIsDisplayed/);
    assert.match(finalized, /group\.open/);
    assert.match(finalized, /attributeFilter: \["hidden", "open"\]/);
    assert.match(finalized, /addEventListener\("toggle"/);
    assert.match(finalized, /setAttribute\("aria-rowcount", String\(displayedCount\)\)/);
    assert.match(finalized, /setAttribute\("autofocus", ""\)/);
    assert.match(finalized, /const modalOpeners = new WeakMap\(\)/);
    assert.match(finalized, /addEventListener\("close"/);
    assert.match(finalized, /modalOpeners\.set\(dialog, button\)/);
    assert.match(finalized, /opener\?\.isConnected/);
    assert.match(finalized, /window\.setTimeout/);
    assert.match(finalized, /input:not\(\[type=hidden\]\):not\(\[disabled\]\)/);
    assert.equal(finalizeCardsInterface(finalized), finalized);
  });
});
