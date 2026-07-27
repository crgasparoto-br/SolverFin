import assert from "node:assert/strict";
import test from "node:test";

import { transactionGroupInstallmentGuardScript } from "./transaction-group-installment-guard.js";

test("guards canonical installments from transaction groups without adding another API query", () => {
  const script = transactionGroupInstallmentGuardScript();

  assert.match(script, /transaction\.installmentId/);
  assert.match(script, /input\.disabled = true/);
  assert.match(script, /indisponível para agrupamento/);
  assert.match(script, /url\.pathname === "\/api\/installments"/);
  assert.match(script, /response\.clone\(\)\.json/);
  assert.match(script, /url\.searchParams\.has\("accountId"\)/);
  assert.match(script, /script\[data-group\]/);
  assert.match(script, /data-installment-badge/);
  assert.match(script, /Parcelas devem permanecer fora de agrupamentos/);
  assert.doesNotMatch(script, /nativeFetch\("\/api\/installments/);
});
