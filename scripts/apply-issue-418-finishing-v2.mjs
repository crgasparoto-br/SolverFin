import { readFile, writeFile } from "node:fs/promises";

async function replaceRequired(path, search, replacement) {
  const current = await readFile(path, "utf8");
  if (!current.includes(search)) {
    throw new Error(`Expected fragment not found in ${path}: ${search.slice(0, 80)}`);
  }
  await writeFile(path, current.replace(search, replacement));
}

async function appendOnce(path, marker, content) {
  const current = await readFile(path, "utf8");
  if (current.includes(marker)) return;
  await writeFile(path, `${current.trimEnd()}\n\n${content.trim()}\n`);
}

await replaceRequired(
  "apps/web/src/dev-server/recurrences-section.ts",
  `  const isCard = targetKind === "card";\n  const itemName = isCard ? "compra" : "lançamento";`,
  `  const isCard = targetKind === "card";\n  const scopeSubject = isCard ? "Esta compra" : "Este lançamento";\n  const currentScopeLabel = isCard\n    ? "Alterar somente esta compra"\n    : "Alterar somente este lançamento";\n  const futureScopeLabel = isCard\n    ? "Alterar esta compra e as próximas"\n    : "Alterar este lançamento e os próximos";`,
);
await replaceRequired(
  "apps/web/src/dev-server/recurrences-section.ts",
  `<p class="muted">Esta \${itemName} faz parte de uma recorrência. Escolha uma opção antes de salvar.</p>`,
  `<p class="muted">\${scopeSubject} faz parte de uma recorrência. Escolha uma opção antes de salvar.</p>`,
);
await replaceRequired(
  "apps/web/src/dev-server/recurrences-section.ts",
  `<button type="button" data-recurrence-scope="current" autofocus>Alterar somente esta \${itemName}</button>\n          <button type="button" class="secondary-button" data-recurrence-scope="current_and_future">Alterar esta \${itemName} e \${isCard ? "as" : "os"} próximas\${isCard ? "" : ""}</button>`,
  `<button type="button" data-recurrence-scope="current" autofocus>\${currentScopeLabel}</button>\n          <button type="button" class="secondary-button" data-recurrence-scope="current_and_future">\${futureScopeLabel}</button>`,
);

await replaceRequired(
  "apps/api/src/repositories/recurring-card-purchase-edit.ts",
  `     left join "Invoice" inv\n       on inv."id" = t."invoiceId"\n      and inv."organizationId" = t."organizationId"\n      and inv."financialProfileId" = t."financialProfileId"\n     left join "Installment" i`,
  `     join "Invoice" inv\n       on inv."id" = t."invoiceId"\n      and inv."organizationId" = t."organizationId"\n      and inv."financialProfileId" = t."financialProfileId"\n     left join "Installment" i`,
);
await replaceRequired(
  "apps/api/src/repositories/recurring-card-purchase-edit.ts",
  `     left join "Recurrence" r\n       on r."id" = t."recurrenceId"`,
  `     join "Recurrence" r\n       on r."id" = t."recurrenceId"`,
);
await replaceRequired(
  "apps/api/src/repositories/recurring-card-purchase-edit.ts",
  `       and (($5::int is not null and i."sequenceNumber" > $5)\n         or ($5::int is null and t."plannedOn" > $6))`,
  `       and (($5::int is not null and (i."sequenceNumber" > $5\n         or (i."sequenceNumber" is null and t."plannedOn" > $6)))\n         or ($5::int is null and t."plannedOn" > $6))`,
);
await replaceRequired(
  "apps/api/src/repositories/recurring-card-purchase-edit.ts",
  `     for update of t, inv`,
  `     for update of t`,
);

await replaceRequired(
  "apps/api/src/repositories/recurring-account-transaction-edit.ts",
  `       and (($5::int is not null and i."sequenceNumber" > $5)\n         or ($5::int is null and t."plannedOn" > $6))`,
  `       and (($5::int is not null and (i."sequenceNumber" > $5\n         or (i."sequenceNumber" is null and t."plannedOn" > $6)))\n         or ($5::int is null and t."plannedOn" > $6))`,
);

await appendOnce(
  "docs/API_RECURRENCES_INSTALLMENTS.md",
  "## Edição de ocorrência atual e próximas",
  `## Edição de ocorrência atual e próximas

A edição ampliada é sempre relativa à ocorrência selecionada. Quando houver uma parcela vinculada, a posição é determinada por sequenceNumber; o critério por data é usado apenas para dados legados sem parcela vinculada.

### Lançamentos de conta

PATCH /api/transactions/:transactionId aceita applyToFuturePlanned: true. A operação atualiza, em uma única transação de banco:

- o lançamento selecionado e sua parcela;
- a regra da recorrência, incluindo o recálculo de startOn pela posição da ocorrência;
- somente lançamentos posteriores ainda planejados;
- a auditoria da ocorrência e da recorrência.

### Compras de cartão

PATCH /api/credit-card-accounts/:cardId/purchases/:transactionId aceita editScope: current_and_future. A operação é atômica e atualiza a compra selecionada, sua parcela, o total da fatura atual, a recorrência, as compras posteriores elegíveis, suas parcelas e os totais das faturas afetadas.

A resposta ampliada contém transactionUpdated, recurrence, updatedCount, skippedCount e skipped. Os motivos estáveis de itens ignorados incluem installment_locked, transaction_missing, transaction_locked, invoice_missing, invoice_locked e invoice_period_mismatch.

Falhas na ocorrência selecionada, validação, categoria, instrumento, período de fatura ou persistência provocam rollback integral. Ocorrências futuras bloqueadas são preservadas e retornadas no resumo de itens ignorados.`,
);

await appendOnce(
  "docs/RECURRENCES_INSTALLMENTS_WEB.md",
  "## Modal de escopo da edição",
  `## Modal de escopo da edição

Ao salvar uma ocorrência que possui recurrenceId, a interface valida o formulário e abre um diálogo com opções explícitas:

- alterar somente o lançamento ou compra selecionado;
- alterar o selecionado e as próximas ocorrências elegíveis;
- voltar para a edição sem salvar.

Fechar, voltar ou pressionar Escape não envia requisições e preserva o formulário. Durante o salvamento, as ações ficam desabilitadas para impedir envio duplicado. Erros permanecem no diálogo e ocorrências ignoradas são resumidas em linguagem clara.

No cartão, o escopo ampliado faz uma única chamada ao endpoint da compra com editScope: current_and_future; o frontend não coordena salvamentos separados. No extrato, o escopo ampliado envia applyToFuturePlanned: true.`,
);
