import { apiGet } from "./api.js";
import { buildEvolutionApiPath } from "./reports-evolution-routing-helpers.js";
import { readEvolutionFilters, type CategoryEvolutionReport } from "./reports-route-page.js";
import { asSourceError, ReportExportError, selectedTables } from "./reports-export-common.js";
import type { CanonicalReportExport, ExportCell, ExportTable } from "./reports-export-serializers.js";

function categoryTable(
  currency: string,
  periods: CategoryEvolutionReport["periods"],
  block?: CategoryEvolutionReport["currencyBlocks"][number],
): ExportTable {
  const rows: ExportCell[][] = [];
  const collect = (
    kind: string,
    series: CategoryEvolutionReport["currencyBlocks"][number]["income"],
    path: readonly string[],
    id: string,
    status: string,
  ): void => {
    for (const [index, period] of periods.entries()) {
      const cell = series.cells[index];
      rows.push([
        kind,
        path.length,
        path.join(" / "),
        id,
        status,
        period.key,
        period.startsOn,
        period.endsOn,
        cell?.amountMinor ?? null,
        cell?.percentage ?? null,
        series.totalMinor,
        series.totalPercentage,
        series.averageMinor,
        series.averagePercentage,
      ]);
    }
  };
  if (block) {
    collect("income", block.income, [], "", "");
    collect("expense", block.expense, [], "", "");
    collect("result", block.result, [], "", "");
    const walk = (
      kind: "income" | "expense",
      nodes: CategoryEvolutionReport["currencyBlocks"][number]["incomeCategories"],
      parents: readonly string[],
    ): void => {
      for (const node of nodes) {
        const path = [...parents, node.name];
        collect(kind, node.series, path, node.categoryId ?? "", node.status);
        walk(kind, node.children, path);
      }
    };
    walk("income", block.incomeCategories, []);
    walk("expense", block.expenseCategories, []);
  }
  return {
    name: "categorias",
    currency,
    columns: [
      "secao",
      "nivel",
      "hierarquia",
      "categoria_id",
      "status",
      "periodo",
      "inicio",
      "fim",
      "valor_centavos",
      "percentual",
      "total_centavos",
      "percentual_total",
      "media_centavos",
      "percentual_medio",
    ],
    rows,
  };
}

export async function loadEvolutionExport(
  token: string,
  url: URL,
  referenceDate: Date,
): Promise<CanonicalReportExport> {
  let filters: ReturnType<typeof readEvolutionFilters>;
  try {
    filters = readEvolutionFilters(url, referenceDate);
  } catch (error) {
    throw new ReportExportError(
      400,
      "REPORT_EXPORT_FILTER_INVALID",
      error instanceof Error ? error.message : "Filtros inválidos.",
    );
  }
  const result = await apiGet<{ report: CategoryEvolutionReport }>(
    token,
    buildEvolutionApiPath(filters),
  );
  if (!result.ok) return asSourceError(result.error, result.status);
  const report = result.data.report;
  const visible = filters.currency
    ? report.currencyBlocks.filter((block) => block.currency === filters.currency)
    : report.currencyBlocks;
  const currency = filters.currency ?? "all";
  const tables: ExportTable[] = visible.map((block) =>
    categoryTable(block.currency, report.periods, block),
  );
  const periods: ExportTable = {
    name: "periodos",
    currency: "",
    columns: ["chave", "rotulo", "inicio", "fim"],
    rows: report.periods.map((period) => [
      period.key,
      period.accessibleLabel,
      period.startsOn,
      period.endsOn,
    ]),
  };
  return {
    view: "category-evolution",
    period: report.periods.length
      ? (report.periods[0]?.startsOn ?? filters.start) +
        " a " +
        (report.periods.at(-1)?.endsOn ?? filters.start)
      : filters.start,
    filters: {
      interval: filters.interval,
      start: filters.start,
      periods: String(filters.periods),
      currency,
      ...(filters.profileId ? { profileId: filters.profileId } : {}),
      ...(filters.accountId ? { accountId: filters.accountId } : {}),
      ...(filters.cardId ? { cardId: filters.cardId } : {}),
    },
    tables: [periods, ...selectedTables(tables, currency)],
  };
}

