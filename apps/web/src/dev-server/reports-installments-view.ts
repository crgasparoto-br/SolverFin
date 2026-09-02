import { formatDateOnly } from "@solverfin/shared";

import { renderMoney } from "../design-system/money.js";
import { renderAlert, renderText } from "../design-system/primitives.js";
import { apiGet } from "./api.js";
import {
  renderReportAnalysisBlock,
  type AnalysisSummaryItem,
} from "./reports-analysis-archetype.js";
import {
  buildInstallmentAnalysisViewModel,
  type InstallmentAggregateViewModel,
  type InstallmentCurrencyViewModel,
} from "./reports-analysis-view-model.js";
import {
  escapeReportHtml as escapeHtml,
  renderReportHeading as renderHeading,
  renderReportState as renderState,
  renderReportsShell as renderShell,
  renderReportViewNavigation as renderViewNavigation,
} from "./reports-route-page-shared.js";

interface InstallmentFilters {
  month: string;
  dueFrom: string;
  dueTo: string;
  status: string;
  cardId?: string;
  categoryId?: string;
  profileId?: string;
}

interface CardRecord {
  id: string;
  name: string;
}

interface CategoryRecord {
  id: string;
  name: string;
}

interface InstallmentRecord {
  id: string;
  status: string;
  sequenceNumber: number;
  totalInstallments: number;
  dueOn: string;
  amountMinor: number;
  currency: string;
  transaction?: { id: string; description: string; status: string };
  recurrence?: { id: string; description: string; status: string };
  invoice?: {
    id: string;
    status: string;
    periodStartOn: string;
    periodEndOn: string;
  };
  card?: { id: string; name: string; status: string };
  category?: { id: string; name: string; kind: string; status: string };
}

export async function renderInstallmentsView(token: string, url: URL): Promise<string> {
  const filters = readInstallmentFilters(url);
  const cardsParams = new URLSearchParams({ status: "all" });
  const categoriesParams = new URLSearchParams({ kind: "expense" });
  if (filters.profileId) {
    cardsParams.set("profileId", filters.profileId);
    categoriesParams.set("profileId", filters.profileId);
  }
  const [installmentsResult, cardsResult, categoriesResult] = await Promise.all([
    apiGet<{ installments: InstallmentRecord[] }>(token, buildInstallmentsPath(filters)),
    apiGet<{ cards: CardRecord[] }>(token, `/api/cards?${cardsParams.toString()}`),
    apiGet<{ categories: CategoryRecord[] }>(
      token,
      `/api/categories?${categoriesParams.toString()}`,
    ),
  ]);
  const cards = cardsResult.ok ? cardsResult.data.cards : [];
  const categories = categoriesResult.ok ? categoriesResult.data.categories : [];
  const header =
    renderHeading(
      "Parcelas consolidadas",
      "Acompanhe o comprometimento mensal sem alterar lançamentos, faturas ou recorrências.",
    ) + renderViewNavigation("installments", filters.profileId);
  const form = renderInstallmentFilterForm(filters, cards, categories);

  if (!installmentsResult.ok) {
    return renderShell(
      header +
        form +
        renderState("api-error", "Não foi possível carregar as parcelas", installmentsResult.error),
    );
  }

  return renderShell(
    header +
      form +
      renderInstallments(installmentsSorted(installmentsResult.data.installments), filters),
  );
}

function readInstallmentFilters(url: URL): InstallmentFilters {
  const month = normalizeMonth(url.searchParams.get("month")) ?? currentMonth();
  const filters: InstallmentFilters = {
    month,
    dueFrom: `${month}-01`,
    dueTo: monthEnd(month),
    status: normalizeStatus(url.searchParams.get("status")),
  };
  const cardId = nonEmpty(url.searchParams.get("cardId"));
  const categoryId = nonEmpty(url.searchParams.get("categoryId"));
  const profileId = nonEmpty(url.searchParams.get("profileId"));
  if (cardId) filters.cardId = cardId;
  if (categoryId) filters.categoryId = categoryId;
  if (profileId) filters.profileId = profileId;
  return filters;
}

