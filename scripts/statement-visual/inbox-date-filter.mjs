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
    `document.querySelectorAll('.import-row').length === 4 && Boolean(document.getElementById('inbox-date-start'))`,
  );

  await setPeriod(browser.cdp, "2026-07-10", "2026-07-20");
  await sleep(750);
  const range = await readFilterState(browser.cdp);
  await writeFile(
    join(outputDir, "inbox-date-filter-debug.json"),
    `${JSON.stringify({ stage: "range", range }, null, 2)}\n`,
  );
  assert.deepEqual(range.visibleDates, ["10/07/2026", "20/07/2026"]);
  assert.equal(range.counter, "2 de 4 linha(s)");
  assert.equal(range.lineStart, "2026-07-10");
  assert.equal(range.lineEnd, "2026-07-20");

  await setPeriod(browser.cdp, "2026-07-15", "2026-07-15");
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
      const start = document.getElementById('inbox-date-start');
      const end = document.getElementById('inbox-date-end');
      start.value = ${JSON.stringify(startsOn)};
      end.value = ${JSON.stringify(endsOn)};
      start.dispatchEvent(new Event('change', { bubbles: true }));
      end.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`,
  );
}

async function readFilterState(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const readDateDetails = (row) => {
        const group = [...row.querySelectorAll('.row-summary > div')].find(
          (item) => item.querySelector('dt')?.textContent?.trim() === 'Data'
        );
        const value = group?.querySelector('dd');
        return {
          fullValue: value?.dataset.fullValue || '',
          preview: value?.querySelector('.row-summary-value-preview')?.textContent?.trim() || '',
          title: value?.getAttribute('title') || '',
          text: value?.textContent?.trim() || ''
        };
      };
      const rows = [...document.querySelectorAll('.import-row')];
      const url = new URL(window.location.href);
      return {
        visibleDates: rows.filter((row) => !row.hidden).map((row) => {
          const date = readDateDetails(row);
          return date.fullValue || date.preview || date.text;
        }).sort(),
        counter: document.getElementById('inbox-visible-lines')?.textContent?.trim() || '',
        lineStart: url.searchParams.get('lineStart'),
        lineEnd: url.searchParams.get('lineEnd'),
        controls: {
          start: document.getElementById('inbox-date-start')?.value || '',
          end: document.getElementById('inbox-date-end')?.value || '',
          sort: document.getElementById('inbox-date-sort')?.value || ''
        },
        rows: rows.map((row) => ({
          hidden: row.hidden,
          date: readDateDetails(row)
        }))
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
