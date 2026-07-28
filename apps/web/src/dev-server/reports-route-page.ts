import { formatMinorCurrency } from "@solverfin/shared";

import { apiGet } from "./api.js";
import { renderInstallmentsView } from "./reports-installments-view.js";
import {
  escapeReportHtml as escapeHtml,
  renderReportHeading as renderHeading,
  renderReportState as renderState,
  renderReportsShell as renderShell,
  renderReportViewNavigation as renderViewNavigation,
  type ReportsView,
} from "./reports-route-page-shared.js";

export type { ReportsView } from "./reports-route-page-shared.js";
type ReportInterval = "monthly" | "annual" | "rolling-year";

interface ViewResolution {
  view?: ReportsView;
  error?: string;
}

interface EvolutionFilters {
  interval: ReportInterval;
  start: string;
  periods: number;
  profileId?: string;
}

interface ReportCell {
  amountMinor: number;
  percentage: number | null;
}

interface ReportSeries {
  cells: ReportCell[];
  totalMinor: number;
  totalPercentage: number | null;
  averageMinor: number;
  averagePercentage: number | null;
}

interface ReportCategoryNode {
  categoryId: string | null;
  name: string;
  status: string;
  series: ReportSeries;
  children: ReportCategoryNode[];
}

interface CategoryEvolutionReport {
  interval: ReportInterval;
  start: string;
  periodCount: number;
  periods: Array<{
    key: string;
    label: string;
    accessibleLabel: string;
    startsOn: string;
    endsOn: string;
  }>;
  currencyBlocks: Array<{
    currency: string;
    income: ReportSeries;
    incomeCategories: ReportCategoryNode[];
    expense: ReportSeries;
    expenseCategories: ReportCategoryNode[];
    result: ReportSeries;
  }>;
}

const LEGACY_FILTERS = ["month", "status", "cardId", "categoryId"] as const;
const EVOLUTION_FILTERS = ["interval", "start", "periods"] as const;
const INTERVAL_LIMITS: Record<ReportInterval, { defaultPeriods: number; maxPeriods: number }> = {
  monthly: { defaultPeriods: 12, maxPeriods: 24 },
  annual: { defaultPeriods: 3, maxPeriods: 10 },
  "rolling-year": { defaultPeriods: 3, maxPeriods: 10 },
};

export async function renderReportsRoutePage(
  token: string,
  url: URL,
  referenceDate: Date = new Date(),
): Promise<string> {
  const resolution = resolveReportsView(url);
  if (resolution.error || !resolution.view) {
    return renderShell(
      renderHeading("Relatórios", "Escolha uma visão compatível com os filtros informados.") +
        renderViewNavigation("category-evolution", url.searchParams.get("profileId") ?? undefined) +
        renderState(
          "filter-error",
          "Não foi possível aplicar os filtros",
          resolution.error ?? "Revise os filtros e tente novamente.",
        ),
    );
  }

  return resolution.view === "installments"
    ? renderInstallmentsView(token, url)
    : renderCategoryEvolutionView(token, url, referenceDate);
}

export function resolveReportsView(url: URL): ViewResolution {
  const explicit = url.searchParams.get("view");
  if (explicit !== null) {
    if (explicit === "category-evolution" || explicit === "installments") return { view: explicit };
    return { error: "Visão inválida. Escolha Evolução por categoria ou Parcelas consolidadas." };
  }

  const hasLegacy = LEGACY_FILTERS.some((key) => url.searchParams.has(key));
  const hasEvolution = EVOLUTION_FILTERS.some((key) => url.searchParams.has(key));
  if (hasLegacy && hasEvolution) {
    return {
      error:
        "Os filtros de evolução e parcelas foram misturados. Escolha uma visão para continuar.",
    };
  }
  if (hasLegacy) return { view: "installments" };
  return { view: "category-evolution" };
}