function buildInstallmentsPath(filters: InstallmentFilters): string {
  return `/api/installments?${new URLSearchParams({
    status: filters.status,
    dueFrom: filters.dueFrom,
    dueTo: filters.dueTo,
    ...(filters.cardId ? { cardId: filters.cardId } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.profileId ? { profileId: filters.profileId } : {}),
  }).toString()}`;
}

function renderInstallmentFilterForm(
  filters: InstallmentFilters,
  cards: CardRecord[],
  categories: CategoryRecord[],
): string {
  return `<section class="panel report-filter-panel" aria-label="Filtros do relatório de parcelas"><form class="report-filters installment-filters" method="get" action="/relatorios">
    <input type="hidden" name="view" value="installments" />${filters.profileId ? `<input type="hidden" name="profileId" value="${escapeHtml(filters.profileId)}" />` : ""}
    <label>Mês<input type="month" name="month" value="${escapeHtml(filters.month)}" /></label>
    <label>Status<select name="status">${renderStatusOptions(filters.status)}</select></label>
    <label>Cartão<select name="cardId"><option value="">Todos os cartões</option>${cards
      .slice()
      .sort(byName)
      .map(
        (card) =>
          `<option value="${escapeHtml(card.id)}"${filters.cardId === card.id ? " selected" : ""}>${escapeHtml(card.name)}</option>`,
      )
      .join("")}</select></label>
    <label>Categoria<select name="categoryId"><option value="">Todas as categorias</option>${categories
      .slice()
      .sort(byName)
      .map(
        (category) =>
          `<option value="${escapeHtml(category.id)}"${filters.categoryId === category.id ? " selected" : ""}>${escapeHtml(category.name)}</option>`,
      )
      .join("")}</select></label>
    <button type="submit">Atualizar relatório</button>
  </form></section>`;
}

function renderInstallments(
  installments: InstallmentRecord[],
  filters: InstallmentFilters,
): string {
  if (installments.length === 0) {
    return `<section class="panel report-results" data-report-state="empty">
      <div class="section-heading"><div><p class="eyebrow">Parcelas</p><h2>${escapeHtml(formatMonthYear(filters.month))}</h2></div></div>
      ${renderCompactEmptyState(
        "Nenhuma parcela no período.",
        "Ajuste mês, cartão, categoria ou status para revisar outro recorte.",
      )}
    </section>`;
  }

  const currencyBlocks = buildInstallmentAnalysisViewModel(
    installments,
    todayDateOnly(),
    formatMonthYear,
  );
  return `<div data-report-state="ready" class="currency-report-list">${currencyBlocks
    .map((block, index) => renderInstallmentCurrencyBlock(block, filters, index))
    .join("")}<p class="sr-only">Período consultado: ${escapeHtml(formatMonthYear(filters.month))}</p></div>`;
}

function renderInstallmentCurrencyBlock(
  block: InstallmentCurrencyViewModel<InstallmentRecord>,
  filters: InstallmentFilters,
  index: number,
): string {
  const summary = block.summary;
  const summaryItems: AnalysisSummaryItem[] = [
    installmentSummaryItem(
      "Abertas/planejadas",
      summary.plannedOpenCount,
      summary.plannedOpenMinor,
      block.currency,
    ),
    installmentSummaryItem(
      "Postadas/fechadas",
      summary.postedClosedCount,
      summary.postedClosedMinor,
      block.currency,
    ),
    installmentSummaryItem(
      "Vencidas",
      summary.overdueCount,
      summary.overdueMinor,
      block.currency,
      summary.overdueCount > 0 ? "attention" : "neutral",
    ),
    installmentSummaryItem(
      "Futuras",
      summary.futureCount,
      summary.futureMinor,
      block.currency,
    ),
    installmentSummaryItem(
      "Total mensal",
      summary.activeCount,
      summary.totalMinor,
      block.currency,
      "information",
    ),
  ];

  return renderReportAnalysisBlock({
    id: `installment-analysis-${index}-${safeId(block.currency)}`,
    currency: block.currency,
    periodCount: 1,
    summaryItems,
    summaryWrapperClassName: "summary-grid",
    summaryItemClassName: "metric-card",
    visualizationTitle: `Distribuição de ${formatMonthYear(filters.month)}`,
    visualizationHtml: renderInstallmentDistribution(block),
    highlightsHtml: renderInstallmentHighlights(block),
    detailTitle: "Parcelas consideradas",
    detailHtml: renderInstallmentDetail(block),
  });
}

