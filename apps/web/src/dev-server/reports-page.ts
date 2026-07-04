import { formatDateOnly, formatMinorCurrency } from "@solverfin/shared";

import { apiGet } from "./api.js";
import { renderAuthenticatedShellDocument } from "./shell.js";
import { sharedShellStyles } from "./shared-styles.js";

export async function renderReportsPage(token: string, url?: URL): Promise<string> {
  const filters = readReportFilters(url);
  const [installmentsResult, cardsResult, categoriesResult] = await Promise.all([
    apiGet<{ installments: InstallmentRecord[] }>(token, buildInstallmentsPath(filters)),
    apiGet<{ cards: CardRecord[] }>(token, "/api/cards?status=all"),
    apiGet<{ categories: CategoryRecord[] }>(token, "/api/categories?kind=expense"),
  ]);
  const cards = cardsResult.ok ? cardsResult.data.cards : [];
  const categories = categoriesResult.ok ? categoriesResult.data.categories : [];

  return renderShell(
    `
      <section class="reports-heading">
        <div>
          <p class="eyebrow">Relatórios</p>
          <h1>Parcelas consolidadas</h1>
          <p class="muted">Acompanhe o comprometimento mensal das parcelas sem alterar lançamentos, faturas ou recorrências.</p>
        </div>
        <span class="readonly-pill">Somente leitura</span>
      </section>

      <section class="panel report-filter-panel" aria-label="Filtros do relatório">
        <form class="report-filters" method="get" action="/relatorios">
          <label>Mês<input type="month" name="month" value="${escapeHtml(filters.month)}" /></label>
          <label>Status<select name="status">${renderStatusOptions(filters.status)}</select></label>
          <label>Cartão<select name="cardId"><option value="">Todos os cartões</option>${renderCardOptions(cards, filters.cardId)}</select></label>
          <label>Categoria<select name="categoryId"><option value="">Todas as categorias</option>${renderCategoryOptions(categories, filters.categoryId)}</select></label>
          <button type="submit">Atualizar relatório</button>
        </form>
      </section>

      ${
        installmentsResult.ok
          ? renderInstallmentReport(installmentsResult.data.installments, filters)
          : renderInstallmentReportError(installmentsResult.error)
      }
    `,
  );
}

function readReportFilters(url?: URL): ReportFilters {
  const month = normalizeMonth(url?.searchParams.get("month")) ?? currentMonth();
  const status = normalizeStatus(url?.searchParams.get("status"));
  const dueFrom = `${month}-01`;
  const dueTo = monthEnd(month);
  const filters: ReportFilters = {
    month,
    dueFrom,
    dueTo,
    status,
  };
  const cardId = nonEmpty(url?.searchParams.get("cardId"));
  const categoryId = nonEmpty(url?.searchParams.get("categoryId"));

  if (cardId !== undefined) filters.cardId = cardId;
  if (categoryId !== undefined) filters.categoryId = categoryId;

  return filters;
}

