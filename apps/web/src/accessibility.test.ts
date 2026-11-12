import { strict as assert } from "node:assert";

import { evaluateViewReadiness } from "./accessibility.js";

acceptsAccessibleReadyView();
flagsMissingLabelsAndFocus();
flagsLargeListsWithoutPagination();

function acceptsAccessibleReadyView(): void {
  const result = evaluateViewReadiness({
    state: "ready",
    hasVisibleHeading: true,
    hasLoadingFeedback: true,
    hasEmptyStateAction: true,
    hasErrorRecoveryAction: true,
    estimatedListItems: 20,
    interactiveElements: [
      {
        id: "new-transaction",
        role: "button",
        accessibleName: "Novo lancamento",
        keyboardReachable: true,
        focusVisible: true,
        minTouchTargetPx: 44,
      },
    ],
  });

  assert.equal(result.accessible, true);
  assert.equal(result.performant, true);
  assert.equal(result.issues.length, 0);
}

function flagsMissingLabelsAndFocus(): void {
  const result = evaluateViewReadiness({
    state: "error",
    hasVisibleHeading: false,
    hasLoadingFeedback: true,
    hasEmptyStateAction: true,
    hasErrorRecoveryAction: false,
    interactiveElements: [
      {
        id: "retry",
        role: "button",
        keyboardReachable: false,
        focusVisible: false,
        minTouchTargetPx: 32,
      },
    ],
  });

  assert.equal(result.accessible, false);
  assert.equal(
    result.issues.some((issue) => issue.includes("nome acessivel")),
    true,
  );
  assert.equal(
    result.issues.some((issue) => issue.includes("recuperacao")),
    true,
  );
}

function flagsLargeListsWithoutPagination(): void {
  const result = evaluateViewReadiness({
    state: "ready",
    hasVisibleHeading: true,
    hasLoadingFeedback: true,
    hasEmptyStateAction: true,
    hasErrorRecoveryAction: true,
    estimatedListItems: 150,
    virtualizedOrPaginated: false,
    interactiveElements: [],
  });

  assert.equal(result.performant, false);
  assert.equal(
    result.issues.some((issue) => issue.includes("Listas grandes")),
    true,
  );
}
