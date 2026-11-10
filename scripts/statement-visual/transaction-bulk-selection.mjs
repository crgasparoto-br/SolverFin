import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { fixtureExpression, loginExpression } from "./fixtures.mjs";
import {
  inspectProtectedGroupSelection,
  selectMixed,
  readBarMetrics,
  readRenderedStatuses,
  readSelectionActionIcons,
  assertSelectionActionIcons,
  verifyFailureFeedback,
} from "./transaction-bulk-selection-helpers.mjs";
import {
  verifyDeletionAndMixedStatuses,
  verifyTransferSelection,
} from "./transaction-bulk-selection-scenarios.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;

if (!chromePath) {
  throw new Error("CHROME_BIN is required for issue 530 visual validation.");
}
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
let groupId;
let additionalIds = [];

try {
  await setViewport(browser.cdp, 1366, 900);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);
  const fixtureIds = await evaluate(browser.cdp, fixtureExpression());
  const route =
    `/lancamentos?accountId=${encodeURIComponent(fixtureIds.longAccountId)}` + "&month=2026-07";

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
  assert.match(mixedSelection.help, /nenhum lançamento selecionado está conciliado/i);
  const protectedPostedGroup = await inspectProtectedGroupSelection(browser.cdp, created.groupId);
  assert.equal(protectedPostedGroup.groupProtected, true);
  assert.equal(protectedPostedGroup.reconcileDisabled, true);
  assert.equal(protectedPostedGroup.unreconcileDisabled, true);
  assert.equal(protectedPostedGroup.clearDisabled, false);
  assert.equal(protectedPostedGroup.voidDisabled, false);
  assert.match(protectedPostedGroup.reconcileTooltip, /remuneração automática/i);
  assert.match(protectedPostedGroup.help, /remuneração automática/i);
  const desktopIcons = await readSelectionActionIcons(browser.cdp);
  assertSelectionActionIcons(desktopIcons, "desktop");
  assert.equal(desktopIcons.find((item) => item.action === "group").disabled, true);
  assert.match(
    desktopIcons.find((item) => item.action === "group").tooltip,
    /Desmarque os agrupamentos/,
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
  await screenshot(browser.cdp, join(outputDir, "issue-530-mixed-selection-1366x900.png"));

  await setViewport(browser.cdp, 1366, 768);
  await sleep(150);
  const shortDesktop = await readBarMetrics(browser.cdp);
  assert.equal(shortDesktop.visibleInViewport, true);
  assert.equal(shortDesktop.bodyOverflow, false);
  assert.ok(shortDesktop.barHeight < 240);
  await screenshot(browser.cdp, join(outputDir, "issue-530-mixed-selection-1366x768.png"));

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
  const mobileIcons = await readSelectionActionIcons(browser.cdp);
  assertSelectionActionIcons(mobileIcons, "mobile");
  await screenshot(browser.cdp, join(outputDir, "issue-530-mixed-selection-390x844.png"));

  // Re-establish the desktop page/selection after viewport emulation so
  // Chrome sends the native Enter key to the focused Clear button reliably.
  await setViewport(browser.cdp, 1366, 900);
  await navigate(browser.cdp, `${baseUrl}${route}`);
  await sleep(150);
  await selectMixed(browser.cdp, created);
  const clearReady = await evaluate(
    browser.cdp,
    `(() => {
      const button = document.querySelector('[data-selection-clear]');
      window.__bulkClearNativeClick = false;
      button.addEventListener('click', () => { window.__bulkClearNativeClick = true; }, { once: true });
      button.focus();
      return {
        focused: document.activeElement === button,
        label: button.getAttribute('aria-label'),
        tooltip: button.getAttribute('data-tooltip')
      };
    })()`,
  );
  assert.equal(clearReady.focused, true);
  assert.equal(clearReady.label, "Limpar seleção");
  assert.equal(clearReady.tooltip, clearReady.label);
  await browser.cdp.send("Page.bringToFront");
  await browser.cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    text: "\r",
    unmodifiedText: "\r",
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
  await sleep(80);
  const cleared = await evaluate(
    browser.cdp,
    `(() => ({
      nativeActivated: window.__bulkClearNativeClick === true,
      selectedCount: document.querySelectorAll('[data-select-transaction]:checked').length,
      selectionHidden: document.querySelector('[data-selection-bar]').hidden
    }))()`,
  );
  assert.equal(cleared.nativeActivated, true, "Enter should activate Clear selection");
  assert.equal(cleared.selectedCount, 0);
  assert.equal(cleared.selectionHidden, true);

  await setViewport(browser.cdp, 1366, 900);
  await navigate(browser.cdp, `${baseUrl}${route}`);
  await sleep(150);
  await selectMixed(browser.cdp, created);

  const { serverFailure, networkFailure } = await verifyFailureFeedback(browser);

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
      window.__issue530EnterReceived = false;
      button.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') window.__issue530EnterReceived = true;
      }, { once: true });
      button.focus();
      return {
        focused: document.activeElement === button,
        tagName: button.tagName,
        type: button.type,
        tabIndex: button.tabIndex,
        accessibleText: button.getAttribute("aria-label"),
        visibleText: button.textContent.trim(),
        tooltip: button.getAttribute("data-tooltip")
      };
    })()`,
  );
  assert.equal(keyboardPrepared.focused, true);
  assert.equal(keyboardPrepared.tagName, "BUTTON");
  assert.equal(keyboardPrepared.type, "button");
  assert.equal(keyboardPrepared.tabIndex, 0);
  assert.equal(keyboardPrepared.visibleText, "");
  assert.equal(keyboardPrepared.tooltip, keyboardPrepared.accessibleText);
  assert.match(keyboardPrepared.accessibleText, /Marcar como conciliado/);
  const reconcileLoaded = browser.cdp.once("Page.loadEventFired", 20_000);
  await browser.cdp.send("Page.bringToFront");
  await browser.cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    text: "\r",
    unmodifiedText: "\r",
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
  const keyboardActivation = await evaluate(
    browser.cdp,
    `(() => {
      const bar = document.querySelector('[data-selection-bar]');
      return {
        enterReceived: window.__issue530EnterReceived === true,
        nativeActivation: bar.getAttribute('aria-busy') === 'true'
      };
    })()`,
  );
  assert.equal(keyboardActivation.enterReceived, true);
  assert.equal(
    keyboardActivation.nativeActivation,
    true,
    "Enter must activate reconciliation natively.",
  );
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
  const protectedReconciledGroup = await inspectProtectedGroupSelection(
    browser.cdp,
    created.groupId,
  );
  assert.equal(protectedReconciledGroup.reconcileDisabled, true);
  assert.equal(protectedReconciledGroup.unreconcileDisabled, true);
  assert.match(protectedReconciledGroup.unreconcileTooltip, /remuneração automática/i);
  const unreconcileLoaded = browser.cdp.once("Page.loadEventFired", 20_000);
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

  const {
    cancelledDeletion,
    deleted,
    mixedStatuses,
    plannedAndPosted,
    allStatuses,
    plannedAndReconciled,
    mixedMobile,
    afterMixedUnreconcile,
    afterMixedReconcile,
  } = await verifyDeletionAndMixedStatuses({
    browser,
    created,
    fixtureIds,
    baseUrl,
    route,
    outputDir,
    onCreatedIds(ids) {
      additionalIds = ids;
    },
  });

  const transfers = await verifyTransferSelection({
    browser,
    fixtureIds,
    baseUrl,
    route,
    outputDir,
    onCreatedIds(ids) {
      additionalIds.push(...ids);
    },
  });

  await writeFile(
    join(outputDir, "issue-530-bulk-selection.json"),
    `${JSON.stringify(
      {
        initial,
        mixedSelection,
        desktopIcons,
        mobileIcons,
        cleared,
        desktop,
        shortDesktop,
        mobile,
        serverFailure,
        networkFailure,
        keyboardPrepared,
        keyboardActivation,
        loading,
        reconciled,
        unreconciled,
        cancelledDeletion,
        deleted,
        mixedStatuses,
        plannedAndPosted,
        allStatuses,
        plannedAndReconciled,
        mixedMobile,
        afterMixedUnreconcile,
        afterMixedReconcile,
        transfers,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  for (const id of additionalIds) {
    await evaluate(
      browser.cdp,
      `fetch("/api/transactions/" + encodeURIComponent(${JSON.stringify(id)}) + "/void", { method: "POST" })`,
    ).catch(() => undefined);
  }
  if (groupId) {
    await evaluate(
      browser.cdp,
      `fetch("/api/transaction-groups/" + encodeURIComponent(${JSON.stringify(groupId)}), { method: "DELETE" })`,
    ).catch(() => undefined);
  }
  await browser.close(outputDir);
}