function buildInstallmentsPath(filters: ReportFilters): string {
  const params = new URLSearchParams({
    status: filters.status,
    dueFrom: filters.dueFrom,
    dueTo: filters.dueTo,
  });

  if (filters.cardId) params.set("cardId", filters.cardId);
  if (filters.categoryId) params.set("categoryId", filters.categoryId);

  return `/api/installments?${params.toString()}`;
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

function renderCardOptions(cards: CardRecord[], selected: string | undefined): string {
  return cards
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(
      (card) =>
        `<option value="${escapeHtml(card.id)}"${selected === card.id ? " selected" : ""}>${escapeHtml(card.name)}</option>`,
    )
    .join("");
}

function renderCategoryOptions(categories: CategoryRecord[], selected: string | undefined): string {
  return categories
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(
      (category) =>
        `<option value="${escapeHtml(category.id)}"${selected === category.id ? " selected" : ""}>${escapeHtml(category.name)}</option>`,
    )
    .join("");
}

function renderInstallmentReport(
  installments: InstallmentRecord[],
  filters: ReportFilters,
): string {
  const summary = summarizeInstallments(installments, todayDateOnly());

  if (installments.length === 0) {
    return `
      <section class="panel report-results">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Parcelas</p>
            <h2>${escapeHtml(formatMonthYear(filters.month))}</h2>
          </div>
        </div>
        ${renderEmptyState("Nenhuma parcela no período.", "Ajuste mês, cartão, categoria ou status para revisar outro recorte.")}
      </section>
    `;
  }

  return `
    <section class="summary-grid" aria-label="Indicadores de parcelas">
      ${renderMetric("Abertas/planejadas", summary.plannedOpenCount, formatMoney(summary.plannedOpenMinor))}
      ${renderMetric("Postadas/fechadas", summary.postedClosedCount, formatMoney(summary.postedClosedMinor))}
      ${renderMetric("Vencidas", summary.overdueCount, formatMoney(summary.overdueMinor), "warning")}
      ${renderMetric("Futuras", summary.futureCount, formatMoney(summary.futureMinor))}
      ${renderMetric("Total mensal", summary.activeCount, formatMoney(summary.totalMinor), "primary")}
    </section>

    <section class="report-grid">
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

    <section class="panel report-results">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Consulta somente leitura</p>
          <h2>Parcelas consideradas</h2>
        </div>
        <span>${installments.length} registros</span>
      </div>
      <div class="installment-table" role="table" aria-label="Parcelas do relatório">
        <div class="installment-table-head" role="row">
          <span>Vencimento</span><span>Parcela</span><span>Origem</span><span>Cartão</span><span>Categoria</span><span>Status</span><span>Valor</span>
        </div>
        ${installments.map(renderInstallmentRow).join("")}
      </div>
    </section>
  `;
}

function summarizeInstallments(
  installments: InstallmentRecord[],
  today: string,
): InstallmentSummary {
  return installments.reduce<InstallmentSummary>(
    (summary, installment) => {
      const amountMinor = installment.status === "cancelled" ? 0 : installment.amountMinor;
      const isPostedClosed = isPostedOrClosed(installment);
      const isPlannedOpen = installment.status === "planned" && !isPostedClosed;
      const isOverdue = isPlannedOpen && installment.dueOn < today;
      const isFuture = installment.status !== "cancelled" && installment.dueOn > today;

      if (installment.status !== "cancelled") {
        summary.activeCount += 1;
        summary.totalMinor += amountMinor;
      }
      if (isPlannedOpen) {
        summary.plannedOpenCount += 1;
        summary.plannedOpenMinor += amountMinor;
      }
      if (isPostedClosed) {
        summary.postedClosedCount += 1;
        summary.postedClosedMinor += amountMinor;
      }
      if (isOverdue) {
        summary.overdueCount += 1;
        summary.overdueMinor += amountMinor;
      }
      if (isFuture) {
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

function groupByMonth(installments: InstallmentRecord[]): AggregateRow[] {
  return aggregateBy(installments, (installment) => formatMonthYear(installment.dueOn.slice(0, 7)));
}

function groupByCard(installments: InstallmentRecord[]): AggregateRow[] {
  return aggregateBy(
    installments,
    (installment) => installment.card?.name ?? "Sem cartão informado",
  );
}

function groupByCategory(installments: InstallmentRecord[]): AggregateRow[] {
  return aggregateBy(installments, (installment) => installment.category?.name ?? "Sem categoria");
}

function aggregateBy(
  installments: InstallmentRecord[],
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

  return Array.from(groups.values()).sort((left, right) => right.amountMinor - left.amountMinor);
}

function renderAggregateRows(rows: AggregateRow[], kind: string): string {
  if (rows.length === 0) {
    return renderEmptyState(
      "Sem dados para agrupar.",
      "As parcelas do filtro selecionado aparecerão aqui.",
    );
  }

  return `
    <div class="aggregate-list" data-aggregate-kind="${escapeHtml(kind)}">
      ${rows
        .map(
          (row) => `
            <article class="aggregate-row">
              <div><strong>${escapeHtml(row.label)}</strong><span>${row.count} parcela${row.count === 1 ? "" : "s"}</span></div>
              <strong>${formatMoney(row.amountMinor)}</strong>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderInstallmentRow(installment: InstallmentRecord): string {
  const source =
    installment.transaction?.description ?? installment.recurrence?.description ?? "Parcela";
  const sequence = `${installment.sequenceNumber}/${installment.totalInstallments}`;
  const invoiceStatus = installment.invoice?.status
    ? ` · Fatura ${formatInvoiceStatus(installment.invoice.status)}`
    : "";

  return `
    <article class="installment-table-row" role="row">
      <time datetime="${escapeHtml(installment.dueOn)}">${formatDate(installment.dueOn)}</time>
      <span>${escapeHtml(sequence)}</span>
      <strong>${escapeHtml(source)}</strong>
      <span>${escapeHtml(installment.card?.name ?? "Sem cartão")}</span>
      <span>${escapeHtml(installment.category?.name ?? "Sem categoria")}</span>
      <span>${escapeHtml(formatInstallmentStatus(installment.status))}${escapeHtml(invoiceStatus)}</span>
      <strong>${formatMoney(installment.amountMinor)}</strong>
    </article>
  `;
}

function renderInstallmentReportError(error: string): string {
  return `
    <section class="panel report-results">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Parcelas</p>
          <h2>Não foi possível carregar o relatório</h2>
        </div>
      </div>
      <p class="error" role="alert">${escapeHtml(error)}</p>
    </section>
  `;
}

function renderMetric(label: string, count: number, value: string, tone = "default"): string {
  return `
    <article class="metric-card metric-${escapeHtml(tone)}">
      <span>${escapeHtml(label)}</span>
      <strong>${count}</strong>
      <p>${value}</p>
    </article>
  `;
}

function renderEmptyState(title: string, description: string): string {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p class="muted">${escapeHtml(description)}</p></div>`;
}

function renderShell(content: string): string {
  return renderAuthenticatedShellDocument({
    activePathname: "/relatorios",
    content,
    currentLabel: "Relatórios",
    styles: css(),
  });
}

function css(): string {
  return `
    ${sharedShellStyles()}
    main{display:grid;gap:20px;margin:0 auto;max-width:1440px;padding:24px;width:100%}.reports-heading{align-items:end;display:flex;gap:16px;justify-content:space-between}.reports-heading>div{display:grid;gap:6px;max-width:760px}.readonly-pill{background:var(--primary-soft);border:1px solid #d4e6ec;border-radius:999px;color:var(--primary);font-size:.82rem;font-weight:900;padding:8px 12px;white-space:nowrap}.report-filter-panel{padding:16px}.report-filters{align-items:end;display:grid;gap:12px;grid-template-columns:minmax(10rem,.8fr) minmax(10rem,.8fr) minmax(12rem,1fr) minmax(12rem,1fr) auto}.summary-grid{display:grid;gap:14px;grid-template-columns:repeat(5,minmax(0,1fr))}.metric-card{display:grid;gap:8px;min-width:0}.metric-card span{color:var(--muted);font-size:.78rem;font-weight:900;text-transform:uppercase}.metric-card strong{color:var(--primary);font-size:1.8rem;line-height:1}.metric-card p{color:var(--muted);font-weight:800}.metric-primary{background:var(--primary);border-color:var(--primary);color:white}.metric-primary span,.metric-primary strong,.metric-primary p{color:white}.metric-warning{background:var(--warning-bg);border-color:#fde68a}.metric-warning strong,.metric-warning p{color:var(--warning)}.report-grid{align-items:start;display:grid;gap:14px;grid-template-columns:repeat(3,minmax(0,1fr))}.report-results{min-width:0}.section-heading{align-items:center;display:flex;gap:12px;justify-content:space-between}.section-heading>div{display:grid;gap:4px}.section-heading span{background:var(--primary-soft);border-radius:999px;color:var(--primary);font-size:.78rem;font-weight:800;padding:6px 10px;white-space:nowrap}.aggregate-list{display:grid;gap:0}.aggregate-row{align-items:center;border-top:1px solid var(--line);display:flex;gap:12px;justify-content:space-between;padding:12px 0}.aggregate-row:first-child{border-top:0}.aggregate-row div{display:grid;gap:3px;min-width:0}.aggregate-row span{color:var(--muted);font-size:.86rem}.aggregate-row>strong{white-space:nowrap}.installment-table{display:grid;overflow-x:auto}.installment-table-head,.installment-table-row{align-items:center;border-bottom:1px solid var(--line);display:grid;gap:12px;grid-template-columns:6.5rem 4.5rem minmax(12rem,1.2fr) minmax(9rem,1fr) minmax(9rem,1fr) minmax(10rem,1fr) 7.5rem;min-width:900px;padding:12px 0}.installment-table-head{color:var(--muted);font-size:.78rem;font-weight:900;text-transform:uppercase}.installment-table-row:last-child{border-bottom:0}.installment-table-row time,.installment-table-row span{color:var(--muted)}.installment-table-row strong:last-child{text-align:right;white-space:nowrap}@media(max-width:1180px){.summary-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.report-grid{grid-template-columns:1fr 1fr}.report-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.report-filters button{grid-column:1/-1}}@media(max-width:760px){main{padding:18px 16px 28px}.reports-heading,.section-heading{align-items:stretch;display:grid}.summary-grid,.report-grid,.report-filters{grid-template-columns:1fr}.readonly-pill{justify-self:start}}
  `;
}

function normalizeMonth(value: string | null | undefined): string | undefined {
  if (value && /^\d{4}-\d{2}$/.test(value)) return value;
  return undefined;
}

function normalizeStatus(value: string | null | undefined): string {
  const allowed = new Set(["all", "planned", "posted", "reconciled", "cancelled"]);
  return value && allowed.has(value) ? value : "all";
}

function nonEmpty(value: string | null | undefined): string | undefined {
  return value && value.trim() ? value : undefined;
}

function currentMonth(): string {
  return todayDateOnly().slice(0, 7);
}

function monthEnd(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(lastDay).padStart(2, "0")}`;
}

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatMonthYear(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const label = new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatMoney(amountMinor: number): string {
  return formatMinorCurrency(amountMinor);
}

function formatDate(value: string): string {
  return formatDateOnly(value);
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface ReportFilters {
  month: string;
  dueFrom: string;
  dueTo: string;
  status: string;
  cardId?: string;
  categoryId?: string;
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
