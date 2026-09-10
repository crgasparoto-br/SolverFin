import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, setViewport } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const candidateSha =
  process.env.STATEMENT_VISUAL_CANDIDATE_SHA ?? process.env.GITHUB_SHA ?? "local";
const storageKey = "solverfin:accounts-cards:filters:v1";
const scenarios = [];

if (!chromePath) {
  throw new Error("CHROME_BIN is required for issue #659 visual validation.");
}
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });

try {
  await setViewport(browser.cdp, 1440, 900);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  for (const viewport of [
    { width: 1440, height: 900, name: "desktop" },
    { width: 390, height: 844, name: "mobile" },
  ]) {
    await setViewport(browser.cdp, viewport.width, viewport.height);
    await navigate(browser.cdp, `${baseUrl}/contas-cartoes`);
    await waitForControls(browser.cdp);
    await evaluate(browser.cdp, `sessionStorage.removeItem(${JSON.stringify(storageKey)})`);
    await navigate(browser.cdp, `${baseUrl}/contas-cartoes`);
    await waitForControls(browser.cdp);

    const seed = await choosePersistableState(browser.cdp);
    assert.equal(seed.available, true, "Filter controls or resources are unavailable.");
    assert.notEqual(seed.currency, "all", "Demo seed does not expose a persisted currency option.");

    await navigate(browser.cdp, `${baseUrl}${seed.resourceHref}`);
    await waitForControls(browser.cdp);
    const afterSelection = await readState(browser.cdp);
    assert.deepEqual(
      afterSelection.filters,
      seed.filters,
      "Selecting a resource lost persisted filters.",
    );
    assert.match(
      afterSelection.location,
      /[?&]resource=/,
      "Resource selection is no longer URL-addressable.",
    );

    await navigate(browser.cdp, `${baseUrl}/dashboard`);
    await navigate(browser.cdp, `${baseUrl}/contas-cartoes`);
    await waitForControls(browser.cdp);
    const afterReturn = await readState(browser.cdp);
    assert.deepEqual(
      afterReturn.filters,
      seed.filters,
      "Leaving and returning to the route lost filters.",
    );

    await navigate(browser.cdp, `${baseUrl}/contas-cartoes`);
    await waitForControls(browser.cdp);
    const afterReload = await readState(browser.cdp);
    assert.deepEqual(afterReload.filters, seed.filters, "Reload lost persisted filters.");

    const afterSingleClear = await evaluate(
      browser.cdp,
      `(() => {
        const search = document.querySelector('[data-master-search]');
        search.value = '';
        search.dispatchEvent(new Event('input', { bubbles: true }));
        return JSON.parse(sessionStorage.getItem(${JSON.stringify(storageKey)}) || '{}');
      })()`,
    );
    assert.equal(
      afterSingleClear.search,
      "",
      "Clearing one filter did not persist the neutral value.",
    );
    assert.equal(afterSingleClear.kind, seed.filters.kind);
    assert.equal(afterSingleClear.currency, seed.filters.currency);
    assert.equal(afterSingleClear.status, seed.filters.status);

    await evaluate(
      browser.cdp,
      `(() => {
        const controls = [
          ['[data-master-search]', '', 'input'],
          ['[data-master-kind]', 'all', 'change'],
          ['[data-master-currency]', 'all', 'change'],
          ['[data-master-status]', 'all', 'change'],
        ];
        controls.forEach(([selector, value, eventName]) => {
          const control = document.querySelector(selector);
          control.value = value;
          control.dispatchEvent(new Event(eventName, { bubbles: true }));
        });
      })()`,
    );
    await navigate(browser.cdp, `${baseUrl}/contas-cartoes`);
    await waitForControls(browser.cdp);
    const afterClearAll = await readState(browser.cdp);
    assert.deepEqual(
      afterClearAll.filters,
      { search: "", kind: "all", currency: "all", status: "all" },
      "Clearing all filters did not persist the neutral state.",
    );

    await evaluate(
      browser.cdp,
      `sessionStorage.setItem(${JSON.stringify(storageKey)}, JSON.stringify({ search: 'persisted-search', kind: 'invalid-kind', currency: 'ZZZ', status: 'invalid-status' }))`,
    );
    await navigate(browser.cdp, `${baseUrl}/contas-cartoes`);
    await waitForControls(browser.cdp);
    const invalid = await readState(browser.cdp);
    assert.equal(invalid.filters.search, "persisted-search");
    assert.equal(invalid.filters.kind, "all");
    assert.equal(invalid.filters.currency, "all");
    assert.equal(invalid.filters.status, "all");

    await evaluate(
      browser.cdp,
      `sessionStorage.setItem(${JSON.stringify(storageKey)}, '{invalid-json')`,
    );
    await navigate(browser.cdp, `${baseUrl}/contas-cartoes`);
    await waitForControls(browser.cdp);
    const malformed = await readState(browser.cdp);
    assert.deepEqual(
      malformed.filters,
      { search: "", kind: "all", currency: "all", status: "all" },
      "Malformed persisted state did not degrade to neutral filters.",
    );

    scenarios.push({
      viewport: viewport.name,
      seed: seed.filters,
      afterSelection,
      afterReturn,
      afterReload,
      afterSingleClear,
      afterClearAll,
      invalid,
      malformed,
    });
  }
} finally {
  await browser.close(outputDir);
}

