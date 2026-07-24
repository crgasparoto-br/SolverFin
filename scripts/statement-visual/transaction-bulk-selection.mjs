import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { fixtureExpression, loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;

if (!chromePath) throw new Error("CHROME_BIN is required for issue 530 visual validation.");
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
let groupId;

try {
  await setViewport(browser.cdp, 1366, 900);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);
  const fixtureIds = await evaluate(browser.cdp, fixtureExpression());
  const route = `/lancamentos?accountId=${encodeURIComponent(fixtureIds.longAccountId)}&month=2026-07`;

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

  const mixedSelection = await evaluate(
    browser.cdp,
    `(() => {
      const group = document.querySelector('[data-selection-entity="group"][value="${created.groupId}"]');
      const direct = document.querySelector('[data-select-transaction][value="${created.directId}"]');
      group.checked = true;
      group.dispatchEvent(new Event('change', { bubbles: true }));
      direct.checked = true;
      direct.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('[data-selection-bar]').scrollIntoView({ block: 'end' });
      const bar = document.querySelector('[data-selection-bar]');
      const rect = bar.getBoundingClientRect();
      const parentRect = bar.parentElement.getBoundingClientRect();
      const computed = getComputedStyle(bar);
      return {
        hidden: bar.hidden,
        count: bar.querySelector('[data-selection-count]').textContent.trim(),
        total: bar.querySelector('[data-selection-total]').textContent.trim(),
        groupDisabled: document.querySelector('[data-group-open]').disabled,
        reconcileDisabled: bar.querySelector('[data-bulk-selection-action="reconcile"]').disabled,
        unreconcileDisabled: bar.querySelector('[data-bulk-selection-action="unreconcile"]').disabled,
        voidDisabled: bar.querySelector('[data-bulk-selection-action="void"]').disabled,
        help: bar.querySelector('[data-bulk-selection-help]').textContent.trim(),
        barHeight: Math.round(rect.height),
        barWidth: Math.round(rect.width),
        barScrollWidth: bar.scrollWidth,
        barClientWidth: bar.clientWidth,
        parentHeight: Math.round(parentRect.height),
        parentWidth: Math.round(parentRect.width),
        computedDisplay: computed.display,
        computedPosition: computed.position,
        computedHeight: computed.height,
        computedWidth: computed.width,
        computedGridTemplateColumns: computed.gridTemplateColumns,
        childCount: bar.children.length,
        bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    })()`,
  );
  await writeFile(
    join(outputDir, "issue-530-bulk-selection-diagnostic.json"),
    `${JSON.stringify({ initial, mixedSelection }, null, 2)}\n`,
  );
  assert.equal(mixedSelection.hidden, false);
  assert.equal(mixedSelection.count, "2 itens · 3 lançamentos");
  assert.match(mixedSelection.total, /350,00/);
  assert.equal(mixedSelection.groupDisabled, true);
  assert.equal(mixedSelection.reconcileDisabled, false);
  assert.equal(mixedSelection.unreconcileDisabled, true);
  assert.equal(mixedSelection.voidDisabled, false);
  assert.match(mixedSelection.help, /desmarque os agrupamentos/i);
  assert.match(mixedSelection.help, /nenhum lançamento selecionado está conciliado/i);
  assert.equal(mixedSelection.bodyOverflow, false);
  assert.ok(
    mixedSelection.barHeight < 180,
    `Selection bar dimensions are invalid: ${JSON.stringify(mixedSelection)}`,
  );
  assert.ok(
    mixedSelection.barScrollWidth <= mixedSelection.barClientWidth + 1,
    `Selection bar has horizontal overflow: ${JSON.stringify(mixedSelection)}`,
  );

  await screenshot(browser.cdp, join(outputDir, "issue-530-mixed-selection-1366x900.png"));

  await setViewport(browser.cdp, 390, 844);
  await sleep(150);
  const mobile = await evaluate(
    browser.cdp,
    `(() => {
      const bar = document.querySelector('[data-selection-bar]');
      bar.scrollIntoView({ block: 'end' });
      const rect = bar.getBoundingClientRect();
      return {
        bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        barWidth: Math.round(rect.width),
        viewportWidth: document.documentElement.clientWidth,
        actionCount: bar.querySelectorAll('[data-bulk-selection-action]').length,
        helpVisible: Boolean(bar.querySelector('[data-bulk-selection-help]').textContent.trim())
      };
    })()`,
  );
  assert.equal(mobile.bodyOverflow, false);
  assert.ok(mobile.barWidth <= mobile.viewportWidth);
  assert.equal(mobile.actionCount, 3);
  assert.equal(mobile.helpVisible, true);
  await screenshot(browser.cdp, join(outputDir, "issue-530-mixed-selection-390x844.png"));

  await writeFile(
    join(outputDir, "issue-530-bulk-selection.json"),
    `${JSON.stringify({ initial, mixedSelection, mobile }, null, 2)}\n`,
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
