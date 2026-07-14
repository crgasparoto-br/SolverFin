import { readFile, writeFile } from "node:fs/promises";

const path = "apps/web/src/dev-server/transactions-page.ts";
let source = await readFile(path, "utf8");

const replacements = [
  [
    '${recurrence ? renderRecurrenceIndicator() : ""}',
    '${transaction.recurrenceId ? renderRecurrenceIndicator() : ""}',
  ],
  [
    '<p class="muted">A conta vem do filtro principal e não pode ser trocada neste modal.</p>',
    '<p class="muted">A conta vem do filtro principal.</p>',
  ],
  [
    '          <label class="full">Editar repetição<select name="editScope"><option>Somente este lançamento</option><option>Este e os próximos</option><option>Toda a repetição</option></select></label>\n',
    "",
  ],
];

for (const [before, after] of replacements) {
  if (!source.includes(before)) {
    throw new Error(`Expected source fragment was not found: ${before}`);
  }
  source = source.replace(before, after);
}

await writeFile(path, source);
