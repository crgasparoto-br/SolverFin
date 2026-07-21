import { readFile, writeFile } from "node:fs/promises";

async function replaceOnce(path, before, after) {
  const source = await readFile(path, "utf8");
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Pattern not found in ${path}: ${before.slice(0, 80)}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Pattern is not unique in ${path}: ${before.slice(0, 80)}`);
  }
  await writeFile(path, source.slice(0, first) + after + source.slice(first + before.length), "utf8");
}

await replaceOnce(
  "packages/domain/src/imports.ts",
  `    const mapping = normalizeSuppliedMapping(input.csvMapping);\n    return {\n      rows: [],\n      metadata: {`,
  `    const mapping = normalizeSuppliedMapping(input.csvMapping);\n    const missingRequiredFields: CsvRequiredField[] =\n      input.csvMapping === undefined\n        ? ["date", "description", "valueStrategy"]\n        : collectMissingRequiredFields(mapping);\n    return {\n      rows: [],\n      metadata: {`,
);

await replaceOnce(
  "packages/domain/src/imports.ts",
  `        missingRequiredFields: ["date", "description", "valueStrategy"],`,
  `        missingRequiredFields,`,
);

await replaceOnce(
  "packages/domain/src/imports.ts",
  `    interpretation: buildInterpretation(resolution.mapping, ignoredHeaders),`,
  `    interpretation: buildInterpretation(\n      resolution.mapping,\n      ignoredHeaders,\n      resolveDetectedValueStrategy(resolution) !== undefined,\n    ),`,
);

await replaceOnce(
  "packages/domain/src/imports.ts",
  `function buildInterpretation(\n  mapping: CsvImportMapping,\n  ignoredHeaders: readonly string[],\n): CsvImportInterpretation[] {`,
  `function buildInterpretation(\n  mapping: CsvImportMapping,\n  ignoredHeaders: readonly string[],\n  includeValueMapping = true,\n): CsvImportInterpretation[] {`,
);

await replaceOnce(
  "packages/domain/src/imports.ts",
  `  if (isV2Mapping(mapping)) {\n    if (mapping.valueStrategy === "signed" && mapping.amount)\n      items.push({\n        source: mapping.amount,\n        target: "amount",\n        label: "Valor com sinal",\n      });\n    if (mapping.valueStrategy === "split") {\n      if (mapping.incomeAmount)\n        items.push({\n          source: mapping.incomeAmount,\n          target: "income",\n          label: "Receita",\n        });\n      if (mapping.expenseAmount)\n        items.push({\n          source: mapping.expenseAmount,\n          target: "expense",\n          label: "Despesa",\n        });\n    }\n  } else if (mapping.amount) {\n    items.push({ source: mapping.amount, target: "amount", label: "Valor" });\n  }`,
  `  if (includeValueMapping) {\n    if (isV2Mapping(mapping)) {\n      if (mapping.valueStrategy === "signed" && mapping.amount)\n        items.push({\n          source: mapping.amount,\n          target: "amount",\n          label: "Valor com sinal",\n        });\n      if (mapping.valueStrategy === "split") {\n        if (mapping.incomeAmount)\n          items.push({\n            source: mapping.incomeAmount,\n            target: "income",\n            label: "Receita",\n          });\n        if (mapping.expenseAmount)\n          items.push({\n            source: mapping.expenseAmount,\n            target: "expense",\n            label: "Despesa",\n          });\n      }\n    } else if (mapping.amount) {\n      items.push({ source: mapping.amount, target: "amount", label: "Valor" });\n    }\n  }`,
);

await replaceOnce(
  "packages/domain/src/imports.test.ts",
  `  assertEqual(\n    preview.csv?.missingRequiredFields.includes("amount"),\n    false,\n    "only the strategy decision is required when value candidates are unique",\n  );\n}`,
  `  assertEqual(\n    preview.csv?.missingRequiredFields.includes("amount"),\n    false,\n    "only the strategy decision is required when value candidates are unique",\n  );\n  assertEqual(\n    preview.csv?.interpretation.some((item) =>\n      ["amount", "income", "expense"].includes(item.target),\n    ),\n    false,\n    "ambiguous strategy does not expose a provisional value interpretation as applied",\n  );\n}`,
);

await replaceOnce(
  "packages/domain/src/imports.test.ts",
  `  assertEqual(preview.state, "mapping_required", "ambiguous delimiter asks user");\n  assertEqual(preview.csv?.delimiterCandidates.length, 2, "both delimiters suggested");\n}`,
  `  assertEqual(preview.state, "mapping_required", "ambiguous delimiter asks user");\n  assertEqual(preview.csv?.delimiterCandidates.length, 2, "both delimiters suggested");\n\n  const mappedPreview = previewImportedStatement({\n    context: tenantA,\n    now,\n    originalFileName: "ambiguous-mapped.csv",\n    csvMapping: {\n      version: 2,\n      valueStrategy: "signed",\n      date: "date",\n      description: "description",\n      amount: "amount",\n    },\n    content: "date;description,amount\\n2026-06-10;Demo,-10",\n  });\n  assertEqual(mappedPreview.state, "mapping_required", "separator choice remains pending");\n  assertEqual(\n    mappedPreview.csv?.missingRequiredFields.length,\n    0,\n    "complete mapping is preserved while only the delimiter remains unresolved",\n  );\n  assertEqual(mappedPreview.csv?.valueStrategy, "signed", "supplied strategy is preserved");\n}`,
);

await replaceOnce(
  "apps/api/src/csv-import-review.integration.test.ts",
  `  const mismatched = await apiRequest(token, "POST", "/api/import-batches/csv/preview", {`,
  `  const ambiguousDelimiter = await apiRequest(\n    token,\n    "POST",\n    "/api/import-batches/csv/preview",\n    {\n      originalFileName: "separador-ambiguo.csv",\n      content: "date;description,amount\\n2026-07-18;Teste,-1",\n      accountId,\n      consentAccepted: true,\n      csvMapping: {\n        version: 2,\n        valueStrategy: "signed",\n        date: "date",\n        description: "description",\n        amount: "amount",\n      },\n    },\n  );\n  assert.equal(ambiguousDelimiter.statusCode, 200);\n  const ambiguousDelimiterBody = readBody<{\n    state: string;\n    csv: { delimiterCandidates: string[]; missingRequiredFields: string[]; valueStrategy?: string };\n  }>(ambiguousDelimiter);\n  assert.equal(ambiguousDelimiterBody.state, "mapping_required");\n  assert.equal(ambiguousDelimiterBody.csv.delimiterCandidates.length, 2);\n  assert.deepEqual(ambiguousDelimiterBody.csv.missingRequiredFields, []);\n  assert.equal(ambiguousDelimiterBody.csv.valueStrategy, "signed");\n\n  const mismatched = await apiRequest(token, "POST", "/api/import-batches/csv/preview", {`,
);

await replaceOnce(
  "scripts/statement-visual/inbox-csv-review.mjs",
  `        expense: form.elements.mappingExpenseAmount.value,\n        createDisabled: document.getElementById('create-csv-import').disabled\n      };`,
  `        expense: form.elements.mappingExpenseAmount.value,\n        createDisabled: document.getElementById('create-csv-import').disabled,\n        interpretation: document.getElementById('csv-preview-result').textContent || ''\n      };`,
);

await replaceOnce(
  "scripts/statement-visual/inbox-csv-review.mjs",
  `  check(ambiguous.expense === "Saída", "Expense candidate was not preserved", ambiguous);\n  check(\n    ambiguous.createDisabled,`,
  `  check(ambiguous.expense === "Saída", "Expense candidate was not preserved", ambiguous);\n  check(\n    !ambiguous.interpretation.includes("Valor com sinal"),\n    "Ambiguous strategy exposed a provisional signed interpretation as applied",\n    ambiguous,\n  );\n  check(\n    ambiguous.createDisabled,`,
);

console.log("Issue 513 audit findings patched successfully.");
