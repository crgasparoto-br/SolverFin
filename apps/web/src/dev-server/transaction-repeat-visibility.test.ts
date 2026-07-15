import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { recurrencesSectionStyles } from "./recurrences-section.js";

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const styles = recurrencesSectionStyles();
  const editForm = String.raw`\.modal-panel form\[data-form\]\[data-method=PATCH\]`;

  assert.match(styles, new RegExp(`${editForm} label:has\(\[name=repeatMode\]\)`));

  for (const field of [
    "installments",
    "installmentStart",
    "installmentValueMode",
    "interval",
    "frequency",
    "endOn",
  ]) {
    assert.match(styles, new RegExp(`${editForm} \\[data-field=${field}\\]`));
  }

  assert.doesNotMatch(styles, /data-method=POST[^}]*display:none/);

  const source = await readFile(
    resolve(process.cwd(), "src/dev-server/transactions-page.ts"),
    "utf8",
  );

  assert.match(source, /form\.dataset\.method = "POST";/);
  assert.match(source, /form\.dataset\.method = clone \? "POST" : "PATCH";/);
  assert.match(source, /<label>Repetição<select name="repeatMode">/);
}
