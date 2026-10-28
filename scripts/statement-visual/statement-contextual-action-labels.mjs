import assert from "node:assert/strict";

import { assertContextualSurface } from "./statement-contextual-assertions.mjs";

export async function checkActionLabels(measure, read, report, state, width, height, selector) {
  const measured = await measure(selector);
  assertContextualSurface(measured, state, selector.startsWith("dialog"));
  if (state === "new") {
    const originalLabel = await read(`(() => {
      const button = document.querySelector(${JSON.stringify(selector)}).querySelector('[data-statement-save-continue]');
      const original = button.textContent;
      button.textContent = "Salvar lançamento";
      return original;
    })()`);
    let rejectedBecause;
    try {
      const mislabeled = await measure(selector);
      assert.throws(
        () => assertContextualSurface(mislabeled, state, true),
        (error) => {
          rejectedBecause = error.message;
          return error.code === "ERR_ASSERTION" && /footer action labels/.test(error.message);
        },
      );
    } finally {
      await read(`(() => {
        document.querySelector(${JSON.stringify(selector)}).querySelector('[data-statement-save-continue]').textContent = ${JSON.stringify(originalLabel)};
      })()`);
    }
    assertContextualSurface(await measure(selector), state, true);
    report.controls.push({
      id: "GS-CONTEXTUAL-NC-CONTINUE-DUPLICATE-LABEL",
      viewport: { width, height },
      mutation: "Save and continue mislabeled as the primary Save action",
      rejectedBecause,
      restored: "passed",
    });
  }
  return measured;
}
