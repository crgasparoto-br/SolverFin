import { apiGet } from "./api.js";
import {
  buildCashFlowApiPath,
  parseCashFlowHorizon,
  parseCashFlowReferenceDate,
  type CashFlowProjection,
} from "./cash-flow-projection-view.js";
import {
  parseReportCurrencyFilter,
  selectReportCurrencyBlocks,
  type ReportsView,
} from "./reports-route-page-shared.js";
import { resolveReportsView } from "./reports-route-page.js";
import { asSourceError, ReportExportError, selectedTables } from "./reports-export-common.js";
import { loadEvolutionExport } from "./reports-export-evolution.js";
import { loadInstallmentsExport } from "./reports-export-installments.js";
import {
  serializeReportCsv,
  serializeReportPdf,
  serializeReportXlsx,
  type CanonicalReportExport,
  type ExportTable,
} from "./reports-export-serializers.js";

export { ReportExportError } from "./reports-export-common.js";

export type ReportExportFormat = "csv" | "xlsx" | "pdf";

const allowedQueries: Record<ReportsView, readonly string[]> = {
  "category-evolution": [
    "view",
    "format",
    "profileId",
    "interval",
    "start",
    "periods",
    "accountId",
    "cardId",
    "currency",
  ],
  installments: [
    "view",
    "format",
    "profileId",
    "month",
    "status",
    "cardId",
    "categoryId",
    "currency",
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
      throw new ReportExportError(
        400,
        "REPORT_EXPORT_FILTER_INVALID",
        "Filtro de exportação inválido: " + key,
      );
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

export async function loadCanonicalReportExport(
  token: string,
  url: URL,
  referenceDate: Date = new Date(),
): Promise<CanonicalReportExport> {
  const resolution = resolveReportsView(url);
  if (!resolution.view || resolution.error) {
    throw new ReportExportError(
      400,
      "REPORT_EXPORT_VIEW_INVALID",
      resolution.error ?? "Visão inválida.",
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
  const content =
    format === "csv"
      ? serializeReportCsv(report)
      : format === "xlsx"
        ? serializeReportXlsx(report)
        : serializeReportPdf(report);
  const contentType = {
    csv: "text/csv; charset=utf-8",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pdf: "application/pdf",
  }[format];
  const suffix = report.period
    .replace(/[^0-9A-Za-z-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 45);
  return {
    content,
    contentType,
    fileName: "solverfin-" + report.view + "-" + (suffix || "relatorio") + "." + format,
  };
}

function cashFlowTables(block: CashFlowProjection["currencyBlocks"][number]): ExportTable[] {
  return [
    {
      name: "resumo",
      currency: block.currency,
      columns: ["indicador", "valor_centavos"],
      rows: [
        ["saldo_inicial", block.openingBalanceMinor],
        ["saldo_final", block.closingBalanceMinor],
      ],
    },
    {
      name: "serie_diaria",
      currency: block.currency,
      columns: ["data", "movimento_centavos", "saldo_projetado_centavos"],
      rows: block.points.map((point) => [
        point.date,
        point.netMovementMinor,
        point.closingBalanceMinor,
      ]),
    },
    {
      name: "evidencias",
      currency: block.currency,
      columns: [
        "data",
        "descricao",
        "origem",
        "origem_id",
        "compromisso_id",
        "efeito_id",
        "conta_id",
        "cartao_id",
        "valor_centavos",
      ],
      rows: block.points.flatMap((point) =>
        point.movements.map((movement) => [
          point.date,
          movement.description,
          movement.source.kind,
          movement.source.id,
          movement.commitmentId,
          movement.effectId,
          movement.accountId ?? "",
          movement.cardId ?? "",
          movement.amountMinor,
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
    const profileId = url.searchParams.get("profileId");
    filters = {
      referenceDate: parseCashFlowReferenceDate(
        url.searchParams.get("referenceDate") ?? referenceDate.toISOString().slice(0, 10),
      ),
      horizonDays: parseCashFlowHorizon(url.searchParams.get("horizonDays") ?? "30"),
      ...(profileId ? { profileId } : {}),
      ...(currency ? { currency } : {}),
    };
  } catch (error) {
    throw new ReportExportError(
      400,
      "REPORT_EXPORT_FILTER_INVALID",
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
