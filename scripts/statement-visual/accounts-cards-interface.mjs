import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];
const scenarios = [];

if (!chromePath) throw new Error("CHROME_BIN is required for accounts and cards validation.");
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });

try {
  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  await captureState(browser.cdp, "accounts", 1366, 768, "issue-535-accounts-desktop-1366x768.png");
  await activateCards(browser.cdp);
  await captureState(browser.cdp, "cards", 1366, 768, "issue-535-cards-desktop-1366x768.png");
  await captureModal(browser.cdp, 1366, 768, "issue-535-card-modal-desktop-1366x768.png");

  await setViewport(browser.cdp, 390, 844);
  await navigate(browser.cdp, `${baseUrl}/contas-cartoes`);
  await sleep(350);
  await captureState(browser.cdp, "accounts", 390, 844, "issue-535-accounts-mobile-390x844.png");
  await activateCards(browser.cdp);
  await captureState(browser.cdp, "cards", 390, 844, "issue-535-cards-mobile-390x844.png");
  await captureModal(browser.cdp, 390, 844, "issue-535-card-modal-mobile-390x844.png");
} finally {
  await browser.close(outputDir);
}

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browser.version,
  failures,
  scenarios,
};
await writeFile(
  join(outputDir, "issue-535-accounts-cards.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log("Issue 535 accounts and cards visual validation passed.");
}

async function captureState(cdp, expectedTab, width, height, filename) {
  if (expectedTab === "accounts") {
    await navigate(cdp, `${baseUrl}/contas-cartoes`);
    await sleep(350);
  }
  const measurements = await evaluate(cdp, pageStateExpression());
  await screenshot(cdp, join(outputDir, filename));
  scenarios.push({
    kind: "page",
    expectedTab,
    viewport: `${width}x${height}`,
    filename,
    measurements,
  });

  check(
    measurements.selectedTab === expectedTab,
    `Issue 535 did not select ${expectedTab}`,
    measurements,
  );
  check(
    measurements.contextActionCount === 1,
    "Issue 535 must expose one primary action",
    measurements,
  );
  check(
    measurements.contextActionLabel ===
      (expectedTab === "cards" ? "Adicionar cartão" : "Adicionar conta"),
    `Issue 535 primary action does not match ${expectedTab}`,
    measurements,
  );
  check(
    !measurements.hasConnectionsTab,
    "Issue 535 still exposes the Connections tab",
    measurements,
  );
  check(
    JSON.stringify(measurements.statusOptions) === JSON.stringify(["all", "active", "inactive"]),
    "Issue 535 status filter is incomplete",
    measurements,
  );
  check(
    !measurements.globalOverflow,
    `Issue 535 overflows horizontally at ${width}px`,
    measurements,
  );
  check(
    measurements.minimumActionTarget >= 40,
    "Issue 535 has row actions smaller than 40px",
    measurements,
  );
  check(
    measurements.itemFooterCount === measurements.itemCount,
    "Issue 535 rows were not normalized into a comparable footer",
    measurements,
  );
  if (expectedTab === "cards") {
    check(
      measurements.instrumentDisclosureCount > 0,
      "Issue 535 has no instrument disclosures",
      measurements,
    );
    check(
      measurements.openInstrumentDisclosureCount === 0,
      "Issue 535 instrument disclosures are not closed by default",
      measurements,
    );
  }
}

async function activateCards(cdp) {
  await evaluate(cdp, `document.querySelector('#cards-tab')?.click()`);
  await sleep(180);
}

async function captureModal(cdp, width, height, filename) {
  await evaluate(cdp, `document.querySelector('[data-context-action]')?.click()`);
  await sleep(180);
  const measurements = await evaluate(cdp, modalStateExpression());
  await screenshot(cdp, join(outputDir, filename));
  scenarios.push({ kind: "modal", viewport: `${width}x${height}`, filename, measurements });

  check(measurements.open, "Issue 535 card modal did not open", measurements);
  check(
    measurements.insideViewport,
    `Issue 535 card modal exceeds ${width}x${height}`,
    measurements,
  );
  check(
    measurements.hasCloseButton,
    "Issue 535 card modal has no accessible close action",
    measurements,
  );
  check(measurements.hasCancelButton, "Issue 535 card modal has no Cancel action", measurements);
  check(
    measurements.hasSinglePrimaryAction,
    "Issue 535 card modal primary action is ambiguous",
    measurements,
  );

  await evaluate(
    cdp,
    `(() => {
      const dialog = document.querySelector('dialog[open]');
      if (dialog && typeof dialog.close === 'function') dialog.close();
    })()`,
  );
  await sleep(80);
}

function pageStateExpression() {
  return `(() => {
    const root = document.documentElement;
    const action = document.querySelector('[data-context-action]');
    const actionButtons = Array.from(document.querySelectorAll('.item-actions button'));
    const actionSizes = actionButtons.map((button) => {
      const rect = button.getBoundingClientRect();
      return Math.min(rect.width, rect.height);
    }).filter((value) => value > 0);
    const status = document.querySelector('[data-master-status]');
    const details = Array.from(document.querySelectorAll('.instrument-disclosure'));
    return {
      selectedTab: document.querySelector('[data-tab][aria-selected="true"]')?.dataset.tab || '',
      contextActionCount: document.querySelectorAll('[data-context-action]').length,
      contextActionLabel: action?.getAttribute('aria-label') || action?.textContent?.trim() || '',
      hasConnectionsTab: Boolean(document.querySelector('#connections-tab')),
      statusOptions: status ? Array.from(status.options).map((option) => option.value) : [],
      globalOverflow: root.scrollWidth > root.clientWidth + 1,
      minimumActionTarget: actionSizes.length > 0 ? Math.min(...actionSizes) : 0,
      itemCount: document.querySelectorAll('[data-master-item]').length,
      itemFooterCount: document.querySelectorAll('[data-master-item] > .item-footer').length,
      instrumentDisclosureCount: details.length,
      openInstrumentDisclosureCount: details.filter((detail) => detail.open).length,
      visiblePanel: document.querySelector('[data-tab-panel]:not([hidden])')?.dataset.tabPanel || '',
      toolbarHeight: document.querySelector('.accounts-cards-toolbar')?.getBoundingClientRect().height || 0,
    };
  })()`;
}

function modalStateExpression() {
  return `(() => {
    const dialog = document.querySelector('dialog[open]');
    if (!dialog) return { open: false, insideViewport: false, hasCloseButton: false, hasCancelButton: false, hasSinglePrimaryAction: false };
    const rect = dialog.getBoundingClientRect();
    const submitButtons = dialog.querySelectorAll('button[type="submit"]');
    return {
      open: dialog.open === true,
      insideViewport: rect.left >= 0 && rect.top >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight,
      hasCloseButton: Boolean(dialog.querySelector('.dialog-standard-close[aria-label="Fechar"]')),
      hasCancelButton: Array.from(dialog.querySelectorAll('button')).some((button) => button.textContent?.trim() === 'Cancelar'),
      hasSinglePrimaryAction: submitButtons.length === 1,
      width: rect.width,
      height: rect.height,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  })()`;
}

function check(condition, message, context) {
  if (!condition) failures.push({ message, context });
}