async function renderCategoryEvolutionView(
  token: string,
  url: URL,
  referenceDate: Date,
): Promise<string> {
  let filters: EvolutionFilters;
  try {
    filters = readEvolutionFilters(url, referenceDate);
  } catch (error) {
    return renderShell(
      renderHeading(
        "Evolução por categoria",
        "Acompanhe receitas, despesas e resultado ao longo do tempo.",
      ) +
        renderViewNavigation("category-evolution", url.searchParams.get("profileId") ?? undefined) +
        renderEvolutionFilterForm(readEvolutionFilterDraft(url, referenceDate)) +
        renderState(
          "filter-error",
          "Revise os filtros",
          error instanceof Error ? error.message : "Os filtros informados são inválidos.",
        ),
    );
  }

  const reportResult = await apiGet<{ report: CategoryEvolutionReport }>(
    token,
    buildEvolutionApiPath(filters),
  );
  const heading = renderHeading(
    "Evolução por categoria",
    "Acompanhe receitas, despesas e resultado por período e moeda.",
  );
  const navigation = renderViewNavigation("category-evolution", filters.profileId);
  const form = renderEvolutionFilterForm(filters);

  if (!reportResult.ok) {
    return renderShell(
      heading +
        navigation +
        form +
        renderState(
          "api-error",
          "Não foi possível carregar o relatório",
          `${reportResult.error} Revise os filtros ou tente novamente.`,
        ),
    );
  }

  const report = reportResult.data.report;
  if (report.currencyBlocks.length === 0) {
    return renderShell(
      heading +
        navigation +
        form +
        renderState(
          "empty",
          "Nenhum lançamento realizado no período",
          "Os períodos continuam disponíveis. Ajuste o início ou a quantidade para consultar outro recorte.",
        ) +
        renderEmptyEvolutionMatrix(report),
    );
  }

  return renderShell(
    heading +
      navigation +
      form +
      `<div data-report-state="ready" class="currency-report-list">${report.currencyBlocks
        .map((block) => renderCurrencyMatrix(report, block))
        .join("")}</div>`,
  );
}

function renderEvolutionFilterForm(filters: EvolutionFilters): string {
  const startControl =
    filters.interval === "annual"
      ? `<input id="report-start" type="number" inputmode="numeric" min="1" max="9999" name="start" value="${escapeHtml(filters.start)}" required />`
      : `<input id="report-start" type="month" name="start" value="${escapeHtml(filters.start)}" required />`;
  const maxPeriods = INTERVAL_LIMITS[filters.interval].maxPeriods;
  return `
    <section class="panel report-filter-panel" aria-label="Filtros da evolução por categoria">
      <form class="report-filters evolution-filters" method="get" action="/relatorios">
        <input type="hidden" name="view" value="category-evolution" />
        ${filters.profileId ? `<input type="hidden" name="profileId" value="${escapeHtml(filters.profileId)}" />` : ""}
        <input type="hidden" name="interval" value="${filters.interval}" />
        <fieldset class="interval-switcher">
          <legend>Intervalo</legend>
          ${intervalSwitchLink("monthly", "Mensal", filters)}
          ${intervalSwitchLink("annual", "Anual", filters)}
          ${intervalSwitchLink("rolling-year", "Anual com início móvel", filters)}
        </fieldset>
        <label for="report-start">Início${startControl}</label>
        <label for="report-periods">Período<input id="report-periods" type="number" inputmode="numeric" min="1" max="${maxPeriods}" name="periods" value="${filters.periods}" required /></label>
        <button type="submit">Carregar</button>
      </form>
      <p class="filter-hint">Escolha outro intervalo para carregar campos e padrões compatíveis antes de ajustar o recorte.</p>
    </section>`;
}

function intervalSwitchLink(
  value: ReportInterval,
  label: string,
  filters: EvolutionFilters,
): string {
  const params = new URLSearchParams({ view: "category-evolution", interval: value });
  if (filters.profileId) params.set("profileId", filters.profileId);
  return `<a href="/relatorios?${params.toString()}"${
    value === filters.interval ? ' aria-current="page"' : ""
  }>${escapeHtml(label)}</a>`;
}

