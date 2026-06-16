import type { TenantContext } from "./tenant.js";
import { buildStableImportHash, ImportFileError, previewImportedStatement } from "./imports.js";

const tenantA: TenantContext = {
  userId: "user-import-a",
  organizationId: "org-import-a",
  financialProfileId: "profile-import-a",
  financialProfileKind: "personal",
};

const now = "2026-06-16T10:00:00.000Z";

testValidCsvPreview();
testInvalidCsvPreview();
testBasicOfxPreview();
testDuplicateDetection();
testInvalidFileErrors();

function testValidCsvPreview(): void {
  const preview = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "extrato-demo.csv",
    content: [
      "date,description,amount,accountId,categoryId",
      "2026-06-10,Receita demo,1500.25,account-demo,category-income",
      "11/06/2026,Mercado demo,-95,account-demo,category-food",
    ].join("\n"),
  });

  assertEqual(preview.state, "ready", "csv preview state");
  assertEqual(preview.batch.sourceKind, "csv", "csv source kind");
  assertEqual(preview.batch.status, "reviewing", "csv batch status");
  assertEqual(preview.batch.totalRows, 2, "csv total rows");
  assertEqual(preview.batch.validRows, 2, "csv valid rows");
  assertEqual(preview.suggestions.length, 2, "csv suggestion count");
  assertEqual(preview.suggestions[0]?.kind, "income", "csv income kind");
  assertEqual(preview.suggestions[0]?.amountMinor, 150025, "csv income amount");
  assertEqual(preview.suggestions[1]?.kind, "expense", "csv expense kind");
  assertEqual(preview.suggestions[1]?.occurredOn, "2026-06-11", "csv br date");
  assertEqual(preview.suggestions[1]?.organizationId, tenantA.organizationId, "csv org scope");
}

function testInvalidCsvPreview(): void {
  const preview = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "extrato-invalido.csv",
    content: ["date,description,amount", "2026-06-10,Compra sem valor,abc", "2026-06-11,,10"].join(
      "\n",
    ),
  });

  assertEqual(preview.state, "blocked", "invalid csv blocked");
  assertEqual(preview.batch.status, "failed", "invalid csv batch status");
  assertEqual(preview.batch.problemRows, 2, "invalid csv problem rows");
  assertEqual(preview.suggestions.length, 0, "invalid csv suggestions");
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
  assertEqual(preview.suggestions.length, 1, "ofx suggestion count");
  assertEqual(preview.suggestions[0]?.kind, "expense", "ofx kind");
  assertEqual(preview.suggestions[0]?.amountMinor, 4250, "ofx amount");
  assertEqual(preview.suggestions[0]?.occurredOn, "2026-06-12", "ofx date");
  assertEqual(preview.suggestions[0]?.externalId, "ofx-demo-1", "ofx external id");
}

function testDuplicateDetection(): void {
  const rowSeed = "2026-06-10,Receita demo,100";
  const duplicateHash = buildStableImportHash(
    `csv:${tenantA.organizationId}:${tenantA.financialProfileId}:${rowSeed}`,
  );
  const preview = previewImportedStatement({
    context: tenantA,
    now,
    originalFileName: "duplicado.csv",
    existingSourceHashes: [duplicateHash],
    content: ["date,description,amount", rowSeed].join("\n"),
  });

  assertEqual(preview.suggestions.length, 1, "duplicate suggestion count");
  assertEqual(preview.suggestions[0]?.status, "duplicate", "duplicate status");
  assertEqual(preview.batch.duplicateRows, 1, "duplicate row count");
  assertEqual(preview.problems[0]?.code, "IMPORT_ROW_DUPLICATE", "duplicate warning");
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
}

function assertImportFileError(action: () => void, expectedCode: ImportFileError["code"]): void {
  try {
    action();
  } catch (error) {
    if (error instanceof ImportFileError && error.code === expectedCode) {
      return;
    }

    throw error;
  }

  throw new Error(`Expected import file error ${expectedCode}.`);
}

function assertProblemCode(
  problems: readonly { code: string }[],
  expectedCode: string,
  message: string,
): void {
  if (!problems.some((problem) => problem.code === expectedCode)) {
    throw new Error(`${message}. Expected problem code ${expectedCode}.`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
