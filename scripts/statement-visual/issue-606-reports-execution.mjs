import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const requestedState = process.env.STATEMENT_VISUAL_STATE;
const allowedStates = new Set(["normal", "empty", "error"]);

if (!chromePath) {
  throw new Error("CHROME_BIN is required for reports visual validation.");
}
if (!requestedState || !allowedStates.has(requestedState)) {
  throw new Error(`Unsupported reports coverage state: ${requestedState ?? "<missing>"}.`);
}
await mkdir(outputDir, { recursive: true });

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  route: "/relatorios",
  state: requestedState,
  browser: "unknown",
  evidence: [],
  failures: [],
};

let browser;
try {
  browser = await launchChrome({ baseUrl, chromePath });
  report.browser = browser.version;
  await setViewport(browser.cdp, 1366, 900);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status}`);

  if (requestedState === "normal") {
    const seeded = await seedReportData(browser.cdp);
    await validateNormal(browser.cdp, seeded.month, 1440, 900, "desktop");
    await validateNormal(browser.cdp, seeded.month, 390, 844, "mobile");
  } else if (requestedState === "empty") {
    await validateEmpty(browser.cdp);
  } else {
    await validateFilterError(browser.cdp);
  }
} catch (error) {
  report.failures.push({ message: serializeError(error) });
} finally {
  if (browser) await browser.close(outputDir);
}

const artifactStem = `issue-606-reports-${requestedState}`;
await writeFile(join(outputDir, `${artifactStem}.json`), `${JSON.stringify(report, null, 2)}\n`);
if (report.failures.length > 0) {
  for (const failure of report.failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log(`/relatorios ${requestedState} focused validation passed.`);
}

async function seedReportData(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const run = async () => {
        const request = async (path, options = {}) => {
          const response = await fetch(path, {
            credentials: 'same-origin',
            ...options,
            headers: { 'content-type': 'application/json', ...(options.headers || {}) },
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(path + ' -> ' + response.status);
          return body;
        };
        const suffix = Date.now().toString(36);
        const accountsBody = await request('/api/accounts');
        let account = accountsBody.accounts?.find((item) => item.status === 'active');
        if (!account) {
          account = (await request('/api/accounts', {
            method: 'POST',
            body: JSON.stringify({ name: 'Conta relatório visual ' + suffix, kind: 'checking', openingBalanceMinor: 0 }),
          })).account;
        }
        const incomeCategory = (await request('/api/categories', {
          method: 'POST',
          body: JSON.stringify({ name: 'Receita visual ' + suffix, kind: 'income' }),
        })).category;
        const expenseCategory = (await request('/api/categories', {
          method: 'POST',
          body: JSON.stringify({ name: 'Despesa visual ' + suffix, kind: 'expense' }),
        })).category;
        const occurredOn = new Date().toISOString().slice(0, 10);
        const createTransaction = (payload) => request('/api/transactions', {
          method: 'POST',
          body: JSON.stringify({ status: 'posted', occurredOn, plannedOn: occurredOn, accountId: account.id, ...payload }),
        });
        await createTransaction({ kind: 'income', categoryId: incomeCategory.id, amountMinor: 250000, description: 'Receita visual ' + suffix });
        await createTransaction({ kind: 'expense', categoryId: expenseCategory.id, amountMinor: 87500, description: 'Despesa visual ' + suffix });
        return { month: occurredOn.slice(0, 7) };
      };
      return run();
    })()`,
  );
}

