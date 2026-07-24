import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { finalizeCardsInterface } from "./cards-interface-finalizer.js";

describe("cards interface finalizer", () => {
  it("adds the single idempotent controller for results, search helpers and modal focus", () => {
    const html =
      '<html><body><main data-cards-interface-enhanced><input type="search" data-purchase-search /><button data-clear-purchase-search>Limpar</button><p data-purchase-results-status></p><div class="purchase-list" aria-label="Compras da fatura" role="table" aria-rowcount="1"><details data-instrument-purchase-group open><article data-purchase-item></article></details><div data-purchase-filter-empty hidden></div></div><button data-reconciliation-toggle="reconciled">Conciliadas</button><button data-reset-purchase-filters>Redefinir</button><button data-open-modal="purchase">Nova compra</button><dialog data-modal="purchase"><input name="amountMinor" /></dialog><script data-cards-interface-controller>legacy()</script></main></body></html>';
    const finalized = finalizeCardsInterface(html);

    assert.match(finalized, /data-cards-interface-finalizer/);
    assert.match(finalized, /input\[data-purchase-search\]/);
    assert.match(finalized, /search\.style\.height = "44px"/);
    assert.match(finalized, /rowMatchesFilters/);
    assert.match(finalized, /rowIsDisplayed/);
    assert.match(finalized, /group\.open/);
    assert.match(finalized, /let updateQueued = false/);
    assert.match(finalized, /if \(updateQueued\) return/);
    assert.match(finalized, /resultStatus\.textContent !== nextStatus/);
    assert.match(finalized, /attributeFilter: \["hidden", "open"\]/);
    assert.match(finalized, /addEventListener\("toggle"/);
    assert.match(finalized, /data-clear-purchase-search/);
    assert.match(finalized, /data-reset-purchase-filters/);
    assert.doesNotMatch(finalized, /aria-rowcount/);
    assert.doesNotMatch(finalized, /data-cards-interface-controller/);
    assert.match(finalized, /setAttribute\("autofocus", ""\)/);
    assert.match(finalized, /const modalOpeners = new WeakMap\(\)/);
    assert.match(finalized, /addEventListener\("close"/);
    assert.match(finalized, /modalOpeners\.set\(dialog, button\)/);
    assert.match(finalized, /opener\?\.isConnected/);
    assert.match(finalized, /window\.setTimeout/);
    assert.match(finalized, /input:not\(\[type=hidden\]\):not\(\[disabled\]\)/);
    assert.equal((finalized.match(/data-cards-interface-finalizer/g) ?? []).length, 1);
    assert.equal(finalizeCardsInterface(finalized), finalized);
  });
});
