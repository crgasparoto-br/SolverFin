import type { TenantContext } from "./tenant.js";
import {
  buildImportPayloadFingerprint,
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
testInvalidCsvPreview();
testBasicOfxPreview();
testDuplicateDetection();
testContextualBatchIdentity();
testStructuredPayloads();
testInvalidFileErrors();

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
  assertEqual(preview.csv?.sampleRows.length, 1, "sample returned");
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
  assertProblemCode(preview.problems, "IMPORT_ROW_AMOUNT_INVALID", "invalid csv amount");
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
