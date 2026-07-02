import { formatDateOnly, formatMinorCurrency } from "@solverfin/shared";

import { apiGet, type ApiFailure, type ApiSuccess } from "./api.js";
import { renderAuthenticatedShellDocument } from "./shell.js";
import { sharedShellStyles } from "./shared-styles.js";

export async function renderDashboardPage(token: string): Promise<string> {
  const [summary, transactions, pendingReview, openInvoices] = await Promise.all([
    apiGet<FinancialSummary>(token, "/api/financial-summary"),
    apiGet<{ transactions: DashboardTransaction[] }>(token, "/api/transactions?status=all"),
    apiGet<{ messages: unknown[] }>(token, "/api/bank-message-inbox?status=pending_review"),
    apiGet<{ invoices: OpenInvoice[] }>(token, "/api/invoices?status=open"),
  ]);

  if (!summary.ok) {
    return renderAuthenticatedPage(
      `<section class="panel"><p class="error">${escapeHtml(summary.error)}</p></section>`,
    );
  }

  return renderAuthenticatedPage(`
    <section class="dashboard-heading">
      <div>
        <p class="eyebrow">Perfil pessoal demo</p>
        <h1>Resumo financeiro</h1>
      </div>
      <span class="demo-pill">Demo seguro</span>
    </section>
    <section class="summary-grid" aria-label="Indicadores principais">
      ${renderMetricCard("Disponível estimado", summary.data.availableBalanceMinor, "Saldo das contas ativas")}
      ${renderMetricCard("Receitas do mês", summary.data.incomeMinor, "Entradas postadas no mês atual")}
      ${renderMetricCard("Despesas do mês", summary.data.expensesMinor, "Saídas postadas no mês atual")}
      ${renderMetricCard("Compromissos previstos", summary.data.plannedCommitmentsMinor, "Lançamentos planejados no mês")}
    </section>
    <section class="panel next-actions" aria-label="Próximas ações">
      <div class="section-heading">
        <h2>Próximas ações</h2>
      </div>
      ${renderNextActions(transactions, pendingReview, openInvoices)}
      <div class="quick-links" aria-label="Atalhos da rotina">
        <a class="button-link secondary-link" href="/lancamentos">Extrato</a>
        <a class="button-link secondary-link" href="/cartoes">Cartões</a>
        <a class="button-link secondary-link" href="/inbox">Inbox e revisão</a>
      </div>
    </section>
    <section class="panel list-panel">
      <div class="section-heading">
        <h2>Itens recentes</h2>
      </div>
      <div class="rows">
        ${renderRecentItems(summary.data.recentItems)}
      </div>
    </section>
  `);
}

interface DashboardTransaction {
  id: string;
  description: string;
  kind: "income" | "expense" | "transfer";
  status: string;
  amountMinor: number;
  occurredOn: string;
  plannedOn?: string;
  invoiceId?: string;
  installmentId?: string;
}

interface OpenInvoice {
  dueOn: string;
}

interface FinancialSummaryItem {
  description: string;
  kind: string;
  amountMinor: number;
  occurredOn: string;
  status: string;
}

interface FinancialSummary {
  availableBalanceMinor: number;
  incomeMinor: number;
  expensesMinor: number;
  plannedCommitmentsMinor: number;
  recentItems: FinancialSummaryItem[];
}

function renderNextActions(
  transactionsResult: ApiSuccess<{ transactions: DashboardTransaction[] }> | ApiFailure,
  pendingReview: ApiSuccess<{ messages: unknown[] }> | ApiFailure,
  openInvoices: ApiSuccess<{ invoices: OpenInvoice[] }> | ApiFailure,
): string {
  const plannedTransactions = transactionsResult.ok
    ? transactionsResult.data.transactions.filter(isPlannedCommitment)
    : [];
  const reviewCount = pendingReview.ok ? pendingReview.data.messages.length : 0;
  const invoices = openInvoices.ok ? openInvoices.data.invoices : [];

  const actions = [
    plannedTransactions.length > 0
      ? renderNextActionRow(
          `${plannedTransactions.length} lançamento${plannedTransactions.length === 1 ? "" : "s"} previsto${plannedTransactions.length === 1 ? "" : "s"} no Extrato`,
          `Próximo vencimento em ${formatDate(nearestDueDate(plannedTransactions.map(getTransactionDueDate)))}.`,
          "/lancamentos",
          "Ver extrato",
        )
      : "",
    reviewCount > 0
      ? renderNextActionRow(
          `${reviewCount} ite${reviewCount === 1 ? "m" : "ns"} aguardando revisão na inbox`,
          "Confirme ou ajuste as sugestões antes de usá-las como lançamento.",
          "/inbox",
          "Abrir inbox",
        )
      : "",
    invoices.length > 0
      ? renderNextActionRow(
          `${invoices.length} fatura${invoices.length === 1 ? "" : "s"} de cartão em aberto`,
          `Próximo vencimento em ${formatDate(nearestDueDate(invoices.map((item) => item.dueOn)))}.`,
          "/cartoes",
          "Ver cartões",
        )
      : "",
  ].filter((row) => row !== "");

  if (actions.length === 0) {
    return renderEmptyState(
      "Nenhuma pendência agora.",
      "Lançamentos previstos, faturas e itens de revisão aparecerão aqui.",
    );
  }

  return `<div class="rows next-action-rows">${actions.join("")}</div>`;
}

