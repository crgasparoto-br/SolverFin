import assert from "node:assert/strict";
import { join } from "node:path";

import { evaluate, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";

export async function checkBudgetGoldenDialogs(cdp, baseUrl, outputDir) {
  const goldenDialogs = [];
  for (const viewport of [
    { width: 1366, height: 768, name: "desktop" },
    { width: 390, height: 844, name: "mobile" },
    { width: 320, height: 740, name: "compact-mobile" },
  ]) {
    await setViewport(cdp, viewport.width, viewport.height);
    await navigate(cdp, `${baseUrl}/orcamentos?currency=USD&status=active`);
    await sleep(200);
    const geometry = await evaluate(
      cdp,
      `(() => {
      const trigger = document.querySelector('[data-sf-dialog-open="new-budget-dialog"]');
      trigger?.click();
      const dialog = document.getElementById('new-budget-dialog');
      const panel = dialog?.querySelector('.sf-dialog-panel');
      const cancel = dialog?.querySelector('.budget-form-actions [data-sf-dialog-close]');
      const confirm = dialog?.querySelector('.budget-form-actions button[type="submit"]');
      cancel?.scrollIntoView({ block: 'nearest' });
      const rect = dialog?.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const expectedNeutral = getComputedStyle(document.querySelector('.sf-filter-bar')).backgroundColor;
      const primary = getComputedStyle(document.querySelector('.budget-primary-action')).backgroundColor;
      const cancelRect = cancel?.getBoundingClientRect();
      return {
        open: dialog?.open === true,
        centered: rect && Math.abs(rect.left - (viewportWidth - rect.right)) <= 18,
        contained: rect && rect.left >= -1 && rect.right <= viewportWidth + 2 && rect.top >= -1 && rect.bottom <= innerHeight + 2,
        scrollablePanel: Boolean(panel && getComputedStyle(panel).overflowY !== 'hidden'),
        cancelNeutral: Boolean(cancel && cancel.classList.contains('sf-button-secondary') && getComputedStyle(cancel).backgroundColor === expectedNeutral),
        confirmPrimary: Boolean(confirm && confirm.classList.contains('sf-button-primary') && getComputedStyle(confirm).backgroundColor === primary),
        cancelRect: cancelRect && { x: cancelRect.x, y: cancelRect.y, width: cancelRect.width, height: cancelRect.height },
      };
    })()`,
    );
    for (const check of [
      "open",
      "centered",
      "contained",
      "scrollablePanel",
      "cancelNeutral",
      "confirmPrimary",
    ]) {
      assert.equal(
        geometry[check],
        true,
        `Golden Screen modal ${check} failed at ${viewport.name}`,
      );
    }
    assert.ok(geometry.cancelRect?.width >= 44 && geometry.cancelRect?.height >= 40);
    await screenshot(cdp, join(outputDir, `issue-725-budget-create-dialog-${viewport.name}.png`));
    const { x, y, width, height } = geometry.cancelRect;
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: Math.round(x + width / 2),
      y: Math.round(y + height / 2),
    });
    await sleep(100);
    const modalStates = await evaluate(
      cdp,
      `(async () => {
      const dialog = document.getElementById('new-budget-dialog');
      const trigger = document.querySelector('[data-sf-dialog-open="new-budget-dialog"]');
      const cancel = dialog.querySelector('.budget-form-actions [data-sf-dialog-close]');
      const probe = document.createElement('div');
      probe.style.backgroundColor = 'var(--sf-color-neutral-control-hover)';
      document.body.append(probe);
      const expectedHover = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const hoverNeutral = cancel.matches(':hover') && getComputedStyle(cancel).backgroundColor === expectedHover;
      cancel.disabled = true;
      const disabledReducedOpacity = Number(getComputedStyle(cancel).opacity) < 1;
      cancel.disabled = false;
      cancel.click();
      await new Promise(resolve => setTimeout(resolve, 0));
      return { hoverNeutral, disabledReducedOpacity, canceled: !dialog.open, focusRestored: document.activeElement === trigger };
    })()`,
    );
    assert.deepEqual(
      modalStates,
      {
        hoverNeutral: true,
        disabledReducedOpacity: true,
        canceled: true,
        focusRestored: true,
      },
      `Golden Screen modal state failed at ${viewport.name}`,
    );
    goldenDialogs.push({ viewport: `${viewport.width}x${viewport.height}`, geometry, modalStates });
  }
  return goldenDialogs;
}
