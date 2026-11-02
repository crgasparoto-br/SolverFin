import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate } from "./cdp.mjs";

import { BUDGET_LONG_LIST_PERIODS } from "./issue-755-budget-list.mjs";
export { BUDGET_LONG_LIST_PERIODS, assertBudgetLongList } from "./issue-755-budget-list.mjs";

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
export async function assertBrowserAttachmentNegativeControls(
  cdp,
  transactionId,
  menuOpen,
  actionVisible,
) {
  const read = attachmentStateReaderExpression(menuOpen, actionVisible);
  const snapshots = await evaluate(
    cdp,
    `(() => {
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
  })()`,
  );
  assertAttachmentEditState(snapshots.before, transactionId);
  assert.throws(() => assertAttachmentEditState(snapshots.absent, transactionId), /did not open/);
  assert.throws(() => assertAttachmentEditState(snapshots.hidden, transactionId), /did not open/);
  assert.throws(
    () => assertAttachmentEditState(snapshots.wrongEntity, transactionId),
    /another transaction/,
  );
  assertAttachmentEditState(snapshots.restored, transactionId);
  return {
    realDom: true,
    rejected: ["modal-absent", "modal-hidden", "wrong-entity"],
    restored: true,
  };
}

const SAFE_API_SEGMENTS = new Set([
  "api",
  "accounts",
  "attachments",
  "budgets",
  "categories",
  "content",
  "credit-card-accounts",
  "inbox",
  "invoices",
  "me",
  "transactions",
  "import-batches",
  "health",
  "auth",
]);

// CDP strings come from browser/network events, not from this harness. Only
// stable protocol categories may reach disk; pattern checks alone can leak PII.
const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const SAFE_EXCEPTION_CLASSES = new Set([
  "Error", "EvalError", "RangeError", "ReferenceError", "SyntaxError", "TypeError", "URIError", "AggregateError",
]);
const SAFE_TRANSPORT_CODES = new Set([
  "net::ERR_ABORTED", "net::ERR_FAILED", "net::ERR_BLOCKED_BY_CLIENT",
  "net::ERR_CONNECTION_RESET", "net::ERR_CONNECTION_REFUSED", "net::ERR_CONNECTION_CLOSED",
  "net::ERR_CONNECTION_ABORTED", "net::ERR_CONNECTION_TIMED_OUT", "net::ERR_TIMED_OUT",
  "net::ERR_NAME_NOT_RESOLVED", "net::ERR_INTERNET_DISCONNECTED",
  "net::ERR_ADDRESS_UNREACHABLE", "net::ERR_EMPTY_RESPONSE", "net::ERR_NETWORK_CHANGED",
  "net::ERR_SSL_PROTOCOL_ERROR", "net::ERR_CERT_AUTHORITY_INVALID",
]);
const SAFE_FIXTURE_STAGES = new Set([
  "not-started", "creating-nine", "nine-period-readback", "creating-tenth", "ten-period-readback",
]);

function safeHttpMethod(method) {
  return typeof method === "string" && SAFE_HTTP_METHODS.has(method) ? method : "unknown";
}

function safeCount(count) {
  return Number.isInteger(count) && count >= 0 && count <= BUDGET_LONG_LIST_PERIODS.length
    ? count : null;
}

function safeEndpoint(url) {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    if (segments[0] !== "api") return "non-api";
    return `/${segments
      .slice(0, 4)
      .map((segment) => (SAFE_API_SEGMENTS.has(segment) ? segment : ":id"))
      .join("/")}`;
  } catch {
    return "unknown";
  }
}

// Failure artifacts must never serialize arbitrary exception text. Classify into
// bounded, non-sensitive messages; currency/PII formats cannot be enumerated safely.
function safeErrorMessage(error) {
  const message = String(error?.message ?? "");
  if (/^Budget fixture failed:/.test(message)) return "budget-fixture-failure";
  if (/^Budget .*API readback|^Budget periods differ/.test(message)) {
    return "budget-readback-failure";
  }
  if (/^Budget (?:category|fixture|long-list)/.test(message)) {
    return "budget-dom-invariant-failure";
  }
  if (/^Transaction (?:action|edit|attachment)/.test(message)) {
    return "transaction-dialog-invariant-failure";
  }
  if (/^Timed out waiting for/.test(message)) return "browser-state-timeout";
  if (/^Demo login failed:/.test(message)) return "demo-login-failure";
  return "unclassified-test-failure";
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
        recentRequests.set(requestId, {
          method: safeHttpMethod(request.method),
          endpoint: safeEndpoint(request.url),
        });
      }
    }),
    cdp.on("Network.responseReceived", ({ requestId, response }) => {
      // Never serialize malformed CDP statuses (e.g. attacker-controlled strings).
      if (!Number.isInteger(response?.status) || response.status < 400 || response.status > 599 || networkErrors.length >= 15) return;
      const request = recentRequests.get(requestId);
      networkErrors.push({
        status: response?.status ?? 0,
        method: request?.method ?? "unknown",
        endpoint: safeEndpoint(response?.url),
      });
    }),
    cdp.on("Network.loadingFailed", ({ requestId, errorText, canceled }) => {
      if (transportFailures.length >= 15) return;
      const request = recentRequests.get(requestId);
      transportFailures.push({
        method: request?.method ?? "unknown",
        endpoint: request?.endpoint ?? "unknown",
        canceled: canceled === true,
        code: SAFE_TRANSPORT_CODES.has(errorText) ? errorText : "network-failure",
      });
    }),
    cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
      if (browserErrors.length >= 8) return;
      browserErrors.push({
        className: SAFE_EXCEPTION_CLASSES.has(exceptionDetails?.exception?.className)
          ? exceptionDetails.exception.className
          : "browser-exception",
        lineNumber: Number.isInteger(exceptionDetails?.lineNumber)
          ? exceptionDetails.lineNumber
          : null,
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
        stage: SAFE_FIXTURE_STAGES.has(state.stage) ? state.stage : "unknown",
        expectedCount: BUDGET_LONG_LIST_PERIODS.length,
        createdCount: safeCount(state.createdCount),
        readbackCount: safeCount(state.readbackCount),
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
        error: {
          kind:
            error instanceof Error &&
            ["Error", "AssertionError", "TypeError", "RangeError", "SyntaxError"].includes(
              error.name,
            )
              ? error.name
              : "Error",
          message: safeErrorMessage(error),
        },
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
