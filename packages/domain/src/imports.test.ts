import type { TenantContext } from "./tenant.js";
import {
  buildImportPayloadFingerprint,
  buildLegacyImportBatchHash,
  buildSecureImportHash,
  buildStableImportHash,
  buildTransactionExtractionPayload,
  ImportFileError,
  parseDeterministicReviewPayload,
  parseTransactionExtractionPayload,
  previewImportedStatement,
} from "./imports.js";

const tenantA: TenantContext = {
  userId: "user-import-a",
  organizationId: "org-import-a",
  financialProfileId: "profile-import-a",
  financialProfileKind: "personal",
};

const now = "2026-06-16T10:00:00.000Z";

testValidCsvPreview();
testSemicolonAndBrazilianAmount();
testQuotedCsvAndBom();
testMappingRequired();
testExplicitMapping();
testAmbiguousDelimiter();
testAmbiguousHeadersRequireChoice();
testDuplicateMappingIsRejected();
testColumnCountMismatchIsSafe();
testOriginalHeadersAndPreviewLimit();
testInvalidCsvPreview();
testBasicOfxPreview();
testDuplicateDetection();
testContextualBatchIdentity();
testStructuredPayloads();
testInvalidFileErrors();
testC6SplitAmountInference();
testSignedAmountIgnoresKindColumn();
testSplitAmountDiagnostics();
testSignedAmountDiagnostics();
testAmbiguousValueStrategy();
testConditionalValueStrategyRequirements();
testMappingPrioritiesAndBalanceSafety();
testStrategyChangesBatchIdentity();
testLegacyMappingCompatibility();

function testValidCsvPreview(): void {
  const preview = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "extrato-demo.csv",
    defaultAccountId: "account-demo",
    content: [
      "date,description,amount,kind",
      "2026-06-10,Receita demo,1500.25,income",
      "11/06/2026,Mercado demo,-95,expense",
    ].join("\n"),
  });

  assertEqual(preview.persisted, false, "preview is never persisted");
  assertEqual(preview.state, "ready", "csv preview state");
  assertEqual(preview.batch.sourceKind, "csv", "csv source kind");
  assertEqual(preview.batch.status, "reviewing", "csv batch status");
  assertEqual(preview.batch.totalRows, 2, "csv total rows");
  assertEqual(preview.batch.validRows, 2, "csv valid rows");
  assertEqual(preview.batch.defaultAccountId, "account-demo", "csv default account");
  assertEqual(preview.suggestions.length, 2, "csv suggestion count");
  assertEqual(preview.suggestions[0]?.kind, "income", "csv income kind");
  assertEqual(preview.suggestions[0]?.amountMinor, 150025, "csv income amount");
  assertEqual(preview.suggestions[1]?.kind, "expense", "csv expense kind");
  assertEqual(preview.suggestions[1]?.occurredOn, "2026-06-11", "csv br date");
  assertEqual(preview.suggestions[1]?.accountId, "account-demo", "csv account propagated");
}

function testSemicolonAndBrazilianAmount(): void {
  const preview = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "extrato-br.csv",
    defaultAccountId: "account-demo",
    content: [
      "Data;Descrição;Valor;Tipo",
      '16/06/2026;"Supermercado, bairro";"-1.234,56";Despesa',
    ].join("\n"),
  });

  assertEqual(preview.state, "ready", "semicolon csv ready");
  assertEqual(preview.csv?.delimiter, ";", "semicolon detected");
  assertEqual(preview.suggestions[0]?.description, "Supermercado, bairro", "quoted comma kept");
  assertEqual(preview.suggestions[0]?.amountMinor, 123456, "brazilian amount parsed");
  assertEqual(preview.suggestions[0]?.kind, "expense", "brazilian kind parsed");
}

function testQuotedCsvAndBom(): void {
  const preview = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "quoted.csv",
    content: [
      "\uFEFFdate,description,amount",
      '2026-06-10,"Compra ""especial"", loja",-42.50',
    ].join("\n"),
  });

  assertEqual(preview.state, "ready", "quoted csv ready");
  assertEqual(preview.suggestions[0]?.description, 'Compra "especial", loja', "escaped quote");
  assertEqual(preview.suggestions[0]?.amountMinor, 4250, "quoted amount");
}

