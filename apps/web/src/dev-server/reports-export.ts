import { apiGet } from "./api.js";
import {
  buildCashFlowApiPath,
  parseCashFlowHorizon,
  parseCashFlowReferenceDate,
  type CashFlowProjection,
} from "./cash-flow-projection-view.js";
import {
  buildInstallmentAnalysisViewModel,
  type InstallmentCurrencyViewModel,
} from "./reports-analysis-view-model.js";
import {
  formatMonthYear,
  normalizeMonth,
  todayDateOnly,
} from "./reports-installments-format.js";
import {
  buildInstallmentsPath,
  readInstallmentFilters,
  type InstallmentRecord,
} from "./reports-installments-view.js";
import {
  parseReportCurrencyFilter,
  selectReportCurrencyBlocks,
  type ReportsView,
} from "./reports-route-page-shared.js";
import { readEvolutionFilters, resolveReportsView, type CategoryEvolutionReport } from "./reports-route-page.js";
import { buildEvolutionApiPath } from "./reports-evolution-routing-helpers.js";
import {
  serializeReportCsv,
  serializeReportPdf,
  serializeReportXlsx,
  type CanonicalReportExport,
  type ExportCell,
  type ExportTable,
} from "./reports-export-serializers.js";

export type ReportExportFormat = "csv" | "xlsx" | "pdf";

export class ReportExportError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ReportExportError";
  }
}

const allowedQueries: Record<ReportsView, readonly string[]> = {
  "category-evolution": [
    "view", "format", "profileId", "interval", "start", "periods",
    "accountId", "cardId", "currency",
  ],
  installments: [
    "view", "format", "profileId", "month", "status", "cardId", "categoryId", "currency",
  ],
  "cash-flow": ["view", "format", "profileId", "referenceDate", "horizonDays", "currency"],
};

function assertExportQuery(url: URL, view: ReportsView): void {
  if (url.searchParams.has("profileId") && !url.searchParams.get("profileId")?.trim()) {
    throw new ReportExportError(400, "REPORT_EXPORT_FILTER_INVALID", "Perfil financeiro inválido.");
  }
  const allowed = new Set(allowedQueries[view]);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) {
      throw new ReportExportError(400, "REPORT_EXPORT_FILTER_INVALID", "Filtro de exportação inválido: " + key);
    }
  }
}

function formatFromQuery(url: URL): ReportExportFormat {
  const value = url.searchParams.get("format");
  if (value !== "csv" && value !== "xlsx" && value !== "pdf") {
    throw new ReportExportError(400, "REPORT_EXPORT_FORMAT_INVALID", "Escolha CSV, XLSX ou PDF.");
  }
  return value;
}

function asSourceError(error: string, status?: number): never {
  throw new ReportExportError(
    status && status >= 400 && status <= 599 ? status : 502,
    "REPORT_EXPORT_SOURCE_UNAVAILABLE",
    error,
  );
}

function selectedTables(
  tables: readonly ExportTable[],
  currency: string,
): ExportTable[] {
  return tables.length
    ? [...tables]
    : [{ name: "sem-dados", currency: currency === "all" ? "" : currency, columns: ["estado"], rows: [] }];
}

export async function loadCanonicalReportExport(
  token: string,
  url: URL,
  referenceDate: Date = new Date(),
): Promise<CanonicalReportExport> {
  const resolution = resolveReportsView(url);
  if (!resolution.view || resolution.error) {
    throw new ReportExportError(
      400, "REPORT_EXPORT_VIEW_INVALID", resolution.error ?? "Visão inválida.",
    );
  }
  const view = resolution.view;
  assertExportQuery(url, view);
  if (view === "category-evolution") {
    return loadEvolutionExport(token, url, referenceDate);
  }
  if (view === "installments") return loadInstallmentsExport(token, url);
  return loadCashFlowExport(token, url, referenceDate);
}

export async function downloadReportExport(
  token: string,
  url: URL,
  referenceDate: Date = new Date(),
): Promise<{ content: Buffer; contentType: string; fileName: string }> {
  const format = formatFromQuery(url);
  const report = await loadCanonicalReportExport(token, url, referenceDate);
  const content = format === "csv"
    ? serializeReportCsv(report)
    : format === "xlsx"
      ? serializeReportXlsx(report)
      : serializeReportPdf(report);
  const contentType = {
    csv: "text/csv; charset=utf-8",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pdf: "application/pdf",
  }[format];
  const suffix = report.period.replace(/[^0-9A-Za-z-]/g, "-").replace(/-+/g, "-").slice(0, 45);
  return {
    content,
    contentType,
    fileName: "solverfin-" + report.view + "-" + (suffix || "relatorio") + "." + format,
  };
}

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
        kind, path.length, path.join(" / "), id, status, period.key,
        period.startsOn, period.endsOn, cell?.amountMinor ?? null,
        cell?.percentage ?? null, series.totalMinor, series.totalPercentage,
        series.averageMinor, series.averagePercentage,
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
      "secao", "nivel", "hierarquia", "categoria_id", "status", "periodo",
      "inicio", "fim", "valor_centavos", "percentual", "total_centavos",
      "percentual_total", "media_centavos", "percentual_medio",
    ],
    rows,
  };
}

