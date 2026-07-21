import { readFile, writeFile } from "node:fs/promises";

async function update(path, transform) {
  const original = await readFile(path, "utf8");
  const updated = transform(original);
  if (updated === original) throw new Error(`No changes produced for ${path}`);
  await writeFile(path, updated, "utf8");
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Missing start marker for ${label}`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`Missing end marker for ${label}`);
  return source.slice(0, start) + replacement + source.slice(end);
}

await update("packages/domain/src/imports.ts", (source) =>
  replaceBetween(
    source,
    "  const signedAvailable = signed.candidates.length > 0;",
    "\n}\n\nfunction resolveSuppliedCsvMapping",
    `  const signedComplete = signed.candidates.length === 1;
  const splitComplete = income.candidates.length === 1 && expense.candidates.length === 1;
  const signedDetected = signed.candidates.length > 0;
  const splitDetected = income.candidates.length > 0 || expense.candidates.length > 0;
  const valueCandidates = {
    ...(signed.candidates.length === 1 ? { amount: signed.candidates[0] } : {}),
    ...(income.candidates.length === 1 ? { incomeAmount: income.candidates[0] } : {}),
    ...(expense.candidates.length === 1 ? { expenseAmount: expense.candidates[0] } : {}),
  };
  let mapping: CsvImportMapping;
  if (signedComplete && splitComplete) {
    mapping = {
      version: 2,
      valueStrategy: "signed",
      ...(date.header ? { date: date.header } : {}),
      ...(description.header ? { description: description.header } : {}),
      amount: signed.candidates[0],
    };
    ambiguousFields.push("valueStrategy");
  } else if (signedComplete) {
    mapping = {
      version: 2,
      valueStrategy: "signed",
      ...(date.header ? { date: date.header } : {}),
      ...(description.header ? { description: description.header } : {}),
      amount: signed.candidates[0],
    };
  } else if (splitComplete) {
    mapping = {
      version: 2,
      valueStrategy: "split",
      ...(date.header ? { date: date.header } : {}),
      ...(description.header ? { description: description.header } : {}),
      incomeAmount: income.candidates[0],
      expenseAmount: expense.candidates[0],
    };
  } else if (signedDetected && splitDetected) {
    mapping = {
      version: 2,
      valueStrategy: "signed",
      ...(date.header ? { date: date.header } : {}),
      ...(description.header ? { description: description.header } : {}),
      ...(valueCandidates.amount === undefined ? {} : { amount: valueCandidates.amount }),
    };
    ambiguousFields.push("valueStrategy");
  } else if (signedDetected) {
    mapping = {
      version: 2,
      valueStrategy: "signed",
      ...(date.header ? { date: date.header } : {}),
      ...(description.header ? { description: description.header } : {}),
      ...(signed.candidates.length === 1 ? { amount: signed.candidates[0] } : {}),
    };
    if (signed.candidates.length > 1) ambiguousFields.push("amount");
  } else {
    mapping = {
      version: 2,
      valueStrategy: "split",
      ...(date.header ? { date: date.header } : {}),
      ...(description.header ? { description: description.header } : {}),
      ...(income.candidates.length === 1 ? { incomeAmount: income.candidates[0] } : {}),
      ...(expense.candidates.length === 1 ? { expenseAmount: expense.candidates[0] } : {}),
    };
    if (income.candidates.length > 1) ambiguousFields.push("incomeAmount");
    if (expense.candidates.length > 1) ambiguousFields.push("expenseAmount");
  }

  const missingRequiredFields = collectMissingRequiredFields(mapping);
  if (ambiguousFields.includes("valueStrategy")) {
    removeItem(missingRequiredFields, "amount");
    removeItem(missingRequiredFields, "incomeAmount");
    removeItem(missingRequiredFields, "expenseAmount");
    if (!missingRequiredFields.includes("valueStrategy"))
      missingRequiredFields.push("valueStrategy");
  } else if (!signedDetected && !splitDetected) {
    removeItem(missingRequiredFields, "incomeAmount");
    removeItem(missingRequiredFields, "expenseAmount");
    if (!missingRequiredFields.includes("valueStrategy"))
      missingRequiredFields.push("valueStrategy");
  }
  return {
    mapping,
    ambiguousFields: unique(ambiguousFields),
    missingRequiredFields,
    ...(Object.keys(valueCandidates).length === 0 ? {} : { valueCandidates }),
  };`,
    "CSV strategy resolver",
  ),
);

await update("packages/domain/src/imports.test.ts", (source) =>
  replaceBetween(
    source,
    "function testConditionalValueStrategyRequirements(): void {",
    "\n}\n\nfunction testMappingPrioritiesAndBalanceSafety",
    `function testConditionalValueStrategyRequirements(): void {
  const signedWithIncome = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "signed-with-income.csv",
    content: "Data,Descrição,Valor,Entrada\\n20/07/2026,Demo,-10,10",
  });
  assertEqual(signedWithIncome.state, "ready", "complete signed strategy ignores partial split");
  assertEqual(signedWithIncome.csv?.valueStrategy, "signed", "signed strategy is detected");
  assertEqual(signedWithIncome.suggestions[0]?.kind, "expense", "signed value remains canonical");

  const signedWithExpense = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "signed-with-expense.csv",
    content: "Data,Descrição,Valor,Saída\\n20/07/2026,Demo,10,20",
  });
  assertEqual(signedWithExpense.state, "ready", "complete signed ignores lone expense column");
  assertEqual(signedWithExpense.csv?.valueStrategy, "signed", "signed wins over partial split");
  assertEqual(signedWithExpense.suggestions[0]?.kind, "income", "positive signed value is income");

  const ambiguousSignedCompleteSplit = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "ambiguous-signed-complete-split.csv",
    content: "Data,Descrição,Valor,Amount,Entrada,Saída\\n20/07/2026,Demo,10,11,10,0",
  });
  assertEqual(
    ambiguousSignedCompleteSplit.state,
    "ready",
    "complete split bypasses ambiguous signed candidates",
  );
  assertEqual(
    ambiguousSignedCompleteSplit.csv?.valueStrategy,
    "split",
    "split is the only complete strategy",
  );
  assertEqual(
    ambiguousSignedCompleteSplit.suggestions[0]?.kind,
    "income",
    "complete split produces the suggestion",
  );

  const ambiguousSplitWithSigned = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "ambiguous-split-with-signed.csv",
    content: "Data,Descrição,Valor,Entrada,Receita,Saída\\n20/07/2026,Demo,-10,10,11,0",
  });
  assertEqual(
    ambiguousSplitWithSigned.state,
    "ready",
    "complete signed bypasses ambiguous split candidates",
  );
  assertEqual(
    ambiguousSplitWithSigned.csv?.valueStrategy,
    "signed",
    "signed is the only complete strategy",
  );
  assertEqual(
    ambiguousSplitWithSigned.suggestions[0]?.kind,
    "expense",
    "signed suggestion remains authoritative",
  );

  const neitherComplete = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "incomplete-strategies.csv",
    content: "Data,Descrição,Valor,Amount,Entrada\\n20/07/2026,Demo,-10,-11,10",
  });
  assertEqual(neitherComplete.state, "mapping_required", "incomplete strategies require a decision");
  assertEqual(
    neitherComplete.csv?.missingRequiredFields.includes("valueStrategy"),
    true,
    "strategy is requested when no detected strategy is complete",
  );
  assertEqual(
    neitherComplete.csv?.missingRequiredFields.includes("amount"),
    false,
    "signed field remains conditional before strategy selection",
  );
  assertEqual(
    neitherComplete.csv?.missingRequiredFields.includes("expenseAmount"),
    false,
    "missing split side remains conditional before strategy selection",
  );

  const splitChoiceMissingExpense = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "incomplete-strategies.csv",
    csvMapping: {
      version: 2,
      valueStrategy: "split",
      date: "Data",
      description: "Descrição",
      incomeAmount: "Entrada",
    },
    content: "Data,Descrição,Valor,Amount,Entrada\\n20/07/2026,Demo,-10,-11,10",
  });
  assertEqual(
    splitChoiceMissingExpense.csv?.missingRequiredFields.includes("expenseAmount"),
    true,
    "split requests the missing expense column after split is selected",
  );`,
    "conditional strategy tests",
  ),
);

await update("apps/api/src/csv-import-review.integration.test.ts", (source) => {
  const callMarker = "  await assertPreviewContractValidation(token, fixtures.account.id);\n";
  if (!source.includes(callMarker)) throw new Error("Missing API call insertion marker");
  source = source.replace(
    callMarker,
    `${callMarker}  await assertStrategyDetectionOnlyWhenNeeded(token, fixtures.account.id);\n`,
  );
  const functionMarker = "async function assertLegacyMappingCannotControlNewImport(";
  const insertion = `async function assertStrategyDetectionOnlyWhenNeeded(
  token: string,
  accountId: string,
): Promise<void> {
  const cases = [
    {
      name: "signed-with-income",
      content: "Data,Descrição,Valor,Entrada\\n20/07/2026,Demo,-10,10",
      expectedStrategy: "signed",
      expectedKind: "expense",
    },
    {
      name: "signed-with-expense",
      content: "Data,Descrição,Valor,Saída\\n20/07/2026,Demo,10,20",
      expectedStrategy: "signed",
      expectedKind: "income",
    },
    {
      name: "ambiguous-signed-complete-split",
      content: "Data,Descrição,Valor,Amount,Entrada,Saída\\n20/07/2026,Demo,10,11,10,0",
      expectedStrategy: "split",
      expectedKind: "income",
    },
    {
      name: "ambiguous-split-complete-signed",
      content: "Data,Descrição,Valor,Entrada,Receita,Saída\\n20/07/2026,Demo,-10,10,11,0",
      expectedStrategy: "signed",
      expectedKind: "expense",
    },
  ] as const;

  for (const item of cases) {
    const response = await apiRequest(token, "POST", "/api/import-batches/csv/preview", {
      originalFileName: item.name + ".csv",
      content: item.content,
      accountId,
      consentAccepted: true,
    });
    assert.equal(response.statusCode, 200);
    const preview = readBody<{
      state: string;
      csv: { valueStrategy?: string; missingRequiredFields: string[]; ambiguousFields: string[] };
      suggestions: Array<{ kind: string }>;
    }>(response);
    assert.equal(preview.state, "ready", item.name + " should be ready");
    assert.equal(preview.csv.valueStrategy, item.expectedStrategy);
    assert.equal(preview.csv.missingRequiredFields.includes("valueStrategy"), false);
    assert.equal(preview.csv.ambiguousFields.includes("valueStrategy"), false);
    assert.equal(preview.suggestions[0]?.kind, item.expectedKind);
  }

  const genuinelyAmbiguous = await apiRequest(
    token,
    "POST",
    "/api/import-batches/csv/preview",
    {
      originalFileName: "both-complete.csv",
      content: "Data,Descrição,Valor,Entrada,Saída\\n20/07/2026,Demo,10,10,0",
      accountId,
      consentAccepted: true,
    },
  );
  assert.equal(genuinelyAmbiguous.statusCode, 200);
  const ambiguousPreview = readBody<{
    state: string;
    csv: { valueStrategy?: string; missingRequiredFields: string[]; ambiguousFields: string[] };
  }>(genuinelyAmbiguous);
  assert.equal(ambiguousPreview.state, "mapping_required");
  assert.equal(ambiguousPreview.csv.valueStrategy, undefined);
  assert.equal(ambiguousPreview.csv.missingRequiredFields.includes("valueStrategy"), true);
  assert.equal(ambiguousPreview.csv.ambiguousFields.includes("valueStrategy"), true);
}