function testMappingRequired(): void {
  const preview = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "custom.csv",
    content: "quando,o-que,quanto\n2026-06-10,Demo,-10",
  });

  assertEqual(preview.state, "mapping_required", "custom headers require mapping");
  assertEqual(preview.csv?.headers.length, 3, "headers returned");
  assertEqual(preview.csv?.sampleRows.length, 0, "raw rows are not returned before mapping");
  assertEqual(preview.suggestions.length, 0, "mapping preview has no suggestions");
}

function testExplicitMapping(): void {
  const preview = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "custom.csv",
    csvMapping: { date: "quando", description: "o-que", amount: "quanto" },
    content: "quando,o-que,quanto\n2026-06-10,Demo,-10",
  });

  assertEqual(preview.state, "ready", "explicit mapping ready");
  assertEqual(preview.csv?.sampleRows[0]?.description, "Demo", "normalized sample returned");
  assertEqual(preview.csv?.sampleRows[0]?.amountMinor, 1000, "normalized sample amount");
  assertEqual(preview.suggestions[0]?.kind, "expense", "kind inferred by sign");
}

function testAmbiguousDelimiter(): void {
  const preview = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "ambiguous.csv",
    content: "date;description,amount\n2026-06-10;Demo,-10",
  });

  assertEqual(preview.state, "mapping_required", "ambiguous delimiter asks user");
  assertEqual(preview.csv?.delimiterCandidates.length, 2, "both delimiters suggested");
}

function testAmbiguousHeadersRequireChoice(): void {
  const preview = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "ambiguous-headers.csv",
    content: "Data,DATE,Descrição,Valor\n16/06/2026,2026-06-16,Demo,-10",
  });

  assertEqual(preview.state, "mapping_required", "ambiguous aliases require explicit mapping");
  assertEqual(preview.csv?.ambiguousFields.includes("date"), true, "date ambiguity exposed");
  assertEqual(preview.csv?.headers[0], "Data", "original header preserved");
  assertEqual(preview.csv?.headers[2], "Descrição", "accented original header preserved");
}

function testDuplicateMappingIsRejected(): void {
  assertImportFileError(
    () =>
      previewImportedStatement({
        context: tenantA,
        now,
        originalFileName: "duplicate-mapping.csv",
        csvMapping: { date: "Data", description: "Data", amount: "Valor" },
        content: "Data,Valor,Descrição\n16/06/2026,-10,Demo",
      }),
    "IMPORT_CSV_MAPPING_INVALID",
  );
}

function testColumnCountMismatchIsSafe(): void {
  const preview = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "columns.csv",
    content: [
      "date,description,amount",
      "2026-06-10,Valida,-10",
      "2026-06-11,Coluna ausente",
      "2026-06-12,Coluna extra,-20,nao-deve-vazar",
    ].join("\n"),
  });

  assertEqual(preview.state, "ready", "valid rows remain reviewable");
  assertEqual(preview.suggestions.length, 1, "invalid structural rows do not create suggestions");
  assertEqual(preview.batch.problemRows, 2, "column mismatches counted");
  assertProblemCode(preview.problems, "IMPORT_CSV_COLUMN_COUNT_MISMATCH", "column count mismatch");
  assertEqual(
    JSON.stringify(preview).includes("nao-deve-vazar"),
    false,
    "raw extra cell is not exposed",
  );
}

function testOriginalHeadersAndPreviewLimit(): void {
  const rows = Array.from(
    { length: 12 },
    (_, index) => `2026-06-${String(index + 1).padStart(2, "0")},Linha ${index + 1},-1`,
  );
  const preview = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "sample-limit.csv",
    content: ["Data,Descrição,Valor", ...rows].join("\n"),
  });

  assertEqual(preview.csv?.headers[0], "Data", "display header remains original");
  assertEqual(preview.csv?.headers[1], "Descrição", "display accent remains original");
  assertEqual(preview.csv?.sampleRows.length, 10, "preview sample is limited");
  assertEqual(preview.suggestions.length, 12, "internal preview retains all valid suggestions");
}

