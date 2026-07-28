import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];
const screenshots = [];

if (!chromePath) throw new Error("CHROME_BIN is required for issue 546 visual validation.");
await mkdir(outputDir, { recursive: true });

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: "unknown",
  desktop: null,
  mobile: null,
  apiError: null,
  failures,
  screenshots,
};

let browser;
try {
  browser = await launchChrome({ baseUrl, chromePath });
  report.browser = browser.version;
  await setViewport(browser.cdp, 1440, 900);
  await navigateWithRetry(browser.cdp, `${baseUrl}/login`, "login");
  const loginResult = await evaluate(browser.cdp, loginExpression());
  assert.equal(
    loginResult.ok,
    true,
    `Demo login failed: ${loginResult.status} ${loginResult.body}`,
  );
  const seeded = await seedScenario(browser.cdp);
  report.desktop = await validateDesktop(browser.cdp, seeded);
  report.mobile = await validateMobile(browser.cdp, seeded);
  report.apiError = await validateApiError(browser.cdp);
} catch (error) {
  failures.push({ message: "Issue 546 visual validation crashed", details: serializeError(error) });
} finally {
  if (browser) await browser.close(outputDir);
}

await writeFile(
  join(outputDir, "issue-546-reports-category-controls.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
await writeFile(
  join(outputDir, "ISSUE-546-REPORTS-CATEGORY-CONTROLS.md"),
  `# Issue 546 reports validation\n\n- Commit: \`${report.commit}\`\n- Browser: ${report.browser}\n- Failures: ${failures.length}\n- Screenshots: ${screenshots.join(", ")}\n`,
);

if (failures.length > 0) {
  failures.forEach((failure) => console.error(`- ${failure.message}`));
  process.exitCode = 1;
} else {
  console.log(
    "Issue 546 account/card filter, section/category controls and negative result validation passed.",
  );
}

async function seedScenario(cdp) {
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
          if (!response.ok) throw new Error(path + ' -> ' + response.status + ' ' + JSON.stringify(body));
          return body;
        };
        const suffix = Date.now().toString(36);
        const account = (await request('/api/accounts', {
          method: 'POST',
          body: JSON.stringify({ name: 'Conta visual issue 546 ' + suffix, kind: 'checking', openingBalanceMinor: 0 }),
        })).account;
        const card = (await request('/api/credit-card-accounts', {
          method: 'POST',
          body: JSON.stringify({
            name: 'Cartão visual issue 546 ' + suffix,
            closingDay: 20,
            dueDay: 10,
            instruments: [{
              type: 'physical',
              holder: 'primary',
              name: 'Principal visual',
              maskedIdentifier: '**** 0546'
            }]
          }),
        })).creditCardAccount;
        const instrument = card.instruments[0];
        const incomeRoot = (await request('/api/categories', {
          method: 'POST', body: JSON.stringify({ name: 'Receitas visuais ' + suffix, kind: 'income' }),
        })).category;
        const incomeChild = (await request('/api/categories', {
          method: 'POST', body: JSON.stringify({ name: 'Serviços visuais ' + suffix, kind: 'income', parentCategoryId: incomeRoot.id }),
        })).category;
        const incomeLeaf = (await request('/api/categories', {
          method: 'POST', body: JSON.stringify({ name: 'Consultoria visual ' + suffix, kind: 'income', parentCategoryId: incomeChild.id }),
        })).category;
        const expenseRoot = (await request('/api/categories', {
          method: 'POST', body: JSON.stringify({ name: 'Despesas visuais ' + suffix, kind: 'expense' }),
        })).category;
        const expenseLeaf = (await request('/api/categories', {
          method: 'POST', body: JSON.stringify({ name: 'Software visual ' + suffix, kind: 'expense', parentCategoryId: expenseRoot.id }),
        })).category;
        const occurredOn = new Date().toISOString().slice(0, 10);
        const createTransaction = (payload) => request('/api/transactions', {
          method: 'POST',
          body: JSON.stringify({ status: 'posted', occurredOn, plannedOn: occurredOn, accountId: account.id, ...payload }),
        });
        await createTransaction({ kind: 'income', categoryId: incomeLeaf.id, amountMinor: 10000, description: 'Receita issue 546 ' + suffix });
        await createTransaction({ kind: 'expense', categoryId: expenseLeaf.id, amountMinor: 20000, description: 'Despesa issue 546 ' + suffix });
        await request('/api/credit-card-accounts/' + card.id + '/purchases', {
          method: 'POST',
          body: JSON.stringify({
            occurredOn,
            amountMinor: 25000,
            description: 'Compra cartão issue 546 ' + suffix,
            categoryId: expenseLeaf.id,
            cardInstrumentId: instrument.id
          })
        });
        await request('/api/credit-card-accounts/' + card.id, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'blocked' })
        });
        return {
          accountId: account.id,
          accountName: account.name,
          cardId: card.id,
          cardName: card.name,
          month: occurredOn.slice(0, 7)
        };
      };
      return run();
    })()`,
  );
}

async function validateDesktop(cdp, seeded) {
  await setViewport(cdp, 1440, 900);
  await navigateWithRetry(
    cdp,
    `${baseUrl}/relatorios?view=category-evolution&interval=monthly&start=${seeded.month}&periods=1&accountId=${seeded.accountId}`,
    "issue 546 desktop",
  );
  await waitForState(cdp, "ready");
  const interaction = await evaluate(
    cdp,
    `(() => {
      const incomeSection = document.querySelector('[data-section-toggle="income"]');
      const expenseSection = document.querySelector('[data-section-toggle="expense"]');
      const categoryToggles = Array.from(document.querySelectorAll('[data-category-toggle]:not([data-section-toggle])'));
      const child = categoryToggles[1];
      if (!(incomeSection instanceof HTMLButtonElement) ||
          !(expenseSection instanceof HTMLButtonElement) ||
          !(child instanceof HTMLButtonElement)) return { ok: false };
      const childDescendantIds = (child.getAttribute('aria-controls') || '').split(' ').filter(Boolean);
      child.click();
      const childHidden = childDescendantIds.every((id) => document.getElementById(id)?.hidden === true);
      const incomeIds = (incomeSection.getAttribute('aria-controls') || '').split(' ').filter(Boolean);
      incomeSection.click();
      const sectionHidden = incomeIds.every((id) => document.getElementById(id)?.hidden === true);
      incomeSection.click();
      const descendantStatePreserved = child.getAttribute('aria-expanded') === 'false' &&
        childDescendantIds.every((id) => document.getElementById(id)?.hidden === true);
      child.click();
      incomeSection.focus();
      return {
        ok: true,
        childHidden,
        sectionHidden,
        descendantStatePreserved,
        sectionFocused: document.activeElement === incomeSection,
        incomeLabel: incomeSection.textContent,
        expenseExpanded: expenseSection.getAttribute('aria-expanded')
      };
    })()`,
  );
  const measurements = await evaluate(cdp, measurementExpression());
  await screenshot(cdp, join(outputDir, "issue-546-reports-category-controls-desktop.png"));
  screenshots.push("issue-546-reports-category-controls-desktop.png");

  check(interaction.ok, "Section and hierarchy controls were not available", interaction);
  check(interaction.childHidden, "Collapsing a category did not hide its full subtree", interaction);
  check(interaction.sectionHidden, "Collapsing Receitas did not hide the full section tree", interaction);
  check(
    interaction.descendantStatePreserved,
    "A descendant collapsed state was lost after reopening the Receitas section",
    interaction,
  );
  check(interaction.sectionFocused, "Section control did not accept keyboard focus", interaction);
  check(interaction.expenseExpanded === "true", "Despesas was changed by Receitas", interaction);
  check(
    measurements.selectedOrigin === `account:${seeded.accountId}`,
    "Selected account was not preserved",
    measurements,
  );
  check(measurements.sectionToggleCount >= 2, "Receitas/Despesas controls were not rendered", measurements);
  check(measurements.categoryToggleCount >= 2, "Multilevel category controls were not rendered", measurements);
  check(measurements.negativeCells >= 3, "Negative Result cells were not highlighted", measurements);
  check(measurements.pageFitsViewport, "Desktop page leaks horizontal overflow", measurements);
  return { viewport: "1440x900", interaction, measurements, screenshot: screenshots.at(-1) };
}

async function validateApiError(cdp) {
  await setViewport(cdp, 1024, 700);
  await navigateWithRetry(
    cdp,
    `${baseUrl}/relatorios?view=category-evolution&interval=monthly&start=2099-01&periods=1&cardId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
    "issue 546 api error",
  );
  await waitForState(cdp, "api-error");
  const measurements = await evaluate(cdp, measurementExpression());
  await screenshot(cdp, join(outputDir, "issue-546-reports-category-controls-api-error.png"));
  screenshots.push("issue-546-reports-category-controls-api-error.png");

  check(measurements.state === "api-error", "Safe API error state was not rendered", measurements);
  check(!measurements.hasReadyReport, "API error exposed a partial ready report", measurements);
  return { viewport: "1024x700", measurements, screenshot: screenshots.at(-1) };
}

