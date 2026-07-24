import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { fixtureExpression, loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;

if (!chromePath) {
  throw new Error("CHROME_BIN is required for issue 530 selection clearance validation.");
}

await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });

try {
  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);
  const fixtureIds = await evaluate(browser.cdp, fixtureExpression());
  const route =
    `/lancamentos?accountId=${encodeURIComponent(fixtureIds.longAccountId)}` + "&month=2026-07";

  await navigate(browser.cdp, `${baseUrl}${route}`);
  await sleep(180);

  const selected = await evaluate(
    browser.cdp,
    `(() => {
      const input = document.querySelector('[data-select-transaction]:not([data-selection-entity="group"]):not(:disabled)');
      if (!input) throw new Error('No selectable transaction was found for issue 530 clearance validation.');
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        selected: input.checked,
        barVisible: !document.querySelector('[data-selection-bar]').hidden
      };
    })()`,
  );
  assert.equal(selected.selected, true);
  assert.equal(selected.barVisible, true);

  const desktop = await measureClearance(browser.cdp);
  assertClearance(desktop, "desktop");
  await screenshot(browser.cdp, join(outputDir, "issue-530-selection-clearance-1366x768.png"));

  await setViewport(browser.cdp, 390, 844);
  await sleep(160);
  const mobile = await measureClearance(browser.cdp);
  assertClearance(mobile, "mobile");
  await screenshot(browser.cdp, join(outputDir, "issue-530-selection-clearance-390x844.png"));

  await writeFile(
    join(outputDir, "issue-530-selection-clearance.json"),
    `${JSON.stringify({ selected, desktop, mobile }, null, 2)}\n`,
  );
} finally {
  await browser.close(outputDir);
}

async function measureClearance(cdp) {
  await evaluate(cdp, `window.scrollTo(0, document.documentElement.scrollHeight)`);
  await sleep(120);
  return evaluate(
    cdp,
    `(() => {
      const bar = document.querySelector('[data-selection-bar]');
      const table = document.querySelector('.statement-table');
      const rows = Array.from(document.querySelectorAll('.statement-row.statement-body'));
      const lastRow = rows.at(-1);
      if (!bar || !table || !lastRow) throw new Error('Clearance measurement elements were not found.');
      const barRect = bar.getBoundingClientRect();
      const rowRect = lastRow.getBoundingClientRect();
      const paddingBottom = Number.parseFloat(getComputedStyle(table).paddingBottom || '0');
      return {
        barHeight: Math.round(barRect.height),
        barTop: Math.round(barRect.top),
        lastRowBottom: Math.round(rowRect.bottom),
        paddingBottom: Math.round(paddingBottom),
        overlap: Math.round(rowRect.bottom - barRect.top),
        visibleInViewport: barRect.top >= 0 && barRect.bottom <= window.innerHeight
      };
    })()`,
  );
}

function assertClearance(metrics, viewport) {
  assert.equal(
    metrics.visibleInViewport,
    true,
    `${viewport}: selection bar is outside the viewport`,
  );
  assert.ok(
    metrics.paddingBottom >= metrics.barHeight + 16,
    `${viewport}: reserved space is smaller than the selection bar: ${JSON.stringify(metrics)}`,
  );
  assert.ok(
    metrics.lastRowBottom <= metrics.barTop - 8,
    `${viewport}: the last statement row is covered by the selection bar: ${JSON.stringify(metrics)}`,
  );
}
