import assert from "node:assert/strict";

import { evaluate } from "./cdp.mjs";

export async function inspectProtectedGroupSelection(cdp, groupId) {
  return evaluate(
    cdp,
    `(() => {
      const group = document.querySelector('[data-selection-entity="group"][value="${groupId}"]');
      if (!group || !group.checked) throw new Error('Selected group missing for protected-state test.');
      const original = group.dataset.reconcileProtected;
      group.dataset.reconcileProtected = 'true';
      group.dispatchEvent(new Event('change', { bubbles: true }));
      const bar = document.querySelector('[data-selection-bar]');
      const reconcile = bar.querySelector('[data-bulk-selection-action="reconcile"]');
      const unreconcile = bar.querySelector('[data-bulk-selection-action="unreconcile"]');
      const result = {
        groupProtected: group.dataset.reconcileProtected === 'true',
        reconcileDisabled: reconcile.disabled,
        unreconcileDisabled: unreconcile.disabled,
        reconcileTooltip: reconcile.getAttribute('data-tooltip'),
        unreconcileTooltip: unreconcile.getAttribute('data-tooltip'),
        clearDisabled: bar.querySelector('[data-selection-clear]').disabled,
        voidDisabled: bar.querySelector('[data-bulk-selection-action="void"]').disabled,
        help: bar.querySelector('[data-bulk-selection-help]').textContent.trim()
      };
      group.dataset.reconcileProtected = original || 'false';
      group.dispatchEvent(new Event('change', { bubbles: true }));
      return result;
    })()`,
  );
}

export async function selectMixed(cdp, created) {
  return evaluate(
    cdp,
    `(() => {
      const group = document.querySelector('[data-selection-entity="group"][value="${created.groupId}"]');
      const direct = document.querySelector('[data-select-transaction][value="${created.directId}"]');
      if (!group || !direct) throw new Error('Issue 530 rows were not found.');
      group.checked = true;
      group.dispatchEvent(new Event('change', { bubbles: true }));
      direct.checked = true;
      direct.dispatchEvent(new Event('change', { bubbles: true }));
      const bar = document.querySelector('[data-selection-bar]');
      return {
        hidden: bar.hidden,
        count: bar.querySelector('[data-selection-count]').textContent.trim(),
        total: bar.querySelector('[data-selection-total]').textContent.trim(),
        groupDisabled: document.querySelector('[data-group-open]').disabled,
        reconcileDisabled: bar.querySelector('[data-bulk-selection-action="reconcile"]').disabled,
        unreconcileDisabled: bar.querySelector('[data-bulk-selection-action="unreconcile"]').disabled,
        voidDisabled: bar.querySelector('[data-bulk-selection-action="void"]').disabled,
        help: bar.querySelector('[data-bulk-selection-help]').textContent.trim()
      };
    })()`,
  );
}