function installmentSummaryItem(
  label: string,
  count: number,
  amountMinor: number,
  currency: string,
  tone: AnalysisSummaryItem["tone"] = "neutral",
): AnalysisSummaryItem {
  return {
    label,
    primaryHtml: renderText(count),
    secondaryHtml: renderMoney({ amountMinor, currency }),
    tone,
  };
}

function renderInstallmentDistribution(
  block: InstallmentCurrencyViewModel<InstallmentRecord>,
): string {
  return `<div class="report-grid" aria-label="Agrupamentos de parcelas em ${escapeHtml(block.currency)}">
      <section class="panel report-results">
        <div class="section-heading"><h2>Comprometimento por mês</h2><span>${block.summary.activeCount} parcelas</span></div>
        ${renderAggregateRows(block.groups.months, "month", block.currency)}
      </section>
      <section class="panel report-results">
        <div class="section-heading"><h2>Por cartão</h2><span>${block.summary.activeCount} parcelas</span></div>
        ${renderAggregateRows(block.groups.cards, "card", block.currency)}
      </section>
      <section class="panel report-results">
        <div class="section-heading"><h2>Por categoria</h2><span>${block.summary.activeCount} parcelas</span></div>
        ${renderAggregateRows(block.groups.categories, "category", block.currency)}
      </section>
    </div>`;
}

function renderInstallmentHighlights(
  block: InstallmentCurrencyViewModel<InstallmentRecord>,
): string {
  const topCategory = block.groups.categories[0];
  const highlight = topCategory
    ? `<article class="report-highlight"><span>Maior comprometimento por categoria</span><strong>${escapeHtml(topCategory.label)}</strong>${renderMoney({ amountMinor: topCategory.amountMinor, currency: block.currency })}</article>`
    : "";
  const alert =
    block.summary.overdueCount > 0
      ? renderAlert({
          tone: "attention",
          title: `${block.summary.overdueCount} parcela${block.summary.overdueCount === 1 ? "" : "s"} vencida${block.summary.overdueCount === 1 ? "" : "s"}`,
          description:
            "Revise as parcelas vencidas no detalhe antes de alterar o planejamento.",
        })
      : renderAlert({
          tone: "positive",
          title: "Nenhuma parcela vencida neste recorte",
          description:
            "O detalhe abaixo mantém as parcelas futuras, postadas e canceladas identificáveis.",
        });
  return `<div class="report-highlights-grid">${highlight}</div>${alert}`;
}

