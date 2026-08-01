import assert from "node:assert/strict";
import test from "node:test";

import { transactionGroupInstallmentGuardScript } from "./transaction-group-installment-guard.js";

test("keeps canonical installments selectable for bulk actions and blocks only grouping", () => {
  const script = transactionGroupInstallmentGuardScript();
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
  assert.doesNotMatch(script, /nativeFetch\("\/api\/installments/);
});

test("preserves the exact installment request after an ambiguous response", () => {
  const script = transactionGroupInstallmentGuardScript();

  assert.match(script, /let ambiguousInstallmentAttempt/);
  assert.match(script, /response\.status === 504|response\.status >= 500/);
  assert.match(script, /ambiguousInstallmentAttempt = descriptor/);
  assert.match(script, /descriptor = ambiguousInstallmentAttempt/);
  assert.match(script, /body: descriptor\.body/);
  assert.match(script, /form\.dataset\.installmentRecovery = "ambiguous"/);
  assert.match(script, /data-installment-recovery-disabled/);
  assert.match(script, /lockInstallmentFormForRecovery\(\);/);
  assert.match(script, /new MutationObserver\(enforceAmbiguousRecoveryMessage\)/);
  assert.match(script, /attributeFilter: \["class"\]/);
  assert.match(script, /antes de alterar os dados/);
  assert.match(script, /addEventListener\("close", clearAmbiguousAttempt\)/);
});

test("blocks blind retry for non-idempotent transaction and recurrence posts", () => {
  const script = transactionGroupInstallmentGuardScript();

  assert.match(script, /descriptor\.pathname === "\/api\/transactions"/);
  assert.match(script, /descriptor\.pathname === "\/api\/recurrences"/);
  assert.match(script, /form\.dataset\.nonIdempotentRecovery = "ambiguous"/);
  assert.match(script, /FINANCIAL_OPERATION_RESULT_UNKNOWN/);
  assert.match(script, /Confira o Extrato antes de tentar novamente para evitar duplicidade/);
  assert.match(script, /target\.dataset\.nonIdempotentRecovery !== "ambiguous"/);
  assert.match(script, /event\.stopImmediatePropagation\(\)/);
  assert.match(script, /submitButton\.disabled = true/);
  assert.match(script, /clearNonIdempotentAmbiguity/);
  assert.doesNotMatch(script, /nonIdempotentAmbiguousRequest\s*=\s*ambiguousInstallmentAttempt/);
});
