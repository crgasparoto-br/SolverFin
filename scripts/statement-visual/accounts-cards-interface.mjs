import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  evaluate,
  launchChrome,
  navigate,
  screenshot,
  setViewport,
  sleep,
} from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir =
  process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const candidateSha =
  process.env.STATEMENT_VISUAL_CANDIDATE_SHA ?? process.env.GITHUB_SHA ?? "local";
const failures = [];
const scenarios = [];
const viewports = [
  { width: 1440, height: 900, suffix: "desktop-1440x900" },
  { width: 1366, height: 768, suffix: "desktop-1366x768" },
  { width: 390, height: 844, suffix: "mobile-390x844" },
];

if (!chromePath) {
  throw new Error("CHROME_BIN is required for accounts/cards A3 validation.");
}
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });

try {
  await setViewport(browser.cdp, 1440, 900);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  for (const viewport of viewports) {
    try {
      await validateViewport(browser.cdp, viewport);
    } catch (error) {
      failures.push({
        message: `Accounts/Cards A3 validation failed at ${viewport.width}x${viewport.height}`,
        details: serializeError(error),
      });
    }
  }
} finally {
  await browser.close(outputDir);
}

const report = {
  generatedAt: new Date().toISOString(),
  commit: candidateSha,
  browser: browser.version,
  failures,
  scenarios,
};
await writeFile(
  join(outputDir, "issue-535-accounts-cards.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`- ${failure.message}: ${failure.details}`);
  }
  process.exitCode = 1;
} else {
  console.log("Accounts/Cards A3 master-detail visual validation passed.");
}

async function validateViewport(cdp, viewport) {
  await setViewport(cdp, viewport.width, viewport.height);
  await navigate(cdp, `${baseUrl}/contas-cartoes`);
  await waitForA3(cdp);

  const baseline = await inspectPage(cdp);
  assert.equal(baseline.archetype, "A3");
  assert.equal(
    baseline.detailLayoutVisible,
    true,
    "A3 DetailLayout is not visible.",
  );
  assert.equal(baseline.masterVisible, true, "Master list is not visible.");
  assert.equal(baseline.detailVisible, true, "Selected detail is not visible.");
  assert.equal(
    baseline.noHorizontalOverflow,
    true,
    "A3 page overflows horizontally.",
  );
  assert.equal(baseline.tabArtifacts, 0, "Retired tab markup is still present.");
  assert.ok(baseline.masterItemCount > 0, "No master resources were rendered.");
  assert.equal(
    baseline.selectedMasterCount,
    1,
    "Exactly one master resource must be selected.",
  );
  assert.equal(baseline.searchVisible, true, "Master search is unavailable.");
  assert.deepEqual(baseline.statusOptions, ["all", "active", "inactive"]);
  assert.equal(baseline.loadingStatePresent, true, "Route loading state is not wired.");

  const account = await selectResource(cdp, "account");
  const card = await selectResource(cdp, "card");
  assert.ok(account, "Demo data has no account master resource.");
  assert.ok(card, "Demo data has no card master resource.");

  if (account) {
    await navigate(cdp, `${baseUrl}${account.href}`);
    await waitForDetail(cdp, "account");
    const measurements = await inspectPage(cdp);
    assert.equal(measurements.selectedKind, "account");
    assert.equal(measurements.selectedMasterCount, 1);
    assert.equal(
      measurements.currencyContextVisible,
      true,
      "Account currency context is ambiguous.",
    );
    scenarios.push({
      kind: "page",
      resourceKind: "account",
      viewport: `${viewport.width}x${viewport.height}`,
      measurements,
    });
  }

  if (card) {
    await navigate(cdp, `${baseUrl}${card.href}`);
    await waitForDetail(cdp, "card");
    const measurements = await inspectPage(cdp);
    assert.equal(measurements.selectedKind, "card");
    assert.equal(measurements.selectedMasterCount, 1);
    assert.equal(
      measurements.currencyContextVisible,
      true,
      "Card currency context is ambiguous.",
    );
    assert.equal(
      measurements.instrumentSectionVisible,
      true,
      "Card instruments are not inside the detail.",
    );
    scenarios.push({
      kind: "page",
      resourceKind: "card",
      viewport: `${viewport.width}x${viewport.height}`,
      measurements,
    });
  }

  const filter = await validateFilter(cdp);
  scenarios.push({
    kind: "filter",
    viewport: `${viewport.width}x${viewport.height}`,
    measurements: filter,
  });

  const dialog = await validateKeyboardDialog(cdp);
  scenarios.push({
    kind: "resource-dialog",
    viewport: `${viewport.width}x${viewport.height}`,
    measurements: dialog,
  });

  if (viewport.width === 1366) {
    const failureState = await validateSaveFailureStates(cdp);
    scenarios.push({
      kind: "save-failure",
      viewport: "1366x768",
      measurements: failureState,
    });

    const destructive = await validateConfirmationCancellation(cdp);
    scenarios.push({
      kind: "confirmation-cancel",
      viewport: "1366x768",
      measurements: destructive,
    });

    const longContent = await validateLongContent(cdp);
    scenarios.push({
      kind: "long-content",
      viewport: "1366x768",
      measurements: longContent,
    });
  }

  await screenshot(
    cdp,
    join(outputDir, `issue-612-accounts-cards-${viewport.suffix}.png`),
  );
}

