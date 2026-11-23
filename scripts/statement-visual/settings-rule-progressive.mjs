/** Progressive-rule keyboard, URL filters and non-mutating list verification. */
export async function validateRuleFiltersAndDisclosure(
  cdp,
  fixtures,
  { evaluate, pressKey, navigateWithRetry, waitForSettings, baseUrl },
) {
  const rest = await evaluate(
    cdp,
    `(() => {
      const details = document.querySelector('.rule-item .rule-disclosure');
      const summary = details?.querySelector('summary');
      const quickFacts = document.querySelector('.rule-item .rule-quick-facts');
      return {
        collapsedByDefault: Boolean(details && !details.open),
        summaryKeyboardReachable: Boolean(summary && summary.tabIndex >= 0),
        quickFactsVisible: Boolean(quickFacts && getComputedStyle(quickFacts).display !== 'none'),
        filterLinks: document.querySelectorAll('nav.settings-rule-filters a[href]').length === 3,
      };
    })()`,
  );
  await evaluate(cdp, `document.querySelector('.rule-item .rule-disclosure summary')?.focus()`);
  await pressKey(cdp, "Enter");
  const opened = await evaluate(
    cdp,
    `(() => ({
      open: Boolean(document.querySelector('.rule-item .rule-disclosure')?.open),
      focusVisible: Boolean(document.activeElement?.matches(':focus-visible')),
      noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
    }))()`,
  );
  await pressKey(cdp, "Enter");
  const closed = await evaluate(
    cdp,
    `!document.querySelector('.rule-item .rule-disclosure')?.open`,
  );

  const filters = [];
  for (const filter of ["ativas", "inativas"]) {
    await navigateWithRetry(
      cdp,
      `${baseUrl}/configuracoes?section=rules&filter=${filter}`,
      "rules-" + filter,
    );
    await waitForSettings(cdp, "rules");
    const observed = await evaluate(
      cdp,
      `(() => {
        const names = [...document.querySelectorAll('.rule-item .item-title-line strong')]
          .map((el) => el.textContent.trim());
        const selected = document.querySelector('.settings-rule-filter[aria-current="page"]');
        return {
          selectedFilter: selected?.getAttribute('href') || '',
          names,
          noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
          filterOnlyList: Boolean(document.querySelector('[data-api-path="/api/automation-rules/apply"]')),
        };
      })()`,
    );
    const expectedName = filter === "ativas" ? fixtures.activeName : fixtures.inactiveName;
    const unexpectedName = filter === "ativas" ? fixtures.inactiveName : fixtures.activeName;
    filters.push({
      filter,
      ...observed,
      passed:
        observed.selectedFilter.endsWith("filter=" + filter) &&
        observed.names.includes(expectedName) &&
        !observed.names.includes(unexpectedName) &&
        observed.noHorizontalOverflow &&
        observed.filterOnlyList,
    });
  }
  await navigateWithRetry(cdp, `${baseUrl}/configuracoes?section=rules`, "rules-original");
  await waitForSettings(cdp, "rules");
  return {
    rest,
    opened,
    closed,
    filters,
    passed:
      Object.values(rest).every(Boolean) &&
      opened.open &&
      opened.focusVisible &&
      opened.noHorizontalOverflow &&
      closed &&
      filters.every((filter) => filter.passed),
  };
}
