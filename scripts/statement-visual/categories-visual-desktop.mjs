import process from "node:process";
import assert from "node:assert/strict";
import { join } from "node:path";
import { evaluate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { state } from "./categories-visual-state.mjs";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const check = (...args) => state.check(...args);
const waitForCategories = (...args) => state.waitForCategories(...args);
const waitForModal = (...args) => state.waitForModal(...args);
const closeModal = (...args) => state.closeModal(...args);
const pageMeasurementExpression = (...args) => state.pageMeasurementExpression(...args);
const modalMeasurementExpression = (...args) => state.modalMeasurementExpression(...args);

export async function validateDesktop(cdp) {
  await setViewport(cdp, 1440, 1000);
  await waitForCategories(cdp);
  const measurements = await evaluate(cdp, pageMeasurementExpression());
  await screenshot(cdp, join(outputDir, "categories-desktop.png"));

  check(
    measurements.viewport.width === 1440,
    "Categories desktop viewport is not 1440px",
    measurements,
  );
  check(
    measurements.noHorizontalOverflow,
    "Categories desktop page has horizontal overflow",
    measurements,
  );
  check(
    measurements.summaryCount === 4,
    "Categories semantic overview does not have four indicators",
    measurements,
  );
  check(
    measurements.filterCount === 5,
    "Categories toolbar does not have five filters",
    measurements,
  );
  check(measurements.search.visible, "Categories search is not visible on desktop", measurements);
  check(
    measurements.directory.visible,
    "Categories directory is not visible on desktop",
    measurements,
  );
  check(
    measurements.allFilterPressed,
    "All categories filter is not selected initially",
    measurements,
  );
  check(measurements.rowCount > 0, "Categories hierarchy rendered no rows", measurements);
  check(
    measurements.semanticLists > 0,
    "Category hierarchy lost native list semantics",
    measurements,
  );
  check(
    measurements.nestedLists > 0,
    "Category hierarchy lost nested parent-child lists",
    measurements,
  );
  check(
    measurements.minimumRowHeight >= 44,
    "Category rows are smaller than the interaction target",
    measurements,
  );

  check(measurements.headerCount === 3, "Desktop lost compact column headers", measurements);
  check(
    measurements.parentCellCount === measurements.rowCount &&
      measurements.levelCellCount === measurements.rowCount &&
      measurements.statusCellCount === measurements.rowCount,
    "Categories lost parent, level or situation columns",
    measurements,
  );
  check(
    measurements.compactRowHeight <= 56,
    "Short category names exceed compact row height",
    measurements,
  );
  const search = await validateSearch(cdp);
  return {
    viewport: "1440x1000",
    measurements,
    search,
    screenshot: "categories-desktop.png",
  };
}

export async function validateSearch(cdp) {
  const firstName = await evaluate(
    cdp,
    `document.querySelector('[data-category-item] [data-edit-category]')?.dataset.categoryName || ''`,
  );
  assert.ok(firstName, "Expected at least one category name for search validation");
  const query = firstName.slice(0, Math.min(4, firstName.length));

  await evaluate(
    cdp,
    `(() => {
      const input = document.querySelector('[data-category-search-input]');
      input.value = ${JSON.stringify(query)};
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`,
  );
  await sleep(100);

  const result = await evaluate(
    cdp,
    `(() => {
      const visibleItems = Array.from(document.querySelectorAll('[data-category-item]')).filter((item) => !item.hidden);
      const status = document.querySelector('[data-category-results-status]')?.textContent?.trim() || '';
      const clearVisible = !document.querySelector('[data-clear-category-search]')?.hidden;
      return { visibleCount: visibleItems.length, status, clearVisible };
    })()`,
  );

  check(result.visibleCount > 0, "Category search hid every category", {
    query,
    result,
  });
  check(result.status.includes("exibida"), "Category search did not announce its result count", {
    query,
    result,
  });
  check(result.clearVisible, "Category search clear action did not become visible", {
    query,
    result,
  });

  await evaluate(cdp, `document.querySelector('[data-clear-category-search]')?.click()`);
  await sleep(80);

  const pathResult = await evaluate(
    cdp,
    `(() => {
      const normalize = (value) => String(value || '')
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .toLocaleLowerCase('pt-BR')
        .trim();
      const items = Array.from(document.querySelectorAll('[data-category-item]'));
      let candidate = null;

      for (const item of items) {
        const name = item.querySelector(':scope > .category-node-row [data-edit-category]')?.dataset.categoryName?.trim() || '';
        const path = item.querySelector(':scope > .category-node-row [data-edit-category]')?.dataset.categoryPath?.trim() || '';
        if (!name || !path || normalize(name) === normalize(path)) continue;
        const ancestor = path
          .split('>')
          .map((part) => part.trim())
          .find((part) => part && !normalize(name).includes(normalize(part)));
        if (ancestor) {
          candidate = { item, name, path, ancestor };
          break;
        }
      }

      if (!candidate) return { candidateFound: false };
      const query = candidate.ancestor.slice(0, Math.min(4, candidate.ancestor.length));
      const input = document.querySelector('[data-category-search-input]');
      input.value = query;
      input.dispatchEvent(new Event('input', { bubbles: true }));

      const expectedMatchCount = items.filter((item) => {
        const name = item.querySelector(':scope > .category-node-row [data-edit-category]')?.dataset.categoryName || '';
        const path = item.querySelector(':scope > .category-node-row [data-edit-category]')?.dataset.categoryPath || '';
        return normalize(name + ' ' + path).includes(normalize(query));
      }).length;
      const status = document.querySelector('[data-category-results-status]')?.textContent?.trim() || '';
      const statusCount = Number(status.match(/\\d+/)?.[0] ?? -1);

      return {
        candidateFound: true,
        name: candidate.name,
        path: candidate.path,
        query,
        targetVisible: !candidate.item.hidden,
        expectedMatchCount,
        statusCount,
        status,
      };
    })()`,
  );

  check(pathResult.candidateFound, "Expected nested category for path search", pathResult);
  check(pathResult.targetVisible, "Category path search lost ancestor matching", pathResult);
  check(
    pathResult.statusCount === pathResult.expectedMatchCount,
    "Category search count is not direct-match only",
    pathResult,
  );

  await evaluate(cdp, `document.querySelector('[data-clear-category-search]')?.click()`);
  await sleep(80);

  const emptyResult = await evaluate(
    cdp,
    `(() => {
    const input = document.querySelector('[data-category-search-input]');
    input.value = 'no-results-717-unmatched-abcdef';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return {
      emptyVisible: !document.querySelector('[data-category-filter-empty]')?.hidden,
      allRowsHidden: Array.from(document.querySelectorAll('[data-category-item]'))
        .every((item) => item.hidden),
      status: document.querySelector('[data-category-results-status]')?.textContent || ''
    };
  })()`,
  );
  check(
    emptyResult.emptyVisible && emptyResult.allRowsHidden,
    "Category empty filter fails to hide every row",
    emptyResult,
  );
  await evaluate(cdp, `document.querySelector('[data-reset-category-view]')?.click()`);
  await sleep(80);

  return { query, ...result, pathResult, emptyResult };
}

export async function validateDesktopModal(cdp) {
  await evaluate(cdp, `document.querySelector('[data-open-category-modal]')?.click()`);
  await waitForModal(cdp);
  const measurements = await evaluate(cdp, modalMeasurementExpression());
  await screenshot(cdp, join(outputDir, "categories-modal-desktop.png"));

  check(measurements.visible, "Category modal did not open on desktop", measurements);
  check(measurements.insideViewport, "Category modal exceeds the desktop viewport", measurements);
  check(measurements.hasDescription, "Category modal has no accessible description", measurements);
  check(
    measurements.labelledControls === 3,
    "Category modal controls are not fully labelled",
    measurements,
  );
  check(measurements.nameFocused, "Category name did not receive initial focus", measurements);
  check(measurements.closeTarget >= 34, "Category modal close action is too small", measurements);

  await closeModal(cdp);
  return {
    viewport: "1440x1000",
    measurements,
    screenshot: "categories-modal-desktop.png",
  };
}
