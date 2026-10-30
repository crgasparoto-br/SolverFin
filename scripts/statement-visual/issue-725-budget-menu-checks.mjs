import assert from "node:assert/strict";
import { join } from "node:path";

import { evaluate, navigate, screenshot, sleep } from "./cdp.mjs";

/** Verify long-list popover layering, category prefill and exact-period selection in Chrome. */
export async function checkBudgetMenuPrefillPeriod(cdp, baseUrl, outputDir) {
  const menuForLayerCheck = await evaluate(
    cdp,
    `(() => {
      const root = Array.from(document.querySelectorAll('.budget-results [data-budget-action-menu]'))
        .find((item) => item.querySelector('[data-api-path$="/archive"]') &&
          item.closest('tr')?.nextElementSibling?.querySelector('[data-budget-action-menu]'));
      const trigger = root?.querySelector('[data-budget-menu-trigger]');
      trigger?.scrollIntoView({ block: 'start', inline: 'nearest' });
      return Boolean(trigger);
    })()`,
  );
  assert.equal(menuForLayerCheck, true, "Long list must include consecutive budget action menus");
  await sleep(160);
  const menuLayering = await evaluate(
    cdp,
    `(() => {
      const root = Array.from(document.querySelectorAll('.budget-results [data-budget-action-menu]'))
        .find((item) => item.querySelector('[data-api-path$="/archive"]') &&
          item.closest('tr')?.nextElementSibling?.querySelector('[data-budget-action-menu]'));
      const trigger = root.querySelector('[data-budget-menu-trigger]');
      trigger.click();
      const popup = root.querySelector('[data-budget-menu-popover]');
      const upperCell = root.closest('td');
      const lowerTrigger = root.closest('tr').nextElementSibling.querySelector('[data-budget-menu-trigger]');
      const lowerCell = lowerTrigger.closest('td');
      const box = popup.getBoundingClientRect();
      const lower = lowerTrigger.getBoundingClientRect();
      const left = Math.max(box.left, lower.left);
      const right = Math.min(box.right, lower.right);
      const top = Math.max(box.top, lower.top);
      const bottom = Math.min(box.bottom, lower.bottom);
      const overlapsNextTrigger = right - left > 2 && bottom - top > 2;
      const x = Math.round((left + right) / 2);
      const y = Math.round((top + bottom) / 2);
      const menuAboveTrigger = overlapsNextTrigger ? popup.contains(document.elementFromPoint(x, y)) : null;
      const upperZ = Number(getComputedStyle(upperCell).zIndex);
      const lowerZ = Number(getComputedStyle(lowerCell).zIndex);
      let negativeOccluded = null;
      if (overlapsNextTrigger) {
        const previous = upperCell.style.zIndex;
        upperCell.style.zIndex = '0';
        negativeOccluded = !popup.contains(document.elementFromPoint(x, y));
        upperCell.style.zIndex = previous;
      }
      return {
        opened: !popup.hidden,
        upperZ,
        lowerZ,
        overlapsNextTrigger,
        menuAboveTrigger,
        negativeOccluded,
        contained: box.left >= 0 && box.right <= innerWidth + 1 &&
          box.top >= 0 && box.bottom <= innerHeight + 1,
      };
    })()`,
  );
  assert.equal(menuLayering.opened, true, "Budget table action menu must open");
  assert.equal(menuLayering.contained, true, "Budget table action menu must stay within viewport");
  assert.ok(
    menuLayering.upperZ > menuLayering.lowerZ,
    "Open menu must paint above lower row actions",
  );
  if (menuLayering.overlapsNextTrigger) {
    assert.equal(
      menuLayering.menuAboveTrigger,
      true,
      "Next row action button obscures the open menu",
    );
    assert.equal(
      menuLayering.negativeOccluded,
      true,
      "Removing the stacking fix must expose the regression",
    );
  }
  await screenshot(cdp, join(outputDir, "issue-725-budgets-menu-layer-desktop.png"));

  const prefill = await evaluate(
    cdp,
    `(() => {
      const create = document.querySelector('.budget-results [data-budget-prefill-category-id]:not([data-budget-prefill-category-id=""])');
      const menu = create?.closest('[data-budget-action-menu]');
      const trigger = menu?.querySelector('[data-budget-menu-trigger]');
      const dialog = document.getElementById('new-budget-dialog');
      const category = dialog?.querySelector('select[name="categoryId"]');
      if (!create || !trigger || !dialog || !category) return { found: false };
      const chosen = create.getAttribute('data-budget-prefill-category-id');
      trigger.click();
      create.click();
      const selected = dialog.open && category.value === chosen;
      dialog.querySelector('[data-sf-dialog-close]').click();
      document.querySelector('.budget-primary-action[data-sf-dialog-open="new-budget-dialog"]')?.click();
      const reset = dialog.open && category.value === '';
      dialog.querySelector('[data-sf-dialog-close]').click();
      return { found: true, selected, reset };
    })()`,
  );
  assert.deepEqual(prefill, { found: true, selected: true, reset: true });

  const optionPeriod = await evaluate(
    cdp,
    `(() => {
      const options = Array.from(document.querySelectorAll('.budget-filter-form select[name="period"] option'));
      return options.find((option) => option.value)?.value ?? null;
    })()`,
  );
  assert.ok(optionPeriod, "Budget period filter must list registered exact periods");
  await navigate(cdp, `${baseUrl}/orcamentos?period=${encodeURIComponent(optionPeriod)}`);
  await sleep(200);
  const periodFilter = await evaluate(
    cdp,
    `(() => {
      const period = document.querySelector('.budget-filter-form select[name="period"]');
      return {
        selected: period?.value ?? null,
        active: document.querySelector('[data-budget-mobile-filters]')?.dataset.activeFilters === 'true',
        context: document.querySelector('.budget-filter-context')?.textContent?.includes('período'),
      };
    })()`,
  );
  assert.deepEqual(periodFilter, { selected: optionPeriod, active: true, context: true });
  await screenshot(cdp, join(outputDir, "issue-725-budgets-period-selected-desktop.png"));

  return { menuLayering, categoryPrefill: prefill, selectedPeriod: periodFilter };
}
