import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

test("parcelamento do Extrato usa uma requisicao canonica idempotente", async () => {
  const source = await readFile(
    resolve(process.cwd(), "src/dev-server/transactions-page.ts"),
    "utf8",
  );
  const guardSource = await readFile(
    resolve(process.cwd(), "src/dev-server/transaction-group-installment-guard.ts"),
    "utf8",
  );

  assert.match(source, /send\("\/api\/installments", "POST", installmentRequest\)/);
  assert.match(source, /idempotencyKey/);
  assert.match(source, /installmentAttemptFingerprint/);
  assert.doesNotMatch(source, /responses\.push\(await send\("\/api\/transactions"/);
  assert.match(guardSource, /data-canonical-installment/);
  assert.match(guardSource, /groupOpen\.disabled = true/);
  assert.match(guardSource, /conciliar, desconciliar ou excluir/);
});
