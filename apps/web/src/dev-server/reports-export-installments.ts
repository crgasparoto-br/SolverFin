import { apiGet } from "./api.js";
import {
  buildInstallmentAnalysisViewModel,
  type InstallmentCurrencyViewModel,
} from "./reports-analysis-view-model.js";
import { formatMonthYear, normalizeMonth, todayDateOnly } from "./reports-installments-format.js";
import {
  buildInstallmentsPath,
  readInstallmentFilters,
  type InstallmentRecord,
} from "./reports-installments-view.js";
import {
  parseReportCurrencyFilter,
  selectReportCurrencyBlocks,
} from "./reports-route-page-shared.js";
import { asSourceError, ReportExportError, selectedTables } from "./reports-export-common.js";
import type {
  CanonicalReportExport,
  ExportCell,
  ExportTable,
} from "./reports-export-serializers.js";

function installmentTables(block: InstallmentCurrencyViewModel<InstallmentRecord>): ExportTable[] {
  const summary = block.summary;
  const summaryRows: ExportCell[][] = [
    ["total_mensal", summary.activeCount, summary.totalMinor],
    ["planejadas_abertas", summary.plannedOpenCount, summary.plannedOpenMinor],
    ["postadas_fechadas", summary.postedClosedCount, summary.postedClosedMinor],
    ["vencidas", summary.overdueCount, summary.overdueMinor],
    ["futuras", summary.futureCount, summary.futureMinor],
  ];
  const groups: ExportCell[][] = [];
  for (const key of ["months", "cards", "categories"] as const) {
    for (const group of block.groups[key]) {
      groups.push([key, group.filterId ?? "", group.label, group.count, group.amountMinor]);
    }
  }
  return [
    {
      name: "resumo",
      currency: block.currency,
      columns: ["indicador", "quantidade", "valor_centavos"],
      rows: summaryRows,
    },
    {
      name: "grupos",
      currency: block.currency,
      columns: ["tipo", "filtro_id", "rotulo", "quantidade", "valor_centavos"],
      rows: groups,
    },
    {
      name: "parcelas",
      currency: block.currency,
      columns: [
        "parcela_id",
        "vencimento",
        "numero",
        "total_parcelas",
        "descricao",
        "cartao",
        "categoria",
        "status",
        "status_fatura",
        "valor_centavos",
      ],
      rows: block.items.map((item) => [
        item.id,
        item.dueOn,
        item.sequenceNumber,
        item.totalInstallments,
        item.transaction?.description ?? item.recurrence?.description ?? "Parcela",
        item.card?.name ?? "Sem cartão",
        item.category?.name ?? "Sem categoria",
        item.status,
        item.invoice?.status ?? "",
        item.amountMinor,
      ]),
    },
  ];
}

export async function loadInstallmentsExport(
  token: string,
  url: URL,
): Promise<CanonicalReportExport> {
  const month = url.searchParams.get("month");
  if (month !== null && !normalizeMonth(month)) {
    throw new ReportExportError(400, "REPORT_EXPORT_FILTER_INVALID", "Mês inválido.");
  }
  const status = url.searchParams.get("status");
  if (
    status !== null &&
    !["all", "planned", "posted", "reconciled", "cancelled"].includes(status)
  ) {
    throw new ReportExportError(400, "REPORT_EXPORT_FILTER_INVALID", "Status inválido.");
  }
  const filters = readInstallmentFilters(url);
  let currency: string | undefined;
  try {
    currency = parseReportCurrencyFilter(url.searchParams.get("currency"));
  } catch (error) {
    throw new ReportExportError(
      400,
      "REPORT_EXPORT_FILTER_INVALID",
      error instanceof Error ? error.message : "Moeda inválida.",
    );
  }
  const result = await apiGet<{ installments: InstallmentRecord[] }>(
    token,
    buildInstallmentsPath(filters),
  );
  if (!result.ok) return asSourceError(result.error, result.status);
  const blocks = buildInstallmentAnalysisViewModel(
    result.data.installments.slice().sort((left, right) => left.dueOn.localeCompare(right.dueOn)),
    todayDateOnly(),
    formatMonthYear,
  );
  const selection = selectReportCurrencyBlocks(blocks, currency);
  const tables = selection.visible.flatMap(installmentTables);
  return {
    view: "installments",
    period: filters.dueFrom + " a " + filters.dueTo,
    filters: {
      month: filters.month,
      status: filters.status,
      currency: selection.currency,
      ...(filters.cardId ? { cardId: filters.cardId } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.profileId ? { profileId: filters.profileId } : {}),
    },
    tables: selectedTables(tables, selection.currency),
  };
}
