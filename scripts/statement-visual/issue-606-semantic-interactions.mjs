import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, setViewport, sleep } from "./cdp.mjs";
import { fixtureExpression, loginExpression } from "./fixtures.mjs";
import { pageMeasurementExpression } from "./measurements.mjs";
import { writeSemanticProof } from "./semantic-proof.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const sourceScenario = process.env.STATEMENT_VISUAL_SOURCE_SCENARIO_ID;
const candidateSha =
  process.env.STATEMENT_VISUAL_CANDIDATE_SHA ?? process.env.GITHUB_SHA ?? "local";

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
    const observations = await validateCards(browser.cdp);
    const assertions = [
      "behavior:component:SummaryGrid",
      "behavior:legacy:card-list-sorting",
      "behavior:legacy:card-instrument-subtotals",
      "behavior:legacy:cards-interface",
      "behavior:legacy:cards-interface-finalizer",
      "behavior:layout:desktop",
      "behavior:layout:mobile",
    ];
    await saveBehaviorEvidence("cards-interface", assertions, observations);
    await writeSemanticProof(["filters", "modal"], { surface: "cards" });
  } else if (sourceScenario === "core-pages") {
    const observations = await validateStatement(browser.cdp);
    const assertions = [
      "behavior:component:PageContainer",
      "behavior:component:PageHeader",
      "behavior:component:DataTable",
      "behavior:legacy:statement-list-sorting",
      "behavior:legacy:statement-insight-context",
      "behavior:layout:desktop",
      "behavior:layout:mobile",
    ];
    await saveBehaviorEvidence("core-pages", assertions, observations);
    await writeSemanticProof(["focus", "overflow"], { surface: "statement" });
  } else if (sourceScenario === "reports-category-evolution") {
    const observations = await validateReports(browser.cdp);
    const assertions = [
      "behavior:component:FilterBar",
      "behavior:component:SummaryGrid",
      "behavior:component:DataTable",
      "behavior:layout:desktop",
      "behavior:layout:mobile",
    ];
    await saveBehaviorEvidence("reports-category-evolution", assertions, observations);
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
  const baseRoute = "/cartoes?month=2026-06";
  await setViewport(cdp, 1440, 900);
  await navigate(cdp, `${baseUrl}${baseRoute}`);
  await waitForCards(cdp);

  const desktopStructure = await inspectCardsStructure(cdp);
  assert.equal(desktopStructure.pageFits, true, "Cards desktop page overflows horizontally.");
  assert.equal(desktopStructure.summaryVisible, true, "Cards invoice summary is not visible.");
  assert.ok(desktopStructure.purchaseCount > 0, "Cards rendered no purchases.");
  assert.ok(desktopStructure.instrumentGroupCount > 0, "Cards rendered no instrument groups.");
  assert.equal(
    desktopStructure.instrumentSubtotalsValid,
    true,
    `Cards instrument subtotal mismatch: ${JSON.stringify(desktopStructure.instrumentGroups)}`,
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
  const filteredStatus = await evaluate(
    cdp,
    `document.querySelector('[data-purchase-results-status]')?.textContent?.trim() || ''`,
  );
  assert.match(filteredStatus, /^0 compras exibidas$/);
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
      const rows = Array.from(document.querySelectorAll('[data-purchase-item]')).filter(
        (row) => !row.hidden,
      );
      return {
        count: rows.length,
        onlyUnreconciled: rows.every(
          (row) => row.dataset.reconciliation === 'unreconciled',
        ),
      };
    })()`,
  );
  assert.ok(filterState.count > 0, "Cards reconciliation filter hid every purchase.");
  assert.equal(
    filterState.onlyUnreconciled,
    true,
    "Cards reconciliation filter leaked reconciled rows.",
  );
  await evaluate(cdp, `document.querySelector('[data-reset-purchase-filters]')?.click()`);

  const dateDesc = await inspectCardSort(cdp, "date_desc");
  const dateAsc = await inspectCardSort(cdp, "date_asc");
  assert.ok(dateDesc.comparableGroups > 0, "Cards sorting has no comparable purchase group.");
  assert.equal(dateDesc.sorted, true, "Cards date_desc order is not descending.");
  assert.equal(dateAsc.sorted, true, "Cards date_asc order is not ascending.");

  await navigate(cdp, `${baseUrl}${baseRoute}`);
  await waitForCards(cdp);
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
        labelled: Boolean(
          dialog?.getAttribute('aria-labelledby') || dialog?.getAttribute('aria-label'),
        ),
        insideViewport: Boolean(
          rect &&
            rect.left >= 0 &&
            rect.right <= innerWidth &&
            rect.top >= 0 &&
            rect.bottom <= innerHeight
        ),
        focusInside: Boolean(dialog && dialog.contains(document.activeElement)),
        firstControlExists: Boolean(first),
      };
    })()`,
  );
  assert.equal(modal.labelled, true, "Cards purchase modal is not labelled.");
  assert.equal(modal.insideViewport, true, "Cards purchase modal exceeds the viewport.");
  assert.equal(modal.focusInside, true, "Cards purchase modal did not receive focus.");
  assert.equal(modal.firstControlExists, true, "Cards purchase modal has no interactive control.");

  await setViewport(cdp, 390, 844);
  await navigate(cdp, `${baseUrl}${baseRoute}`);
  await waitForCards(cdp);
  const mobileStructure = await inspectCardsStructure(cdp);
  assert.equal(mobileStructure.pageFits, true, "Cards mobile page overflows horizontally.");
  assert.equal(mobileStructure.summaryVisible, true, "Cards mobile summary is not visible.");
  assert.ok(mobileStructure.purchaseCount > 0, "Cards mobile rendered no purchases.");

  return {
    desktop: desktopStructure,
    mobile: mobileStructure,
    sorting: { dateAsc, dateDesc },
    filterState,
    filteredStatus,
    modal,
  };
}

