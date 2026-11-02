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
  const safeFixture = {
    stage: fixture.stage ?? "budget-readback",
    ok: fixture.ok,
    createdCount: fixture.createdCount,
    readbackCount: fixture.readbackCount,
  };
  assert.equal(fixture.ok, true, `Budget fixture failed: ${JSON.stringify(safeFixture)}`);
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
  assert.equal(state.menuOpen, true, "Transaction action menu is not open");
  assert.equal(state.actionVisible, true, "Transaction edit action is not visible");
  assert.equal(state.dialogOpen, true, "Transaction edit dialog did not open");
  assert.equal(state.attachmentSectionOpen, true, "Attachment disclosure did not open");
  assert.equal(state.workspaceVisible, true, "Attachment workspace is not visible");
  assert.equal(state.entityId, transactionId, "Attachment workspace points to another transaction");
}

// Read the actual production DOM; one reader is used by both the normal journey and mutations.
export function attachmentStateReaderExpression(menuOpen, actionVisible) {
  return `(() => {
    const dialog = document.querySelector('dialog[data-modal][open]');
    const disclosure = dialog?.querySelector('[data-statement-attachments]');
    const workspace = disclosure?.querySelector('[data-attachment-workspace][data-entity-kind="transaction"]');
    const rect = workspace?.getBoundingClientRect();
    const visible = Boolean(dialog && !dialog.hidden && dialog.checkVisibility?.());
    return {
      menuOpen: ${Boolean(menuOpen)},
      actionVisible: ${Boolean(actionVisible)},
      dialogOpen: Boolean(dialog?.open && visible),
      attachmentSectionOpen: Boolean(disclosure?.open && visible),
      workspaceVisible: Boolean(visible && disclosure?.open && rect?.width && rect?.height && workspace?.checkVisibility?.()),
      entityId: workspace?.dataset.entityId ?? null,
    };
  })`;
}

// Fail closed on real DOM mutations, then prove that the unmodified browser state passes again.
export async function assertBrowserAttachmentNegativeControls(cdp, transactionId, menuOpen, actionVisible) {
  const read = attachmentStateReaderExpression(menuOpen, actionVisible);
  const snapshots = await evaluate(cdp, `(() => {
    const readState = ${read};
    const dialog = document.querySelector('dialog[data-modal][open]');
    const workspace = dialog?.querySelector('[data-attachment-workspace][data-entity-kind="transaction"]');
    if (!dialog || !workspace) throw new Error('Attachment negative control lacks a real open dialog');
    const parent = dialog.parentNode;
    const next = dialog.nextSibling;
    const before = readState();
    let absent;
    try {
      dialog.remove();
      absent = readState();
    } finally {
      parent.insertBefore(dialog, next);
    }
    const wasHidden = dialog.hidden;
    let hidden;
    try {
      dialog.hidden = true;
      hidden = readState();
    } finally {
      dialog.hidden = wasHidden;
    }
    const originalId = workspace.dataset.entityId;
    let wrongEntity;
    try {
      workspace.dataset.entityId = 'wrong-transaction-for-negative-control';
      wrongEntity = readState();
    } finally {
      workspace.dataset.entityId = originalId;
    }
    return { before, absent, hidden, wrongEntity, restored: readState() };
  })()`);
  assertAttachmentEditState(snapshots.before, transactionId);
  assert.throws(() => assertAttachmentEditState(snapshots.absent, transactionId), /did not open/);
  assert.throws(() => assertAttachmentEditState(snapshots.hidden, transactionId), /did not open/);
  assert.throws(() => assertAttachmentEditState(snapshots.wrongEntity, transactionId), /another transaction/);
  assertAttachmentEditState(snapshots.restored, transactionId);
  return { realDom: true, rejected: ["modal-absent", "modal-hidden", "wrong-entity"], restored: true };
}

const SAFE_API_SEGMENTS = new Set([
  "api", "accounts", "attachments", "budgets", "categories", "content", "credit-card-accounts",
  "inbox", "invoices", "me", "transactions", "import-batches", "health", "auth",
]);

function safeEndpoint(url) {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    if (segments[0] !== "api") return "non-api";
    return `/${segments.slice(0, 4).map((segment) => SAFE_API_SEGMENTS.has(segment) ? segment : ":id").join("/")}`;
  } catch {
    return "unknown";
  }
}

function safeErrorMessage(error) {
  const message = String(error?.message ?? error ?? "unknown-error");
  return message
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "[id]")
    .replace(/\b\d{4,}\b/g, "[number]")
    .slice(0, 320);
}