function renderCurrencyMatrix(
  report: CategoryEvolutionReport,
  block: CategoryEvolutionReport["currencyBlocks"][number],
): string {
  return `
    <section class="panel evolution-block" aria-labelledby="currency-${escapeHtml(block.currency)}">
      <div class="section-heading"><div><p class="eyebrow">Moeda</p><h2 id="currency-${escapeHtml(block.currency)}">${escapeHtml(block.currency)}</h2></div><span>${report.periodCount} período${report.periodCount === 1 ? "" : "s"}</span></div>
      <div class="evolution-table-scroll" tabindex="0" aria-label="Matriz de evolução em ${escapeHtml(block.currency)}">
        <table class="evolution-table">
          <thead><tr><th scope="col" class="sticky-description">Descrição</th>${report.periods
            .map(
              (period) =>
                `<th scope="col"><span aria-hidden="true">${escapeHtml(period.label)}</span><span class="sr-only">${escapeHtml(period.accessibleLabel)}</span></th>`,
            )
            .join("")}<th scope="col">Média</th><th scope="col">Total</th></tr></thead>
          <tbody>
            ${renderSeriesRow("Receitas", block.income, block.currency, "income", 0)}
            ${block.incomeCategories.map((node) => renderCategoryRows(node, block.currency, "income", 1)).join("")}
            ${renderSeriesRow("Despesas", block.expense, block.currency, "expense", 0)}
            ${block.expenseCategories.map((node) => renderCategoryRows(node, block.currency, "expense", 1)).join("")}
            ${renderSeriesRow("Resultado", block.result, block.currency, "result", 0)}
          </tbody>
        </table>
      </div>
    </section>`;
}

function renderEmptyEvolutionMatrix(report: CategoryEvolutionReport): string {
  const emptySeries: ReportSeries = {
    cells: report.periods.map(() => ({ amountMinor: 0, percentage: null })),
    totalMinor: 0,
    totalPercentage: null,
    averageMinor: 0,
    averagePercentage: null,
  };
  return `
    <section class="panel evolution-block" aria-label="Matriz sem movimentos">
      <div class="evolution-table-scroll" tabindex="0">
        <table class="evolution-table"><thead><tr><th scope="col" class="sticky-description">Descrição</th>${report.periods.map((period) => `<th scope="col">${escapeHtml(period.label)}</th>`).join("")}<th scope="col">Média</th><th scope="col">Total</th></tr></thead>
        <tbody>${renderSeriesRow("Receitas", emptySeries, "BRL", "income", 0)}${renderSeriesRow("Despesas", emptySeries, "BRL", "expense", 0)}${renderSeriesRow("Resultado", emptySeries, "BRL", "result", 0)}</tbody></table>
      </div>
    </section>`;
}

function renderCategoryRows(
  node: ReportCategoryNode,
  currency: string,
  kind: "income" | "expense",
  depth: number,
): string {
  return (
    renderSeriesRow(node.name, node.series, currency, kind, depth, node.status === "archived") +
    node.children.map((child) => renderCategoryRows(child, currency, kind, depth + 1)).join("")
  );
}

function renderSeriesRow(
  label: string,
  series: ReportSeries,
  currency: string,
  kind: "income" | "expense" | "result",
  depth: number,
  archived = false,
): string {
  return `<tr class="report-row report-row-${kind}${depth === 0 ? " report-section-row" : ""}">
    <th scope="row" class="sticky-description" style="--report-depth:${depth}"><span>${escapeHtml(label)}</span>${archived ? "<small>Arquivada</small>" : ""}</th>
    ${series.cells.map((cell) => renderValueCell(cell.amountMinor, cell.percentage, currency, kind)).join("")}
    ${renderValueCell(series.averageMinor, series.averagePercentage, currency, kind)}
    ${renderValueCell(series.totalMinor, series.totalPercentage, currency, kind)}
  </tr>`;
}

function renderValueCell(
  amountMinor: number,
  percentage: number | null,
  currency: string,
  kind: "income" | "expense" | "result",
): string {
  const presentedAmount = kind === "expense" ? -Math.abs(amountMinor) : amountMinor;
  const normalized = Object.is(presentedAmount, -0) ? 0 : presentedAmount;
  return `<td><strong>${escapeHtml(formatMinorCurrency(normalized, { currency }))}</strong><span>${percentage === null ? "—" : `${formatPercentage(percentage)}%`}</span></td>`;
}

