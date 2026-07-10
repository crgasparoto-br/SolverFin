import { readFile, writeFile } from "node:fs/promises";

async function replaceIfPresent(path, search, replacement) {
  const current = await readFile(path, "utf8");
  if (!current.includes(search)) return false;
  await writeFile(path, current.replace(search, replacement));
  return true;
}

const webPath = "apps/web/src/dev-server/recurrences-section.ts";
await replaceIfPresent(
  webPath,
  `  const isCard = targetKind === "card";\n  const itemName = isCard ? "compra" : "lançamento";`,
  `  const isCard = targetKind === "card";\n  const scopeSubject = isCard ? "Esta compra" : "Este lançamento";\n  const currentScopeLabel = isCard\n    ? "Alterar somente esta compra"\n    : "Alterar somente este lançamento";\n  const futureScopeLabel = isCard\n    ? "Alterar esta compra e as próximas"\n    : "Alterar este lançamento e os próximos";`,
);
await replaceIfPresent(
  webPath,
  `<p class="muted">Esta \${itemName} faz parte de uma recorrência. Escolha uma opção antes de salvar.</p>`,
  `<p class="muted">\${scopeSubject} faz parte de uma recorrência. Escolha uma opção antes de salvar.</p>`,
);
await replaceIfPresent(
  webPath,
  `<button type="button" data-recurrence-scope="current" autofocus>Alterar somente esta \${itemName}</button>\n          <button type="button" class="secondary-button" data-recurrence-scope="current_and_future">Alterar esta \${itemName} e \${isCard ? "as" : "os"} próximas\${isCard ? "" : ""}</button>`,
  `<button type="button" data-recurrence-scope="current" autofocus>\${currentScopeLabel}</button>\n          <button type="button" class="secondary-button" data-recurrence-scope="current_and_future">\${futureScopeLabel}</button>`,
);

const cardPath = "apps/api/src/repositories/recurring-card-purchase-edit.ts";
await replaceIfPresent(
  cardPath,
  `     left join "Invoice" inv\n       on inv."id" = t."invoiceId"\n      and inv."organizationId" = t."organizationId"\n      and inv."financialProfileId" = t."financialProfileId"\n     left join "Installment" i`,
  `     join "Invoice" inv\n       on inv."id" = t."invoiceId"\n      and inv."organizationId" = t."organizationId"\n      and inv."financialProfileId" = t."financialProfileId"\n     left join "Installment" i`,
);
await replaceIfPresent(
  cardPath,
  `     left join "Recurrence" r\n       on r."id" = t."recurrenceId"`,
  `     join "Recurrence" r\n       on r."id" = t."recurrenceId"`,
);
await replaceIfPresent(
  cardPath,
  `       and (($5::int is not null and i."sequenceNumber" > $5)\n         or ($5::int is null and t."plannedOn" > $6))`,
  `       and (($5::int is not null and (i."sequenceNumber" > $5\n         or (i."sequenceNumber" is null and t."plannedOn" > $6)))\n         or ($5::int is null and t."plannedOn" > $6))`,
);
await replaceIfPresent(cardPath, `     for update of t, inv, r`, `     for update of t, r`);
await replaceIfPresent(cardPath, `     for update of t, inv`, `     for update of t`);
