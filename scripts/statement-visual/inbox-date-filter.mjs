import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;

if (!chromePath) throw new Error("CHROME_BIN is required for Inbox date filter validation.");

await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
let evidence;

try {
  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  const fixture = await createFixture(browser.cdp);
  const inboxUrl = `${baseUrl}/inbox?importBatchId=${encodeURIComponent(fixture.batchId)}`;
  await navigate(browser.cdp, inboxUrl);
  await waitFor(
    browser.cdp,
    `document.querySelectorAll('.import-row').length === 4 && Boolean(document.getElementById('apply-inbox-date-filters'))`,
  );

  const clickability = await evaluate(
    browser.cdp,
    `(() => {
      const button = document.getElementById('apply-inbox-date-filters');
      const rect = button.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(centerX, centerY);
      return {
        width: rect.width,
        height: rect.height,
        disabled: button.disabled,
        pointerEvents: getComputedStyle(button).pointerEvents,
        hitId: hit?.id || '',
        centerX,
        centerY
      };
    })()`,
  );
  assert.equal(clickability.disabled, false);
  assert.equal(clickability.pointerEvents, "auto");
  assert.equal(clickability.hitId, "apply-inbox-date-filters");
  assert.ok(clickability.width >= 112);
  assert.ok(clickability.height >= 34);

  await setPeriod(browser.cdp, "2026-07-10", "2026-07-20");
  await physicalClick(browser.cdp, clickability.centerX, clickability.centerY);
  await waitFor(browser.cdp, `document.querySelectorAll('.import-row:not([hidden])').length === 3`);
  const range = await readFilterState(browser.cdp);
  assert.deepEqual(range.visibleDates, ["10/07/2026", "15/07/2026", "20/07/2026"]);
  assert.equal(range.counter, "3 de 4 linha(s)");
  assert.equal(range.lineStart, "2026-07-10");
  assert.equal(range.lineEnd, "2026-07-20");

  await setPeriod(browser.cdp, "2026-07-15", "2026-07-15");
  await physicalClick(browser.cdp, clickability.centerX, clickability.centerY);
  await waitFor(browser.cdp, `document.querySelectorAll('.import-row:not([hidden])').length === 1`);
  const singleDay = await readFilterState(browser.cdp);
  assert.deepEqual(singleDay.visibleDates, ["15/07/2026"]);
  assert.equal(singleDay.counter, "1 de 4 linha(s)");

  await evaluate(
    browser.cdp,
    `(() => {
      document.getElementById('clear-inbox-date-filters')?.click();
      return true;
    })()`,
  );
  await waitFor(browser.cdp, `document.querySelectorAll('.import-row:not([hidden])').length === 4`);
  const cleared = await readFilterState(browser.cdp);
  assert.equal(cleared.counter, "4 de 4 linha(s)");
  assert.equal(cleared.lineStart, null);
  assert.equal(cleared.lineEnd, null);

  const screenshotName = "inbox-date-filter-1366x768.png";
  await screenshot(browser.cdp, join(outputDir, screenshotName));
  evidence = {
    generatedAt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA ?? "local",
    browser: browser.version,
    batchId: fixture.batchId,
    clickability,
    range,
    singleDay,
    cleared,
    screenshot: screenshotName,
  };
} finally {
  await browser.close(outputDir);
}

await writeFile(
  join(outputDir, "inbox-date-filter.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
console.log("Inbox date filter validation passed.");

async function createFixture(cdp) {
  const result = await evaluate(
    cdp,
    `(async () => {
      const readJson = async (response) => ({
        ok: response.ok,
        status: response.status,
        body: await response.json().catch(() => ({}))
      });
      const accounts = await readJson(await fetch('/api/accounts'));
      if (!accounts.ok) return accounts;
      const account = (accounts.body.accounts || []).find((item) => item.status === 'active');
      if (!account) return { ok: false, status: 0, body: { error: 'No active account available' } };
      const suffix = Date.now().toString(36);
      const created = await readJson(await fetch('/api/import-batches/csv', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          originalFileName: 'inbox-date-filter-' + suffix + '.csv',
          content: [
            'date,description,amount',
            '2026-07-01,Filtro data 1 ' + suffix + ',-10.00',
            '2026-07-10,Filtro data 2 ' + suffix + ',-20.00',
            '2026-07-15,Filtro data 3 ' + suffix + ',-30.00',
            '2026-07-20,Filtro data 4 ' + suffix + ',-40.00'
          ].join('\\n'),
          accountId: account.id,
          consentAccepted: true
        })
      }));
      if (!created.ok) return created;
      return { ok: true, status: created.status, body: { batchId: created.body.importBatch.id } };
    })()`,
  );

  assert.equal(
    result.ok,
    true,
    `Date filter fixture failed: ${result.status} ${JSON.stringify(result.body)}`,
  );
  return result.body;
}

async function setPeriod(cdp, startsOn, endsOn) {
  await evaluate(
    cdp,
    `(() => {
      document.getElementById('inbox-date-start').value = ${JSON.stringify(startsOn)};
      document.getElementById('inbox-date-end').value = ${JSON.stringify(endsOn)};
      return true;
    })()`,
  );
}

async function physicalClick(cdp, x, y) {
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
}

async function readFilterState(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const readDate = (row) => {
        const group = [...row.querySelectorAll('.row-summary > div')].find(
          (item) => item.querySelector('dt')?.textContent?.trim() === 'Data'
        );
        const value = group?.querySelector('dd');
        return value?.dataset.fullValue || value?.querySelector('.row-summary-value-preview')?.textContent?.trim() || value?.textContent?.trim() || '';
      };
      const url = new URL(window.location.href);
      return {
        visibleDates: [...document.querySelectorAll('.import-row:not([hidden])')].map(readDate).sort(),
        counter: document.getElementById('inbox-visible-lines')?.textContent?.trim() || '',
        lineStart: url.searchParams.get('lineStart'),
        lineEnd: url.searchParams.get('lineEnd')
      };
    })()`,
  );
}

async function waitFor(cdp, expression, timeout = 12_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    try {
      if (await evaluate(cdp, expression)) return;
    } catch {
      // The page can briefly replace its execution context while loading.
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}