function renderInstallmentDetail(
  block: InstallmentCurrencyViewModel<InstallmentRecord>,
): string {
  const countLabel = `${block.items.length} registro${block.items.length === 1 ? "" : "s"}`;
  const rows = block.items
    .map(
      (item) => `<tr class="installment-table-row">
        <td><time datetime="${escapeHtml(item.dueOn)}">${escapeHtml(formatDateOnly(item.dueOn))}</time></td>
        <td>${item.sequenceNumber}/${item.totalInstallments}</td>
        <td>${renderText(item.transaction?.description ?? item.recurrence?.description ?? "Parcela")}</td>
        <td>${renderText(item.card?.name ?? "Sem cartão")}</td>
        <td>${renderText(item.category?.name ?? "Sem categoria")}</td>
        <td>${renderText(installmentStatusLabel(item))}</td>
        <td>${renderMoney({ amountMinor: item.amountMinor, currency: block.currency })}</td>
      </tr>`,
    )
    .join("");

  return `<div class="section-heading report-detail-count"><span>${countLabel}</span></div>
    <div class="installment-table" tabindex="0" aria-label="Parcelas do relatório em ${escapeHtml(block.currency)}">
      <table>
        <caption class="sr-only">Parcelas do relatório em ${escapeHtml(block.currency)}</caption>
        <thead><tr><th scope="col">Vencimento</th><th scope="col">Parcela</th><th scope="col">Origem</th><th scope="col">Cartão</th><th scope="col">Categoria</th><th scope="col">Status</th><th scope="col">Valor</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderAggregateRows(
  rows: readonly InstallmentAggregateViewModel[],
  kind: string,
  currency: string,
): string {
  if (rows.length === 0) {
    return renderCompactEmptyState(
      "Sem dados para agrupar.",
      "As parcelas do filtro selecionado aparecerão aqui.",
    );
  }
  const maxAmount = Math.max(1, ...rows.map((row) => Math.abs(row.amountMinor)));
  return `<div class="aggregate-list" data-aggregate-kind="${escapeHtml(kind)}">${rows
    .map((row) => {
      const scale =
        row.amountMinor === 0
          ? 0
          : Math.max(
              4,
              Math.round((Math.abs(row.amountMinor) / maxAmount) * 100),
            );
      return `<article class="aggregate-row"><div class="aggregate-copy"><strong>${escapeHtml(row.label)}</strong><span>${row.count} parcela${row.count === 1 ? "" : "s"}</span><span class="aggregate-bar" aria-hidden="true"><span style="--aggregate-size:${scale}%"></span></span></div><strong>${renderMoney({ amountMinor: row.amountMinor, currency })}</strong></article>`;
    })
    .join("")}</div>`;
}

function renderCompactEmptyState(title: string, description: string): string {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p class="muted">${escapeHtml(description)}</p></div>`;
}

function installmentStatusLabel(item: InstallmentRecord): string {
  const invoice = item.invoice?.status
    ? ` · Fatura ${formatInvoiceStatus(item.invoice.status)}`
    : "";
  return formatInstallmentStatus(item.status) + invoice;
}

function renderStatusOptions(selected: string): string {
  return [
    ["all", "Todos"],
    ["planned", "Planejadas"],
    ["posted", "Postadas"],
    ["reconciled", "Conciliadas"],
    ["cancelled", "Canceladas"],
  ]
    .map(
      ([value, label]) =>
        `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`,
    )
    .join("");
}

function normalizeMonth(value: string | null): string | undefined {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : undefined;
}

function normalizeStatus(value: string | null): string {
  return value && new Set(["all", "planned", "posted", "reconciled", "cancelled"]).has(value)
    ? value
    : "all";
}

function nonEmpty(value: string | null): string | undefined {
  return value?.trim() || undefined;
}

function currentMonth(): string {
  return todayDateOnly().slice(0, 7);
}

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthEnd(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  return `${month}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, "0")}`;
}

function formatMonthYear(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const label = new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatInstallmentStatus(status: string): string {
  if (status === "planned") return "Planejada";
  if (status === "posted") return "Postada";
  if (status === "reconciled") return "Conciliada";
  if (status === "cancelled") return "Cancelada";
  return status;
}

function formatInvoiceStatus(status: string): string {
  if (status === "open") return "aberta";
  if (status === "closed") return "fechada";
  if (status === "paid") return "paga";
  if (status === "overdue") return "vencida";
  if (status === "cancelled") return "cancelada";
  return status;
}

function installmentsSorted(items: InstallmentRecord[]): InstallmentRecord[] {
  return items.slice().sort((left, right) => left.dueOn.localeCompare(right.dueOn));
}

function byName(left: { name: string }, right: { name: string }): number {
  return left.name.localeCompare(right.name, "pt-BR");
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}