function testInvalidCsvPreview(): void {
  const preview = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "extrato-invalido.csv",
    content: ["date,description,amount", "2026-02-30,Compra sem valor,abc", "2026-06-11,,10"].join(
      "\n",
    ),
  });

  assertEqual(preview.state, "blocked", "invalid csv blocked");
  assertEqual(preview.batch.status, "failed", "invalid csv batch status");
  assertEqual(preview.batch.problemRows, 2, "invalid csv problem rows");
  assertEqual(preview.suggestions.length, 0, "invalid csv suggestions");
  assertProblemCode(preview.problems, "IMPORT_ROW_DATE_INVALID", "invalid csv date");
  assertProblemCode(preview.problems, "IMPORT_ROW_NUMBER_INVALID", "invalid csv amount");
  assertProblemCode(preview.problems, "IMPORT_ROW_DESCRIPTION_REQUIRED", "invalid csv description");
}

function testBasicOfxPreview(): void {
  const preview = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "extrato-demo.ofx",
    content: [
      "<OFX>",
      "<BANKTRANLIST>",
      "<STMTTRN>",
      "<TRNTYPE>DEBIT",
      "<DTPOSTED>20260612000000[-3:BRT]",
      "<TRNAMT>-42.50",
      "<FITID>ofx-demo-1",
      "<NAME>Compra OFX demo",
      "</STMTTRN>",
      "</BANKTRANLIST>",
      "</OFX>",
    ].join("\n"),
  });

  assertEqual(preview.state, "ready", "ofx preview state");
  assertEqual(preview.batch.sourceKind, "ofx", "ofx source kind");
  assertEqual(preview.suggestions[0]?.amountMinor, 4250, "ofx amount");
  assertEqual(preview.suggestions[0]?.externalId, "ofx-demo-1", "ofx external id");
}

function testDuplicateDetection(): void {
  const rowSeed = "2026-06-10|Receita demo|10000|income|";
  const duplicateHash = buildStableImportHash(
    `csv:${tenantA.organizationId}:${tenantA.financialProfileId}:${rowSeed}`,
  );
  const preview = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "duplicado.csv",
    existingSourceHashes: [duplicateHash],
    content: "date,description,amount\n2026-06-10,Receita demo,100",
  });

  assertEqual(preview.suggestions[0]?.status, "duplicate", "duplicate status");
  assertEqual(preview.batch.duplicateRows, 1, "duplicate row count");
  assertProblemCode(preview.problems, "IMPORT_ROW_DUPLICATE", "duplicate warning");
}

function testContextualBatchIdentity(): void {
  const common = {
    context: tenantA,
    now,
    originalFileName: "same.csv",
    content: "date,description,amount\n2026-06-10,Demo,-10",
  } as const;
  const accountA = previewImportedStatement({ ...common, defaultAccountId: "account-a" });
  const accountB = previewImportedStatement({ ...common, defaultAccountId: "account-b" });
  const mapped = previewImportedStatement({
    ...common,
    defaultAccountId: "account-a",
    csvMapping: { date: "date", description: "description", amount: "amount" },
  });

  assertNotEqual(
    accountA.batch.sourceHash,
    accountB.batch.sourceHash,
    "account changes batch identity",
  );
  assertEqual(
    accountA.batch.sourceHash,
    mapped.batch.sourceHash,
    "canonical mapping keeps identity",
  );
  assertEqual(accountA.batch.sourceHash.startsWith("sha256-"), true, "batch uses SHA-256");
  assertEqual(
    accountA.batch.contentHash,
    accountB.batch.contentHash,
    "content hash ignores account",
  );
  assertNotEqual(
    accountA.batch.sourceHash,
    buildLegacyImportBatchHash({
      kind: "csv",
      content: common.content,
      defaultAccountId: "account-a",
      ...(accountA.batch.csvDelimiter === undefined
        ? {}
        : { csvDelimiter: accountA.batch.csvDelimiter }),
      ...(accountA.batch.csvMapping === undefined ? {} : { csvMapping: accountA.batch.csvMapping }),
    }),
    "secure batch identity differs from legacy hash",
  );
  assertEqual(buildSecureImportHash("demo").length, 71, "SHA-256 identifier length");
}