function isPlannedCommitment(transaction: DashboardTransaction): boolean {
  return (
    (transaction.status === "planned" || transaction.status === "suggested") &&
    (transaction.kind === "income" || transaction.kind === "expense") &&
    transaction.invoiceId === undefined &&
    transaction.installmentId === undefined
  );
}

function getTransactionDueDate(transaction: DashboardTransaction): string {
  return transaction.plannedOn ?? transaction.occurredOn;
}

function renderRecentItems(items: FinancialSummaryItem[]): string {
  return (
    items
      .map(
        (item) => `
          <article class="row">
            <div><strong>${escapeHtml(item.description)}</strong><span>${escapeHtml(item.kind)} - ${escapeHtml(item.status)} - ${formatDate(item.occurredOn)}</span></div>
            <strong>${formatMoney(item.amountMinor)}</strong>
          </article>
        `,
      )
      .join("") || renderEmptyState("Nenhum lançamento ainda.", "Crie lançamentos para acompanhar a rotina financeira deste perfil.")
  );
}

function renderAuthenticatedPage(content: string): string {
  return renderAuthenticatedShellDocument({
    activePathname: "/dashboard",
    currentLabel: "Dashboard",
    content,
    styles: dashboardStyles(),
  });
}

function renderNextActionRow(
  title: string,
  description: string,
  href: string,
  linkLabel: string,
): string {
  return `
    <article class="row next-action-row">
      <div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span></div>
      <a class="button-link secondary-link" href="${href}">${escapeHtml(linkLabel)}</a>
    </article>
  `;
}

function renderMetricCard(title: string, amountMinor: number, subtitle: string): string {
  return `<article class="metric-card"><span>${escapeHtml(title)}</span><strong>${formatMoney(amountMinor)}</strong><p>${escapeHtml(subtitle)}</p></article>`;
}

function renderEmptyState(title: string, description: string): string {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p class="muted">${escapeHtml(description)}</p></div>`;
}

function nearestDueDate(dates: string[]): string {
  return dates.slice().sort((left, right) => left.localeCompare(right))[0] ?? "";
}

function formatMoney(amountMinor: number): string {
  return formatMinorCurrency(amountMinor);
}

function formatDate(date: string): string {
  return formatDateOnly(date);
}

function dashboardStyles(): string {
  return `
    ${sharedShellStyles()}
    main { display: grid; gap: 20px; margin: 0 auto; max-width: 1440px; padding: 24px; width: 100%; }
    .dashboard-heading { align-items: end; display: flex; gap: 16px; justify-content: space-between; }
    .demo-pill { background: var(--success-bg); border-radius: 999px; color: var(--success); font-weight: 800; padding: 8px 12px; white-space: nowrap; }
    .secondary-link { background: var(--primary-soft); border: 1px solid #d4e6ec; color: var(--primary); }
    .summary-grid { display: grid; gap: 14px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .metric-card { display: grid; gap: 8px; min-width: 0; }
    .metric-card span { color: var(--muted); font-size: .78rem; font-weight: 800; text-transform: uppercase; }
    .metric-card strong { color: var(--primary); font-size: 1.5rem; line-height: 1.2; overflow-wrap: anywhere; }
    .metric-card p { color: var(--muted); line-height: 1.45; }
    .next-actions { gap: 14px; }
    .section-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; }
    .quick-links { display: flex; flex-wrap: wrap; gap: 8px; }
    .rows { display: grid; gap: 10px; }
    .row { align-items: center; border-top: 1px solid var(--line); display: flex; gap: 16px; justify-content: space-between; min-width: 0; padding-top: 10px; }
    .row:first-child { border-top: 0; padding-top: 0; }
    .row div { display: grid; gap: 4px; min-width: 0; }
    .row span { color: var(--muted); line-height: 1.45; }
    .row strong { overflow-wrap: anywhere; }
    .row > strong { text-align: right; white-space: nowrap; }
    .error { background: var(--danger-bg); border: 1px solid #fecaca; border-radius: 8px; color: var(--danger); padding: 10px 12px; }
    @media (max-width: 1024px) { .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 760px) { .summary-grid { grid-template-columns: 1fr; } .dashboard-heading, .row, .section-heading { align-items: stretch; display: grid; } .row > strong { text-align: left; white-space: normal; } }
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
