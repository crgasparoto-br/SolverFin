import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BUDGET_LONG_LIST_PERIODS,
  assertAttachmentEditState,
  assertBudgetLongList,
} from "./issue-755-ci-determinism.mjs";

const periodLabels = BUDGET_LONG_LIST_PERIODS.map(({ periodStartOn }) => {
  const [year, month, day] = periodStartOn.split("-");
  return `${day}/${month}/${year} a 31/12/2099`;
});

const fixture = { ok: true, createdCount: 10, readbackCount: 10 };
const rendered = { rows: 1, historyCount: 9, periodLabels };

test("budget long-list passes only when ten created periods survive API readback and SSR", () => {
  assert.doesNotThrow(() => assertBudgetLongList(fixture, rendered));
  assert.throws(() => assertBudgetLongList({ ...fixture, readbackCount: 9 }, rendered), /9 !== 10/);
  assert.throws(
    () => assertBudgetLongList(fixture, { ...rendered, historyCount: 8 }),
    /ten or more period records/,
  );
  assert.throws(
    () => assertBudgetLongList(fixture, { ...rendered, periodLabels: periodLabels.slice(1) }),
    /missing the fixture period/,
  );
});

test("transaction modal absent, collapsed and mismatched identity all fail closed", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const state = {
    menuOpen: true,
    actionVisible: true,
    dialogOpen: true,
    attachmentSectionOpen: true,
    workspaceVisible: true,
    entityId: id,
  };
  assert.doesNotThrow(() => assertAttachmentEditState(state, id));
  for (const missing of [
    "menuOpen",
    "actionVisible",
    "dialogOpen",
    "attachmentSectionOpen",
    "workspaceVisible",
  ]) {
    assert.throws(() => assertAttachmentEditState({ ...state, [missing]: false }, id));
  }
  assert.throws(
    () => assertAttachmentEditState({ ...state, entityId: "other" }, id),
    /another transaction/,
  );
});

test("failure diagnostics preserve DOM, fixture and network causes without financial payloads", async () => {
  const { mkdtemp, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { watchVisualFailures } = await import("./issue-755-ci-determinism.mjs");
  const listeners = new Map();
  const fakeCdp = {
    on(event, callback) {
      const callbacks = listeners.get(event) ?? new Set();
      callbacks.add(callback);
      listeners.set(event, callbacks);
      return () => callbacks.delete(callback);
    },
    async send(method) {
      assert.equal(method, "Runtime.evaluate");
      return { result: { value: { route: "orcamentos", openDialogs: 0, budgetHistoryEntries: 9 } } };
    },
  };
  const emit = (name, data) => {
    for (const callback of listeners.get(name) ?? []) callback(data);
  };
  const diagnostics = watchVisualFailures(fakeCdp);
  diagnostics.setFixtureState({ stage: "nine-period-readback", createdCount: 9, readbackCount: 9, bankDetail: "PRIVATE" });
  emit("Network.requestWillBeSent", {
    requestId: "request-1",
    request: { method: "POST", url: "https://localhost/api/budgets/private-id?email=private@example.com&amount=123456" },
  });
  emit("Network.responseReceived", {
    requestId: "request-1", response: { status: 503, url: "https://localhost/api/budgets/private-id?bank=SECRET" },
  });
  emit("Network.loadingFailed", { requestId: "request-1", errorText: "net::ERR_CONNECTION_RESET", canceled: false });
  emit("Runtime.consoleAPICalled", { type: "error", args: [{ value: "PRIVATE FINANCIAL VALUE" }] });
  emit("Runtime.exceptionThrown", { exceptionDetails: { text: "PRIVATE ERROR PAYLOAD", lineNumber: 21 } });
  const dir = await mkdtemp(join(tmpdir(), "issue-755-diagnostics-"));
  try {
    await diagnostics.save(dir, "fixture-9", new Error("Request failed for private@example.com 123456"));
    const output = await readFile(join(dir, "issue-755-fixture-9-failure.json"), "utf8");
    const report = JSON.parse(output);
    assert.equal(report.fixtureState.createdCount, 9);
    assert.equal(report.fixtureState.readbackCount, 9);
    assert.equal(report.dom.budgetHistoryEntries, 9);
    assert.deepEqual(report.networkErrors, [{ status: 503, method: "POST", endpoint: "/api/budgets/:id" }]);
    assert.deepEqual(report.transportFailures, [{ method: "POST", endpoint: "/api/budgets/:id", canceled: false, code: "net::ERR_CONNECTION_RESET" }]);
    assert.deepEqual(report.consoleEvents, [{ type: "error" }]);
    assert.equal(report.browserErrors[0].lineNumber, 21);
    for (const secret of ["PRIVATE", "SECRET", "private@example.com", "123456", "private-id"]) {
      assert.equal(output.includes(secret), false, `Diagnostics exposed ${secret}`);
    }
  } finally {
    diagnostics.stop();
    assert.equal([...listeners.values()].every((callbacks) => callbacks.size === 0), true);
    await rm(dir, { recursive: true, force: true });
  }
});
