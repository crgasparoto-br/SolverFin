import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BUDGET_LONG_LIST_PERIODS,
  assertAttachmentEditState,
  assertBudgetLongList,
} from "./issue-755-ci-determinism.mjs";

const ids = Array.from({ length: 10 }, (_, index) => `synthetic-budget-${index + 1}`);
const historyPeriodLabels = BUDGET_LONG_LIST_PERIODS.slice(0, -1).map(({ periodStartOn }) => {
  const [year, month, day] = periodStartOn.split("-");
  return `${day}/${month}/${year} a 31/12/2099`;
});

const fixture = {
  ok: true,
  createdCount: 10,
  readbackCount: 10,
  periodReadback: true,
  categoryId: "synthetic-category",
  categoryName: "Categoria sintética",
  currency: "USD",
  ids,
};
const fixtureGroup = {
  rowIds: [ids.at(-1)],
  currentRowId: ids.at(-1),
  categoryName: fixture.categoryName,
  currency: "USD",
  currentPeriodLabel: "01/10/2034 → 31/10/2034",
  historyPeriodLabels,
};
const rendered = { rows: 1, historyCount: 9, fixtureGroup };

test("budget long-list requires exact API readback and the same category's nine history entries", () => {
  assert.doesNotThrow(() => assertBudgetLongList(fixture, rendered));
  assert.throws(() => assertBudgetLongList({ ...fixture, readbackCount: 9 }, rendered), /9 !== 10/);
  assert.throws(
    () => assertBudgetLongList({ ...fixture, periodReadback: false }, rendered),
    /API readback/,
  );
  assert.throws(
    () => assertBudgetLongList({ ...fixture, categoryId: null }, rendered),
    /category is missing/,
  );
  assert.throws(
    () => assertBudgetLongList({ ...fixture, ids: ids.slice(1) }, rendered),
    /9 !== 10/,
  );
  assert.throws(
    () => assertBudgetLongList(fixture, { ...rendered, fixtureGroup: null }),
    /history is missing/,
  );
  assert.throws(
    () =>
      assertBudgetLongList(fixture, {
        ...rendered,
        rows: 10,
        historyCount: 0,
        fixtureGroup: { ...fixtureGroup, rowIds: ids, historyPeriodLabels: [] },
      }),
    /exactly one category row/,
  );
  assert.throws(
    () =>
      assertBudgetLongList(fixture, {
        ...rendered,
        fixtureGroup: { ...fixtureGroup, historyPeriodLabels: [] },
      }),
    /nine history entries/,
  );
  assert.throws(
    () =>
      assertBudgetLongList(fixture, {
        ...rendered,
        fixtureGroup: { ...fixtureGroup, rowIds: [ids.at(-1), ids.at(-1)] },
      }),
    /exactly one category row/,
  );
  assert.throws(
    () =>
      assertBudgetLongList(fixture, {
        ...rendered,
        fixtureGroup: { ...fixtureGroup, categoryName: "Outra categoria" },
      }),
    /another category/,
  );
  assert.throws(
    () =>
      assertBudgetLongList(fixture, {
        ...rendered,
        fixtureGroup: { ...fixtureGroup, currency: "BRL" },
      }),
    /another currency/,
  );
  assert.throws(
    () =>
      assertBudgetLongList(fixture, {
        ...rendered,
        fixtureGroup: { ...fixtureGroup, historyPeriodLabels: historyPeriodLabels.slice(1) },
      }),
    /nine history entries/,
  );
  assert.throws(
    () =>
      assertBudgetLongList(fixture, {
        ...rendered,
        fixtureGroup: {
          ...fixtureGroup,
          historyPeriodLabels: [historyPeriodLabels[1], ...historyPeriodLabels.slice(1)],
        },
      }),
    /history must contain exactly one/,
  );
  assert.throws(
    () =>
      assertBudgetLongList(fixture, {
        ...rendered,
        fixtureGroup: { ...fixtureGroup, currentPeriodLabel: "01/01/2033" },
      }),
    /current period is missing/,
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
      return {
        result: { value: { route: "orcamentos", openDialogs: 0, budgetHistoryEntries: 9 } },
      };
    },
  };
  const emit = (name, data) => {
    for (const callback of listeners.get(name) ?? []) callback(data);
  };
  const diagnostics = watchVisualFailures(fakeCdp);
  diagnostics.setFixtureState({
    stage: "nine-period-readback",
    createdCount: 9,
    readbackCount: 9,
    bankDetail: "PRIVATE",
  });
  emit("Network.requestWillBeSent", {
    requestId: "request-1",
    request: {
      method: "POST",
      url: "https://localhost/api/budgets/private-id?email=private@example.com&amount=123456",
    },
  });
  emit("Network.responseReceived", {
    requestId: "request-1",
    response: { status: 503, url: "https://localhost/api/budgets/private-id?bank=SECRET" },
  });
  emit("Network.loadingFailed", {
    requestId: "request-1",
    errorText: "net::ERR_CONNECTION_RESET",
    canceled: false,
  });
  emit("Network.requestWillBeSent", {
    requestId: "request-adversarial",
    request: { method: "PRIVATEACCOUNT", url: "https://localhost/api/budgets/private-id" },
  });
  emit("Network.responseReceived", {
    requestId: "request-adversarial",
    response: { status: 403, url: "https://localhost/api/budgets/private-id" },
  });
  emit("Network.loadingFailed", {
    requestId: "request-adversarial",
    errorText: "net::ERR_CONNECTION_RESET",
    canceled: false,
  });
  emit("Network.responseReceived", {
    requestId: "request-adversarial",
    response: { status: "SECRET_STATUS", url: "https://localhost/api/budgets/private-id" },
  });
  emit("Network.loadingFailed", {
    requestId: "request-adversarial",
    errorText: "net::ERR_PRIVATEACCOUNT",
    canceled: false,
  });
  emit("Runtime.consoleAPICalled", { type: "error", args: [{ value: "PRIVATE FINANCIAL VALUE" }] });
  emit("Runtime.exceptionThrown", {
    exceptionDetails: { text: "PRIVATE ERROR PAYLOAD", lineNumber: 21 },
  });
  emit("Runtime.exceptionThrown", {
    exceptionDetails: { exception: { className: "MariaAccountError" }, lineNumber: 22 },
  });
  emit("Runtime.exceptionThrown", {
    exceptionDetails: { exception: { className: "TypeError" }, lineNumber: 23 },
  });
  const dir = await mkdtemp(join(tmpdir(), "issue-755-diagnostics-"));
  try {
    await diagnostics.save(
      dir,
      "fixture-9",
      new Error("Request failed for private@example.com 123456"),
    );
    const output = await readFile(join(dir, "issue-755-fixture-9-failure.json"), "utf8");
    const report = JSON.parse(output);
    assert.equal(report.fixtureState.createdCount, 9);
    assert.equal(report.fixtureState.readbackCount, 9);
    assert.equal(report.dom.budgetHistoryEntries, 9);
    assert.deepEqual(report.networkErrors, [
      { status: 503, method: "POST", endpoint: "/api/budgets/:id" },
      { status: 403, method: "unknown", endpoint: "/api/budgets/:id" },
    ]);
    assert.deepEqual(report.transportFailures, [
      {
        method: "POST",
        endpoint: "/api/budgets/:id",
        canceled: false,
        code: "net::ERR_CONNECTION_RESET",
      },
      {
        method: "unknown",
        endpoint: "/api/budgets/:id",
        canceled: false,
        code: "net::ERR_CONNECTION_RESET",
      },
      {
        method: "unknown",
        endpoint: "/api/budgets/:id",
        canceled: false,
        code: "network-failure",
      },
    ]);
    assert.deepEqual(report.consoleEvents, [{ type: "error" }]);
    assert.equal(report.browserErrors[0].lineNumber, 21);
    assert.deepEqual(report.browserErrors[1], { className: "browser-exception", lineNumber: 22 });
    assert.deepEqual(report.browserErrors[2], { className: "TypeError", lineNumber: 23 });
    assert.equal(report.error.message, "unclassified-test-failure");
    for (const secret of ["PRIVATE", "SECRET", "MariaAccountError", "private@example.com", "123456", "private-id"]) {
      assert.equal(output.includes(secret), false, `Diagnostics exposed ${secret}`);
    }
    diagnostics.setFixtureState({ stage: "MariaAccount", createdCount: 100000, readbackCount: 9 });
    await diagnostics.save(dir, "untrusted-fixture", new Error("Synthetic R$ 12,34"));
    const unsafeState = await readFile(join(dir, "issue-755-untrusted-fixture-failure.json"), "utf8");
    assert.equal(JSON.parse(unsafeState).fixtureState.stage, "unknown");
    assert.equal(JSON.parse(unsafeState).fixtureState.createdCount, null);
    assert.equal(unsafeState.includes("MariaAccount"), false);
    // Both decimal formats bypassed the former four-digit redactor. Never persist free-form text.
    for (const message of [
      "Budget amount R$ 12,34 and USD 56.78 on account Maria",
      "Saldo -0,01; CPF 123.456.789-09; 12,3%",
      "Request failed: 1.000,00 | 0.01 | private@example.com",
      "Transaction edit dialog failed with price EUR 9,99",
    ]) {
      await diagnostics.save(dir, "fixture-9", new Error(message));
      const sanitized = await readFile(join(dir, "issue-755-fixture-9-failure.json"), "utf8");
      for (const secret of [
        "12,34",
        "56.78",
        "Maria",
        "-0,01",
        "123.456",
        "1.000,00",
        "0.01",
        "9,99",
        "private@example.com",
      ]) {
        assert.equal(sanitized.includes(secret), false, `Diagnostics leaked ${secret}`);
      }
    }
  } finally {
    diagnostics.stop();
    assert.equal(
      [...listeners.values()].every((callbacks) => callbacks.size === 0),
      true,
    );
    await rm(dir, { recursive: true, force: true });
  }
});