async function inspectCardsStructure(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const parsePurchase = (row) => {
        const script = row.querySelector('script[data-purchase]');
        if (!script?.textContent) return null;
        try {
          return JSON.parse(script.textContent);
        } catch {
          return null;
        }
      };
      const parseMoneyMinor = (text) => {
        const normalized = String(text || '')
          .replace(/[^0-9,.-]/g, '')
          .replace(/\\./g, '')
          .replace(',', '.');
        const value = Number(normalized);
        return Number.isFinite(value) ? Math.round(Math.abs(value) * 100) : null;
      };
      const groups = Array.from(
        document.querySelectorAll('[data-instrument-purchase-group]'),
      ).map((group) => {
        const instrumentId = group.dataset.instrumentId || '';
        const rows = Array.from(group.querySelectorAll('[data-purchase-item]'));
        const records = rows.map(parsePurchase).filter(Boolean);
        const expectedMinor = records.reduce(
          (sum, record) => sum + Math.abs(Number(record.amountMinor || 0)),
          0,
        );
        const summary = instrumentId
          ? document.querySelector(
              '.instrument-summary-row[data-instrument-id="' + instrumentId + '"] dd',
            )
          : Array.from(document.querySelectorAll('.instrument-summary-row')).find(
              (row) => !row.hasAttribute('data-instrument-id'),
            )?.querySelector('dd');
        const displayedMinor = parseMoneyMinor(summary?.textContent || '');
        const consistentInstrument = records.every(
          (record) => String(record.cardInstrumentId || '') === instrumentId,
        );
        return {
          instrumentId,
          rowCount: records.length,
          expectedMinor,
          displayedMinor,
          consistentInstrument,
          subtotalMatches: displayedMinor === expectedMinor,
        };
      });
      const summary = document.querySelector('.invoice-overview');
      const summaryRect = summary?.getBoundingClientRect();
      return {
        viewportWidth: innerWidth,
        pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        summaryVisible: Boolean(summaryRect && summaryRect.width > 0 && summaryRect.height > 0),
        purchaseCount: document.querySelectorAll('[data-purchase-item]').length,
        instrumentGroupCount: groups.length,
        instrumentSubtotalsValid:
          groups.length > 0 &&
          groups.every(
            (group) =>
              group.rowCount > 0 && group.consistentInstrument && group.subtotalMatches,
          ),
        instrumentGroups: groups,
      };
    })()`,
  );
}

async function inspectCardSort(cdp, sort) {
  await setViewport(cdp, 1366, 900);
  await navigate(cdp, `${baseUrl}/cartoes?month=2026-06&sort=${sort}`);
  await waitForCards(cdp);
  return evaluate(
    cdp,
    `(() => {
      const direction = ${JSON.stringify(sort)};
      const groups = Array.from(
        document.querySelectorAll('[data-instrument-purchase-group]'),
      ).map((group) => {
        const dates = Array.from(group.querySelectorAll('[data-purchase-item]'))
          .map((row) => {
            const script = row.querySelector('script[data-purchase]');
            if (!script?.textContent) return '';
            try {
              const record = JSON.parse(script.textContent);
              return String(record.effectiveOn || record.plannedOn || record.occurredOn || '');
            } catch {
              return '';
            }
          })
          .filter(Boolean);
        const expected = [...dates].sort((left, right) => left.localeCompare(right));
        if (direction === 'date_desc') expected.reverse();
        return {
          dates,
          sorted: dates.length < 2 || dates.every((date, index) => date === expected[index]),
        };
      });
      return {
        direction,
        comparableGroups: groups.filter((group) => group.dates.length >= 2).length,
        sorted: groups.every((group) => group.sorted),
        groups,
      };
    })()`,
  );
}

async function waitForCards(cdp) {
  await waitFor(
    cdp,
    `Boolean(
      document.querySelector('[data-purchase-item]') &&
        document.querySelector('[data-purchase-search]') &&
        document.querySelector('.invoice-overview')
    )`,
    "Cards did not render purchases, search and invoice summary.",
  );
}

async function validateStatement(cdp) {
  const fixtureIds = await evaluate(cdp, fixtureExpression());
  const baseRoute = `/lancamentos?accountId=${encodeURIComponent(
    fixtureIds.longAccountId,
  )}&month=2026-07`;
  await setViewport(cdp, 1366, 900);
  await navigate(cdp, `${baseUrl}${baseRoute}`);
  await sleep(300);

  const measurements = await evaluate(cdp, pageMeasurementExpression());
  assert.equal(measurements.globalOverflow, false, "Statement has global horizontal overflow.");
  assert.equal(
    measurements.table.hasLocalHorizontalScroll,
    true,
    "Statement lost its local table overflow strategy.",
  );
  const structure = await inspectStatementStructure(cdp);
  assert.equal(structure.mainPresent, true, "Statement has no main region.");
  assert.equal(structure.visibleH1Count, 1, "Statement must expose one visible h1.");
  assert.ok(structure.rowCount > 0, "Statement has no data rows.");

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

  const dateAsc = await inspectStatementSort(cdp, baseRoute, "date_asc");
  const dateDesc = await inspectStatementSort(cdp, baseRoute, "date_desc");
  assert.ok(dateAsc.rowCount >= 2, "Statement sorting has fewer than two comparable rows.");
  assert.equal(dateAsc.sorted, true, "Statement date_asc order is not ascending.");
  assert.equal(dateDesc.sorted, true, "Statement date_desc order is not descending.");

  const insightFixture = await createStatementInsightFixture(cdp, fixtureIds.longAccountId);
  const insightRoute = `${baseRoute}&categoryId=${encodeURIComponent(insightFixture.categoryId)}`;
  await navigate(cdp, `${baseUrl}${insightRoute}`);
  await waitFor(
    cdp,
    `Boolean(document.querySelector('[data-insight-context]'))`,
    "Statement insight context notice did not render.",
  );
  const insight = await evaluate(
    cdp,
    `(() => {
      const expectedCategory = ${JSON.stringify(insightFixture.categoryId)};
      const records = Array.from(document.querySelectorAll('script[data-transaction]'))
        .map((script) => {
          try {
            return JSON.parse(script.textContent || '{}');
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      return {
        notice: document.querySelector('[data-insight-context]')?.textContent?.trim() || '',
        rowCount: records.length,
        allMatchCategory:
          records.length > 0 &&
          records.every((record) => String(record.categoryId || '') === expectedCategory),
      };
    })()`,
  );
  assert.match(insight.notice, /Filtro do insight ativo/);
  assert.ok(insight.rowCount > 0, "Statement insight context returned no transaction.");
  assert.equal(
    insight.allMatchCategory,
    true,
    "Statement insight context leaked another category.",
  );

  await setViewport(cdp, 390, 844);
  await navigate(cdp, `${baseUrl}${baseRoute}`);
  await sleep(250);
  const mobileMeasurements = await evaluate(cdp, pageMeasurementExpression());
  const mobileStructure = await inspectStatementStructure(cdp);
  assert.equal(
    mobileMeasurements.globalOverflow,
    false,
    "Statement mobile page overflows globally.",
  );
  assert.equal(mobileStructure.mainPresent, true, "Statement mobile has no main region.");
  assert.equal(mobileStructure.visibleH1Count, 1, "Statement mobile must expose one visible h1.");
  assert.ok(mobileStructure.rowCount > 0, "Statement mobile has no data rows.");

  return {
    desktop: { measurements, structure, focus },
    mobile: { measurements: mobileMeasurements, structure: mobileStructure },
    sorting: { dateAsc, dateDesc },
    insight,
  };
}

async function inspectStatementStructure(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const main = document.querySelector('main');
      const headings = Array.from(document.querySelectorAll('main h1')).filter((heading) => {
        const rect = heading.getBoundingClientRect();
        const style = getComputedStyle(heading);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        );
      });
      return {
        viewportWidth: innerWidth,
        mainPresent: Boolean(main),
        visibleH1Count: headings.length,
        rowCount: document.querySelectorAll('.statement-row.statement-body').length,
        tablePresent: Boolean(document.querySelector('.statement-table[role="table"]')),
        pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      };
    })()`,
  );
}

async function inspectStatementSort(cdp, baseRoute, sort) {
  await setViewport(cdp, 1366, 900);
  await navigate(cdp, `${baseUrl}${baseRoute}&sort=${sort}`);
  await sleep(200);
  return evaluate(
    cdp,
    `(() => {
      const direction = ${JSON.stringify(sort)};
      const dates = Array.from(document.querySelectorAll('script[data-transaction]'))
        .map((script) => {
          try {
            const record = JSON.parse(script.textContent || '{}');
            return String(record.effectiveOn || record.plannedOn || record.occurredOn || '');
          } catch {
            return '';
          }
        })
        .filter(Boolean);
      const expected = [...dates].sort((left, right) => left.localeCompare(right));
      if (direction === 'date_desc') expected.reverse();
      return {
        direction,
        rowCount: dates.length,
        dates,
        sorted: dates.every((date, index) => date === expected[index]),
      };
    })()`,
  );
}

async function createStatementInsightFixture(cdp, accountId) {
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
        const category = (await request('/api/categories', {
          method: 'POST',
          body: JSON.stringify({ name: 'Insight visual ' + suffix, kind: 'expense' }),
        })).category;
        await request('/api/transactions', {
          method: 'POST',
          body: JSON.stringify({
            status: 'posted',
            occurredOn: '2026-07-20',
            plannedOn: '2026-07-20',
            accountId: ${JSON.stringify(accountId)},
            kind: 'expense',
            categoryId: category.id,
            amountMinor: 3210,
            description: 'Insight visual ' + suffix,
          }),
        });
        return { categoryId: category.id };
      };
      return run();
    })()`,
  );
}

async function validateReports(cdp) {
  const month = await seedReportData(cdp);
  await setViewport(cdp, 1440, 900);
  await navigate(
    cdp,
    `${baseUrl}/relatorios?view=category-evolution&interval=monthly&start=${month}&periods=1`,
  );
  await waitForReportReady(cdp);
  const desktop = await inspectReportStructure(cdp, false);
  assert.equal(desktop.pageFits, true, "Reports desktop page overflows horizontally.");
  assert.equal(desktop.filterVisible, true, "Reports desktop filter bar is not visible.");
  assert.ok(desktop.filterControlCount >= 4, "Reports desktop filter bar has too few controls.");
  assert.ok(desktop.tableCount >= 1, "Reports desktop has no semantic table.");
  assert.ok(desktop.rowHeaderCount >= 3, "Reports desktop has incomplete report rows.");
  assert.ok(desktop.summaryBlockCount >= 1, "Reports desktop has no report summary block.");

  await setViewport(cdp, 390, 844);
  await navigate(
    cdp,
    `${baseUrl}/relatorios?view=category-evolution&interval=monthly&start=${month}&periods=12`,
  );
  await waitForReportReady(cdp);
  const mobile = await inspectReportStructure(cdp, true);
  assert.equal(mobile.focused, true, "Reports matrix did not accept focus.");
  assert.equal(mobile.localOverflow, true, "Reports mobile matrix lost local overflow.");
  assert.equal(mobile.pageFits, true, "Reports mobile page leaks horizontal overflow.");
  assert.equal(mobile.filterVisible, true, "Reports mobile filter bar is not visible.");
  assert.ok(mobile.tableCount >= 1, "Reports mobile has no semantic table.");

  return { month, desktop, mobile };
}

async function inspectReportStructure(cdp, focusScroller) {
  return evaluate(
    cdp,
    `(() => {
      const scroller = document.querySelector('.evolution-table-scroll');
      if (${JSON.stringify(focusScroller)}) scroller?.focus();
      const form = document.querySelector('.evolution-filters');
      const formRect = form?.getBoundingClientRect();
      const tables = Array.from(document.querySelectorAll('table.evolution-table'));
      return {
        viewportWidth: innerWidth,
        focused: document.activeElement === scroller,
        localOverflow: Boolean(scroller && scroller.scrollWidth > scroller.clientWidth + 1),
        pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        filterVisible: Boolean(formRect && formRect.width > 0 && formRect.height > 0),
        filterControlCount: form?.querySelectorAll('input, select, button, a').length || 0,
        tableCount: tables.length,
        rowHeaderCount: tables.reduce(
          (count, table) => count + table.querySelectorAll('th[scope="row"]').length,
          0,
        ),
        summaryBlockCount: document.querySelectorAll(
          '.currency-report-list .evolution-block',
        ).length,
      };
    })()`,
  );
}

async function waitForReportReady(cdp) {
  await waitFor(
    cdp,
    `document.querySelector('[data-report-state]')?.getAttribute('data-report-state') === 'ready'`,
    "Reports did not reach ready state.",
  );
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
            body: JSON.stringify({
              name: 'Conta semantica ' + suffix,
              kind: 'checking',
              openingBalanceMinor: 0,
            }),
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
            status: 'posted',
            occurredOn,
            plannedOn: occurredOn,
            accountId: account.id,
            kind: 'expense',
            categoryId: category.id,
            amountMinor: 87500,
            description: 'Despesa semantica ' + suffix,
          }),
        });
        return occurredOn.slice(0, 7);
      };
      return run();
    })()`,
  );
}

async function saveBehaviorEvidence(name, assertions, observations) {
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    commit: candidateSha,
    sourceScenario: name,
    assertions: [...assertions].sort(),
    observations,
  };
  await writeFile(
    join(outputDir, `issue-606-semantic-${name}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}

async function waitFor(cdp, expression, message) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(cdp, expression)) return;
    await sleep(100);
  }
  throw new Error(message);
}
