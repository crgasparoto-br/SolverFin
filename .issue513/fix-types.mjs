import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(content, search, replacement, label) {
  const first = content.indexOf(search);
  const last = content.lastIndexOf(search);
  if (first < 0 || first !== last) {
    throw new Error(`Expected exactly one match for ${label}`);
  }
  return content.replace(search, replacement);
}

const indexPath = "packages/domain/src/index.ts";
let index = readFileSync(indexPath, "utf8");
index = replaceOnce(
  index,
  "export interface ImportBatch extends Traceable, TenantScoped {",
  `export type CsvImportMappingSnapshot =
  | {
      version?: 1 | undefined;
      date?: string | undefined;
      description?: string | undefined;
      amount?: string | undefined;
      kind?: string | undefined;
      externalId?: string | undefined;
    }
  | {
      version: 2;
      valueStrategy: "signed";
      date?: string | undefined;
      description?: string | undefined;
      amount?: string | undefined;
    }
  | {
      version: 2;
      valueStrategy: "split";
      date?: string | undefined;
      description?: string | undefined;
      incomeAmount?: string | undefined;
      expenseAmount?: string | undefined;
    };

export interface ImportBatch extends Traceable, TenantScoped {`,
  "CSV mapping snapshot type",
);
index = replaceOnce(
  index,
  '  csvMapping?: Partial<Record<"date" | "description" | "amount" | "kind" | "externalId", string>>;',
  "  csvMapping?: CsvImportMappingSnapshot;",
  "ImportBatch csvMapping type",
);
writeFileSync(indexPath, index, "utf8");

const domainTestPath = "packages/domain/src/imports.test.ts";
let domainTests = readFileSync(domainTestPath, "utf8");
domainTests = domainTests.replaceAll("\\\\n", "\\n");
writeFileSync(domainTestPath, domainTests, "utf8");

const integrationPath = "apps/api/src/csv-import-review.integration.test.ts";
let integration = readFileSync(integrationPath, "utf8");
integration = replaceOnce(
  integration,
  `interface ImportBatch {
  id: string;
  organizationId: string;
  financialProfileId: string;
  status: string;
  totalRows?: number;
}`,
  `interface ImportBatch {
  id: string;
  organizationId: string;
  financialProfileId: string;
  status: string;
  totalRows?: number;
  csvMapping?: {
    version?: number;
    valueStrategy?: string;
    date?: string;
    description?: string;
    amount?: string;
    incomeAmount?: string;
    expenseAmount?: string;
  };
}`,
  "integration ImportBatch type",
);
integration = replaceOnce(
  integration,
  `interface ExtractionPayload {
  payloadVersion: 1;
  sourceRowNumber: number;
  description: string;`,
  `interface ExtractionPayload {
  payloadVersion: 1;
  sourceRowNumber: number;
  description: string;
  kind?: string;`,
  "integration extraction kind",
);
integration = integration.replaceAll("\\\\n", "\\n");
writeFileSync(integrationPath, integration, "utf8");
