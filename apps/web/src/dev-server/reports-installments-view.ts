import { formatDateOnly, formatMinorCurrency } from "@solverfin/shared";

import { apiGet } from "./api.js";
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

interface InstallmentSummary {
  activeCount: number;
  totalMinor: number;
  plannedOpenCount: number;
  plannedOpenMinor: number;
  postedClosedCount: number;
  postedClosedMinor: number;
  overdueCount: number;
  overdueMinor: number;
  futureCount: number;
  futureMinor: number;
}

interface AggregateRow {
  label: string;
  count: number;
  amountMinor: number;
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

  const summary = summarizeInstallments(installments, todayDateOnly());
  return `<div data-report-state="ready">
    <section class="summary-grid" aria-label="Indicadores de parcelas">
      ${renderMetric("Abertas/planejadas", summary.plannedOpenCount, summary.plannedOpenMinor)}
      ${renderMetric("Postadas/fechadas", summary.postedClosedCount, summary.postedClosedMinor)}
      ${renderMetric("Vencidas", summary.overdueCount, summary.overdueMinor, "warning")}
      ${renderMetric("Futuras", summary.futureCount, summary.futureMinor)}
      ${renderMetric("Total mensal", summary.activeCount, summary.totalMinor, "primary")}
    </section>
    <section class="report-grid" aria-label="Agrupamentos de parcelas">
      <section class="panel report-results">
        <div class="section-heading"><h2>Comprometimento por mês</h2><span>${escapeHtml(formatMonthYear(filters.month))}</span></div>
        ${renderAggregateRows(groupByMonth(installments), "month")}
      </section>
      <section class="panel report-results">
        <div class="section-heading"><h2>Por cartão</h2><span>${summary.activeCount} parcelas</span></div>
        ${renderAggregateRows(groupByCard(installments), "card")}
      </section>
      <section class="panel report-results">
        <div class="section-heading"><h2>Por categoria</h2><span>${summary.activeCount} parcelas</span></div>
        ${renderAggregateRows(groupByCategory(installments), "category")}
      </section>
    </section>
    <section class="panel report-results"><div class="section-heading"><div><p class="eyebrow">Consulta somente leitura</p><h2>Parcelas consideradas</h2></div><span>${installments.length} registros</span></div>
      <div class="installment-table" role="table" aria-label="Parcelas do relatório"><div class="installment-table-head" role="row"><span>Vencimento</span><span>Parcela</span><span>Origem</span><span>Cartão</span><span>Categoria</span><span>Status</span><span>Valor</span></div>${installments.map(renderInstallmentRow).join("")}</div>
    </section>
    <p class="sr-only">Período consultado: ${escapeHtml(formatMonthYear(filters.month))}</p>
  </div>`;
}

function summarizeInstallments(
  installments: readonly InstallmentRecord[],
  today: string,
): InstallmentSummary {
  return installments.reduce<InstallmentSummary>(
    (summary, installment) => {
      const amountMinor = installment.status === "cancelled" ? 0 : installment.amountMinor;
      const postedClosed = isPostedOrClosed(installment);
      const plannedOpen = installment.status === "planned" && !postedClosed;
      const overdue = plannedOpen && installment.dueOn < today;
      const future = installment.status !== "cancelled" && installment.dueOn > today;

      if (installment.status !== "cancelled") {
        summary.activeCount += 1;
        summary.totalMinor += amountMinor;
      }
      if (plannedOpen) {
        summary.plannedOpenCount += 1;
        summary.plannedOpenMinor += amountMinor;
      }
      if (postedClosed) {
        summary.postedClosedCount += 1;
        summary.postedClosedMinor += amountMinor;
      }
      if (overdue) {
        summary.overdueCount += 1;
        summary.overdueMinor += amountMinor;
      }
      if (future) {
        summary.futureCount += 1;
        summary.futureMinor += amountMinor;
      }
      return summary;
    },
    {
      activeCount: 0,
      totalMinor: 0,
      plannedOpenCount: 0,
      plannedOpenMinor: 0,
      postedClosedCount: 0,
      postedClosedMinor: 0,
      overdueCount: 0,
      overdueMinor: 0,
      futureCount: 0,
      futureMinor: 0,
    },
  );
}