async function validateNormal(cdp, month, width, height, label) {
  await setViewport(cdp, width, height);
  const periods = width <= 390 ? 12 : 1;
  await navigate(
    cdp,
    `${baseUrl}/relatorios?view=category-evolution&interval=monthly&start=${month}&periods=${periods}`,
  );
  await waitForReportState(cdp, "ready");
  if (width <= 390) {
    await evaluate(cdp, `document.querySelector('.evolution-table-scroll')?.focus()`);
  }
  const measurements = await evaluate(cdp, reportMeasurementExpression());
  const screenshotName = `issue-606-reports-normal-${label}.png`;
  await screenshot(cdp, join(outputDir, screenshotName));
  assert.equal(measurements.state, "ready", `Reports ${label} did not render ready state.`);
  assert.ok(measurements.tableCount >= 1, `Reports ${label} rendered no semantic table.`);
  assert.equal(measurements.noHorizontalOverflow, true, `Reports ${label} has page overflow.`);
  if (width <= 390) {
    assert.equal(measurements.tableScrollable, true, "Reports mobile matrix is not scrollable.");
    assert.equal(measurements.scrollerFocused, true, "Reports mobile matrix is not focusable.");
  }
  report.evidence.push({
    label,
    width,
    height,
    screenshot: screenshotName,
    measurements,
  });
}

async function validateEmpty(cdp) {
  await setViewport(cdp, 1024, 700);
  await navigate(
    cdp,
    `${baseUrl}/relatorios?view=category-evolution&interval=monthly&start=2099-01&periods=1`,
  );
  await waitForReportState(cdp, "empty");
  const measurements = await evaluate(cdp, reportMeasurementExpression());
  const screenshotName = "issue-606-reports-empty.png";
  await screenshot(cdp, join(outputDir, screenshotName));
  assert.equal(measurements.state, "empty", "Reports empty state was not rendered.");
  assert.ok(measurements.rowHeaders >= 3, "Reports empty state lost principal rows.");
  assert.equal(measurements.noHorizontalOverflow, true, "Reports empty state has page overflow.");
  report.evidence.push({
    width: 1024,
    height: 700,
    screenshot: screenshotName,
    measurements,
  });
}

async function validateFilterError(cdp) {
  await setViewport(cdp, 1024, 700);
  await navigate(
    cdp,
    `${baseUrl}/relatorios?view=category-evolution&interval=quarterly&start=2026-13&periods=abc`,
  );
  await waitForReportState(cdp, "filter-error");
  const measurements = await evaluate(cdp, reportMeasurementExpression());
  const screenshotName = "issue-606-reports-error.png";
  await screenshot(cdp, join(outputDir, screenshotName));
  assert.equal(measurements.state, "filter-error", "Reports filter-error state was not rendered.");
  assert.ok(
    measurements.invalidControls >= 3,
    "Reports invalid filters are not identified accessibly.",
  );
  assert.equal(
    measurements.noHorizontalOverflow,
    true,
    "Reports filter-error state has page overflow.",
  );
  report.evidence.push({
    width: 1024,
    height: 700,
    screenshot: screenshotName,
    measurements,
  });
}

async function waitForReportState(cdp, expectedState) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(
      cdp,
      `document.querySelector('[data-report-state]')?.getAttribute('data-report-state') || ''`,
    );
    if (state === expectedState) return;
    await sleep(100);
  }
  throw new Error(`Reports did not reach ${expectedState} state.`);
}

function reportMeasurementExpression() {
  return `(() => {
    const root = document.documentElement;
    const scroller = document.querySelector('.evolution-table-scroll');
    const table = document.querySelector('.evolution-table');
    return {
      state: document.querySelector('[data-report-state]')?.getAttribute('data-report-state') || '',
      viewportWidth: window.innerWidth,
      noHorizontalOverflow: root.scrollWidth <= root.clientWidth + 1,
      tableCount: document.querySelectorAll('table.evolution-table').length,
      rowHeaders: table?.querySelectorAll('th[scope="row"]').length || 0,
      tableScrollable: Boolean(scroller && scroller.scrollWidth > scroller.clientWidth + 1),
      scrollerFocused: document.activeElement === scroller,
      invalidControls: document.querySelectorAll('[aria-invalid="true"]').length,
    };
  })()`;
}

function serializeError(error) {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}
