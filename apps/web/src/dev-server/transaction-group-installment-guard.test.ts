import assert from "node:assert/strict";
import test from "node:test";

import { transactionGroupingScript } from "./transaction-group-installment-guard.js";

test("keeps canonical installments selectable for bulk actions and blocks only grouping", () => {
  const script = transactionGroupingScript();
  const directSelectionGuard = script.match(
    /function markCanonicalSelection\(input\) \{([\s\S]*?)\n {6}}/,
  )?.[1];

  assert.ok(directSelectionGuard, "missing direct canonical installment selection guard");
  assert.match(directSelectionGuard, /dataset\.canonicalInstallment = "true"/);
  assert.doesNotMatch(directSelectionGuard, /input\.disabled = true/);
  assert.match(script, /data-canonical-installment/);
  assert.match(script, /syncCanonicalGroupingGuard/);
  assert.match(script, /data-group-open/);
  assert.match(script, /continuam disponíveis para conciliar, desconciliar ou excluir/);
  assert.match(script, /function disableLegacyGroupSelection\(input\)/);
  assert.match(script, /input\.disabled = true/);
  assert.match(script, /descriptor\.pathname === "\/api\/installments"/);
  assert.match(script, /response\.clone\(\)\.json/);
  assert.match(script, /searchParams\.has\("accountId"\)/);
  assert.match(script, /script\[data-group\]/);
  assert.match(script, /data-installment-badge/);
  assert.match(script, /Parcelas devem permanecer fora de agrupamentos/);
  assert.doesNotMatch(script, /FINANCIAL_OPERATION_RESULT_UNKNOWN/);
  assert.doesNotMatch(script, /installmentRecovery/);
  assert.doesNotMatch(script, /nonIdempotentRecovery/);
});