export async function readBarMetrics(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const bar = document.querySelector('[data-selection-bar]');
      const rect = bar.getBoundingClientRect();
      const parentRect = bar.parentElement.getBoundingClientRect();
      const computed = getComputedStyle(bar);
      return {
        barHeight: Math.round(rect.height),
        barWidth: Math.round(rect.width),
        barTop: Math.round(rect.top),
        barBottom: Math.round(rect.bottom),
        barScrollWidth: bar.scrollWidth,
        barClientWidth: bar.clientWidth,
        parentHeight: Math.round(parentRect.height),
        parentWidth: Math.round(parentRect.width),
        computedDisplay: computed.display,
        computedPosition: computed.position,
        computedBottom: computed.bottom,
        computedHeight: computed.height,
        computedWidth: computed.width,
        computedGridTemplateColumns: computed.gridTemplateColumns,
        visibleInViewport: rect.top >= 0 && rect.bottom <= window.innerHeight,
        bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    })()`,
  );
}

export async function readRenderedStatuses(cdp, created) {
  return evaluate(
    cdp,
    `(() => {
      const groupRow = document.querySelector('[data-group-row="${created.groupId}"]');
      const directInput = document.querySelector('[data-select-transaction][value="${created.directId}"]');
      const directRow = directInput?.closest('.statement-row');
      return {
        groupPresent: Boolean(groupRow),
        groupStatus: groupRow?.querySelector('.grouped-status > .statement-status:not(.transaction-group-state)')?.getAttribute('aria-label') || '',
        directStatus: directRow?.querySelector('.statement-status-control > summary .statement-status')?.getAttribute('aria-label') || ''
      };
    })()`,
  );
}

export async function readSelectionActionIcons(cdp) {
  return evaluate(
    cdp,
    `(() => Array.from(document.querySelectorAll(
      '.selection-bar .bulk-selection-actions > button'
    )).map((button) => {
      const circle = button.querySelector(".statement-status");
      const svg = circle?.querySelector("svg");
      const target = button.getBoundingClientRect();
      const shape = circle?.getBoundingClientRect();
      const glyph = svg?.getBoundingClientRect();
      return {
        action: button.dataset.bulkSelectionAction ||
          (button.hasAttribute("data-group-open") ? "group" : "clear"),
        disabled: button.disabled,
        insideToolbar: button.parentElement?.classList.contains("bulk-selection-actions"),
        label: button.getAttribute("aria-label"),
        title: button.getAttribute("title"),
        tooltip: button.getAttribute("data-tooltip"),
        text: button.textContent.trim(),
        iconCount: button.querySelectorAll("svg").length,
        circleClass: circle?.className || "",
        targetWidth: Math.round(target.width),
        targetHeight: Math.round(target.height),
        circleWidth: Math.round(shape?.width || 0),
        circleHeight: Math.round(shape?.height || 0),
        glyphWidth: Math.round(glyph?.width || 0),
        glyphHeight: Math.round(glyph?.height || 0)
      };
    }))()`,
  );
}

export function assertSelectionActionIcons(items, viewport) {
  assert.deepEqual(
    items.map((item) => item.action),
    ["reconcile", "unreconcile", "group", "clear", "void"],
    `${viewport}: toolbar order`,
  );
  assert.equal(items.length, 5, `${viewport}: action count`);
  for (const item of items) {
    assert.equal(item.insideToolbar, true, `${viewport}: unified toolbar`);
    assert.equal(item.text, "", `${viewport}: no visible label on ${item.action}`);
    assert.equal(item.iconCount, 1, `${viewport}: single SVG on ${item.action}`);
    assert.equal(item.targetWidth, 44);
    assert.equal(item.targetHeight, 44);
    assert.equal(item.circleWidth, 26);
    assert.equal(item.circleHeight, 26);
    assert.equal(item.glyphWidth, 15);
    assert.equal(item.glyphHeight, 15);
    assert.ok(item.label, `${viewport}: accessible label`);
    assert.equal(item.title, item.tooltip);
    assert.match(item.tooltip, new RegExp(item.label));
    assert.match(
      item.circleClass,
      item.action === "reconcile"
        ? /statement-status-ok/
        : item.action === "unreconcile"
          ? /statement-status-posted/
          : item.action === "void"
            ? /bulk-icon-danger/
            : /bulk-icon-neutral/,
    );
  }
}

/** Verify the selection and accessible feedback survive API and network errors. */
export async function verifyFailureFeedback(browser) {
  const serverFailure = await evaluate(
    browser.cdp,
    `(async () => {
      const originalFetch = window.fetch;
      window.confirm = () => true;
      window.fetch = async (input, init) => {
        if (String(input).includes('/api/transactions/bulk-actions')) {
          return new Response(JSON.stringify({ error: { message: 'Falha controlada para manter a seleção.' } }), {
            status: 409,
            headers: { 'content-type': 'application/json' }
          });
        }
        return originalFetch(input, init);
      };
      document.querySelector('[data-bulk-selection-action="reconcile"]').click();
      await new Promise((resolve) => setTimeout(resolve, 80));
      const result = {
        selectedCount: document.querySelectorAll('[data-select-transaction]:checked').length,
        status: document.querySelector('[data-bulk-selection-status]').textContent.trim(),
        ariaBusy: document.querySelector('[data-selection-bar]').getAttribute('aria-busy')
      };
      window.fetch = originalFetch;
      return result;
    })()`,
  );
  assert.equal(serverFailure.selectedCount, 2);
  assert.equal(serverFailure.status, "Falha controlada para manter a seleção.");
  assert.equal(serverFailure.ariaBusy, "false");

  const networkFailure = await evaluate(
    browser.cdp,
    `(async () => {
      const originalFetch = window.fetch;
      window.confirm = () => true;
      window.fetch = async (input, init) => {
        if (String(input).includes('/api/transactions/bulk-actions')) throw new TypeError('network unavailable');
        return originalFetch(input, init);
      };
      document.querySelector('[data-bulk-selection-action="reconcile"]').click();
      await new Promise((resolve) => setTimeout(resolve, 80));
      const result = {
        selectedCount: document.querySelectorAll('[data-select-transaction]:checked').length,
        status: document.querySelector('[data-bulk-selection-status]').textContent.trim(),
        ariaBusy: document.querySelector('[data-selection-bar]').getAttribute('aria-busy')
      };
      window.fetch = originalFetch;
      return result;
    })()`,
  );
  assert.equal(networkFailure.selectedCount, 2);
  assert.match(networkFailure.status, /verifique sua conexão e tente novamente/i);
  assert.equal(networkFailure.ariaBusy, "false");

  return { serverFailure, networkFailure };
}
