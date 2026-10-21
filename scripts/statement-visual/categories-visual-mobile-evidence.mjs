import { join } from "node:path";

import { evaluate, screenshot, sleep } from "./cdp.mjs";

/** Capture the actual hierarchy below the toolbar, not just the initial mobile fold. */
export async function captureMobileHierarchyEvidence(cdp, viewport, { outputDir, check }) {
  const selection = await evaluate(
    cdp,
    `(() => {
    const items = [...document.querySelectorAll('[data-category-item]')];
    const chains = items.filter(item => item.dataset.categoryDepth === '2').map(leaf => {
      const child = leaf.parentElement?.closest('[data-category-item]');
      const root = child?.parentElement?.closest('[data-category-item]');
      return root && child ? [root, child, leaf] : null;
    }).filter(Boolean);
    chains.sort((a, b) =>
      (items.indexOf(a[2]) - items.indexOf(a[0])) -
      (items.indexOf(b[2]) - items.indexOf(b[0])));
    const chosen = chains[0];
    if (!chosen) return { indexes: [], names: [] };
    chosen[0].querySelector(':scope > .category-node-row').scrollIntoView({ block: 'start' });
    window.scrollBy(0, -96);
    return {
      indexes: chosen.map(item => items.indexOf(item)),
      names: chosen.map(item => item.querySelector(':scope > .category-node-row [data-edit-category]')?.dataset.categoryName),
    };
  })()`,
  );
  await sleep(160);
  const hierarchyVisible = await evaluate(
    cdp,
    `(() => {
    const items = [...document.querySelectorAll('[data-category-item]')];
    return ${JSON.stringify(selection.indexes)}.map((index, depth) => {
      const item = items[index];
      const row = item?.querySelector(':scope > .category-node-row');
      const menu = row?.querySelector('[data-category-menu-button]');
      const status = row?.querySelector('[data-category-status-icon]');
      const bounds = row?.getBoundingClientRect();
      const menuBounds = menu?.getBoundingClientRect();
      return {
        depth, name: row?.querySelector('[data-edit-category]')?.dataset.categoryName,
        inViewport: Boolean(bounds && bounds.top >= 72 && bounds.bottom <= innerHeight - 4),
        menuVisible: Boolean(menuBounds && menuBounds.left >= 0 && menuBounds.right <= innerWidth && menuBounds.width > 0),
        statusVisible: Boolean(status && status.getBoundingClientRect().width > 0),
      };
    });
  })()`,
  );
  const hierarchyScreenshot = `categories-${viewport}-hierarchy.png`;
  await screenshot(cdp, join(outputDir, hierarchyScreenshot));
  check(
    hierarchyVisible.length === 3 &&
      hierarchyVisible.every((row) => row.inViewport && row.menuVisible && row.statusVisible),
    `Mobile ${viewport} evidence does not expose all three hierarchy levels and actions`,
    { selection, hierarchyVisible },
  );

  const longest = await evaluate(
    cdp,
    `(() => {
    const items = [...document.querySelectorAll('[data-category-item]')];
    const item = items.sort((a, b) =>
      (b.querySelector(':scope > .category-node-row [data-edit-category]')?.dataset.categoryName.length || 0) -
      (a.querySelector(':scope > .category-node-row [data-edit-category]')?.dataset.categoryName.length || 0))[0];
    const row = item?.querySelector(':scope > .category-node-row');
    row?.scrollIntoView({ block: 'center' });
    return { name: row?.querySelector('[data-edit-category]')?.dataset.categoryName || '' };
  })()`,
  );
  await sleep(160);
  const longNameVisible = await evaluate(
    cdp,
    `(() => {
    const item = [...document.querySelectorAll('[data-category-item]')].find(item =>
      item.querySelector(':scope > .category-node-row [data-edit-category]')?.dataset.categoryName === ${JSON.stringify(longest.name)});
    const row = item?.querySelector(':scope > .category-node-row');
    const action = row?.querySelector('[data-category-menu-button]');
    const rect = row?.getBoundingClientRect();
    const button = action?.getBoundingClientRect();
    return Boolean(rect && rect.top >= 72 && rect.bottom <= innerHeight - 4 &&
      button && button.left >= 0 && button.right <= innerWidth);
  })()`,
  );
  const longNameScreenshot = `categories-${viewport}-long-name.png`;
  await screenshot(cdp, join(outputDir, longNameScreenshot));
  check(
    longest.name.length >= 25 && longNameVisible,
    `Mobile ${viewport} long-name evidence does not show the row and its action`,
    { longest, longNameVisible },
  );
  return {
    hierarchyScreenshots: [hierarchyScreenshot, longNameScreenshot],
    hierarchyEvidence: { selection, hierarchyVisible, longest, longNameVisible },
  };
}

