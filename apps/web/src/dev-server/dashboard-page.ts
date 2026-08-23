import { formatMinorCurrency } from "@solverfin/shared";

import { apiGet } from "./api.js";
import {
  presentDashboard,
  type DashboardContentViewModel,
  type DashboardCurrencySummaryViewModel,
  type DashboardFinancialSummary,
  type DashboardMetricViewModel,
  type DashboardOpenInvoice,
  type DashboardRecentItemViewModel,
  type DashboardScreenViewModel,
  type DashboardTransaction,
} from "./dashboard-presenter.js";
import { icon } from "./icons.js";
import { renderAuthenticatedShellDocument } from "./shell.js";
import { sharedShellStyles } from "./shared-styles.js";
import type { MoneyViewModel } from "./screen-view-model.js";

export async function renderDashboardPage(token: string): Promise<string> {
  const [summary, transactions, pendingReview, openInvoices] = await Promise.all([
    apiGet<DashboardFinancialSummary>(token, "/api/financial-summary"),
    apiGet<{ transactions: DashboardTransaction[] }>(token, "/api/transactions?status=all"),
    apiGet<{ messages: unknown[] }>(token, "/api/bank-message-inbox?status=pending_review"),
    apiGet<{ invoices: DashboardOpenInvoice[] }>(token, "/api/invoices?status=open"),
  ]);

  return renderDashboard(
    presentDashboard({
      summary,
      transactions,
      pendingReview,
      openInvoices,
      filters: {},
    }),
  );
}

function renderDashboard(model: DashboardScreenViewModel): string {
  switch (model.status) {
    case "loading":
      return renderAuthenticatedPage(
        '<section class="panel" aria-busy="true"><p class="muted">Carregando resumo financeiro...</p></section>',
      );
    case "error":
      return renderAuthenticatedPage(
        `<section class="panel"><p class="error">${escapeHtml(model.error.message)}</p></section>`,
      );
    case "empty":
      return renderAuthenticatedPage(
        `<section class="panel">${renderEmptyState(model.empty.title, model.empty.description)}</section>`,
      );
    case "success":
      return renderAuthenticatedPage(renderDashboardContent(model.content));
  }
}

function renderDashboardContent(content: DashboardContentViewModel): string {
  return `
    <section class="dashboard-heading">
      <div>
        <p class="eyebrow">Visão geral financeira</p>
        <h1>Resumo financeiro</h1>
      </div>
    </section>
    ${renderCurrencySummaries(content.currencySummaries)}
    <section class="panel next-actions" aria-label="Próximas ações">
      <div class="section-heading">
        <h2>Próximas ações</h2>
      </div>
      ${renderNextActions(content.nextActions)}
      <div class="quick-links" aria-label="Atalhos da rotina">
        <a class="button-link secondary-link" href="/lancamentos" title="Ver extrato da conta">${icon("receipt", 14)} Extrato</a>
        <a class="button-link secondary-link" href="/cartoes" title="Ver cartões de crédito">${icon("credit-card", 14)} Cartões</a>
        <a class="button-link secondary-link" href="/inbox" title="Inbox e revisão de sugestões">${icon("inbox", 14)} Inbox</a>
      </div>
    </section>
    <section class="panel list-panel">
      <div class="section-heading">
        <h2>Itens recentes</h2>
      </div>
      <div class="rows">
        ${renderRecentItems(content.recentItems)}
      </div>
    </section>
  `;
}

function renderCurrencySummaries(blocks: readonly DashboardCurrencySummaryViewModel[]): string {
  if (blocks.length === 0) {
    return renderEmptyState(
      "Nenhum total financeiro disponível.",
      "Registre lançamentos ou contas para acompanhar os valores deste perfil.",
    );
  }

  return blocks
    .map(
      (block) => `
        <section class="currency-summary" aria-label="Indicadores em ${escapeHtml(block.currency)}">
          <div class="section-heading currency-heading">
            <h2>${escapeHtml(block.currency)}</h2>
          </div>
          <div class="summary-grid">
            ${block.metrics.map(renderMetricCard).join("")}
          </div>
        </section>
      `,
    )
    .join("");
}

function renderNextActions(actions: DashboardContentViewModel["nextActions"]): string {
  if (actions.length === 0) {
    return renderEmptyState(
      "Nenhuma pendência agora.",
      "Lançamentos previstos, faturas e itens de revisão aparecerão aqui.",
    );
  }

  return `<div class="rows next-action-rows">${actions
    .map((action) =>
      renderNextActionRow(action.title, action.description, action.href, action.linkLabel),
    )
    .join("")}</div>`;
}

function renderRecentItems(items: readonly DashboardRecentItemViewModel[]): string {
  return (
    items
      .map(
        (item) => `
          <article class="row">
            <div><strong>${escapeHtml(item.description)}</strong><span>${escapeHtml(item.kind)} - ${escapeHtml(item.status)} - ${escapeHtml(item.amount.currency)} - ${escapeHtml(item.occurredOnLabel)}</span></div>
            <strong>${formatMoney(item.amount)}</strong>
          </article>
        `,
      )
      .join("") ||
    renderEmptyState(
      "Nenhum lançamento ainda.",
      "Crie lançamentos para acompanhar a rotina financeira deste perfil.",
    )
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

function renderMetricCard(metric: DashboardMetricViewModel): string {
  return `<article class="metric-card"><span>${escapeHtml(metric.title)}</span><strong>${formatMoney(metric.amount)}</strong><p>${escapeHtml(metric.subtitle)}</p></article>`;
}

function renderEmptyState(title: string, description: string): string {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p class="muted">${escapeHtml(description)}</p></div>`;
}

function formatMoney(value: MoneyViewModel): string {
  return formatMinorCurrency(value.amountMinor, { currency: value.currency });
}

function dashboardStyles(): string {
  return `
    ${sharedShellStyles()}
    main { display: grid; gap: 16px; margin: 0 auto; max-width: 1440px; padding: 20px; width: 100%; }
    .dashboard-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; }
    .secondary-link { background: var(--surface); border: 1px solid var(--line); color: var(--primary); }
    .secondary-link:hover { background: var(--primary-soft); border-color: #c8dde5; }
    .currency-summary { display: grid; gap: 8px; }
    .currency-heading h2 { color: var(--primary); font-size: 0.875rem; letter-spacing: 0.04em; margin: 0; }
    .summary-grid { display: grid; gap: 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .metric-card { display: grid; gap: 6px; min-width: 0; padding: 14px 16px; }
    .metric-card span { color: var(--muted); font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
    .metric-card strong { color: var(--primary); font-size: 1.25rem; font-weight: 700; line-height: 1.2; overflow-wrap: anywhere; }
    .metric-card p { color: var(--muted); font-size: 0.8125rem; line-height: 1.4; }
    .next-actions { gap: 12px; }
    .section-heading { align-items: center; display: flex; gap: 10px; justify-content: space-between; }
    .quick-links { display: flex; flex-wrap: wrap; gap: 6px; }
    .rows { display: grid; gap: 0; }
    .row { align-items: center; border-top: 1px solid var(--line); display: flex; gap: 12px; justify-content: space-between; min-width: 0; padding: 8px 0; }
    .row:first-child { border-top: 0; padding-top: 0; }
    .row div { display: grid; gap: 2px; min-width: 0; }
    .row span { color: var(--muted); font-size: 0.8125rem; line-height: 1.4; }
    .row strong { font-size: 0.875rem; overflow-wrap: anywhere; }
    .row > strong { text-align: right; white-space: nowrap; }
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
