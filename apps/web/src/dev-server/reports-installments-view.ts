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
  invoice?: { id: string; status: string; periodStartOn: string; periodEndOn: string };
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
    return renderState(
      "empty",
      "Nenhuma parcela no período.",
      "Ajuste mês, cartão, categoria ou status para revisar outro recorte.",
    );
  }
  const active = installments.filter((item) => item.status !== "cancelled");
  const posted = installments.filter(
    (item) =>
      item.status === "posted" ||
      item.status === "reconciled" ||
      item.invoice?.status === "closed" ||
      item.invoice?.status === "paid",
  );
  const planned = installments.filter(
    (item) => item.status === "planned" && !posted.includes(item),
  );
  const total = active.reduce((sum, item) => sum + item.amountMinor, 0);
  return `<div data-report-state="ready">
    <section class="summary-grid" aria-label="Indicadores de parcelas">
      ${renderMetric("Abertas/planejadas", planned.length, sumMoney(planned))}
      ${renderMetric("Postadas/fechadas", posted.length, sumMoney(posted))}
      ${renderMetric("Total mensal", active.length, total, true)}
    </section>
    <section class="panel report-results"><div class="section-heading"><div><p class="eyebrow">Consulta somente leitura</p><h2>Parcelas consideradas</h2></div><span>${installments.length} registros</span></div>
      <div class="installment-table" role="table" aria-label="Parcelas do relatório"><div class="installment-table-head" role="row"><span>Vencimento</span><span>Parcela</span><span>Origem</span><span>Cartão</span><span>Categoria</span><span>Status</span><span>Valor</span></div>${installments.map(renderInstallmentRow).join("")}</div>
    </section>
    <p class="sr-only">Período consultado: ${escapeHtml(formatMonthYear(filters.month))}</p>
  </div>`;
}

function renderMetric(label: string, count: number, amountMinor: number, primary = false): string {
  return `<article class="metric-card${primary ? " metric-primary" : ""}"><span>${escapeHtml(label)}</span><strong>${count}</strong><p>${escapeHtml(formatMinorCurrency(amountMinor))}</p></article>`;
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
  return new Date().toISOString().slice(0, 7);
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

function sumMoney(items: InstallmentRecord[]): number {
  return items.reduce((sum, item) => sum + (item.status === "cancelled" ? 0 : item.amountMinor), 0);
}

function installmentsSorted(items: InstallmentRecord[]): InstallmentRecord[] {
  return items.slice().sort((left, right) => left.dueOn.localeCompare(right.dueOn));
}

function byName(left: { name: string }, right: { name: string }): number {
  return left.name.localeCompare(right.name, "pt-BR");
}