await writeFile(
  join(outputDir, "issue-659-accounts-cards-filter-persistence.json"),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), commit: candidateSha, scenarios }, null, 2)}\n`,
);
console.log("Issue #659 accounts/cards filter persistence visual validation passed.");

async function choosePersistableState(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const search = document.querySelector('[data-master-search]');
      const kind = document.querySelector('[data-master-kind]');
      const currency = document.querySelector('[data-master-currency]');
      const status = document.querySelector('[data-master-status]');
      const items = Array.from(document.querySelectorAll('[data-resource-master-item]'));
      if (!search || !kind || !currency || !status || items.length === 0) return { available: false };
      const target = items.find((item) => item.dataset.status === 'active') || items[0];
      const targetName = target.querySelector('.resource-master-title strong')?.textContent?.trim() || '';
      const targetKind = target.dataset.kind || 'all';
      const targetCurrency = target.dataset.currency || 'unavailable';
      const targetStatus = target.dataset.status === 'active' ? 'active' : 'inactive';
      const resourceHref = target.querySelector('.resource-master-link')?.getAttribute('href') || '/contas-cartoes';
      search.value = targetName;
      kind.value = targetKind;
      currency.value = targetCurrency;
      status.value = targetStatus;
      search.dispatchEvent(new Event('input', { bubbles: true }));
      kind.dispatchEvent(new Event('change', { bubbles: true }));
      currency.dispatchEvent(new Event('change', { bubbles: true }));
      status.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        available: true,
        currency: targetCurrency,
        resourceHref,
        filters: { search: targetName, kind: targetKind, currency: targetCurrency, status: targetStatus },
      };
    })()`,
  );
}

async function readState(cdp) {
  return evaluate(
    cdp,
    `(() => ({
      filters: {
        search: document.querySelector('[data-master-search]')?.value || '',
        kind: document.querySelector('[data-master-kind]')?.value || 'all',
        currency: document.querySelector('[data-master-currency]')?.value || 'all',
        status: document.querySelector('[data-master-status]')?.value || 'all',
      },
      location: location.pathname + location.search,
      persisted: sessionStorage.getItem(${JSON.stringify(storageKey)}),
      selectedCount: document.querySelectorAll('[data-resource-master-item] [aria-current="page"]').length,
      neutralVisible: Boolean(document.querySelector('[data-filter-selection-empty]') && !document.querySelector('[data-filter-selection-empty]').hidden),
    }))()`,
  );
}

async function waitForControls(cdp) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const ready = await evaluate(
      cdp,
      `Boolean(document.querySelector('[data-master-search]') && document.querySelector('[data-master-kind]') && document.querySelector('[data-master-currency]') && document.querySelector('[data-master-status]'))`,
    );
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Accounts/Cards filter controls did not render.");
}
