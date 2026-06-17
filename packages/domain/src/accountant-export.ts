import type {
  Category,
  EntityId,
  FinancialContextKind,
  ISODate,
  TenantScoped,
  Transaction,
} from "./index.js";
import type { TenantContext } from "./tenant.js";
import { listTenantScopedResources } from "./tenant-authorization.js";

export type AccountantExportDelimiter = "," | ";";

export interface AccountantExportFilters {
  periodStartOn: ISODate;
  periodEndOn: ISODate;
  financialProfileKind?: FinancialContextKind;
  delimiter?: AccountantExportDelimiter;
}

export interface AccountantExportRow {
  periodo_inicio: ISODate;
  periodo_fim: ISODate;
  data_lancamento: ISODate;
  tipo: Transaction["kind"];
  categoria: string;
  descricao: string;
  valor_centavos: number;
  moeda: string;
  contexto_financeiro: FinancialContextKind;
  status: Transaction["status"];
}

export interface AccountantExportResult {
  filename: string;
  contentType: "text/csv; charset=utf-8";
  rows: readonly AccountantExportRow[];
  csv: string;
}

export type AccountantExportErrorCode =
  | "ACCOUNTANT_EXPORT_PERIOD_INVALID"
  | "ACCOUNTANT_EXPORT_TENANT_REQUIRED";

export class AccountantExportError extends Error {
  readonly code: AccountantExportErrorCode;
  readonly statusCode = 400;

  constructor(code: AccountantExportErrorCode, message: string) {
    super(message);
    this.name = "AccountantExportError";
    this.code = code;
  }
}

const CSV_HEADERS: readonly (keyof AccountantExportRow)[] = [
  "periodo_inicio",
  "periodo_fim",
  "data_lancamento",
  "tipo",
  "categoria",
  "descricao",
  "valor_centavos",
  "moeda",
  "contexto_financeiro",
  "status",
];

export function generateAccountantCsvExport(input: {
  context: TenantContext;
  transactions: readonly Transaction[];
  categories?: readonly Category[];
  filters: AccountantExportFilters;
}): AccountantExportResult {
  assertValidPeriod(input.filters.periodStartOn, input.filters.periodEndOn);

  const delimiter = input.filters.delimiter ?? ";";
  const scopedCategories = listTenantScopedResources(input.context, input.categories ?? []);
  const categoryNames = new Map(scopedCategories.map((category) => [category.id, category.name]));
  const rows = listTenantScopedResources(input.context, input.transactions)
    .filter((transaction) => transaction.status !== "voided")
    .filter((transaction) => transaction.occurredOn >= input.filters.periodStartOn)
    .filter((transaction) => transaction.occurredOn <= input.filters.periodEndOn)
    .filter(
      () =>
        input.filters.financialProfileKind === undefined ||
        input.context.financialProfileKind === input.filters.financialProfileKind,
    )
    .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.id.localeCompare(b.id))
    .map((transaction) => buildRow(input.context, transaction, categoryNames, input.filters));

  return {
    filename: buildFilename(input.context, input.filters),
    contentType: "text/csv; charset=utf-8",
    rows,
    csv: serializeCsv(rows, delimiter),
  };
}

function buildRow(
  context: TenantContext,
  transaction: Transaction & TenantScoped,
  categoryNames: ReadonlyMap<EntityId, string>,
  filters: AccountantExportFilters,
): AccountantExportRow {
  return {
    periodo_inicio: filters.periodStartOn,
    periodo_fim: filters.periodEndOn,
    data_lancamento: transaction.occurredOn,
    tipo: transaction.kind,
    categoria: transaction.categoryId
      ? (categoryNames.get(transaction.categoryId) ?? "Sem categoria")
      : "Sem categoria",
    descricao: transaction.description,
    valor_centavos:
      transaction.kind === "expense" ? -transaction.amountMinor : transaction.amountMinor,
    moeda: transaction.currency,
    contexto_financeiro: context.financialProfileKind,
    status: transaction.status,
  };
}

function serializeCsv(
  rows: readonly AccountantExportRow[],
  delimiter: AccountantExportDelimiter,
): string {
  const lines = [
    CSV_HEADERS.join(delimiter),
    ...rows.map((row) =>
      CSV_HEADERS.map((header) => escapeCsvCell(row[header], delimiter)).join(delimiter),
    ),
  ];

  return `${lines.join("\n")}\n`;
}

function escapeCsvCell(value: string | number, delimiter: AccountantExportDelimiter): string {
  const text = String(value);

  if (text.includes(delimiter) || text.includes("\n") || text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function assertValidPeriod(periodStartOn: ISODate, periodEndOn: ISODate): void {
  if (!periodStartOn.trim() || !periodEndOn.trim() || periodStartOn > periodEndOn) {
    throw new AccountantExportError(
      "ACCOUNTANT_EXPORT_PERIOD_INVALID",
      "Periodo de exportacao invalido.",
    );
  }
}

function buildFilename(context: TenantContext, filters: AccountantExportFilters): string {
  return `solverfin-${context.financialProfileKind}-${filters.periodStartOn}-${filters.periodEndOn}.csv`;
}