function formatPercentage(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

function readEvolutionFilters(url: URL, referenceDate: Date): EvolutionFilters {
  const draft = readEvolutionFilterDraft(url, referenceDate);
  const interval = draft.interval;
  const rawStart = url.searchParams.get("start");
  const rawPeriods = url.searchParams.get("periods");
  if (url.searchParams.has("interval") && !isInterval(url.searchParams.get("interval"))) {
    throw new Error("Intervalo inválido. Escolha mensal, anual ou anual com início móvel.");
  }
  if (rawPeriods !== null && !/^\d+$/.test(rawPeriods)) {
    throw new Error("Período inválido. Informe uma quantidade inteira de colunas.");
  }
  const max = INTERVAL_LIMITS[interval].maxPeriods;
  if (draft.periods < 1 || draft.periods > max) {
    throw new Error(`Período inválido. Informe entre 1 e ${max}.`);
  }
  if (rawStart !== null) validateEvolutionStart(interval, rawStart);
  validateEvolutionEnd(interval, draft.start, draft.periods);
  return draft;
}

function readEvolutionFilterDraft(url: URL, referenceDate: Date): EvolutionFilters {
  const requestedInterval = url.searchParams.get("interval");
  const interval = isInterval(requestedInterval) ? requestedInterval : "monthly";
  const requestedPeriods = url.searchParams.get("periods");
  const parsedPeriods =
    requestedPeriods && /^\d+$/.test(requestedPeriods) ? Number(requestedPeriods) : undefined;
  const periods = parsedPeriods ?? INTERVAL_LIMITS[interval].defaultPeriods;
  const requestedStart = url.searchParams.get("start");
  const start = requestedStart ?? deriveEvolutionStart(interval, periods, referenceDate);
  const profileId = nonEmpty(url.searchParams.get("profileId"));
  return { interval, start, periods, ...(profileId ? { profileId } : {}) };
}

function validateEvolutionStart(interval: ReportInterval, start: string): void {
  if (interval === "annual") {
    if (!/^\d{4}$/.test(start) || Number(start) < 1) {
      throw new Error("Início inválido. Informe um ano no formato AAAA.");
    }
    return;
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(start) || Number(start.slice(0, 4)) < 1) {
    throw new Error("Início inválido. Informe um mês no formato AAAA-MM.");
  }
}

function validateEvolutionEnd(interval: ReportInterval, start: string, periods: number): void {
  validateEvolutionStart(interval, start);
  if (interval === "annual") {
    if (Number(start) + periods - 1 > 9999)
      throw new Error("O período calculado ultrapassa o ano 9999.");
    return;
  }
  const year = Number(start.slice(0, 4));
  const month = Number(start.slice(5, 7));
  const offset = interval === "monthly" ? periods - 1 : periods * 12 - 1;
  const end = addMonths(year, month, offset);
  if (end.year > 9999) throw new Error("O período calculado ultrapassa o ano 9999.");
}

function deriveEvolutionStart(
  interval: ReportInterval,
  periods: number,
  referenceDate: Date,
): string {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth() + 1;
  if (interval === "annual") return String(year - periods + 1).padStart(4, "0");
  const offset = interval === "monthly" ? -(periods - 1) : -(periods * 12 - 1);
  const result = addMonths(year, month, offset);
  return `${String(result.year).padStart(4, "0")}-${String(result.month).padStart(2, "0")}`;
}

function addMonths(year: number, month: number, offset: number): { year: number; month: number } {
  const absolute = year * 12 + month - 1 + offset;
  return { year: Math.floor(absolute / 12), month: (((absolute % 12) + 12) % 12) + 1 };
}

function buildEvolutionApiPath(filters: EvolutionFilters): string {
  return `/api/reports/category-evolution?${new URLSearchParams({
    interval: filters.interval,
    start: filters.start,
    periods: String(filters.periods),
    ...(filters.profileId ? { profileId: filters.profileId } : {}),
  }).toString()}`;
}

function isInterval(value: string | null): value is ReportInterval {
  return value === "monthly" || value === "annual" || value === "rolling-year";
}

function nonEmpty(value: string | null): string | undefined {
  return value?.trim() || undefined;
}