async function validateMobile(cdp, seeded) {
  await setViewport(cdp, 390, 844);
  await navigateWithRetry(
    cdp,
    `${baseUrl}/relatorios?view=category-evolution&interval=monthly&start=${seeded.month}&periods=12&cardId=${seeded.cardId}`,
    "issue 546 mobile card filter",
  );
  await waitForState(cdp, "ready");
  const measurements = await evaluate(cdp, measurementExpression());
  await screenshot(cdp, join(outputDir, "issue-546-reports-category-controls-mobile.png"));
  screenshots.push("issue-546-reports-category-controls-mobile.png");

  check(measurements.viewportWidth === 390, "Mobile viewport is not 390px", measurements);
  check(measurements.pageFitsViewport, "Mobile page leaks horizontal overflow", measurements);
  check(measurements.tableScrollable, "Mobile matrix is not horizontally scrollable", measurements);
  check(measurements.filterColumns === 1, "Mobile report filters are not stacked", measurements);
  check(
    measurements.selectedOrigin === `card:${seeded.cardId}`,
    "Blocked card selection was lost on mobile",
    measurements,
  );
  check(measurements.accountId === null, "Card filter emitted accountId", measurements);
  check(measurements.cardId === seeded.cardId, "Card filter URL was not preserved", measurements);
  check(measurements.negativeCells >= 3, "Card result was not negative and highlighted", measurements);
  return { viewport: "390x844", measurements, screenshot: screenshots.at(-1) };
}

