import assert from "node:assert/strict";
import { join } from "node:path";

import { evaluate, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { readBarMetrics, selectMixed } from "./transaction-bulk-selection-helpers.mjs";

/** Exercise deletion safety and mixed-status persistence against the real API. */
export async function verifyDeletionAndMixedStatuses({
  browser,
  created,
  fixtureIds,
  baseUrl,
  route,
  outputDir,
  onCreatedIds,
}) {
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

  // Regression #768: the Golden Screen offers both operations for mixed eligible statuses.
  const mixedStatuses = await evaluate(
    browser.cdp,
    `(async () => {
      async function create(status, day) {
        const body = {
          accountId: ${JSON.stringify(fixtureIds.longAccountId)},
          kind: "expense",
          amountMinor: 1250,
          currency: "BRL",
          occurredOn: "2026-07-" + day,
          plannedOn: "2026-07-" + day,
          effectiveOn: status === "planned" ? null : "2026-07-" + day,
          status,
          description: "QA issue 768 seleção " + status
        };
        const response = await fetch("/api/transactions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body)
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(JSON.stringify(payload));
        return payload.transaction.id;
      }
      return {
        plannedId: await create("planned", "26"),
        postedId: await create("posted", "27"),
        reconciledId: await create("reconciled", "28")
      };
    })()`,
  );
  onCreatedIds(Object.values(mixedStatuses));
  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, `${baseUrl}${route}`);
  await sleep(150);
  const plannedAndPosted = await evaluate(
    browser.cdp,
    `(() => {
      const ids = [${JSON.stringify(mixedStatuses.plannedId)}, ${JSON.stringify(mixedStatuses.postedId)}];
      ids.forEach((id) => {
        const input = document.querySelector('[data-select-transaction][value="' + id + '"]');
        if (!input || input.disabled) throw new Error("Missing selectable row: " + id);
        input.checked = true;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      const bar = document.querySelector("[data-selection-bar]");
      const reconcile = bar.querySelector('[data-bulk-selection-action="reconcile"]');
      const unreconcile = bar.querySelector('[data-bulk-selection-action="unreconcile"]');
      return {
        visible: !bar.hidden,
        reconcileDisabled: reconcile.disabled,
        unreconcileDisabled: unreconcile.disabled,
        variant: reconcile.dataset.buttonVariant,
        help: bar.querySelector("[data-bulk-selection-help]").textContent.trim()
      };
    })()`,
  );
  assert.equal(plannedAndPosted.visible, true);
  assert.equal(plannedAndPosted.reconcileDisabled, false);
  assert.equal(plannedAndPosted.unreconcileDisabled, true);
  assert.equal(plannedAndPosted.variant, "neutral");
  assert.match(plannedAndPosted.help, /nenhum lançamento selecionado está conciliado/i);

  const allStatuses = await evaluate(
    browser.cdp,
    `(() => {
      const input = document.querySelector('[data-select-transaction][value="${mixedStatuses.reconciledId}"]');
      if (!input || input.disabled) throw new Error("Missing reconciled row");
      input.checked = true;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      const bar = document.querySelector("[data-selection-bar]");
      return {
        count: bar.querySelector("[data-selection-count]").textContent.trim(),
        reconcileDisabled: bar.querySelector('[data-bulk-selection-action="reconcile"]').disabled,
        unreconcileDisabled: bar.querySelector('[data-bulk-selection-action="unreconcile"]').disabled
      };
    })()`,
  );
  assert.equal(allStatuses.count, "3");
  assert.equal(allStatuses.reconcileDisabled, false);
  assert.equal(allStatuses.unreconcileDisabled, false);
  await screenshot(browser.cdp, join(outputDir, "issue-768-mixed-statuses-1366x768.png"));

  const plannedAndReconciled = await evaluate(
    browser.cdp,
    `(() => {
      const input = document.querySelector('[data-select-transaction][value="${mixedStatuses.postedId}"]');
      input.checked = false;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      const bar = document.querySelector("[data-selection-bar]");
      return {
        count: bar.querySelector("[data-selection-count]").textContent.trim(),
        reconcileDisabled: bar.querySelector('[data-bulk-selection-action="reconcile"]').disabled,
        unreconcileDisabled: bar.querySelector('[data-bulk-selection-action="unreconcile"]').disabled
      };
    })()`,
  );
  assert.equal(plannedAndReconciled.count, "2");
  assert.equal(plannedAndReconciled.reconcileDisabled, false);
  assert.equal(plannedAndReconciled.unreconcileDisabled, false);
  await setViewport(browser.cdp, 390, 844);
  await sleep(150);
  const mixedMobile = await readBarMetrics(browser.cdp);
  assert.equal(mixedMobile.bodyOverflow, false);
  assert.equal(mixedMobile.visibleInViewport, true);
  await screenshot(browser.cdp, join(outputDir, "issue-768-mixed-statuses-390x844.png"));

  const unreconcileLoadedForMixed = browser.cdp.once("Page.loadEventFired", 20_000);
  await evaluate(
    browser.cdp,
    `(() => {
    window.confirm = () => true;
    document.querySelector('[data-bulk-selection-action="unreconcile"]').click();
  })()`,
  );
  await unreconcileLoadedForMixed;
  await sleep(120);
  const afterMixedUnreconcile = await evaluate(
    browser.cdp,
    `(async () => {
      const response = await fetch("/api/transactions?accountId=" +
        encodeURIComponent(${JSON.stringify(fixtureIds.longAccountId)}) + "&status=all");
      const body = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(body));
      const find = (id) => body.transactions.find((transaction) => transaction.id === id);
      return {
        planned: find("${mixedStatuses.plannedId}"),
        posted: find("${mixedStatuses.postedId}"),
        reconciled: find("${mixedStatuses.reconciledId}")
      };
    })()`,
  );
  assert.equal(afterMixedUnreconcile.planned.status, "planned");
  assert.equal(afterMixedUnreconcile.planned.effectiveOn, undefined);
  assert.equal(afterMixedUnreconcile.posted.status, "posted");
  assert.equal(afterMixedUnreconcile.reconciled.status, "posted");

  await navigate(browser.cdp, `${baseUrl}${route}`);
  await sleep(150);
  const readyToReconcile = await evaluate(
    browser.cdp,
    `(() => {
      const ids = ${JSON.stringify(Object.values(mixedStatuses))};
      ids.forEach((id) => {
        const input = document.querySelector('[data-select-transaction][value="' + id + '"]');
        if (!input || input.disabled) throw new Error("Missing row after unreconcile: " + id);
        input.checked = true;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      return !document.querySelector('[data-bulk-selection-action="reconcile"]').disabled;
    })()`,
  );
  assert.equal(readyToReconcile, true);
  const reconcileLoadedForMixed = browser.cdp.once("Page.loadEventFired", 20_000);
  await evaluate(
    browser.cdp,
    `(() => {
    window.confirm = () => true;
    document.querySelector('[data-bulk-selection-action="reconcile"]').click();
  })()`,
  );
  await reconcileLoadedForMixed;
  await sleep(120);
  const afterMixedReconcile = await evaluate(
    browser.cdp,
    `(async () => {
      const response = await fetch("/api/transactions?accountId=" +
        encodeURIComponent(${JSON.stringify(fixtureIds.longAccountId)}) + "&status=all");
      const body = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(body));
      return [${JSON.stringify(mixedStatuses.plannedId)}, ${JSON.stringify(mixedStatuses.postedId)}, ${JSON.stringify(mixedStatuses.reconciledId)}]
        .map((id) => body.transactions.find((transaction) => transaction.id === id));
    })()`,
  );
  assert.deepEqual(
    afterMixedReconcile.map((item) => item.status),
    ["reconciled", "reconciled", "reconciled"],
  );
  assert.ok(
    afterMixedReconcile[0].effectiveOn,
    "Planned reconciliation must create an effective date",
  );

  return {
    cancelledDeletion,
    deleted,
    mixedStatuses,
    plannedAndPosted,
    allStatuses,
    plannedAndReconciled,
    mixedMobile,
    afterMixedUnreconcile,
    afterMixedReconcile,
  };
}
