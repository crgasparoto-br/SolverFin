import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

import { evaluate, launchChrome, navigate, setViewport, sleep } from "./cdp.mjs";
import { fixtureExpression, loginExpression } from "./fixtures.mjs";
import { pageMeasurementExpression } from "./measurements.mjs";
import { writeSemanticProof } from "./semantic-proof.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const sourceScenario = process.env.STATEMENT_VISUAL_SOURCE_SCENARIO_ID;

if (!chromePath) {
  throw new Error("CHROME_BIN is required for semantic visual validation.");
}
await mkdir(outputDir, { recursive: true });

const browser = await launchChrome({ baseUrl, chromePath });
try {
  await setViewport(browser.cdp, 1366, 900);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status}`);

  if (sourceScenario === "cards-interface") {
    await validateCards(browser.cdp);
    await writeSemanticProof(["filters", "modal"], { surface: "cards" });
  } else if (sourceScenario === "core-pages") {
    await validateStatement(browser.cdp);
    await writeSemanticProof(["focus", "overflow"], { surface: "statement" });
  } else if (sourceScenario === "reports-category-evolution") {
    await validateReports(browser.cdp);
    await writeSemanticProof(["focus", "overflow"], { surface: "reports" });
  } else {
    throw new Error(
      `Unsupported semantic interaction source scenario: ${sourceScenario ?? "<missing>"}.`,
    );
  }
} finally {
  await browser.close(outputDir);
}

async function validateCards(cdp) {
  await setViewport(cdp, 1440, 900);
  await navigate(cdp, `${baseUrl}/cartoes?month=2026-06`);
  await waitFor(
    cdp,
    `Boolean(document.querySelector('[data-purchase-item]') && document.querySelector('[data-purchase-search]'))`,
    "Cards did not render purchases and search.",
  );

  await evaluate(
    cdp,
    `(() => {
      const input = document.querySelector('[data-purchase-search]');
      input.value = 'consulta-sem-resultado-visual';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`,
  );
  await waitFor(
    cdp,
    `(() => {
      const rows = Array.from(document.querySelectorAll('[data-purchase-item]'));
      const empty = document.querySelector('[data-purchase-filter-empty]');
      return rows.length > 0 && rows.every((row) => row.hidden) && Boolean(empty && !empty.hidden);
    })()`,
    "Cards search did not reach its filtered empty state.",
  );
  await evaluate(cdp, `document.querySelector('[data-clear-purchase-search]')?.click()`);
  await sleep(80);

  await evaluate(
    cdp,
    `(() => {
      const toggle = document.querySelector('[data-reconciliation-toggle="reconciled"]');
      if (!toggle) throw new Error('Reconciliation filter is missing');
      if (toggle.getAttribute('aria-pressed') === 'true') toggle.click();
      return true;
    })()`,
  );
  await sleep(100);
  const filterState = await evaluate(
    cdp,
    `(() => {
      const rows = Array.from(document.querySelectorAll('[data-purchase-item]')).filter((row) => !row.hidden);
      return { count: rows.length, onlyUnreconciled: rows.every((row) => row.dataset.reconciliation === 'unreconciled') };
    })()`,
  );
  assert.ok(filterState.count > 0, "Cards reconciliation filter hid every purchase.");
  assert.equal(
    filterState.onlyUnreconciled,
    true,
    "Cards reconciliation filter leaked reconciled rows.",
  );
  await evaluate(cdp, `document.querySelector('[data-reset-purchase-filters]')?.click()`);

  await evaluate(cdp, `document.querySelector('[data-open-modal="purchase"]')?.click()`);
  await waitFor(
    cdp,
    `Boolean(document.querySelector('dialog[data-modal="purchase"][open]'))`,
    "Cards purchase modal did not open.",
  );
  const modal = await evaluate(
    cdp,
    `(() => {
      const dialog = document.querySelector('dialog[data-modal="purchase"][open]');
      const rect = dialog?.getBoundingClientRect();
      const first = dialog?.querySelector('input, select, textarea, button');
      return {
        labelled: Boolean(dialog?.getAttribute('aria-labelledby') || dialog?.getAttribute('aria-label')),
        insideViewport: Boolean(rect && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight),
        focusInside: Boolean(dialog && dialog.contains(document.activeElement)),
        firstControlExists: Boolean(first),
      };
    })()`,
  );
  assert.equal(modal.labelled, true, "Cards purchase modal is not labelled.");
  assert.equal(modal.insideViewport, true, "Cards purchase modal exceeds the viewport.");
  assert.equal(modal.focusInside, true, "Cards purchase modal did not receive focus.");
  assert.equal(modal.firstControlExists, true, "Cards purchase modal has no interactive control.");
}

async function validateStatement(cdp) {
  const fixtureIds = await evaluate(cdp, fixtureExpression());
  const route = `/lancamentos?accountId=${encodeURIComponent(fixtureIds.longAccountId)}&month=2026-07`;
  await setViewport(cdp, 1366, 900);
  await navigate(cdp, `${baseUrl}${route}`);
  await sleep(300);
  const measurements = await evaluate(cdp, pageMeasurementExpression());
  assert.equal(measurements.globalOverflow, false, "Statement has global horizontal overflow.");
  assert.equal(
    measurements.table.hasLocalHorizontalScroll,
    true,
    "Statement lost its local table overflow strategy.",
  );

  const focus = await evaluate(
    cdp,
    `(() => {
      const trigger = document.querySelector('.statement-status[data-tooltip]');
      if (!trigger) return { exists: false, focused: false };
      trigger.focus();
      return { exists: true, focused: document.activeElement === trigger };
    })()`,
  );
  assert.equal(focus.exists, true, "Statement exposes no focusable status indicator.");
  assert.equal(focus.focused, true, "Statement status indicator did not accept focus.");
}

async function validateReports(cdp) {
  const month = await seedReportData(cdp);
  await setViewport(cdp, 390, 844);
  await navigate(
    cdp,
    `${baseUrl}/relatorios?view=category-evolution&interval=monthly&start=${month}&periods=12`,
  );
  await waitFor(
    cdp,
    `document.querySelector('[data-report-state]')?.getAttribute('data-report-state') === 'ready'`,
    "Reports did not reach ready state.",
  );
  const result = await evaluate(
    cdp,
    `(() => {
      const scroller = document.querySelector('.evolution-table-scroll');
      scroller?.focus();
      return {
        focused: document.activeElement === scroller,
        localOverflow: Boolean(scroller && scroller.scrollWidth > scroller.clientWidth + 1),
        pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      };
    })()`,
  );
  assert.equal(result.focused, true, "Reports matrix did not accept focus.");
  assert.equal(result.localOverflow, true, "Reports mobile matrix lost local overflow.");
  assert.equal(result.pageFits, true, "Reports page leaks horizontal overflow.");
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
            body: JSON.stringify({ name: 'Conta semantica ' + suffix, kind: 'checking', openingBalanceMinor: 0 }),
          })).account;
        }
        const category = (await request('/api/categories', {
          method: 'POST',
          body: JSON.stringify({ name: 'Despesa semantica ' + suffix, kind: 'expense' }),
        })).category;
        const occurredOn = new Date().toISOString().slice(0, 10);
        await request('/api/transactions', {
          method: 'POST',
          body: JSON.stringify({
            status: 'posted', occurredOn, plannedOn: occurredOn, accountId: account.id,
            kind: 'expense', categoryId: category.id, amountMinor: 87500,
            description: 'Despesa semantica ' + suffix,
          }),
        });
        return occurredOn.slice(0, 7);
      };
      return run();
    })()`,
  );
}

async function waitFor(cdp, expression, message) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(cdp, expression)) return;
    await sleep(100);
  }
  throw new Error(message);
}
