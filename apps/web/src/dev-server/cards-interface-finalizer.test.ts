import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { finalizeCardsInterface } from "./cards-interface-finalizer.js";

const deferredController = `        root.querySelectorAll("[data-open-modal]").forEach((button) => {
          button.addEventListener("click", () =>
            requestAnimationFrame(() => {
              const dialog = root.querySelector(
                'dialog[data-modal="' + button.dataset.openModal + '"]',
              );
              dialog
                ?.querySelector(
                  "input:not([type=hidden]):not([disabled]), select:not([disabled]), button:not([disabled])",
                )
                ?.focus();
            }),
          );
        });`;

describe("cards interface finalizer", () => {
  it("enforces the mobile search target and immediate modal focus", () => {
    const html = `<main data-cards-interface-enhanced><style>main[data-cards-interface-enhanced] .purchase-search input{min-height:44px}</style><script>${deferredController}</script></main>`;
    const finalized = finalizeCardsInterface(html);

    assert.match(finalized, /purchase-search input\{height:44px;min-height:44px\}/);
    assert.doesNotMatch(finalized, /requestAnimationFrame\(\(\) => \{\s+const dialog/);
    assert.match(finalized, /button\.addEventListener\("click", \(\) => \{\s+const dialog/);
    assert.equal(finalizeCardsInterface(finalized), finalized);
  });

  it("does not change unrelated pages", () => {
    const html = "<main><h1>Outra tela</h1></main>";
    assert.equal(finalizeCardsInterface(html), html);
  });
});
