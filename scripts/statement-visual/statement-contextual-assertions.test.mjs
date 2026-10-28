import assert from "node:assert/strict";
import test from "node:test";

import { assertContextualSurface } from "./statement-contextual-assertions.mjs";

function measured(state, columns) {
  return {
    visible: true,
    inside: true,
    horizontalOverflow: false,
    documentOverflow: false,
    unnamedButtons: 0,
    visibleAccountFields: 1,
    documentScrollLocked: true,
    dialogOverflowHidden: true,
    panelScrollControlled: true,
    footerActionHeights: { cancel: 44, continue: state === "edit" ? 0 : 44, save: 44 },
    footerActionLabels: state === "edit"
      ? ["Cancelar", "Salvar lançamento"]
      : ["Cancelar", "Salvar e continuar", "Salvar lançamento"],
    footerActionColumns: columns,
    footerActionRowDelta: columns === 1 ? 52 : state === "edit" ? 0 : 52,
    footerContinueRowDelta: columns === 1 ? 52 : 0,
    footerContinueHidden: state === "edit",
    footerPrimaryBelowContinue: state !== "edit",
    footerContinueAfterCancel: columns === 1,
    footerSaveAfterCancel: columns === 1,
    footerActionsContained: true,
    tooltipStatusCount: 3,
    statusLabelVisuallyHidden: true,
    horizontalCenterDelta: 0,
    verticalCenterDelta: 0,
    focusInside: true,
    closeButtons: 1,
    closeGlyphDuplications: 0,
    readOnlyOriginalName: "Banco completo",
    readOnlyInputHidden: true,
    readOnlyVisibleName: "Banco completo",
    selectedAccountName: "Banco completo",
    fullAccountName: "Banco completo",
  };
}

test("creation and cloning support primary action below Continue at 320, 390 and 1366", () => {
  for (const state of ["new", "clone"]) {
    for (const columns of [1, 2]) {
      assert.doesNotThrow(() => assertContextualSurface(measured(state, columns), state, true));
    }
  }
});

test("editing requires one visible primary submit, allowing narrow stacking", () => {
  for (const columns of [1, 2]) {
    assert.doesNotThrow(() => assertContextualSurface(measured("edit", columns), "edit", true));
  }
});

test("negative controls reject undersized buttons and leaked create-only action", () => {
  const mislabeled = measured("new", 2);
  mislabeled.footerActionLabels[1] = "Salvar lançamento";
  assert.throws(() => assertContextualSurface(mislabeled, "new", true), /footer action labels/);
  const tooSmall = measured("new", 2);
  tooSmall.footerActionHeights.continue = 32;
  assert.throws(() => assertContextualSurface(tooSmall, "new", true), /Continue touch target/);
  const leaked = measured("edit", 2);
  leaked.footerContinueHidden = false;
  assert.throws(() => assertContextualSurface(leaked, "edit", true), /create-only submit/);
  const badSave = measured("edit", 2);
  badSave.footerActionHeights.save = 0;
  assert.throws(() => assertContextualSurface(badSave, "edit", true), /save footer touch target/);
  const reversed = measured("new", 1);
  reversed.footerContinueAfterCancel = false;
  assert.throws(() => assertContextualSurface(reversed, "new", true), /stack in order/);
});
