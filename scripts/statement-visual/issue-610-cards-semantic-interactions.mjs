import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";
import { writeSemanticProof } from "./semantic-proof.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const sourceScenario = process.env.STATEMENT_VISUAL_SOURCE_SCENARIO_ID;
const candidateSha =
  process.env.STATEMENT_VISUAL_CANDIDATE_SHA ?? process.env.GITHUB_SHA ?? "local";

if (!chromePath) {
  throw new Error("CHROME_BIN is required for cards semantic visual validation.");
}
if (sourceScenario !== "cards-interface") {
  throw new Error(`Unsupported cards semantic source scenario: ${sourceScenario ?? "<missing>"}.`);
}

await mkdir(outputDir, { recursive: true });

const browser = await launchChrome({ baseUrl, chromePath });
try {
  await setViewport(browser.cdp, 1366, 900);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status}`);

  const observations = await validateCards(browser.cdp);
  const assertions = [
    "behavior:component:SummaryGrid",
    "behavior:component:Tabs",
    "behavior:legacy:card-list-sorting",
    "behavior:legacy:card-instrument-subtotals",
    "behavior:legacy:cards-interface",
    "behavior:legacy:cards-interface-finalizer",
    "behavior:layout:desktop",
    "behavior:layout:mobile",
  ];
  await saveBehaviorEvidence(assertions, observations);
  await writeSemanticProof(["filters", "modal"], { surface: "cards" });
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
  assert.ok(desktopStructure.tabCount > 0, "Cards invoice Tabs primitive is not present in the real flow.");
  assert.ok(desktopStructure.purchaseCount > 0, "Cards rendered no purchases.");
  assert.ok(desktopStructure.instrumentGroupCount > 0, "Cards rendered no instrument groups.");
  assert.equal(
    desktopStructure.instrumentSubtotalsValid,
    true,
    `Cards instrument subtotal mismatch: ${JSON.stringify(desktopStructure.instrumentGroups)}`,
  );

  await navigate(
    cdp,
    `${baseUrl}${baseRoute}&q=${encodeURIComponent("consulta-sem-resultado-visual")}`,
  );
  await waitFor(
    cdp,
    `(() => {
      const empty = document.querySelector('[data-purchase-filter-empty]');
      const query = document.querySelector('[data-purchase-search]')?.value || '';
      return Boolean(empty && !empty.hidden) &&
        document.querySelectorAll('[data-purchase-item]').length === 0 &&
        query === 'consulta-sem-resultado-visual';
    })()`,
    "Cards search did not reach its SSR filtered empty state.",
  );
  const filteredState = await evaluate(
    cdp,
    `(() => ({
      rowCount: document.querySelectorAll('[data-purchase-item]').length,
      query: document.querySelector('[data-purchase-search]')?.value || '',
      status: document.querySelector('[data-purchase-results-status]')?.textContent?.trim() || '',
      emptyVisible: Boolean(document.querySelector('[data-purchase-filter-empty]')),
    }))()`,
  );
  assert.equal(filteredState.rowCount, 0, "Cards filtered state still renders purchases.");
  assert.equal(
    filteredState.query,
    "consulta-sem-resultado-visual",
    "Cards search query is not preserved by SSR filtering.",
  );
  assert.match(filteredState.status, /^0\s+compras?$/);
  assert.equal(filteredState.emptyVisible, true, "Cards filtered empty state is missing.");

  await navigate(cdp, `${baseUrl}${baseRoute}&reconciliation=unreconciled`);
  await waitForCards(cdp);
  const filterState = await evaluate(
    cdp,
    `(() => {
      const rows = Array.from(document.querySelectorAll('[data-purchase-item]'));
      const selected = document.querySelector('[data-reconciliation-toggle="unreconciled"]');
      return {
        count: rows.length,
        onlyUnreconciled: rows.every(
          (row) => row.dataset.reconciliation === 'unreconciled',
        ),
        selected: selected?.getAttribute('aria-current') === 'page',
      };
    })()`,
  );
  assert.ok(filterState.count > 0, "Cards unreconciled filter returned no purchase.");
  assert.equal(
    filterState.onlyUnreconciled,
    true,
    "Cards reconciliation filter leaked reconciled rows.",
  );
  assert.equal(filterState.selected, true, "Cards reconciliation filter lost its selected state.");

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
        firstControlExists: Boolean(dialog?.querySelector('input, select, textarea, button')),
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
  assert.ok(mobileStructure.tabCount > 0, "Cards invoice Tabs primitive is not present on mobile.");
  assert.ok(mobileStructure.purchaseCount > 0, "Cards mobile rendered no purchases.");

  return {
    desktop: desktopStructure,
    mobile: mobileStructure,
    sorting: { dateAsc, dateDesc },
    filterState,
    filteredState,
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
        const expectedByCurrency = new Map();
        for (const record of records) {
          const currency = String(record.currency || '').toUpperCase();
          expectedByCurrency.set(
            currency,
            (expectedByCurrency.get(currency) || 0) + Math.abs(Number(record.amountMinor || 0)),
          );
        }
        const displayedByCurrency = new Map();
        group.querySelectorAll('.cards-instrument-totals .sf-money[data-currency]').forEach((money) => {
          const currency = String(money.getAttribute('data-currency') || '').toUpperCase();
          const value = parseMoneyMinor(money.querySelector('.sf-money-value')?.textContent || '');
          if (currency && value !== null) displayedByCurrency.set(currency, value);
        });
        const consistentInstrument = records.every(
          (record) => String(record.cardInstrumentId || '') === instrumentId,
        );
        const subtotalMatches =
          expectedByCurrency.size === displayedByCurrency.size &&
          Array.from(expectedByCurrency.entries()).every(
            ([currency, value]) => displayedByCurrency.get(currency) === value,
          );
        return {
          instrumentId,
          rowCount: records.length,
          expectedByCurrency: Object.fromEntries(expectedByCurrency),
          displayedByCurrency: Object.fromEntries(displayedByCurrency),
          consistentInstrument,
          subtotalMatches,
        };
      });
      const summary = document.querySelector('.cards-invoice-summary');
      const summaryRect = summary?.getBoundingClientRect();
      return {
        viewportWidth: innerWidth,
        pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        summaryVisible: Boolean(summaryRect && summaryRect.width > 0 && summaryRect.height > 0),
        tabCount: document.querySelectorAll('.cards-invoice-navigation .sf-tab').length,
        purchaseCount: document.querySelectorAll('[data-purchase-item]').length,
        instrumentGroupCount: groups.length,
        instrumentSubtotalsValid:
          groups.length > 0 &&
          groups.every(
            (group) => group.rowCount > 0 && group.consistentInstrument && group.subtotalMatches,
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
      document.querySelector('[data-cards-archetype="A3"]') &&
        document.querySelector('[data-purchase-item]') &&
        document.querySelector('[data-purchase-search]') &&
        document.querySelector('.cards-invoice-summary')
    )`,
    "Cards did not render purchases, search and invoice summary.",
  );
}

async function saveBehaviorEvidence(assertions, observations) {
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    commit: candidateSha,
    sourceScenario: "cards-interface",
    assertions: [...assertions].sort(),
    observations,
  };
  await writeFile(
    join(outputDir, "issue-606-semantic-cards-interface.json"),
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
