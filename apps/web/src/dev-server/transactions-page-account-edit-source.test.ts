import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const source = await readFile(
    resolve(process.cwd(), "src/dev-server/transactions-page.ts"),
    "utf8",
  );

  assert.doesNotMatch(
    source,
    /A conta vem do filtro principal e não pode ser trocada neste modal\./,
  );
  assert.match(source, /<p class="muted">A conta vem do filtro principal\.<\/p>/);
  assert.doesNotMatch(source, /<select name="editScope">/);
  assert.doesNotMatch(source, />Editar repetição</);
  assert.match(source, /transaction\.recurrenceId \? renderRecurrenceIndicator\(\) : ""/);
}
