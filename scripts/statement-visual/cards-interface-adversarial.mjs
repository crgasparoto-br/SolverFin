import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;

if (!chromePath) throw new Error("CHROME_BIN is required for cards adversarial validation.");
await mkdir(outputDir, { recursive: true });

const browser = await launchChrome({ baseUrl, chromePath });
const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browser.version,
  viewport: "1366x768",
  compactDesktop: undefined,
  collapsedGroups: undefined,
  keyboardModal: undefined,
  screenshots: [],
};

try {
  await loginAndOpenCards(browser.cdp);
  report.compactDesktop = await validateCompactDesktop(browser.cdp);
  report.screenshots.push("cards-compact-desktop.png");
  report.collapsedGroups = await validateCollapsedGroups(browser.cdp);
  report.screenshots.push("cards-collapsed-groups.png");
  report.keyboardModal = await validateKeyboardModal(browser.cdp);
  report.screenshots.push("cards-modal-compact-desktop.png");

  await writeFile(
    join(outputDir, "cards-interface-adversarial.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(
    join(outputDir, "CARDS-INTERFACE-ADVERSARIAL.md"),
    renderReport(report),
  );
  console.log("Cards compact desktop, collapsed groups and keyboard validation passed.");
} finally {
  await browser.close(outputDir);
}

async function loginAndOpenCards(cdp) {
  await setViewport(cdp, 1366, 768);
  await navigate(cdp, `${baseUrl}/login`);
  const login = await evaluate(cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);
  await navigate(cdp, `${baseUrl}/cartoes?month=2026-06`);
  await waitForCards(cdp);
}

async function validateCompactDesktop(cdp) {
  const measurements = await evaluate(
    cdp,
    `(() => {
      const rect = (element) => element?.getBoundingClientRect();
      const visible = (element) => {
        const value = rect(element);
        const style = element ? getComputedStyle(element) : undefined;
        return Boolean(value && value.width > 0 && value.height > 0 && style?.display !== 'none' && style?.visibility !== 'hidden');
      };
      const heroAction = document.querySelector('[data-open-modal="purchase"]');
      const search = document.querySelector('[data-purchase-search]');
      const tableHeader = document.querySelector('.purchase-table-head');
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
        heroActionVisible: visible(heroAction),
        searchVisible: visible(search),
        searchHeight: rect(search)?.height || 0,
        tableHeaderVisible: visible(tableHeader),
      };
    })()`,
  );

  assert.deepEqual(measurements.viewport, { width: 1366, height: 768 });
  assert.equal(measurements.noHorizontalOverflow, true, "Cards page overflows at 1366x768");
  assert.equal(measurements.heroActionVisible, true, "Primary action is unavailable at 1366x768");
  assert.equal(measurements.searchVisible, true, "Purchase search is unavailable at 1366x768");
  assert.ok(measurements.searchHeight >= 44, "Purchase search target is smaller than 44px");
  assert.equal(measurements.tableHeaderVisible, true, "Desktop header is hidden at 1366x768");
  await screenshot(cdp, join(outputDir, "cards-compact-desktop.png"));
  return measurements;
}

async function validateCollapsedGroups(cdp) {
  const initial = await evaluate(
    cdp,
    `(() => ({
      rowCount: document.querySelectorAll('[data-purchase-item]').length,
      groupCount: document.querySelectorAll('[data-instrument-purchase-group]').length,
    }))()`,
  );
  assert.ok(initial.rowCount > 0, "Cards page has no purchases for collapsed-group validation");
  assert.ok(initial.groupCount > 0, "Cards page has no instrument groups");

  await evaluate(
    cdp,
    `document.querySelectorAll('[data-instrument-purchase-group]').forEach((group) => { group.open = false; })`,
  );
  await sleep(150);

  const collapsed = await evaluate(
    cdp,
    `(() => {
      const rows = Array.from(document.querySelectorAll('[data-purchase-item]'));
      const matchingRows = rows.filter((row) => !row.hidden && !row.closest('[data-instrument-purchase-group]')?.hidden);
      const displayedRows = matchingRows.filter((row) => row.closest('[data-instrument-purchase-group]')?.open);
      const empty = document.querySelector('[data-purchase-filter-empty]');
      return {
        matchingRows: matchingRows.length,
        displayedRows: displayedRows.length,
        resultStatus: document.querySelector('[data-purchase-results-status]')?.textContent?.trim() || '',
        ariaRowCount: document.querySelector('.purchase-list[aria-label="Compras da fatura"]')?.getAttribute('aria-rowcount'),
        emptyVisible: Boolean(empty && !empty.hidden),
        closedGroups: Array.from(document.querySelectorAll('[data-instrument-purchase-group]')).filter((group) => !group.open).length,
      };
    })()`,
  );

  assert.ok(collapsed.matchingRows > 0, "Collapsed groups lost matching purchases");
  assert.equal(collapsed.displayedRows, 0, "Purchases remain displayed inside collapsed groups");
  assert.equal(collapsed.resultStatus, "0 compras exibidas");
  assert.equal(collapsed.ariaRowCount, "0");
  assert.equal(
    collapsed.emptyVisible,
    false,
    "Filter-empty state must stay hidden when collapsed groups still contain matches",
  );
  assert.equal(collapsed.closedGroups, initial.groupCount);
  await screenshot(cdp, join(outputDir, "cards-collapsed-groups.png"));

  await evaluate(
    cdp,
    `document.querySelectorAll('[data-instrument-purchase-group]').forEach((group) => { group.open = true; })`,
  );
  await sleep(150);

  const restored = await evaluate(
    cdp,
    `(() => ({
      resultStatus: document.querySelector('[data-purchase-results-status]')?.textContent?.trim() || '',
      ariaRowCount: document.querySelector('.purchase-list[aria-label="Compras da fatura"]')?.getAttribute('aria-rowcount'),
    }))()`,
  );
  assert.equal(restored.resultStatus, `${initial.rowCount} compras exibidas`);
  assert.equal(restored.ariaRowCount, String(initial.rowCount));
  return { initial, collapsed, restored };
}

async function validateKeyboardModal(cdp) {
  const focused = await evaluate(
    cdp,
    `(() => {
      const button = document.querySelector('[data-open-modal="purchase"]');
      button?.focus();
      return document.activeElement === button;
    })()`,
  );
  assert.equal(focused, true, "Primary purchase action cannot receive keyboard focus");

  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await waitForModal(cdp);
  await sleep(80);

  const opened = await evaluate(
    cdp,
    `(() => {
      const dialog = document.querySelector('dialog[data-modal="purchase"]');
      const rect = dialog?.getBoundingClientRect();
      return {
        visible: Boolean(dialog?.open),
        insideViewport: Boolean(rect && rect.left >= -1 && rect.right <= window.innerWidth + 1 && rect.top >= -1 && rect.bottom <= window.innerHeight + 1),
        firstFieldFocused: Boolean(dialog?.querySelector('.modal-panel')?.contains(document.activeElement) && document.activeElement?.matches('input, select, textarea')),
      };
    })()`,
  );
  assert.equal(opened.visible, true, "Enter did not open the purchase modal");
  assert.equal(opened.insideViewport, true, "Purchase modal exceeds 1366x768");
  assert.equal(opened.firstFieldFocused, true, "Purchase modal did not focus the first field");
  await screenshot(cdp, join(outputDir, "cards-modal-compact-desktop.png"));

  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
  });
  await sleep(100);

  const closed = await evaluate(
    cdp,
    `(() => ({
      closed: !document.querySelector('dialog[data-modal="purchase"]')?.open,
      focusRestored: document.activeElement === document.querySelector('[data-open-modal="purchase"]'),
    }))()`,
  );
  assert.equal(closed.closed, true, "Escape did not close the purchase modal");
  assert.equal(closed.focusRestored, true, "Focus was not restored to the modal opener");
  return { opened, closed };
}

async function waitForCards(cdp) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ready = await evaluate(
      cdp,
      `Boolean(document.querySelector('main[data-cards-interface-enhanced] .invoice-overview') && document.querySelector('[data-purchase-item]'))`,
    );
    if (ready) return;
    await sleep(100);
  }
  throw new Error("Cards interface did not render with demo purchases.");
}

async function waitForModal(cdp) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const open = await evaluate(
      cdp,
      `Boolean(document.querySelector('dialog[data-modal="purchase"][open]'))`,
    );
    if (open) return;
    await sleep(50);
  }
  throw new Error("Purchase modal did not open from keyboard interaction.");
}

function renderReport(value) {
  return `# Cards interface adversarial validation\n\n- Status: **APPROVED**\n- Browser: ${value.browser}\n- Commit: ${value.commit}\n- Viewport: ${value.viewport}\n- Scenarios: compact desktop, collapsed instrument groups, keyboard modal flow\n- Screenshots: ${value.screenshots.join(", ")}\n`;
}