`;
  if (!source.includes(functionMarker)) throw new Error("Missing API function insertion marker");
  return source.replace(functionMarker, insertion + functionMarker);
});

await update("scripts/statement-visual/inbox-csv-review.mjs", (source) => {
  const marker = `  await screenshot(cdp, join(outputDir, "issue-513-csv-mapping-c6.png"));\n\n`;
  if (!source.includes(marker)) throw new Error("Missing visual insertion marker");
  const insertion = `  await screenshot(cdp, join(outputDir, "issue-513-csv-mapping-c6.png"));

  await evaluate(
    cdp,
    \`(() => {
      const form = document.getElementById('csv-import-form');
      for (const name of ['mappingDate', 'mappingDescription', 'mappingStrategy', 'mappingAmount', 'mappingIncomeAmount', 'mappingExpenseAmount']) {
        form.elements[name].value = '';
      }
      const transfer = new DataTransfer();
      transfer.items.add(new File([
        'Data,Descrição,Valor,Entrada\\\\n20/07/2026,Assinada,-10,10'
      ], 'signed-partial-split-issue-513.csv', { type: 'text/csv' }));
      form.elements.file.files = transfer.files;
      document.getElementById('preview-csv-import').click();
      return true;
    })()\`,
  );
  await waitFor(
    cdp,
    \`(() => {
      const form = document.getElementById('csv-import-form');
      return form?.elements.mappingStrategy?.value === 'signed' &&
        form?.elements.mappingAmount?.value === 'Valor' &&
        document.getElementById('create-csv-import')?.disabled === false &&
        document.getElementById('csv-import-status')?.textContent.includes('Preview pronto');
    })()\`,
  );
  const partialSplit = await evaluate(
    cdp,
    \`(() => {
      const form = document.getElementById('csv-import-form');
      return {
        strategy: form.elements.mappingStrategy.value,
        amount: form.elements.mappingAmount.value,
        income: form.elements.mappingIncomeAmount.value,
        createDisabled: document.getElementById('create-csv-import').disabled,
        preview: document.getElementById('csv-preview-result').textContent || ''
      };
    })()\`,
  );
  check(partialSplit.strategy === "signed", "Partial split incorrectly forced a strategy choice", partialSplit);
  check(partialSplit.amount === "Valor", "Signed amount was not selected with partial split", partialSplit);
  check(!partialSplit.createDisabled, "Complete signed mapping stayed blocked by partial split", partialSplit);
  check(partialSplit.preview.includes("Despesa"), "Signed preview did not infer the negative amount", partialSplit);

`;
  source = source.replace(marker, insertion);
  return source.replace(
    "  return { setup, c6, ambiguous, resolved, screenshot: \"issue-513-csv-mapping-c6.png\" };",
    "  return { setup, c6, partialSplit, ambiguous, resolved, screenshot: \"issue-513-csv-mapping-c6.png\" };",
  );
});