async function inspectPage(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const visible = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };
      const detail = document.querySelector('[data-resource-detail]');
      const detailText = detail?.textContent || '';
      const masterItems = Array.from(document.querySelectorAll('[data-resource-master-item]'));
      return {
        archetype: document.querySelector('[data-accounts-cards-archetype]')?.getAttribute('data-accounts-cards-archetype') || '',
        noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        detailLayoutVisible: visible(document.querySelector('.sf-detail-layout')),
        masterVisible: visible(document.querySelector('.resource-master-panel')),
        detailVisible: visible(document.querySelector('.resource-detail-panel')),
        masterItemCount: masterItems.length,
        selectedMasterCount: document.querySelectorAll('[data-resource-master-item] [aria-current="page"]').length,
        selectedKind: detail?.getAttribute('data-resource-detail') || '',
        tabArtifacts: document.querySelectorAll('[data-tab-panel], [role="tab"], .sf-tabs').length,
        searchVisible: visible(document.querySelector('[data-master-search]')),
        statusOptions: Array.from(document.querySelectorAll('[data-master-status] option')).map((option) => option.value),
        currencyContextVisible: /Moeda/i.test(detailText) && (/\b(BRL|USD|EUR)\b/.test(detailText) || /Moeda (indisponível|não informada)/i.test(detailText)),
        instrumentSectionVisible: visible(document.querySelector('.resource-instruments')),
        instrumentCount: document.querySelectorAll('[data-card-instrument]').length,
        loadingStatePresent: Boolean(document.querySelector('[data-resource-loading]')),
        directActionCount: detail ? detail.querySelectorAll('.resource-detail-actions button, .resource-detail-actions a').length : 0,
      };
    })()`,
  );
}

async function selectResource(cdp, kind) {
  return evaluate(
    cdp,
    `(() => {
      const link = Array.from(document.querySelectorAll('[data-resource-master-item] .resource-master-link')).find((candidate) => {
        const value = new URL(candidate.href).searchParams.get('resource') || '';
        return value.startsWith(${JSON.stringify(`${kind}:`)});
      });
      if (!link) return null;
      const url = new URL(link.href);
      return { href: url.pathname + url.search, label: link.textContent?.trim() || '' };
    })()`,
  );
}

async function validateFilter(cdp) {
  const state = await evaluate(
    cdp,
    `(() => {
      const input = document.querySelector('[data-master-search]');
      if (!input) return { available: false };
      input.value = 'consulta-sem-resultado-issue-612';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const items = Array.from(document.querySelectorAll('[data-resource-master-item]'));
      const empty = document.querySelector('[data-filter-empty]');
      const result = {
        available: true,
        hiddenCount: items.filter((item) => item.hidden).length,
        totalCount: items.length,
        emptyVisible: Boolean(empty && !empty.hidden),
      };
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return result;
    })()`,
  );
  assert.equal(state.available, true);
  assert.ok(state.totalCount > 0);
  assert.equal(
    state.hiddenCount,
    state.totalCount,
    "Search did not filter the unified master list.",
  );
  assert.equal(
    state.emptyVisible,
    true,
    "Filtered empty state is not visible.",
  );
  return state;
}

async function validateKeyboardDialog(cdp) {
  const prepared = await evaluate(
    cdp,
    `(() => {
      const trigger = document.querySelector('[data-resource-detail] [data-open-dialog]');
      if (!trigger) return false;
      trigger.focus();
      return document.activeElement === trigger;
    })()`,
  );
  assert.equal(prepared, true, "No focusable direct edit action is available.");

  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
  });
  await waitFor(
    cdp,
    `Boolean(document.querySelector('dialog.master-dialog[open]:not(#accounts-cards-confirm-dialog)'))`,
    "Resource dialog did not open with Enter.",
  );

  const opened = await evaluate(
    cdp,
    `(() => {
      const dialog = document.querySelector('dialog.master-dialog[open]:not(#accounts-cards-confirm-dialog)');
      const rect = dialog?.getBoundingClientRect();
      return {
        open: Boolean(dialog),
        labelled: Boolean(dialog?.getAttribute('aria-labelledby') || dialog?.getAttribute('aria-label')),
        insideViewport: Boolean(rect && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight),
        focusInside: Boolean(dialog && dialog.contains(document.activeElement)),
      };
    })()`,
  );
  assert.equal(opened.open, true);
  assert.equal(opened.labelled, true);
  assert.equal(
    opened.insideViewport,
    true,
    "Resource dialog exceeds the viewport.",
  );
  assert.equal(
    opened.focusInside,
    true,
    "Resource dialog did not receive focus.",
  );

  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
  });
  await sleep(100);
  const closed = await evaluate(
    cdp,
    `(() => ({
      open: Boolean(document.querySelector('dialog.master-dialog[open]:not(#accounts-cards-confirm-dialog)')),
      focusRestored: document.activeElement?.matches?.('[data-resource-detail] [data-open-dialog]') === true,
    }))()`,
  );
  assert.equal(closed.open, false, "Resource dialog did not close with Escape.");
  assert.equal(
    closed.focusRestored,
    true,
    "Focus was not restored to the dialog trigger.",
  );
  return { ...opened, closed };
}

async function validateSaveFailureStates(cdp) {
  await evaluate(
    cdp,
    `document.querySelector('[data-resource-detail] [data-open-dialog]')?.click()`,
  );
  await waitFor(
    cdp,
    `Boolean(document.querySelector('dialog.master-dialog[open]:not(#accounts-cards-confirm-dialog)'))`,
    "Edit dialog did not reopen.",
  );

  const prepared = await evaluate(
    cdp,
    `(() => {
      const dialog = document.querySelector('dialog.master-dialog[open]:not(#accounts-cards-confirm-dialog)');
      const form = dialog?.querySelector('form[data-api-form]');
      if (!form || !form.checkValidity()) return false;
      window.__issue612OriginalFetch = window.fetch;
      window.__issue612ResolveFetch = null;
      window.fetch = () => new Promise((resolve) => { window.__issue612ResolveFetch = resolve; });
      form.requestSubmit();
      return true;
    })()`,
  );
  assert.equal(
    prepared,
    true,
    "Could not prepare a valid save form for loading/error coverage.",
  );
  await sleep(80);

  const loading = await evaluate(
    cdp,
    `(() => ({
      visible: Boolean(document.querySelector('[data-resource-loading]') && !document.querySelector('[data-resource-loading]').hidden),
      status: document.querySelector('dialog.master-dialog[open] [data-form-status]')?.textContent?.trim() || '',
    }))()`,
  );
  assert.equal(
    loading.visible,
    true,
    "Loading state did not become visible during save.",
  );
  assert.match(loading.status, /Salvando/i);

  await evaluate(
    cdp,
    `(() => {
      window.__issue612ResolveFetch?.(new Response(JSON.stringify({ error: { message: 'Falha simulada de validação' } }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }));
    })()`,
  );
  await sleep(120);
  const failed = await evaluate(
    cdp,
    `(() => {
      const status = document.querySelector('dialog.master-dialog[open] [data-form-status]');
      const result = {
        loadingHidden: Boolean(document.querySelector('[data-resource-loading]')?.hidden),
        status: status?.textContent?.trim() || '',
        statusClass: status?.className || '',
      };
      if (window.__issue612OriginalFetch) window.fetch = window.__issue612OriginalFetch;
      delete window.__issue612OriginalFetch;
      delete window.__issue612ResolveFetch;
      return result;
    })()`,
  );
  assert.equal(
    failed.loadingHidden,
    true,
    "Loading state remained visible after save failure.",
  );
  assert.match(failed.status, /Falha simulada/i);
  assert.match(failed.statusClass, /error/);

  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
  });
  await sleep(80);
  return { loading, failed };
}

async function validateConfirmationCancellation(cdp) {
  const prepared = await evaluate(
    cdp,
    `(() => {
      const form = document.querySelector('[data-resource-detail] form[data-confirm]');
      if (!form) return false;
      window.__issue612OriginalFetch = window.fetch;
      window.__issue612FetchCount = 0;
      window.fetch = (...args) => {
        window.__issue612FetchCount += 1;
        return window.__issue612OriginalFetch(...args);
      };
      form.requestSubmit();
      return true;
    })()`,
  );
  assert.equal(
    prepared,
    true,
    "No destructive action requiring confirmation was found.",
  );
  await waitFor(
    cdp,
    `Boolean(document.querySelector('#accounts-cards-confirm-dialog[open]'))`,
    "Confirmation dialog did not open.",
  );
  await evaluate(cdp, `document.querySelector('[data-confirm-cancel]')?.click()`);
  await sleep(80);
  const result = await evaluate(
    cdp,
    `(() => {
      const value = {
        open: Boolean(document.querySelector('#accounts-cards-confirm-dialog[open]')),
        requestCount: Number(window.__issue612FetchCount || 0),
      };
      if (window.__issue612OriginalFetch) window.fetch = window.__issue612OriginalFetch;
      delete window.__issue612OriginalFetch;
      delete window.__issue612FetchCount;
      return value;
    })()`,
  );
  assert.equal(
    result.open,
    false,
    "Confirmation dialog did not close after cancellation.",
  );
  assert.equal(
    result.requestCount,
    0,
    "Cancelled destructive action still called the API.",
  );
  return { ...result, cancelledWithoutRequest: true };
}

async function validateLongContent(cdp) {
  const original = await evaluate(
    cdp,
    `(() => {
      const title = document.querySelector('[data-resource-detail] h2');
      const masterTitle = document.querySelector('[data-resource-master-item] .resource-master-title strong');
      const values = { title: title?.textContent || '', masterTitle: masterTitle?.textContent || '' };
      const long = 'Recurso financeiro internacional com identificação deliberadamente extensa para validar reflow sem perda de ações ou contexto monetário';
      if (title) title.textContent = long;
      if (masterTitle) masterTitle.textContent = long;
      return values;
    })()`,
  );
  await sleep(80);
  const result = await evaluate(
    cdp,
    `(() => ({
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      detailVisible: Boolean(document.querySelector('[data-resource-detail]')?.getClientRects().length),
      actionsVisible: Boolean(document.querySelector('.resource-detail-actions')?.getClientRects().length),
    }))()`,
  );
  assert.equal(
    result.noHorizontalOverflow,
    true,
    "Long content creates horizontal overflow.",
  );
  assert.equal(result.detailVisible, true);
  assert.equal(
    result.actionsVisible,
    true,
    "Long content hides maintenance actions.",
  );
  await evaluate(
    cdp,
    `((values) => {
      const title = document.querySelector('[data-resource-detail] h2');
      const masterTitle = document.querySelector('[data-resource-master-item] .resource-master-title strong');
      if (title) title.textContent = values.title;
      if (masterTitle) masterTitle.textContent = values.masterTitle;
    })(${JSON.stringify(original)})`,
  );
  return result;
}

async function waitForA3(cdp) {
  await waitFor(
    cdp,
    `Boolean(document.querySelector('[data-accounts-cards-archetype="A3"]') && document.querySelector('[data-resource-master-item]'))`,
    "Accounts/Cards A3 did not render master resources.",
  );
}

async function waitForDetail(cdp, kind) {
  await waitFor(
    cdp,
    `Boolean(document.querySelector('[data-resource-detail="${kind}"]'))`,
    `Accounts/Cards did not render ${kind} detail.`,
  );
}

async function waitFor(cdp, expression, message) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(cdp, expression)) return;
    await sleep(100);
  }
  throw new Error(message);
}

function serializeError(error) {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
