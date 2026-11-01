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
  assert.throws(
    () => assertBudgetLongList({ ...fixture, readbackCount: 9 }, rendered),
    /9 !== 10/,
  );
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