// Bounded evidence collected only when a scenario fails; no payloads, URLs with queries or console arguments.
export function watchVisualFailures(cdp) {
  const networkErrors = [];
  const transportFailures = [];
  const browserErrors = [];
  const consoleEvents = [];
  const recentRequests = new Map();
  let fixtureState = { stage: "not-started", expectedCount: 10 };
  const stops = [
    cdp.on("Network.requestWillBeSent", ({ requestId, request }) => {
      if (requestId && request) {
        if (recentRequests.size >= 80) recentRequests.delete(recentRequests.keys().next().value);
        recentRequests.set(requestId, { method: request.method, endpoint: safeEndpoint(request.url) });
      }
    }),
    cdp.on("Network.responseReceived", ({ requestId, response }) => {
      if (response?.status < 400 || networkErrors.length >= 15) return;
      const request = recentRequests.get(requestId);
      networkErrors.push({ status: response?.status ?? 0, method: request?.method ?? "unknown", endpoint: safeEndpoint(response?.url) });
    }),
    cdp.on("Network.loadingFailed", ({ requestId, errorText, canceled }) => {
      if (transportFailures.length >= 15) return;
      const request = recentRequests.get(requestId);
      transportFailures.push({
        method: request?.method ?? "unknown",
        endpoint: request?.endpoint ?? "unknown",
        canceled: canceled === true,
        code: /^net::ERR_[A-Z0-9_]+$/.test(errorText ?? "") ? errorText : "network-failure",
      });
    }),
    cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
      if (browserErrors.length >= 8) return;
      browserErrors.push({
        className: /^[A-Za-z]+Error$/.test(exceptionDetails?.exception?.className ?? "")
          ? exceptionDetails.exception.className : "browser-exception",
        lineNumber: Number.isInteger(exceptionDetails?.lineNumber) ? exceptionDetails.lineNumber : null,
      });
    }),
    cdp.on("Runtime.consoleAPICalled", ({ type }) => {
      if (consoleEvents.length < 12 && ["error", "warning", "assert"].includes(type)) {
        consoleEvents.push({ type });
      }
    }),
  ];
  return {
    setFixtureState(state) {
      fixtureState = {
        stage: String(state.stage ?? "unknown").replace(/[^a-z0-9-]/gi, "-").slice(0, 50),
        expectedCount: BUDGET_LONG_LIST_PERIODS.length,
        createdCount: Number.isInteger(state.createdCount) ? state.createdCount : null,
        readbackCount: Number.isInteger(state.readbackCount) ? state.readbackCount : null,
      };
    },
    async save(outputDir, scenario, error) {
      const dom = await evaluate(
        cdp,
        `(() => ({
          route: ['lancamentos','orcamentos','cartoes','inbox'].includes(location.pathname.split('/')[1]) ? location.pathname.split('/')[1] : 'other',
          readyState: document.readyState,
          editButtons: document.querySelectorAll('[data-edit]').length,
          openActionMenus: document.querySelectorAll('details.actions[open]').length,
          openDialogs: document.querySelectorAll('dialog[open]').length,
          visibleDialogs: Array.from(document.querySelectorAll('dialog[open]')).filter((node) => node.checkVisibility?.()).length,
          attachmentWorkspaces: Array.from(document.querySelectorAll('[data-attachment-workspace]')).slice(0, 12).map((node) => ({
            kind: ['transaction','invoice','import_batch'].includes(node.dataset.entityKind) ? node.dataset.entityKind : 'other',
            hasEntityId: Boolean(node.dataset.entityId),
            visible: Boolean(node.checkVisibility?.()),
          })),
          budgetRows: document.querySelectorAll('.budget-results tbody tr').length,
          budgetHistoryEntries: document.querySelectorAll('.budget-history-entry').length,
          budgetPeriodCount: document.querySelectorAll('.budget-period,.budget-history-heading strong').length,
        }))()`,
      ).catch(() => ({ unavailable: true }));
      const safeScenario = scenario.replace(/[^a-zA-Z0-9_.-]+/g, "-");
      const path = join(outputDir, `issue-755-${safeScenario}-failure.json`);
      const data = {
        scenario: safeScenario,
        error: { kind: error instanceof Error ? error.name : "Error", message: safeErrorMessage(error) },
        fixtureState,
        dom,
        networkErrors,
        transportFailures,
        browserErrors,
        consoleEvents,
      };
      await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
      console.error(`[issue-755] Failure diagnostics written: ${path}`);
    },
    stop() {
      for (const stop of stops) stop();
    },
  };
}