function testStructuredPayloads(): void {
  const preview = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "payload.csv",
    defaultAccountId: "account-a",
    content: "date,description,amount\n2026-06-10,Demo,-10",
  });
  const suggestion = preview.suggestions[0];
  if (suggestion === undefined) throw new Error("Expected suggestion.");
  const payload = buildTransactionExtractionPayload(suggestion);
  const parsed = parseTransactionExtractionPayload(payload);
  assertEqual(parsed?.accountId, "account-a", "structured payload account");
  assertEqual(parsed?.amountMinor, 1000, "structured payload amount");
  const fingerprint = buildImportPayloadFingerprint(payload);
  assertEqual(fingerprint.startsWith("fnv1a-"), true, "payload fingerprint");
  const deterministic = parseDeterministicReviewPayload({
    payloadVersion: 1,
    sourceSuggestionId: "source-1",
    sourcePayloadFingerprint: fingerprint,
    targetTransactionId: "transaction-1",
    reasons: ["Mesmo valor"],
    conflicts: [],
  });
  assertEqual(deterministic?.sourceSuggestionId, "source-1", "deterministic source link");
}

function testInvalidFileErrors(): void {
  assertImportFileError(
    () =>
      previewImportedStatement({
        context: tenantA,
        now,
        originalFileName: "vazio.csv",
        content: "  ",
      }),
    "IMPORT_FILE_EMPTY",
  );
  assertImportFileError(
    () =>
      previewImportedStatement({
        context: tenantA,
        now,
        originalFileName: "extrato.txt",
        content: "date,description,amount\n2026-06-10,Demo,10",
      }),
    "IMPORT_FILE_KIND_UNSUPPORTED",
  );
  assertImportFileError(
    () =>
      previewImportedStatement({
        context: tenantA,
        now,
        originalFileName: "extrato.csv",
        maxSizeInBytes: 10,
        content: "date,description,amount\n2026-06-10,Demo,10",
      }),
    "IMPORT_FILE_TOO_LARGE",
  );
  assertImportFileError(
    () =>
      previewImportedStatement({
        context: tenantA,
        now,
        originalFileName: "header.csv",
        content: "date,description,amount",
      }),
    "IMPORT_CSV_NO_DATA_ROWS",
  );
  assertImportFileError(
    () =>
      previewImportedStatement({
        context: tenantA,
        now,
        originalFileName: "quotes.csv",
        content: 'date,description,amount\n2026-06-10,"Demo,-10',
      }),
    "IMPORT_CSV_STRUCTURE_INVALID",
  );
  assertImportFileError(
    () =>
      previewImportedStatement({
        context: tenantA,
        now,
        originalFileName: "encoding.csv",
        content: "date,description,amount\n2026-06-10,Demo\u0000,-10",
      }),
    "IMPORT_FILE_ENCODING_INVALID",
  );
}

function testC6SplitAmountInference(): void {
  const preview = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "c6.csv",
    content: [
      "Data Lançamento;Data Contábil;Título;Descrição;Entrada(R$);Saída(R$);Saldo do Dia(R$)",
      "20/07/2026;20/07/2026;PIX;Receita cliente;100,00;;100,00",
      "20/07/2026;20/07/2026;Compra;Mercado;;-25,50;74,50",
    ].join("\n"),
  });

  assertEqual(preview.state, "ready", "C6 preview state");
  assertEqual(preview.csv?.mapping.version, 2, "C6 mapping version");
  assertEqual(preview.csv?.valueStrategy, "split", "C6 split strategy");
  assertEqual(preview.csv?.mapping.date, "Data Lançamento", "posting date has priority");
  assertEqual(preview.csv?.mapping.description, "Descrição", "description has priority over title");
  assertEqual(preview.suggestions[0]?.kind, "income", "C6 income inferred");
  assertEqual(preview.suggestions[0]?.amountMinor, 10000, "C6 income amount");
  assertEqual(preview.suggestions[1]?.kind, "expense", "C6 expense inferred");
  assertEqual(preview.suggestions[1]?.amountMinor, 2550, "C6 expense amount uses modulus");
  assertEqual(
    preview.csv?.interpretation.some(
      (item) => item.source === "Saldo do Dia(R$)" && item.target === "ignored",
    ),
    true,
    "balance is explicitly ignored",
  );
}