async function loadEvolutionExport(
  token: string,
  url: URL,
  referenceDate: Date,
): Promise<CanonicalReportExport> {
  let filters: ReturnType<typeof readEvolutionFilters>;
  try {
    filters = readEvolutionFilters(url, referenceDate);
  } catch (error) {
    throw new ReportExportError(
      400, "REPORT_EXPORT_FILTER_INVALID",
      error instanceof Error ? error.message : "Filtros inválidos.",
    );
  }
  const result = await apiGet<{ report: CategoryEvolutionReport }>(
    token, buildEvolutionApiPath(filters),
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
      period.key, period.accessibleLabel, period.startsOn, period.endsOn,
    ]),
  };
  return {
    view: "category-evolution",
    period: report.periods.length
      ? report.periods[0].startsOn + " a " + report.periods[report.periods.length - 1].endsOn
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

function installmentTables(
  block: InstallmentCurrencyViewModel<InstallmentRecord>,
): ExportTable[] {
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
      name: "resumo", currency: block.currency,
      columns: ["indicador", "quantidade", "valor_centavos"], rows: summaryRows,
    },
    {
      name: "grupos", currency: block.currency,
      columns: ["tipo", "filtro_id", "rotulo", "quantidade", "valor_centavos"], rows: groups,
    },
    {
      name: "parcelas", currency: block.currency,
      columns: [
        "parcela_id", "vencimento", "numero", "total_parcelas", "descricao",
        "cartao", "categoria", "status", "status_fatura", "valor_centavos",
      ],
      rows: block.items.map((item) => [
        item.id, item.dueOn, item.sequenceNumber, item.totalInstallments,
        item.transaction?.description ?? item.recurrence?.description ?? "Parcela",
        item.card?.name ?? "Sem cartão", item.category?.name ?? "Sem categoria",
        item.status, item.invoice?.status ?? "", item.amountMinor,
      ]),
    },
  ];
}

async function loadInstallmentsExport(
  token: string,
  url: URL,
): Promise<CanonicalReportExport> {
  const month = url.searchParams.get("month");
  if (month !== null && !normalizeMonth(month)) {
    throw new ReportExportError(400, "REPORT_EXPORT_FILTER_INVALID", "Mês inválido.");
  }
  const status = url.searchParams.get("status");
  if (status !== null && !["all", "planned", "posted", "reconciled", "cancelled"].includes(status)) {
    throw new ReportExportError(400, "REPORT_EXPORT_FILTER_INVALID", "Status inválido.");
  }
  const filters = readInstallmentFilters(url);
  let currency: string | undefined;
  try {
    currency = parseReportCurrencyFilter(url.searchParams.get("currency"));
  } catch (error) {
    throw new ReportExportError(
      400, "REPORT_EXPORT_FILTER_INVALID",
      error instanceof Error ? error.message : "Moeda inválida.",
    );
  }
  const result = await apiGet<{ installments: InstallmentRecord[] }>(
    token, buildInstallmentsPath(filters),
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

function cashFlowTables(
  block: CashFlowProjection["currencyBlocks"][number],
): ExportTable[] {
  return [
    {
      name: "resumo", currency: block.currency,
      columns: ["indicador", "valor_centavos"],
      rows: [
        ["saldo_inicial", block.openingBalanceMinor],
        ["saldo_final", block.closingBalanceMinor],
      ],
    },
    {
      name: "serie_diaria", currency: block.currency,
      columns: ["data", "movimento_centavos", "saldo_projetado_centavos"],
      rows: block.points.map((point) => [
        point.date, point.netMovementMinor, point.closingBalanceMinor,
      ]),
    },
    {
      name: "evidencias", currency: block.currency,
      columns: ["data", "descricao", "origem"],
      rows: block.points.flatMap((point) =>
        point.movements.map((movement) => [
          point.date, movement.description, movement.source.kind,
        ]),
      ),
    },
  ];
}

async function loadCashFlowExport(
  token: string,
  url: URL,
  referenceDate: Date,
): Promise<CanonicalReportExport> {
  let filters: {
    referenceDate: string;
    horizonDays: 30 | 60 | 90;
    profileId?: string;
    currency?: string;
  };
  try {
    const currency = parseReportCurrencyFilter(url.searchParams.get("currency"));
    filters = {
      referenceDate: parseCashFlowReferenceDate(
        url.searchParams.get("referenceDate") ?? referenceDate.toISOString().slice(0, 10),
      ),
      horizonDays: parseCashFlowHorizon(url.searchParams.get("horizonDays") ?? "30"),
      ...(url.searchParams.get("profileId") ? { profileId: url.searchParams.get("profileId") ?? undefined } : {}),
      ...(currency ? { currency } : {}),
    };
  } catch (error) {
    throw new ReportExportError(
      400, "REPORT_EXPORT_FILTER_INVALID",
      error instanceof Error ? error.message : "Filtros inválidos.",
    );
  }
  const result = await apiGet<CashFlowProjection>(token, buildCashFlowApiPath(filters));
  if (!result.ok) return asSourceError(result.error, result.status);
  const projection = result.data;
  const selection = selectReportCurrencyBlocks(projection.currencyBlocks, filters.currency);
  const tables = selection.visible.flatMap(cashFlowTables);
  return {
    view: "cash-flow",
    period: projection.from + " a " + projection.to,
    filters: {
      referenceDate: filters.referenceDate,
      horizonDays: String(filters.horizonDays),
      currency: selection.currency,
      ...(filters.profileId ? { profileId: filters.profileId } : {}),
    },
    tables: selectedTables(tables, selection.currency),
  };
}