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
  longContent: undefined,
  collapsedGroups: undefined,
  keyboardActionMenu: undefined,
  keyboardModal: undefined,
  screenshots: [],
};

try {
  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);
  await navigate(browser.cdp, `${baseUrl}/cartoes?month=2026-06`);
  await waitFor(browser.cdp, '[data-cards-archetype="A3"] [data-purchase-item]');

  report.compactDesktop = await validateCompactDesktop(browser.cdp);
  report.screenshots.push("cards-compact-desktop.png");
  report.longContent = await validateLongContent(browser.cdp);
  report.collapsedGroups = await validateCollapsedGroups(browser.cdp);
  report.screenshots.push("cards-collapsed-groups.png");
  report.keyboardActionMenu = await validateKeyboardActionMenu(browser.cdp);
  report.keyboardModal = await validateKeyboardModal(browser.cdp);
  report.screenshots.push("cards-modal-compact-desktop.png");

  await writeFile(
    join(outputDir, "cards-interface-adversarial.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(join(outputDir, "CARDS-INTERFACE-ADVERSARIAL.md"), renderReport(report));
  console.log("Cards A3 compact desktop, overflow and keyboard validation passed.");
} finally {
  await browser.close(outputDir);
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
      const moneyCurrencies = Array.from(document.querySelectorAll('.sf-money[data-currency]')).map((node) => node.getAttribute('data-currency'));
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
        archetype: document.querySelector('[data-cards-archetype]')?.getAttribute('data-cards-archetype') || '',
        masterVisible: visible(document.querySelector('.cards-master-panel')),
        detailVisible: visible(document.querySelector('.cards-detail-panel')),
        primaryActionVisible: visible(document.querySelector('[data-open-modal="purchase"]')),
        searchVisible: visible(document.querySelector('[data-purchase-search]')),
        tableHeaderVisible: visible(document.querySelector('.cards-purchase-table-head')),
        groupCount: document.querySelectorAll('[data-instrument-purchase-group]').length,
        rowCount: document.querySelectorAll('[data-purchase-item]').length,
        moneyCurrencies,
        settlementCopy: document.querySelector('.cards-settlement-note')?.textContent?.trim() || '',
      };
    })()`,
  );

  assert.deepEqual(measurements.viewport, { width: 1366, height: 768 });
  assert.equal(measurements.archetype, "A3");
  assert.equal(measurements.noHorizontalOverflow, true, "Cards A3 overflows at 1366x768");
  assert.equal(measurements.masterVisible, true, "Card master is unavailable at 1366x768");
  assert.equal(measurements.detailVisible, true, "Invoice detail is unavailable at 1366x768");
  assert.equal(measurements.primaryActionVisible, true, "Primary purchase action is unavailable");
  assert.equal(measurements.searchVisible, true, "Purchase search is unavailable");
  assert.equal(measurements.tableHeaderVisible, true, "Desktop purchase header is hidden");
  assert.ok(measurements.groupCount > 0, "Cards A3 has no instrument groups");
  assert.ok(measurements.rowCount > 0, "Cards A3 has no purchase rows");
  assert.ok(measurements.moneyCurrencies.length > 0, "Cards A3 rendered no explicit Money values");
  assert.ok(measurements.moneyCurrencies.every(Boolean), "Cards A3 rendered Money without currency");
  assert.match(measurements.settlementCopy, /não é uma nova compra/i);

  const accessibility = await readAccessibilitySummary(cdp);
  for (const role of ["table", "row", "columnheader", "cell"]) {
    assert.ok(accessibility.roles.includes(role), `Accessibility tree is missing ${role}`);
  }
  measurements.accessibility = accessibility;
  await screenshot(cdp, join(outputDir, "cards-compact-desktop.png"));
  return measurements;
}

async function validateLongContent(cdp) {
  const originals = await evaluate(
    cdp,
    `(() => {
      const groupName = document.querySelector('[data-instrument-label]');
      const description = document.querySelector('[data-purchase-item] .cards-purchase-description strong');
      const category = document.querySelector('[data-purchase-item] .cards-purchase-description > span');
      const amount = document.querySelector('[data-purchase-item] .cards-purchase-amount');
      const values = {
        groupName: groupName?.textContent || '',
        description: description?.textContent || '',
        category: category?.textContent || '',
        amount: amount?.innerHTML || '',
      };
      if (groupName) groupName.textContent = 'Cartão corporativo internacional adicional com identificação deliberadamente extensa';
      if (description) description.textContent = 'Assinatura internacional recorrente com uma descrição operacional deliberadamente extensa para validar reflow e truncamento';
      if (category) category.textContent = 'Serviços profissionais e tecnologia internacional com classificação extensa';
      if (amount) amount.textContent = 'USD 12.345.678,90';
      return values;
    })()`,
  );
  await sleep(100);

  const measurements = await evaluate(
    cdp,
    `(() => {
      const detail = document.querySelector('.cards-detail-panel');
      const action = document.querySelector('[data-purchase-item] .cards-purchase-actions summary');
      const detailRect = detail?.getBoundingClientRect();
      const actionRect = action?.getBoundingClientRect();
      return {
        noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
        detailInsideViewport: Boolean(detailRect && detailRect.right <= window.innerWidth + 1),
        rowActionVisible: Boolean(actionRect && actionRect.width > 0 && actionRect.height > 0),
      };
    })()`,
  );

  assert.equal(measurements.noHorizontalOverflow, true, "Long card content creates horizontal overflow");
  assert.equal(measurements.detailInsideViewport, true, "Long card content pushes invoice detail outside viewport");
  assert.equal(measurements.rowActionVisible, true, "Long card content hides row action");

  await evaluate(
    cdp,
    `((values) => {
      const groupName = document.querySelector('[data-instrument-label]');
      const description = document.querySelector('[data-purchase-item] .cards-purchase-description strong');
      const category = document.querySelector('[data-purchase-item] .cards-purchase-description > span');
      const amount = document.querySelector('[data-purchase-item] .cards-purchase-amount');
      if (groupName) groupName.textContent = values.groupName;
      if (description) description.textContent = values.description;
      if (category) category.textContent = values.category;
      if (amount) amount.innerHTML = values.amount;
    })(${JSON.stringify(originals)})`,
  );
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
  assert.ok(initial.rowCount > 0 && initial.groupCount > 0);

  await evaluate(cdp, `document.querySelectorAll('[data-instrument-purchase-group]').forEach((group) => { group.open = false; })`);
  await sleep(80);
  const collapsed = await evaluate(
    cdp,
    `(() => ({
      closedGroups: Array.from(document.querySelectorAll('[data-instrument-purchase-group]')).filter((group) => !group.open).length,
      visibleRows: Array.from(document.querySelectorAll('[data-purchase-item]')).filter((row) => row.getClientRects().length > 0).length,
      noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
    }))()`,
  );
  assert.equal(collapsed.closedGroups, initial.groupCount);
  assert.equal(collapsed.visibleRows, 0, "Collapsed instrument groups still expose purchase rows");
  assert.equal(collapsed.noHorizontalOverflow, true);
  await screenshot(cdp, join(outputDir, "cards-collapsed-groups.png"));

  await evaluate(cdp, `document.querySelectorAll('[data-instrument-purchase-group]').forEach((group) => { group.open = true; })`);
  await sleep(80);
  return { initial, collapsed };
}

async function validateKeyboardActionMenu(cdp) {
  const prepared = await evaluate(
    cdp,
    `(() => {
      const summary = document.querySelector('.cards-purchase-actions > summary');
      summary?.focus();
      return Boolean(summary && document.activeElement === summary);
    })()`,
  );
  assert.equal(prepared, true, "Purchase action menu cannot receive keyboard focus");
  await pressKey(cdp, "Enter", "Enter", 13);
  await sleep(60);
  const opened = await evaluate(cdp, `Boolean(document.querySelector('.cards-purchase-actions[open]'))`);
  assert.equal(opened, true, "Purchase action menu did not open with Enter");
  await pressKey(cdp, "Escape", "Escape", 27);
  await sleep(60);
  const closed = await evaluate(
    cdp,
    `(() => {
      const details = document.querySelector('.cards-purchase-actions');
      return { open: Boolean(details?.open), focusReturned: document.activeElement === details?.querySelector('summary') };
    })()`,
  );
  assert.equal(closed.open, false, "Escape did not close purchase action menu");
  assert.equal(closed.focusReturned, true, "Purchase action menu did not restore focus");
  return { opened, closed };
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
  await pressKey(cdp, "Enter", "Enter", 13);
  await waitFor(cdp, 'dialog[data-modal="purchase"][open]');

  const opened = await evaluate(
    cdp,
    `(() => {
      const dialog = document.querySelector('dialog[data-modal="purchase"]');
      const rect = dialog?.getBoundingClientRect();
      return {
        open: Boolean(dialog?.open),
        labelled: Boolean(dialog?.getAttribute('aria-labelledby')),
        focusInside: Boolean(dialog?.contains(document.activeElement)),
        insideViewport: Boolean(rect && rect.left >= -1 && rect.right <= window.innerWidth + 1 && rect.top >= -1 && rect.bottom <= window.innerHeight + 1),
      };
    })()`,
  );
  assert.equal(opened.open, true);
  assert.equal(opened.labelled, true);
  assert.equal(opened.focusInside, true, "Modal did not contain focus after opening");
  assert.equal(opened.insideViewport, true);
  await screenshot(cdp, join(outputDir, "cards-modal-compact-desktop.png"));

  await pressKey(cdp, "Escape", "Escape", 27);
  await sleep(80);
  const closed = await evaluate(cdp, `!document.querySelector('dialog[data-modal="purchase"]')?.open`);
  assert.equal(closed, true, "Escape did not close purchase modal");
  return { opened, closed };
}

async function readAccessibilitySummary(cdp) {
  await cdp.send("Accessibility.enable");
  const tree = await cdp.send("Accessibility.getFullAXTree");
  const roles = Array.from(
    new Set((tree.nodes ?? []).map((node) => node.role?.value).filter((role) => typeof role === "string")),
  );
  return { nodeCount: tree.nodes?.length ?? 0, roles };
}

async function waitFor(cdp, selector) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await evaluate(cdp, `Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
    await sleep(100);
  }
  throw new Error(`Cards selector did not render: ${selector}`);
}

async function pressKey(cdp, key, code, keyCode) {
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    code,
    text: key === "Enter" ? "\r" : undefined,
    unmodifiedText: key === "Enter" ? "\r" : undefined,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  });
}

function renderReport(value) {
  return `# Cards A3 adversarial validation\n\n- Status: **APPROVED**\n- Browser: ${value.browser}\n- Commit: ${value.commit}\n- Viewport: ${value.viewport}\n- Screenshots: ${value.screenshots.join(", ")}\n`;
}
