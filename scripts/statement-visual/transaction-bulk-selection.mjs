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
import { fixtureExpression, loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir =
  process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;

if (!chromePath) {
  throw new Error("CHROME_BIN is required for issue 530 visual validation.");
}
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
let groupId;

try {
  await setViewport(browser.cdp, 1366, 900);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(
    login.ok,
    true,
    `Demo login failed: ${login.status} ${login.body}`,
  );
  const fixtureIds = await evaluate(browser.cdp, fixtureExpression());
  const route =
    `/lancamentos?accountId=${encodeURIComponent(fixtureIds.longAccountId)}` +
    "&month=2026-07";

  await navigate(browser.cdp, `${baseUrl}${route}`);
  const created = await evaluate(
    browser.cdp,
    `(async () => {
      async function request(path, method, body) {
        const response = await fetch(path, {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body)
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(method + " " + path + " failed: " + JSON.stringify(payload));
        return payload;
      }
      const accountId = ${JSON.stringify(fixtureIds.longAccountId)};
      const members = [];
      for (const [index, amountMinor] of [10000, 20000].entries()) {
        members.push((await request("/api/transactions", "POST", {
          accountId,
          kind: "income",
          amountMinor,
          occurredOn: "2026-07-" + String(20 + index).padStart(2, "0"),
          plannedOn: "2026-07-" + String(20 + index).padStart(2, "0"),
          effectiveOn: "2026-07-" + String(20 + index).padStart(2, "0"),
          status: "posted",
          description: "QA issue 530 membro " + (index + 1),
          currency: "BRL"
        })).transaction);
      }
      const direct = (await request("/api/transactions", "POST", {
        accountId,
        kind: "income",
        amountMinor: 5000,
        occurredOn: "2026-07-22",
        plannedOn: "2026-07-22",
        effectiveOn: "2026-07-22",
        status: "posted",
        description: "QA issue 530 simples",
        currency: "BRL"
      })).transaction;
      const group = (await request("/api/transaction-groups", "POST", {
        memberIds: members.map((member) => member.id),
        description: "QA issue 530 agrupamento",
        displayOn: "2026-07-21"
      })).group;
      return { groupId: group.id, directId: direct.id };
    })()`,
  );
  groupId = created.groupId;

  await navigate(browser.cdp, `${baseUrl}${route}`);
  await sleep(250);

  const initial = await evaluate(
    browser.cdp,
    `(() => {
      const row = document.querySelector('[data-group-row="${created.groupId}"]');
      const marker = row?.querySelector('[data-selection-entity="group"]');
      const financialStatus = row?.querySelector('.grouped-status > .statement-status:not(.transaction-group-state)');
      const groupState = row?.querySelector('[data-transaction-group-state]');
      return {
        rowFound: Boolean(row),
        markerFound: Boolean(marker),
        markerLabel: marker?.getAttribute('aria-label') || '',
        financialStatus: financialStatus?.getAttribute('aria-label') || '',
        groupStateLabel: groupState?.getAttribute('aria-label') || '',
        groupStateTooltip: groupState?.getAttribute('data-tooltip') || '',
        groupStateFocusable: groupState?.tabIndex === 0,
        groupStateUsesStatusStyle: groupState?.classList.contains('statement-status') || false
      };
    })()`,
  );
  assert.equal(initial.rowFound, true);
  assert.equal(initial.markerFound, true);
  assert.match(initial.markerLabel, /2 lançamentos/);
  assert.equal(initial.financialStatus, "Efetivado não conciliado");
  assert.equal(initial.groupStateLabel, "Agrupamento com 2 lançamentos");
  assert.equal(initial.groupStateTooltip, initial.groupStateLabel);
  assert.equal(initial.groupStateFocusable, true);
  assert.equal(initial.groupStateUsesStatusStyle, true);

  const mixedSelection = await selectMixed(browser.cdp, created);
  assert.equal(mixedSelection.hidden, false);
  assert.equal(mixedSelection.count, "2 itens · 3 lançamentos");
  assert.match(mixedSelection.total, /350,00/);
  assert.equal(mixedSelection.groupDisabled, true);
  assert.equal(mixedSelection.reconcileDisabled, false);
  assert.equal(mixedSelection.unreconcileDisabled, true);
  assert.equal(mixedSelection.voidDisabled, false);
  assert.match(mixedSelection.help, /desmarque os agrupamentos/i);
  assert.match(
    mixedSelection.help,
    /nenhum lançamento selecionado está conciliado/i,
  );

  await evaluate(
    browser.cdp,
    `window.scrollTo(0, Math.max(0, (document.documentElement.scrollHeight - window.innerHeight) / 2))`,
  );
  await sleep(120);
  const desktop = await readBarMetrics(browser.cdp);
  assert.equal(desktop.computedPosition, "fixed");
  assert.equal(desktop.computedBottom, "16px");
  assert.equal(desktop.visibleInViewport, true);
  assert.equal(desktop.bodyOverflow, false);
  assert.ok(
    desktop.barHeight < 220,
    `Selection bar dimensions are invalid: ${JSON.stringify(desktop)}`,
  );
  assert.ok(
    desktop.barScrollWidth <= desktop.barClientWidth + 1,
    `Selection bar has horizontal overflow: ${JSON.stringify(desktop)}`,
  );
  await screenshot(
    browser.cdp,
    join(outputDir, "issue-530-mixed-selection-1366x900.png"),
  );

  await setViewport(browser.cdp, 1366, 768);
  await sleep(150);
  const shortDesktop = await readBarMetrics(browser.cdp);
  assert.equal(shortDesktop.visibleInViewport, true);
  assert.equal(shortDesktop.bodyOverflow, false);
  assert.ok(shortDesktop.barHeight < 240);
  await screenshot(
    browser.cdp,
    join(outputDir, "issue-530-mixed-selection-1366x768.png"),
  );

  await setViewport(browser.cdp, 390, 844);
  await sleep(150);
  const mobile = await evaluate(
    browser.cdp,
    `(() => {
      const bar = document.querySelector('[data-selection-bar]');
      const rect = bar.getBoundingClientRect();
      return {
        bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        barWidth: Math.round(rect.width),
        barHeight: Math.round(rect.height),
        viewportWidth: document.documentElement.clientWidth,
        viewportHeight: window.innerHeight,
        visibleInViewport: rect.top >= 0 && rect.bottom <= window.innerHeight,
        actionCount: bar.querySelectorAll('[data-bulk-selection-action]').length,
        helpVisible: Boolean(bar.querySelector('[data-bulk-selection-help]').textContent.trim())
      };
    })()`,
  );
  assert.equal(mobile.bodyOverflow, false);
  assert.ok(mobile.barWidth <= mobile.viewportWidth);
  assert.ok(mobile.barHeight < mobile.viewportHeight);
  assert.equal(mobile.visibleInViewport, true);
  assert.equal(mobile.actionCount, 3);
  assert.equal(mobile.helpVisible, true);
  await screenshot(
    browser.cdp,
    join(outputDir, "issue-530-mixed-selection-390x844.png"),
  );

  await setViewport(browser.cdp, 1366, 900);
  await navigate(browser.cdp, `${baseUrl}${route}`);
  await sleep(150);
  await selectMixed(browser.cdp, created);

  const serverFailure = await evaluate(
    browser.cdp,
    `(async () => {
      const originalFetch = window.fetch;
      window.confirm = () => true;
      window.fetch = async (input, init) => {
        if (String(input).includes('/api/transactions/bulk-actions')) {
          return new Response(JSON.stringify({ error: { message: 'Falha controlada para manter a seleção.' } }), {
            status: 409,
            headers: { 'content-type': 'application/json' }
          });
        }
        return originalFetch(input, init);
      };
      document.querySelector('[data-bulk-selection-action="reconcile"]').click();
      await new Promise((resolve) => setTimeout(resolve, 80));
      const result = {
        selectedCount: document.querySelectorAll('[data-select-transaction]:checked').length,
        status: document.querySelector('[data-bulk-selection-status]').textContent.trim(),
        ariaBusy: document.querySelector('[data-selection-bar]').getAttribute('aria-busy')
      };
      window.fetch = originalFetch;
      return result;
    })()`,
  );
  assert.equal(serverFailure.selectedCount, 2);
  assert.equal(serverFailure.status, "Falha controlada para manter a seleção.");
  assert.equal(serverFailure.ariaBusy, "false");

  const networkFailure = await evaluate(
    browser.cdp,
    `(async () => {
      const originalFetch = window.fetch;
      window.confirm = () => true;
      window.fetch = async (input, init) => {
        if (String(input).includes('/api/transactions/bulk-actions')) throw new TypeError('network unavailable');
        return originalFetch(input, init);
      };
      document.querySelector('[data-bulk-selection-action="reconcile"]').click();
      await new Promise((resolve) => setTimeout(resolve, 80));
      const result = {
        selectedCount: document.querySelectorAll('[data-select-transaction]:checked').length,
        status: document.querySelector('[data-bulk-selection-status]').textContent.trim(),
        ariaBusy: document.querySelector('[data-selection-bar]').getAttribute('aria-busy')
      };
      window.fetch = originalFetch;
      return result;
    })()`,
  );
  assert.equal(networkFailure.selectedCount, 2);
  assert.match(
    networkFailure.status,
    /verifique sua conexão e tente novamente/i,
  );
  assert.equal(networkFailure.ariaBusy, "false");

  await navigate(browser.cdp, `${baseUrl}${route}`);
  await sleep(150);
  await selectMixed(browser.cdp, created);
  const keyboardPrepared = await evaluate(
    browser.cdp,
    `(() => {
      const originalFetch = window.fetch.bind(window);
      window.confirm = () => true;
      window.fetch = async (input, init) => {
        if (String(input).includes('/api/transactions/bulk-actions')) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        return originalFetch(input, init);
      };
      const button = document.querySelector('[data-bulk-selection-action="reconcile"]');
      button.focus();
      return { focused: document.activeElement === button };
    })()`,
  );
  assert.equal(keyboardPrepared.focused, true);
  const reconcileLoaded = browser.cdp.once("Page.loadEventFired", 20_000);
  await browser.cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await browser.cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await sleep(40);
  const loading = await evaluate(
    browser.cdp,
    `(() => {
      const bar = document.querySelector('[data-selection-bar]');
      return {
        ariaBusy: bar.getAttribute('aria-busy'),
        actionsDisabled: Array.from(bar.querySelectorAll('[data-bulk-selection-action]')).every((button) => button.disabled),
        clearDisabled: bar.querySelector('[data-selection-clear]').disabled,
        status: bar.querySelector('[data-bulk-selection-status]').textContent.trim()
      };
    })()`,
  );
  assert.equal(loading.ariaBusy, "true");
  assert.equal(loading.actionsDisabled, true);
  assert.equal(loading.clearDisabled, true);
  assert.equal(loading.status, "Processando...");
  await reconcileLoaded;
  await sleep(120);

  const reconciled = await readRenderedStatuses(browser.cdp, created);
  assert.equal(reconciled.groupPresent, true);
  assert.equal(reconciled.groupStatus, "Conciliado");
  assert.equal(reconciled.directStatus, "Conciliado");

  await selectMixed(browser.cdp, created);
  const unreconcileLoaded = browser.cdp.once(
    "Page.loadEventFired",
    20_000,
  );
  await evaluate(
    browser.cdp,
    `(() => {
      window.confirm = () => true;
      document.querySelector('[data-bulk-selection-action="unreconcile"]').click();
    })()`,
  );
  await unreconcileLoaded;
  await sleep(120);

  const unreconciled = await readRenderedStatuses(browser.cdp, created);
  assert.equal(unreconciled.groupPresent, true);
  assert.equal(unreconciled.groupStatus, "Efetivado não conciliado");
  assert.equal(unreconciled.directStatus, "Efetivado não conciliado");

  await selectMixed(browser.cdp, created);
  const cancelledDeletion = await evaluate(
    browser.cdp,
    `(async () => {
      const originalFetch = window.fetch;
      let bulkCalls = 0;
      window.confirm = () => false;
      window.fetch = async (input, init) => {
        if (String(input).includes('/api/transactions/bulk-actions')) bulkCalls += 1;
        return originalFetch(input, init);
      };
      document.querySelector('[data-bulk-selection-action="void"]').click();
      await new Promise((resolve) => setTimeout(resolve, 80));
      const result = {
        bulkCalls,
        selectedCount: document.querySelectorAll('[data-select-transaction]:checked').length,
        groupPresent: Boolean(document.querySelector('[data-group-row="${created.groupId}"]')),
        directPresent: Boolean(document.querySelector('[data-select-transaction][value="${created.directId}"]')),
        ariaBusy: document.querySelector('[data-selection-bar]').getAttribute('aria-busy')
      };
      window.fetch = originalFetch;
      return result;
    })()`,
  );
  assert.equal(cancelledDeletion.bulkCalls, 0);
  assert.equal(cancelledDeletion.selectedCount, 2);
  assert.equal(cancelledDeletion.groupPresent, true);
  assert.equal(cancelledDeletion.directPresent, true);
  assert.notEqual(cancelledDeletion.ariaBusy, "true");

  const deleteLoaded = browser.cdp.once("Page.loadEventFired", 20_000);
  await evaluate(
    browser.cdp,
    `(() => {
      window.confirm = () => true;
      document.querySelector('[data-bulk-selection-action="void"]').click();
    })()`,
  );
  await deleteLoaded;
  await sleep(120);
  const deleted = await evaluate(
    browser.cdp,
    `(() => ({
      groupPresent: Boolean(document.querySelector('[data-group-row="${created.groupId}"]')),
      directPresent: Boolean(document.querySelector('[data-select-transaction][value="${created.directId}"]')),
      selectionBarHidden: document.querySelector('[data-selection-bar]').hidden
    }))()`,
  );
  assert.equal(deleted.groupPresent, false);
  assert.equal(deleted.directPresent, false);
  assert.equal(deleted.selectionBarHidden, true);

  await writeFile(
    join(outputDir, "issue-530-bulk-selection.json"),
    `${JSON.stringify(
      {
        initial,
        mixedSelection,
        desktop,
        shortDesktop,
        mobile,
        serverFailure,
        networkFailure,
        loading,
        reconciled,
        unreconciled,
        cancelledDeletion,
        deleted,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  if (groupId) {
    await evaluate(
      browser.cdp,
      `fetch("/api/transaction-groups/" + encodeURIComponent(${JSON.stringify(groupId)}), { method: "DELETE" })`,
    ).catch(() => undefined);
  }
  await browser.close(outputDir);
}

async function selectMixed(cdp, created) {
  return evaluate(
    cdp,
    `(() => {
      const group = document.querySelector('[data-selection-entity="group"][value="${created.groupId}"]');
      const direct = document.querySelector('[data-select-transaction][value="${created.directId}"]');
      if (!group || !direct) throw new Error('Issue 530 rows were not found.');
      group.checked = true;
      group.dispatchEvent(new Event('change', { bubbles: true }));
      direct.checked = true;
      direct.dispatchEvent(new Event('change', { bubbles: true }));
      const bar = document.querySelector('[data-selection-bar]');
      return {
        hidden: bar.hidden,
        count: bar.querySelector('[data-selection-count]').textContent.trim(),
        total: bar.querySelector('[data-selection-total]').textContent.trim(),
        groupDisabled: document.querySelector('[data-group-open]').disabled,
        reconcileDisabled: bar.querySelector('[data-bulk-selection-action="reconcile"]').disabled,
        unreconcileDisabled: bar.querySelector('[data-bulk-selection-action="unreconcile"]').disabled,
        voidDisabled: bar.querySelector('[data-bulk-selection-action="void"]').disabled,
        help: bar.querySelector('[data-bulk-selection-help]').textContent.trim()
      };
    })()`,
  );
}

async function readBarMetrics(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const bar = document.querySelector('[data-selection-bar]');
      const rect = bar.getBoundingClientRect();
      const parentRect = bar.parentElement.getBoundingClientRect();
      const computed = getComputedStyle(bar);
      return {
        barHeight: Math.round(rect.height),
        barWidth: Math.round(rect.width),
        barTop: Math.round(rect.top),
        barBottom: Math.round(rect.bottom),
        barScrollWidth: bar.scrollWidth,
        barClientWidth: bar.clientWidth,
        parentHeight: Math.round(parentRect.height),
        parentWidth: Math.round(parentRect.width),
        computedDisplay: computed.display,
        computedPosition: computed.position,
        computedBottom: computed.bottom,
        computedHeight: computed.height,
        computedWidth: computed.width,
        computedGridTemplateColumns: computed.gridTemplateColumns,
        visibleInViewport: rect.top >= 0 && rect.bottom <= window.innerHeight,
        bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    })()`,
  );
}

async function readRenderedStatuses(cdp, created) {
  return evaluate(
    cdp,
    `(() => {
      const groupRow = document.querySelector('[data-group-row="${created.groupId}"]');
      const directInput = document.querySelector('[data-select-transaction][value="${created.directId}"]');
      const directRow = directInput?.closest('.statement-row');
      return {
        groupPresent: Boolean(groupRow),
        groupStatus: groupRow?.querySelector('.grouped-status > .statement-status:not(.transaction-group-state)')?.getAttribute('aria-label') || '',
        directStatus: directRow?.querySelector('.col-status')?.getAttribute('aria-label') || ''
      };
    })()`,
  );
}