function testSignedAmountIgnoresKindColumn(): void {
  const preview = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "signed.csv",
    content: [
      "date,description,amount,kind",
      "2026-07-20,Saída,-10,income",
      "2026-07-20,Entrada,10,expense",
    ].join("\n"),
  });
  assertEqual(preview.suggestions[0]?.kind, "expense", "negative amount wins over type column");
  assertEqual(preview.suggestions[1]?.kind, "income", "positive amount wins over type column");
  assertEqual(
    preview.suggestions[0]?.externalId,
    undefined,
    "generic flow does not fill external ID",
  );
}

function testSplitAmountDiagnostics(): void {
  const preview = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "split-invalid.csv",
    content: [
      "date,description,Entrada,Saída",
      "2026-07-20,Ambas,10,20",
      "2026-07-20,Zero,0,0",
      "2026-07-20,Vazia,,",
      "2026-07-20,Inválida,abc,",
      "2026-07-20,Entrada negativa,-10,",
      "2026-07-20,Saída positiva,,20",
      "2026-07-20,Entrada com zero oposto,10,0",
      "2026-07-20,Saída com zero oposto,0,20",
    ].join("\n"),
  });
  assertEqual(preview.state, "ready", "valid split rows remain reviewable");
  assertProblemCode(preview.problems, "IMPORT_ROW_SPLIT_AMOUNT_CONFLICT", "both values filled");
  assertEqual(
    preview.problems.filter((problem) => problem.code === "IMPORT_ROW_SPLIT_AMOUNT_REQUIRED")
      .length,
    2,
    "empty and all-zero split rows share the controlled missing-value diagnostic",
  );
  assertProblemCode(preview.problems, "IMPORT_ROW_NUMBER_INVALID", "invalid number");
  assertEqual(
    preview.suggestions[0]?.kind,
    "income",
    "negative income column still creates income",
  );
  assertEqual(preview.suggestions[0]?.amountMinor, 1000, "negative income uses modulus");
  assertEqual(
    preview.suggestions[1]?.kind,
    "expense",
    "positive expense column still creates expense",
  );
  assertEqual(preview.suggestions[1]?.amountMinor, 2000, "positive expense uses modulus");
  assertEqual(preview.suggestions[2]?.kind, "income", "zero expense column is treated as absent");
  assertEqual(preview.suggestions[2]?.amountMinor, 1000, "income with opposite zero is accepted");
  assertEqual(preview.suggestions[3]?.kind, "expense", "zero income column is treated as absent");
  assertEqual(preview.suggestions[3]?.amountMinor, 2000, "expense with opposite zero is accepted");
}

function testSignedAmountDiagnostics(): void {
  const preview = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "signed-invalid.csv",
    content: [
      "date,description,amount",
      "2026-07-20,Vazio,",
      "2026-07-20,Zero,0",
      "2026-07-20,Inválido,abc",
    ].join("\n"),
  });
  assertEqual(preview.state, "blocked", "invalid signed rows are blocked");
  assertProblemCode(preview.problems, "IMPORT_ROW_AMOUNT_REQUIRED", "empty signed value");
  assertProblemCode(preview.problems, "IMPORT_ROW_AMOUNT_ZERO", "zero signed value");
  assertProblemCode(preview.problems, "IMPORT_ROW_NUMBER_INVALID", "invalid signed number");
}

