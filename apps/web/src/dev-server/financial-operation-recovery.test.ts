import assert from "node:assert/strict";
import test from "node:test";

import { financialOperationRecoveryScript } from "./financial-operation-recovery.js";

test("preserves the exact installment request after an ambiguous response", () => {
  const script = financialOperationRecoveryScript();

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

test("keeps the modal close action usable during ambiguous recovery", () => {
  const script = financialOperationRecoveryScript();
  const closeGuard = script.match(/function keepModalCloseAvailable\(\) \{([\s\S]*?)\n {6}}/)?.[1];

  assert.ok(closeGuard, "missing focused modal-close recovery guard");
  assert.match(script, /\.close-form button\[type="submit"\]/);
  assert.match(closeGuard, /closeButton\.disabled = false/);
  assert.match(closeGuard, /dataset\.financialRecoveryCloseAvailable = "true"/);
  assert.match(script, /lockInstallmentFormForRecovery[\s\S]*keepModalCloseAvailable\(\)/);
  assert.match(script, /enforceAmbiguousRecoveryMessage[\s\S]*keepModalCloseAvailable\(\)/);
  assert.match(script, /lockNonIdempotentFormAfterAmbiguity[\s\S]*keepModalCloseAvailable\(\)/);
  assert.match(script, /modal\?\.addEventListener\("close", clearAmbiguousAttempt\)/);
  assert.match(script, /modal\?\.addEventListener\("close", clearNonIdempotentAmbiguity\)/);
});

test("blocks blind retry for non-idempotent transaction and recurrence posts", () => {
  const script = financialOperationRecoveryScript();

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
