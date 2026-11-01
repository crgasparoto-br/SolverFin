import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate } from "./cdp.mjs";

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
  assert.equal(fixture.ok, true, `Budget fixture failed: ${JSON.stringify(fixture)}`);
  assert.equal(fixture.createdCount, BUDGET_LONG_LIST_PERIODS.length);
  assert.equal(fixture.readbackCount, BUDGET_LONG_LIST_PERIODS.length);
  assert.ok(
    rendered.rows + rendered.historyCount >= BUDGET_LONG_LIST_PERIODS.length,
    "Budget long-list scenario must preserve ten or more period records",
  );
  for (const period of BUDGET_LONG_LIST_PERIODS) {
    const [year, month, day] = period.periodStartOn.split("-");
    const label = `${day}/${month}/${year}`;
    assert.ok(
      rendered.periodLabels.some((text) => text.includes(label)),
      `Budget long-list is missing the fixture period ${period.periodStartOn}`,
    );
  }
}

export function assertAttachmentEditState(state, transactionId) {
  assert.equal(
    state.menuOpen,
    true,
    `Transaction action menu is not open: ${JSON.stringify(state)}`,
  );
  assert.equal(
    state.actionVisible,
    true,
    `Transaction edit action is not visible: ${JSON.stringify(state)}`,
  );
  assert.equal(
    state.dialogOpen,
    true,
    `Transaction edit dialog did not open: ${JSON.stringify(state)}`,
  );
  assert.equal(
    state.attachmentSectionOpen,
    true,
    `Attachment disclosure did not open: ${JSON.stringify(state)}`,
  );
  assert.equal(
    state.workspaceVisible,
    true,
    `Attachment workspace is not visible: ${JSON.stringify(state)}`,
  );
  assert.equal(
    state.entityId,
    transactionId,
    `Attachment workspace points to another transaction: ${JSON.stringify(state)}`,
  );
}

// Gather bounded failure-only evidence without emitting financial descriptions or API payloads.
export function watchVisualFailures(cdp) {
  const networkErrors = [];
  const browserErrors = [];
  const stopNetwork = cdp.on("Network.responseReceived", ({ response }) => {
    if (response?.status < 400) return;
    try {
      const path = new URL(response.url).pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id");
      if (networkErrors.length < 15) networkErrors.push({ status: response.status, path });
    } catch {
      // Ignore malformed external URLs.
    }
  });
  const stopErrors = cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
    if (browserErrors.length < 8)
      browserErrors.push({ text: exceptionDetails?.text ?? "browser-exception" });
  });
  return {
    async save(outputDir, scenario, error) {
      const dom = await evaluate(
        cdp,
        `(() => ({
        pathname: location.pathname,
        readyState: document.readyState,
        editButtons: document.querySelectorAll('[data-edit]').length,
        openActionMenus: document.querySelectorAll('details.actions[open]').length,
        openDialogs: document.querySelectorAll('dialog[open]').length,
        attachmentWorkspaces: Array.from(document.querySelectorAll('[data-attachment-workspace]')).map((node) => ({
          kind: node.dataset.entityKind,
          hasEntityId: Boolean(node.dataset.entityId),
          visible: Boolean(node.checkVisibility?.())
        })),
        budgetRows: document.querySelectorAll('.budget-results tbody tr').length,
        budgetHistoryEntries: document.querySelectorAll('.budget-history-entry').length,
      }))()`,
      ).catch(() => ({ unavailable: true }));
      const data = {
        scenario,
        error: String(error?.message ?? error),
        dom,
        networkErrors,
        browserErrors,
      };
      const safeScenario = scenario.replace(/[^a-zA-Z0-9_.-]+/g, "-");
      const path = join(outputDir, `issue-755-${safeScenario}-failure.json`);
      await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
      console.error(`[issue-755] Failure diagnostics written: ${path}`);
    },
    stop() {
      stopNetwork();
      stopErrors();
    },
  };
}
