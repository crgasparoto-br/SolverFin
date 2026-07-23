import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];

if (!chromePath)
  throw new Error("CHROME_BIN is required for Inbox interface refinement validation.");
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
let report;
let fatalError;

try {
  report = await validateInboxInterfaceRefinement(browser.cdp);
} catch (error) {
  fatalError = {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
  failures.push({ message: fatalError.message, details: fatalError });
} finally {
  await browser.close(outputDir);
}

const evidence = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browser.version,
  failures,
  fatalError,
  ...report,
};
await writeFile(
  join(outputDir, "issue-525-inbox-interface-refinement.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  if (fatalError?.stack) console.error(fatalError.stack);
  process.exitCode = 1;
} else {
  console.log("Inbox interface refinement validation passed.");
}

async function validateInboxInterfaceRefinement(cdp) {
  await setViewport(cdp, 1366, 768);
  await navigate(cdp, `${baseUrl}/login`);
  const login = await evaluate(cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  const fixture = await createFixture(cdp);
  const batchId = fixture.body.importBatch.id;
  await navigate(cdp, `${baseUrl}/inbox?importBatchId=${encodeURIComponent(batchId)}`);
  await waitFor(cdp, `document.querySelectorAll('.import-row').length >= 10`);

  const desktop = await inspectViewport(cdp, {
    width: 1366,
    height: 768,
    screenshotName: "issue-525-inbox-desktop-1366x768.png",
    verifyKeyboardFocus: true,
  });
  check(desktop.bodyFitsViewport, "Inbox overflows horizontally at 1366x768", desktop);
  check(desktop.headerVisible, "Batch header is not fully visible at 1366x768", desktop);
  check(desktop.summaryVisible, "Batch summary is not fully visible at 1366x768", desktop);
  check(desktop.toolbarVisible, "Bulk selection toolbar is not fully visible at 1366x768", desktop);
  check(
    desktop.completeRows >= 5,
    `Expected at least 5 complete imported rows at 1366x768, found ${desktop.completeRows}`,
    desktop,
  );
  check(desktop.batchIsContinuous, "Batch history still looks like repeated cards", desktop);
  check(desktop.selectedBatchHasIndicator, "Selected batch lacks a non-color indicator", desktop);
  check(
    desktop.focusIsVisible,
    "Keyboard focus is not distinguishable on the selected batch",
    desktop,
  );
  check(desktop.bulkControlsIntrinsic, "Bulk selection controls are stretched on desktop", desktop);
  check(desktop.labelActivatesCheckbox, "Bulk selection label does not toggle its checkbox", desktop);
  check(desktop.rowsAreContinuous, "Imported rows still look like individual cards", desktop);

  const tablet = await inspectViewport(cdp, {
    width: 768,
    height: 1024,
    screenshotName: "issue-525-inbox-tablet-768x1024.png",
    scrollTarget: ".bulk-actions",
  });
  check(tablet.bodyFitsViewport, "Inbox overflows horizontally at 768x1024", tablet);
  check(tablet.toolbarVisible, "Bulk selection toolbar is not visible on tablet", tablet);
  check(
    tablet.completeRows >= 1,
    "No complete imported row is visible with the tablet toolbar",
    tablet,
  );
  check(tablet.bulkControlsIntrinsic, "Bulk selection controls are stretched on tablet", tablet);
  check(
    tablet.labelActivatesCheckbox,
    "Bulk selection label does not toggle its checkbox on tablet",
    tablet,
  );

  const mobile = await inspectViewport(cdp, {
    width: 390,
    height: 844,
    screenshotName: "issue-525-inbox-mobile-390x844.png",
    scrollTarget: ".bulk-actions",
  });
  check(mobile.bodyFitsViewport, "Inbox overflows horizontally at 390x844", mobile);
  check(
    mobile.navScrollsHorizontally,
    "Inbox section navigation is not compact and horizontal",
    mobile,
  );
  check(mobile.actionsFitViewport, "Inbox actions overflow the mobile viewport", mobile);
  check(mobile.toolbarVisible, "Bulk selection toolbar is not visible in the mobile evidence", mobile);
  check(
    mobile.completeRows >= 1,
    "No complete imported row is visible with the mobile toolbar",
    mobile,
  );
  check(
    mobile.bulkControlsIntrinsic,
    "Bulk selection controls unnecessarily fill mobile width",
    mobile,
  );
  check(
    mobile.compactFilterActionsIntrinsic,
    "A short filter action unnecessarily fills the mobile width",
    mobile,
  );
  check(
    mobile.labelActivatesCheckbox,
    "Bulk selection label does not toggle its checkbox on mobile",
    mobile,
  );

  return { batchId, desktop, tablet, mobile };
}

async function createFixture(cdp) {
  const fixture = await evaluate(
    cdp,
    `(() => fetch('/api/accounts')
      .then(async (response) => ({ ok: response.ok, status: response.status, body: await response.json() }))
      .then(async (accountsResponse) => {
        if (!accountsResponse.ok) return accountsResponse;
        const account = (accountsResponse.body.accounts || []).find((item) => item.status === 'active');
        if (!account) return { ok: false, status: 0, body: { error: 'No active account available' } };
        const suffix = Date.now().toString(36);
        const rows = Array.from({ length: 10 }, (_, index) => {
          const day = String(index + 1).padStart(2, '0');
          const description = index === 3
            ? 'Descrição longa para validar leitura e alinhamento responsivo sem cortar ações essenciais ' + suffix
            : 'Lançamento visual ' + String(index + 1) + ' ' + suffix;
          const amount = index % 3 === 0 ? String(100 + index) + '.50' : '-' + String(20 + index) + '.75';
          return '2026-07-' + day + ',' + description + ',' + amount;
        });
        const createResponse = await fetch('/api/import-batches/csv', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            originalFileName: 'issue-525-inbox-' + suffix + '.csv',
            content: ['date,description,amount', ...rows].join('\\n'),
            accountId: account.id,
            consentAccepted: true
          })
        });
        return { ok: createResponse.ok, status: createResponse.status, body: await createResponse.json() };
      }))()`,
  );
  assert.equal(
    fixture.ok,
    true,
    `Issue 525 fixture creation failed: ${fixture.status} ${JSON.stringify(fixture.body)}`,
  );
  return fixture;
}

async function inspectViewport(
  cdp,
  { width, height, screenshotName, scrollTarget, verifyKeyboardFocus = false },
) {
  await setViewport(cdp, width, height);
  await evaluate(
    cdp,
    scrollTarget
      ? `(() => {
          const target = document.querySelector(${JSON.stringify(scrollTarget)});
          target?.scrollIntoView({ block: 'start', inline: 'nearest' });
          window.scrollBy(0, -8);
          return Boolean(target);
        })()`
      : `(() => { window.scrollTo(0, 0); return true; })()`,
  );
  await sleep(250);

  if (verifyKeyboardFocus) await focusSelectedBatchByKeyboard(cdp);

  const metrics = await evaluate(
    cdp,
    `(() => {
      const withinViewport = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight;
      };
      const rows = [...document.querySelectorAll('.import-row')];
      const selectedBatch = document.querySelector('.batch-item.selected');
      const unselectedBatch = document.querySelector('.batch-item:not(.selected)') ?? document.querySelector('.batch-item');
      const batchList = document.querySelector('.import-batch-list');
      const bulk = document.querySelector('.bulk-actions');
      const bulkLabel = bulk?.querySelector(':scope > label');
      const bulkCheckbox = bulkLabel?.querySelector('input[type="checkbox"]');
      const bulkButton = document.getElementById('approve-selected-import-lines');
      const nav = document.querySelector('.inbox-section-nav');
      const selectedStyle = selectedBatch ? getComputedStyle(selectedBatch) : null;
      const unselectedStyle = unselectedBatch ? getComputedStyle(unselectedBatch) : null;
      const listStyle = batchList ? getComputedStyle(batchList) : null;
      const rowStyle = rows[0] ? getComputedStyle(rows[0]) : null;
      const actionElements = [...document.querySelectorAll('.inbox-page button, .inbox-page .button-link')]
        .filter((element) => element.getBoundingClientRect().width > 0);
      const compactFilterButtons = [...document.querySelectorAll('.inbox-page .compact-filters button')]
        .filter((element) => element.getBoundingClientRect().width > 0);
      const focusIsVisible = document.activeElement === selectedBatch
        && Boolean(selectedStyle && selectedStyle.boxShadow !== 'none');
      let labelActivatesCheckbox = false;
      if (bulkLabel && bulkCheckbox && !bulkCheckbox.disabled) {
        const initialChecked = bulkCheckbox.checked;
        bulkLabel.click();
        labelActivatesCheckbox = bulkCheckbox.checked !== initialChecked;
        bulkLabel.click();
      }
      return {
        viewport: window.innerWidth + 'x' + window.innerHeight,
        bodyFitsViewport: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        headerVisible: withinViewport(document.getElementById('import-detail-heading')),
        summaryVisible: withinViewport(document.querySelector('.import-summary')),
        toolbarVisible: withinViewport(bulk),
        completeRows: rows.filter(withinViewport).length,
        rowRects: rows.slice(0, 6).map((row) => {
          const rect = row.getBoundingClientRect();
          return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: Math.round(rect.height) };
        }),
        batchIsContinuous: Boolean(unselectedStyle && listStyle && unselectedStyle.borderRadius === '0px' && listStyle.gap === '0px' && unselectedStyle.backgroundColor === 'rgba(0, 0, 0, 0)'),
        selectedBatchHasIndicator: Boolean(selectedStyle && selectedStyle.borderLeftWidth !== '0px' && selectedStyle.borderLeftColor !== 'rgba(0, 0, 0, 0)'),
        focusIsVisible,
        bulkControlsIntrinsic: Boolean(bulk && bulkLabel && bulkCheckbox && bulkButton && bulkLabel.getBoundingClientRect().width < bulk.getBoundingClientRect().width * 0.6 && bulkCheckbox.getBoundingClientRect().width <= 24 && bulkButton.getBoundingClientRect().width < bulk.getBoundingClientRect().width * 0.7),
        compactFilterActionsIntrinsic: compactFilterButtons.every((button) => {
          const parent = button.parentElement;
          const parentWidth = parent?.getBoundingClientRect().width || window.innerWidth;
          const style = getComputedStyle(button);
          return style.flexGrow === '0' && button.getBoundingClientRect().width < parentWidth * 0.8;
        }),
        labelActivatesCheckbox,
        rowsAreContinuous: Boolean(rowStyle && rowStyle.borderRadius === '0px' && rowStyle.borderTopWidth === '0px' && rowStyle.borderBottomWidth !== '0px'),
        navScrollsHorizontally: Boolean(nav && getComputedStyle(nav).display === 'flex' && nav.scrollWidth > nav.clientWidth),
        actionsFitViewport: actionElements.every((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left >= 0 && rect.right <= window.innerWidth;
        }),
        dimensions: {
          documentScrollWidth: document.documentElement.scrollWidth,
          documentClientWidth: document.documentElement.clientWidth,
          bulkWidth: bulk ? Math.round(bulk.getBoundingClientRect().width) : 0,
          bulkLabelWidth: bulkLabel ? Math.round(bulkLabel.getBoundingClientRect().width) : 0,
          bulkButtonWidth: bulkButton ? Math.round(bulkButton.getBoundingClientRect().width) : 0,
          compactFilterButtonWidths: compactFilterButtons.map((button) => Math.round(button.getBoundingClientRect().width)),
          navClientWidth: nav?.clientWidth || 0,
          navScrollWidth: nav?.scrollWidth || 0
        }
      };
    })()`,
  );

  await screenshot(cdp, join(outputDir, screenshotName));
  return { ...metrics, screenshot: screenshotName };
}

async function focusSelectedBatchByKeyboard(cdp) {
  const prepared = await evaluate(
    cdp,
    `(() => {
      const selectedBatch = document.querySelector('.batch-item.selected');
      if (!selectedBatch) return false;
      const focusable = [...document.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter((element) => element.getClientRects().length > 0);
      const index = focusable.indexOf(selectedBatch);
      if (index < 0) return false;
      if (index > 0) focusable[index - 1].focus();
      else {
        document.body.tabIndex = -1;
        document.body.focus();
      }
      return true;
    })()`,
  );
  assert.equal(
    prepared,
    true,
    "Unable to prepare keyboard focus validation for selected batch",
  );
  await cdp.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
  });
  await sleep(100);
}

function check(condition, message, details) {
  if (!condition) failures.push({ message, details });
}

async function waitFor(cdp, expression, timeout = 12_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if (await evaluate(cdp, expression)) return;
    } catch {
      // The page can briefly replace its execution context while loading.
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}
