import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { screenshot } from "./cdp.mjs";
import { assertContextualSurface } from "./statement-contextual-assertions.mjs";
import { checkActionLabels } from "./statement-contextual-action-labels.mjs";

/** Records positive, negative and restored modal controls with the same browser. */
export function createContextualCapture(cdp, { outputDir, route, report, read, measure }) {
  return async (state, width, height, selector, extra = {}) => {
    const measured = await checkActionLabels(measure, read, report, state, width, height, selector);
    const file = `statement-contextual-${state}-${width}x${height}.png`;
    await screenshot(cdp, join(outputDir, file));
    const accessibilityFile = `statement-contextual-${state}-${width}x${height}-ax.json`;
    const accessibility = await cdp.send("Accessibility.getFullAXTree");
    await writeFile(
      join(outputDir, accessibilityFile),
      `${JSON.stringify({ subjectSha: report.subjectSha, route, state, viewport: { width, height }, ...accessibility }, null, 2)}\n`,
    );
    report.observations.push({
      state,
      viewport: { width, height },
      selector,
      measured,
      screenshot: file,
      accessibilityFile,
      ...extra,
    });
    const savedStyle = await read(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      const original = node.getAttribute('style');
      node.style.setProperty('position', 'fixed', 'important');
      node.style.setProperty('left', (innerWidth - 4) + 'px', 'important');
      node.style.setProperty('right', 'auto', 'important');
      node.style.setProperty('margin', '0', 'important');
      return original;
    })()`);
    let reason;
    try {
      const wrong = await measure(selector);
      assert.throws(
        () => assertContextualSurface(wrong, state, selector.startsWith("dialog")),
        (error) => {
          reason = error.message;
          return error.code === "ERR_ASSERTION";
        },
      );
    } finally {
      await read(`(() => {
        const node = document.querySelector(${JSON.stringify(selector)});
        const original = ${JSON.stringify(savedStyle)};
        if (original === null) node.removeAttribute('style');
        else node.setAttribute('style', original);
      })()`);
    }
    assertContextualSurface(await measure(selector), state, selector.startsWith("dialog"));
    if (state === "new" || state === "edit" || state === "clone") {
      const originalStyle = await read(`(() => {
        const node = document.querySelector(${JSON.stringify(selector)});
        const original = node.getAttribute("style");
        node.style.setProperty("inset", "auto", "important");
        node.style.setProperty("top", "50%", "important");
        node.style.setProperty("right", "16px", "important");
        // Keep the mobile negative case inside the viewport while making its offset measurable.
        if (innerWidth < 1100) {
          node.style.setProperty("width", "65vw", "important");
        }
        node.style.setProperty("margin", "0", "important");
        node.style.setProperty("transform", "translateY(-50%)", "important");
        return original;
      })()`);
      let centerError;
      try {
        const rightAnchored = await measure(selector);
        assert.equal(
          rightAnchored.inside,
          true,
          `${state}: negative control must remain inside viewport`,
        );
        assert.throws(
          () => assertContextualSurface(rightAnchored, state, true),
          (error) => {
            centerError = error.message;
            return error.code === "ERR_ASSERTION" && /horizontal center/.test(error.message);
          },
        );
      } finally {
        await read(`(() => {
          const node = document.querySelector(${JSON.stringify(selector)});
          const original = ${JSON.stringify(originalStyle)};
          if (original === null) node.removeAttribute("style");
          else node.setAttribute("style", original);
        })()`);
      }
      assertContextualSurface(await measure(selector), state, true);
      report.controls.push({
        id: "GS-CONTEXTUAL-NC-RIGHT-ALIGNED-" + state,
        viewport: { width, height },
        mutation: "Dialog right-aligned but entirely inside the viewport",
        rejectedBecause: centerError,
        restored: "passed",
      });
      const originalCancelStyle = await read(`(() => {
        const button = document.querySelector(${JSON.stringify(selector)}).querySelector('[data-transaction-cancel]');
        const original = button.getAttribute('style');
        button.style.setProperty('transform', 'translateX(-120px)', 'important');
        return original;
      })()`);
      let footerError;
      try {
        const clipped = await measure(selector);
        assert.throws(
          () => assertContextualSurface(clipped, state, true),
          (error) => {
            footerError = error.message;
            return error.code === "ERR_ASSERTION" && /footer actions/.test(error.message);
          },
        );
      } finally {
        await read(`(() => {
          const button = document.querySelector(${JSON.stringify(selector)}).querySelector('[data-transaction-cancel]');
          const original = ${JSON.stringify(originalCancelStyle)};
          if (original === null) button.removeAttribute('style');
          else button.setAttribute('style', original);
        })()`);
      }
      assertContextualSurface(await measure(selector), state, true);
      report.controls.push({
        id: "GS-CONTEXTUAL-NC-FOOTER-CLIPPED-" + state,
        viewport: { width, height },
        mutation: "Cancel button shifted outside the dialog content box without changing the row",
        rejectedBecause: footerError,
        restored: "passed",
      });
      for (const action of state === "edit" ? ["cancel", "save"] : ["cancel", "continue", "save"]) {
        const buttonSelector =
          action === "cancel"
            ? "[data-transaction-cancel]"
            : action === "continue"
              ? "[data-statement-save-continue]"
              : "[data-statement-save-primary]";
        const originalTouchStyle = await read(`(() => {
          const button = document.querySelector(${JSON.stringify(selector)}).querySelector(${JSON.stringify(buttonSelector)});
          const original = button.getAttribute("style");
          button.style.setProperty("min-height", "0px", "important");
          button.style.setProperty("height", "32px", "important");
          button.style.setProperty("max-height", "32px", "important");
          return original;
        })()`);
        let touchError;
        try {
          const tooSmall = await measure(selector);
          assert.equal(
            tooSmall.footerActionsContained,
            true,
            "Touch-height negative case must remain contained",
          );
          assert.ok(
            tooSmall.footerActionHeights[action] < 44,
            "Touch-height mutation must reduce the target",
          );
          assert.throws(
            () => assertContextualSurface(tooSmall, state, true),
            (error) => {
              touchError = error.message;
              return (
                error.code === "ERR_ASSERTION" &&
                error.message.includes(
                  action === "continue" ? "Continue touch target" : action + " footer touch target",
                )
              );
            },
          );
        } finally {
          await read(`(() => {
            const button = document.querySelector(${JSON.stringify(selector)}).querySelector(${JSON.stringify(buttonSelector)});
            const original = ${JSON.stringify(originalTouchStyle)};
            if (original === null) button.removeAttribute("style");
            else button.setAttribute("style", original);
          })()`);
        }
        assertContextualSurface(await measure(selector), state, true);
        report.controls.push({
          id: `GS-CONTEXTUAL-NC-FOOTER-TOUCH-${action.toUpperCase()}-${state}`,
          viewport: { width, height },
          mutation: `Footer ${action} touch target reduced to 32px without clipping or changing the action row`,
          rejectedBecause: touchError,
          restored: "passed",
        });
      }
    }
    report.controls.push({
      id: "GS-CONTEXTUAL-ANCHOR-" + state,
      viewport: { width, height },
      mutation: "Overlay anchored at viewport right instead of within viewport",
      rejectedBecause: reason,
      restored: "passed",
    });
  };
}