function testAmbiguousValueStrategy(): void {
  const preview = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "ambiguous-strategy.csv",
    content: "Data,Descrição,Valor,Entrada,Saída\n20/07/2026,Demo,10,10,",
  });
  assertEqual(preview.state, "mapping_required", "ambiguous value strategy requires a decision");
  assertEqual(
    preview.csv?.ambiguousFields.includes("valueStrategy"),
    true,
    "strategy ambiguity exposed",
  );
  assertEqual(preview.csv?.valueStrategy, undefined, "ambiguous strategy is not preselected");
  assertEqual(preview.csv?.valueCandidates?.amount, "Valor", "signed candidate is preserved");
  assertEqual(
    preview.csv?.valueCandidates?.incomeAmount,
    "Entrada",
    "income candidate is preserved",
  );
  assertEqual(
    preview.csv?.valueCandidates?.expenseAmount,
    "Saída",
    "expense candidate is preserved",
  );
  assertEqual(
    preview.csv?.missingRequiredFields.includes("amount"),
    false,
    "only the strategy decision is required when value candidates are unique",
  );
}

function testConditionalValueStrategyRequirements(): void {
  const signedWithIncome = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "signed-with-income.csv",
    content: "Data,Descrição,Valor,Entrada\n20/07/2026,Demo,10,10",
  });
  assertEqual(signedWithIncome.state, "mapping_required", "signed and income require strategy");
  assertEqual(
    signedWithIncome.csv?.missingRequiredFields.includes("valueStrategy"),
    true,
    "strategy is the only unconditional value decision",
  );
  assertEqual(
    signedWithIncome.csv?.missingRequiredFields.includes("amount"),
    false,
    "signed amount is not requested before strategy selection",
  );
  assertEqual(
    signedWithIncome.csv?.missingRequiredFields.includes("expenseAmount"),
    false,
    "missing split side is conditional until split is selected",
  );

  const signedChoice = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "signed-with-income.csv",
    csvMapping: {
      version: 2,
      valueStrategy: "signed",
      date: "Data",
      description: "Descrição",
      amount: "Valor",
    },
    content: "Data,Descrição,Valor,Entrada\n20/07/2026,Demo,10,10",
  });
  assertEqual(signedChoice.state, "ready", "signed choice is immediately usable");

  const splitChoiceMissingExpense = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "signed-with-income.csv",
    csvMapping: {
      version: 2,
      valueStrategy: "split",
      date: "Data",
      description: "Descrição",
      incomeAmount: "Entrada",
    },
    content: "Data,Descrição,Valor,Entrada\n20/07/2026,Demo,10,10",
  });
  assertEqual(
    splitChoiceMissingExpense.csv?.missingRequiredFields.includes("expenseAmount"),
    true,
    "split requests the missing expense column only after split is selected",
  );

  const signedWithExpense = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "signed-with-expense.csv",
    content: "Data,Descrição,Valor,Saída\n20/07/2026,Demo,-10,10",
  });
  assertEqual(
    signedWithExpense.csv?.missingRequiredFields.includes("incomeAmount"),
    false,
    "missing income column is conditional until split is selected",
  );

  const ambiguousSignedCompleteSplit = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "ambiguous-signed-complete-split.csv",
    content: "Data,Descrição,Valor,Amount,Entrada,Saída\n20/07/2026,Demo,10,11,10,0",
  });
  assertEqual(
    ambiguousSignedCompleteSplit.csv?.missingRequiredFields.includes("valueStrategy"),
    true,
    "strategy remains the first decision with ambiguous signed candidates",
  );
  assertEqual(
    ambiguousSignedCompleteSplit.csv?.missingRequiredFields.includes("amount"),
    false,
    "ambiguous signed field is not required when complete split remains available",
  );
  const completeSplitChoice = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "ambiguous-signed-complete-split.csv",
    csvMapping: {
      version: 2,
      valueStrategy: "split",
      date: "Data",
      description: "Descrição",
      incomeAmount: "Entrada",
      expenseAmount: "Saída",
    },
    content: "Data,Descrição,Valor,Amount,Entrada,Saída\n20/07/2026,Demo,10,11,10,0",
  });
  assertEqual(
    completeSplitChoice.state,
    "ready",
    "complete split choice bypasses signed ambiguity",
  );

  const ambiguousSplitWithSigned = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "ambiguous-split-with-signed.csv",
    content: "Data,Descrição,Valor,Entrada,Receita,Saída\n20/07/2026,Demo,-10,10,11,0",
  });
  assertEqual(
    ambiguousSplitWithSigned.csv?.missingRequiredFields.includes("valueStrategy"),
    true,
    "strategy is requested before resolving split-only ambiguity",
  );
  assertEqual(
    ambiguousSplitWithSigned.csv?.missingRequiredFields.includes("incomeAmount"),
    false,
    "split ambiguity is conditional when signed is complete",
  );
  const unambiguousSignedChoice = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "ambiguous-split-with-signed.csv",
    csvMapping: {
      version: 2,
      valueStrategy: "signed",
      date: "Data",
      description: "Descrição",
      amount: "Valor",
    },
    content: "Data,Descrição,Valor,Entrada,Receita,Saída\n20/07/2026,Demo,-10,10,11,0",
  });
  assertEqual(unambiguousSignedChoice.state, "ready", "signed choice bypasses split ambiguity");
}

