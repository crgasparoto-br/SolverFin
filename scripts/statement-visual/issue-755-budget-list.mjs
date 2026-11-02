import assert from "node:assert/strict";

export const BUDGET_LONG_LIST_PERIODS = Object.freeze(
  Array.from({ length: 10 }, (_, index) => {
    const year = 2034;
    const month = String(index + 1).padStart(2, "0");
    const end = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
    return {
      periodStartOn: `${year}-${month}-01`,
      periodEndOn: `${year}-${month}-${String(end).padStart(2, "0")}`,
    };
  }),
);

export function assertBudgetLongList(fixture, rendered) {
  const safeFixture = {
    stage: fixture.stage ?? "budget-readback",
    ok: fixture.ok,
    createdCount: fixture.createdCount,
    readbackCount: fixture.readbackCount,
  };
  assert.equal(fixture.ok, true, `Budget fixture failed: ${JSON.stringify(safeFixture)}`);
  assert.equal(fixture.createdCount, BUDGET_LONG_LIST_PERIODS.length);
  assert.equal(fixture.readbackCount, BUDGET_LONG_LIST_PERIODS.length);
  assert.equal(fixture.periodReadback, true, "Budget periods differ from their API readback");
  assert.equal(fixture.ids?.length, BUDGET_LONG_LIST_PERIODS.length);
  assert.equal(
    new Set(fixture.ids).size,
    BUDGET_LONG_LIST_PERIODS.length,
    "Budget fixture IDs must be unique",
  );
  assert.ok(fixture.categoryId && fixture.categoryName, "Budget fixture category is missing");
  const group = rendered.fixtureGroup;
  assert.ok(group, "Budget category history is missing from the DOM");
  // The last API-created budget is the newest period and must be the single grouped row.
  const newestId = fixture.ids.at(-1);
  assert.deepEqual(group.rowIds, [newestId], "Budget fixture must have exactly one category row");
  assert.equal(group.currentRowId, newestId, "Budget category row points to the wrong budget");
  assert.equal(
    group.categoryName,
    fixture.categoryName,
    "Budget category row has another category",
  );
  assert.equal(group.currency, fixture.currency, "Budget category row has another currency");
  assert.equal(
    group.historyPeriodLabels?.length,
    9,
    "Budget category must have nine history entries",
  );
  const labelFor = (period) => {
    const [year, month, day] = period.periodStartOn.split("-");
    return `${day}/${month}/${year}`;
  };
  assert.ok(
    group.currentPeriodLabel?.includes(labelFor(BUDGET_LONG_LIST_PERIODS[9])),
    "Budget category current period is missing",
  );
  for (const period of BUDGET_LONG_LIST_PERIODS.slice(0, -1)) {
    const label = labelFor(period);
    assert.equal(
      group.historyPeriodLabels.filter((text) => text.includes(label)).length,
      1,
      `Budget category history must contain exactly one ${period.periodStartOn} period`,
    );
  }
}

// prettier-ignore
export function budgetRenderedStateExpression(fixture) {
  return `(() => {
    const fixtureIds = new Set(${JSON.stringify(fixture.ids)});
    const newestId = ${JSON.stringify(fixture.ids.at(-1))};
    const rows = Array.from(document.querySelectorAll('.budget-results tbody tr[data-row-key]'));
    const matchingRows = rows.filter((row) => fixtureIds.has(row.getAttribute('data-row-key')));
    const current = matchingRows.find((row) => row.getAttribute('data-row-key') === newestId);
    const history = Array.from(current?.querySelectorAll('[data-column="period"] .budget-period-history .budget-history-entry') ?? []);
    const keys = rows.map((row) => [row.querySelector('[data-column="category"]')?.textContent?.trim(),
      row.querySelector('[data-column="currency"]')?.textContent?.trim()].join('|'));
    return {
      rows: rows.length,
      historyCount: document.querySelectorAll('.budget-results .budget-history-entry').length,
      uniqueCategories: new Set(keys).size === keys.length,
      fixtureGroup: {
        rowIds: matchingRows.map((row) => row.getAttribute('data-row-key')),
        currentRowId: current?.getAttribute('data-row-key') ?? null,
        categoryName: (() => {
          const strong = current?.querySelector('[data-column="category"] .budget-category-tree strong');
          return [...(strong?.childNodes ?? [])].filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent).join('').trim() || null;
        })(),
        currency: current?.querySelector('[data-column="currency"] .budget-currency')?.textContent?.trim() ?? null,
        currentPeriodLabel: current?.querySelector('[data-column="period"] .budget-period')?.textContent?.trim() ?? null,
        historyPeriodLabels: history.map((node) => node.querySelector('.budget-history-heading > strong')?.textContent?.trim() ?? ''),
      },
      currencies: Array.from(document.querySelectorAll('select[name="currency"] option')).map((option) => option.value),
      focused: Array.from(document.querySelectorAll('.budget-focus-item .budget-currency')).map((node) => node.textContent?.trim()),
    };
  })()`;
}

// Mutate a real category row and restore its original DOM state afterward.
// prettier-ignore
export function budgetGroupMutationsExpression(fixture) {
  return `(() => {
    const target = document.querySelector('.budget-results tr[data-row-key=${JSON.stringify(fixture.ids.at(-1))}]');
    const history = target?.querySelector('.budget-period-history');
    const march = [...(history?.querySelectorAll('.budget-history-heading > strong') ?? [])]
      .find((node) => node.textContent?.includes('01/03/2034'));
    const category = target?.querySelector('[data-column="category"] .budget-category-tree strong');
    if (!target || !history || !march || !category) throw new Error('Budget fixture target category row is incomplete');
    const categoryNameNode = [...category.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
    if (!categoryNameNode) throw new Error('Budget fixture category label missing');
    const original = { month: march.textContent, name: categoryNameNode.nodeValue };
    const read = () => ${budgetRenderedStateExpression(fixture)};
    const snapshots = {};
    try {
      march.textContent = 'month-omitted-for-negative-control';
      snapshots.missingMonth = read();
      march.textContent = original.month;
      categoryNameNode.nodeValue = 'wrong-category-for-negative-control';
      snapshots.wrongCategory = read();
      categoryNameNode.nodeValue = original.name;
      history.remove();
      snapshots.noHistory = read();
      target.querySelector('[data-column="period"]').appendChild(history);
      const duplicate = target.cloneNode(true);
      target.after(duplicate);
      snapshots.duplicateRows = read();
      duplicate.remove();
    } finally {
      march.textContent = original.month;
      categoryNameNode.nodeValue = original.name;
      if (!history.isConnected) target.querySelector('[data-column="period"]').appendChild(history);
      const table = target.closest('tbody');
      [...(table?.querySelectorAll('tr[data-row-key]') ?? [])]
        .filter((row) => row !== target && row.getAttribute('data-row-key') === target.getAttribute('data-row-key'))
        .forEach((row) => row.remove());
    }
    snapshots.restored = read();
    return snapshots;
  })()`;
}
