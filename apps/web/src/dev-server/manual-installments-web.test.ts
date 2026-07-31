import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("parcelamento do Extrato usa uma requisicao canonica idempotente", async () => {
  const source = await readFile(new URL("./transactions-page.ts", import.meta.url), "utf8");

  assert.match(source, /send\("\/api\/installments", "POST", installmentRequest\)/);
  assert.match(source, /idempotencyKey/);
  assert.match(source, /installmentAttemptFingerprint/);
  assert.doesNotMatch(source, /responses\.push\(await send\("\/api\/transactions"/);
  assert.match(source, /!transaction\.installmentId/);
});