function measurementExpression() {
  return `(() => {
    const scroller = document.querySelector('.evolution-table-scroll');
    const form = document.querySelector('.evolution-filters');
    const style = form ? getComputedStyle(form) : null;
    const url = new URL(window.location.href);
    return {
      state: document.querySelector('[data-report-state]')?.getAttribute('data-report-state') || '',
      hasReadyReport: Boolean(document.querySelector('[data-report-state="ready"]')),
      viewportWidth: window.innerWidth,
      pageFitsViewport: document.documentElement.scrollWidth <= window.innerWidth + 1,
      tableScrollable: Boolean(scroller && scroller.scrollWidth > scroller.clientWidth + 1),
      filterColumns: style ? style.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      selectedOrigin: document.querySelector('select[name="origin"]')?.value || '',
      accountId: url.searchParams.get('accountId'),
      cardId: url.searchParams.get('cardId'),
      sectionToggleCount: document.querySelectorAll('[data-section-toggle]').length,
      categoryToggleCount: document.querySelectorAll('[data-category-toggle]:not([data-section-toggle])').length,
      negativeCells: document.querySelectorAll('[data-negative-value="true"]').length,
    };
  })()`;
}

async function waitForState(cdp, expected) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await evaluate(
      cdp,
      `document.querySelector('[data-report-state]')?.getAttribute('data-report-state') || ''`,
    );
    if (state === expected) return;
    await sleep(100);
  }
  throw new Error(`Reports state ${expected} did not render.`);
}

async function navigateWithRetry(cdp, url, label) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await navigate(cdp, url);
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      console.warn(`Navigation to ${label} failed on attempt ${attempt}; retrying.`);
      await sleep(400 * attempt);
    }
  }
}

function check(condition, message, details) {
  if (!condition) failures.push({ message, details });
}

function serializeError(error) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack ?? "" };
  }
  return { name: "UnknownError", message: String(error), stack: "" };
}