function isPostedOrClosed(installment: InstallmentRecord): boolean {
  return (
    installment.status === "posted" ||
    installment.status === "reconciled" ||
    installment.invoice?.status === "closed" ||
    installment.invoice?.status === "paid"
  );
}

function groupByMonth(installments: readonly InstallmentRecord[]): AggregateRow[] {
  return aggregateBy(installments, (installment) => formatMonthYear(installment.dueOn.slice(0, 7)));
}

function groupByCard(installments: readonly InstallmentRecord[]): AggregateRow[] {
  return aggregateBy(
    installments,
    (installment) => installment.card?.name ?? "Sem cartão informado",
  );
}

function groupByCategory(installments: readonly InstallmentRecord[]): AggregateRow[] {
  return aggregateBy(installments, (installment) => installment.category?.name ?? "Sem categoria");
}

function aggregateBy(
  installments: readonly InstallmentRecord[],
  labelFor: (installment: InstallmentRecord) => string,
): AggregateRow[] {
  const groups = new Map<string, AggregateRow>();
  for (const installment of installments) {
    const label = labelFor(installment);
    const current = groups.get(label) ?? { label, count: 0, amountMinor: 0 };
    current.count += 1;
    if (installment.status !== "cancelled") current.amountMinor += installment.amountMinor;
    groups.set(label, current);
  }
  return Array.from(groups.values()).sort(
    (left, right) => right.amountMinor - left.amountMinor || left.label.localeCompare(right.label),
  );
}

function renderAggregateRows(rows: readonly AggregateRow[], kind: string): string {
  if (rows.length === 0) {
    return renderCompactEmptyState(
      "Sem dados para agrupar.",
      "As parcelas do filtro selecionado aparecerão aqui.",
    );
  }
  return `<div class="aggregate-list" data-aggregate-kind="${escapeHtml(kind)}">${rows
    .map(
      (row) =>
        `<article class="aggregate-row"><div><strong>${escapeHtml(row.label)}</strong><span>${row.count} parcela${row.count === 1 ? "" : "s"}</span></div><strong>${escapeHtml(formatMinorCurrency(row.amountMinor))}</strong></article>`,
    )
    .join("")}</div>`;
}

function renderMetric(
  label: string,
  count: number,
  amountMinor: number,
  tone: "default" | "warning" | "primary" = "default",
): string {
  return `<article class="metric-card metric-${tone}"><span>${escapeHtml(label)}</span><strong>${count}</strong><p>${escapeHtml(formatMinorCurrency(amountMinor))}</p></article>`;
}

function renderCompactEmptyState(title: string, description: string): string {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p class="muted">${escapeHtml(description)}</p></div>`;
}

function renderInstallmentRow(item: InstallmentRecord): string {
  const source = item.transaction?.description ?? item.recurrence?.description ?? "Parcela";
  const invoice = item.invoice?.status
    ? ` · Fatura ${formatInvoiceStatus(item.invoice.status)}`
    : "";
  return `<article class="installment-table-row" role="row"><time datetime="${escapeHtml(item.dueOn)}">${escapeHtml(formatDateOnly(item.dueOn))}</time><span>${item.sequenceNumber}/${item.totalInstallments}</span><strong>${escapeHtml(source)}</strong><span>${escapeHtml(item.card?.name ?? "Sem cartão")}</span><span>${escapeHtml(item.category?.name ?? "Sem categoria")}</span><span>${escapeHtml(formatInstallmentStatus(item.status) + invoice)}</span><strong>${escapeHtml(formatMinorCurrency(item.amountMinor, { currency: item.currency }))}</strong></article>`;
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
