import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { enhanceCardInstrumentSubtotals } from "./card-instrument-subtotals-enhancement.js";

function purchaseRow(id: string, instrumentId: string | undefined, amountMinor: number): string {
  const purchase = {
    id,
    cardId: "card-1",
    ...(instrumentId ? { cardInstrumentId: instrumentId } : {}),
    occurredOn: `2026-07-${id === "p1" ? "03" : id === "p2" ? "02" : "01"}`,
    description: id,
    amountMinor,
  };
  return `<article class="purchase-row" data-purchase-item data-reconciliation="reconciled" data-search="${id}"><strong>${id}</strong><script type="application/json" data-purchase="${id}">${JSON.stringify(purchase)}</script></article>`;
}

const html = `<!doctype html><html><head></head><body>
<input type="hidden" data-card-input value="card-1" />
<select name="cardInstrumentId"><option value="instrument-main" selected>Físico titular · final 1111</option></select>
<aside><section class="summary-block"><h2>Totais por cartão (R$)</h2><dl class="summary-list"><div class="summary-row"><dt>Cartão Principal - final 9999</dt><dd class="debit">-R$ 175,00</dd></div></dl></section></aside>
<div class="purchase-list" aria-label="Compras da fatura">${purchaseRow("p2", "instrument-main", 5000)}${purchaseRow("p1", "instrument-main", 10000)}${purchaseRow("p3", undefined, 2500)}</div>
</body></html>`;

describe("card instrument subtotals", () => {
  it("groups purchases and renders instrument subtotals", () => {
    const enhanced = enhanceCardInstrumentSubtotals(html);
    assert.match(enhanced, /data-instrument-purchase-group data-instrument-id="instrument-main"/);
    assert.match(enhanced, /2 compras/);
    assert.match(enhanced, /-R\$ 150,00/);
    assert.match(enhanced, /Sem instrumento identificado/);
    assert.match(enhanced, /-R\$ 25,00/);
  });

  it("lists instruments before the consolidated card total", () => {
    const enhanced = enhanceCardInstrumentSubtotals(html);
    const instrumentIndex = enhanced.indexOf('class="summary-row instrument-summary-row"');
    const totalIndex = enhanced.indexOf(
      'class="summary-row summary-row-strong instrument-card-total"',
    );
    assert.ok(instrumentIndex >= 0 && totalIndex > instrumentIndex);
    assert.match(enhanced, /Cartão Principal - final 9999 · Total/);
    assert.match(enhanced, /-R\$ 175,00/);
  });

  it("preserves the purchase order received from the sorting enhancement", () => {
    const enhanced = enhanceCardInstrumentSubtotals(html);
    const groupStart = enhanced.indexOf(
      'data-instrument-purchase-group data-instrument-id="instrument-main"',
    );
    const groupEnd = enhanced.indexOf("</details>", groupStart);
    const group = enhanced.slice(groupStart, groupEnd);
    assert.ok(group.indexOf('data-purchase="p2"') < group.indexOf('data-purchase="p1"'));
  });

  it("is idempotent and supports filters and archived instruments", () => {
    const enhanced = enhanceCardInstrumentSubtotals(html);
    assert.equal(enhanceCardInstrumentSubtotals(enhanced), enhanced);
    assert.match(enhanced, /MutationObserver/);
    assert.match(enhanced, /\/api\/credit-card-accounts\//);
  });
});