function testMappingPrioritiesAndBalanceSafety(): void {
  const preview = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "priorities.csv",
    content:
      " Data Contábil , DATA LANÇAMENTO ,Título,Descrição,Saldo do Dia(R$),Valor \n20/07/2026,19/07/2026,Título fallback,Descrição principal,10,-5",
  });
  assertEqual(preview.csv?.mapping.date, "DATA LANÇAMENTO", "date priority ignores casing");
  assertEqual(
    preview.csv?.mapping.description,
    "Descrição",
    "description priority ignores accents",
  );
  assertEqual(
    (preview.csv?.mapping as { amount?: string } | undefined)?.amount,
    "Valor",
    "balance is never auto-detected as amount",
  );

  assertImportFileError(
    () =>
      previewImportedStatement({
        context: tenantA,
        now,
        originalFileName: "balance.csv",
        csvMapping: {
          version: 2,
          valueStrategy: "signed",
          date: "Data",
          description: "Descrição",
          amount: "Saldo do Dia(R$)",
        },
        content: "Data,Descrição,Saldo do Dia(R$)\n20/07/2026,Demo,10",
      }),
    "IMPORT_CSV_MAPPING_INVALID",
  );
}

function testStrategyChangesBatchIdentity(): void {
  const content = "Data,Descrição,Valor,Entrada,Saída\n20/07/2026,Demo,10,10,";
  const signed = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "identity.csv",
    csvMapping: {
      version: 2,
      valueStrategy: "signed",
      date: "Data",
      description: "Descrição",
      amount: "Valor",
    },
    content,
  });
  const split = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "identity.csv",
    csvMapping: {
      version: 2,
      valueStrategy: "split",
      date: "Data",
      description: "Descrição",
      incomeAmount: "Entrada",
      expenseAmount: "Saída",
    },
    content,
  });
  assertNotEqual(
    signed.batch.sourceHash,
    split.batch.sourceHash,
    "strategies have distinct hashes",
  );
}

function testLegacyMappingCompatibility(): void {
  const preview = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "legacy.csv",
    csvMapping: {
      version: 1,
      date: "date",
      description: "description",
      amount: "amount",
      kind: "kind",
      externalId: "externalId",
    },
    content: "date,description,amount,kind,externalId\n2026-07-20,Legado,10,expense,legacy-1",
  });
  assertEqual(preview.suggestions[0]?.kind, "expense", "legacy type remains readable");
  assertEqual(
    preview.suggestions[0]?.externalId,
    "legacy-1",
    "legacy external ID remains readable",
  );
}

function assertImportFileError(action: () => void, expectedCode: ImportFileError["code"]): void {
  try {
    action();
  } catch (error) {
    if (error instanceof ImportFileError && error.code === expectedCode) return;
    throw error;
  }
  throw new Error(`Expected import file error ${expectedCode}.`);
}

function assertProblemCode(
  problems: readonly { code: string }[],
  expectedCode: string,
  message: string,
): void {
  if (!problems.some((problem) => problem.code === expectedCode))
    throw new Error(`${message}. Expected problem code ${expectedCode}.`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected)
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
}

function assertNotEqual<T>(actual: T, expected: T, message: string): void {
  if (actual === expected) throw new Error(`${message}. Values must differ.`);
}
