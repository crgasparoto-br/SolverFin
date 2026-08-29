import { renderMoney } from "../design-system/money.js";
import { apiGet } from "./api.js";
import {
  presentDashboard,
  type DashboardContentViewModel,
  type DashboardCurrencySummaryViewModel,
  type DashboardDecisionModuleViewModel,
  type DashboardFinancialSummary,
  type DashboardMetricViewModel,
  type DashboardOpenInvoice,
  type DashboardRecentItemViewModel,
  type DashboardScreenViewModel,
} from "./dashboard-presenter.js";
import { icon } from "./icons.js";
import { renderAuthenticatedShellDocument } from "./shell.js";
import { sharedShellStyles } from "./shared-styles.js";

export async function renderDashboardPage(token: string): Promise<string> {
  const [summary, pendingReview, openInvoices] = await Promise.all([
    apiGet<DashboardFinancialSummary>(token, "/api/financial-summary"),
    apiGet<{ messages: unknown[] }>(token, "/api/bank-message-inbox?status=pending_review"),
    apiGet<{ invoices: DashboardOpenInvoice[] }>(token, "/api/invoices?status=open"),
  ]);

  return renderDashboard(
    presentDashboard({
      summary,
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
    <section class="panel dashboard-hero" aria-labelledby="dashboard-title">
      <div class="dashboard-heading">
        <p class="eyebrow">Cockpit financeiro</p>
        <h1 id="dashboard-title">Situação financeira atual</h1>
        <p class="muted">Acompanhe posição, entradas, despesas e compromissos sem misturar moedas.</p>
      </div>
      <div class="data-quality" data-quality="${content.dataQuality.status}" role="status">
        <strong>${escapeHtml(content.dataQuality.title)}</strong>
        <span>${escapeHtml(content.dataQuality.description)}</span>
      </div>
    </section>
    ${renderCurrencyNavigator(content.currencySummaries)}
    ${renderCurrencySummaries(content.currencySummaries)}
    <section class="panel next-actions" aria-label="Próximas ações">
      <div class="section-heading">
        <div><p class="eyebrow">Ação</p><h2>Próximas ações</h2></div>
      </div>
      ${renderNextActions(content.nextActions)}
      <div class="quick-links" aria-label="Atalhos da rotina">
        <a class="button-link secondary-link" href="/lancamentos" title="Ver extrato da conta">${icon("receipt", 14)} Extrato</a>
        <a class="button-link secondary-link" href="/cartoes" title="Ver cartões de crédito">${icon("credit-card", 14)} Cartões</a>
        <a class="button-link secondary-link" href="/inbox" title="Inbox e revisão de sugestões">${icon("inbox", 14)} Inbox</a>
      </div>
    </section>
    ${renderDecisionModules(content.decisionModules)}
    <section class="panel list-panel">
      <div class="section-heading">
        <div><p class="eyebrow">Evidências</p><h2>Itens recentes</h2></div>
      </div>
      <div class="rows">
        ${renderRecentItems(content.recentItems)}
      </div>
    </section>
  `;
}

function renderCurrencyNavigator(blocks: readonly DashboardCurrencySummaryViewModel[]): string {
  if (blocks.length < 2) return "";

  return `<nav class="currency-nav panel" aria-label="Moedas disponíveis"><span>Moedas</span>${blocks
    .map(
      (block) =>
        `<a class="currency-chip" href="#currency-${escapeHtml(block.currency)}">${escapeHtml(block.currency)}</a>`,
    )
    .join("")}</nav>`;
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
        <section id="currency-${escapeHtml(block.currency)}" class="currency-summary" aria-label="Indicadores em ${escapeHtml(block.currency)}">
          <div class="section-heading currency-heading">
            <div><p class="eyebrow">Moeda</p><h2>${escapeHtml(block.currency)}</h2></div>
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
      "Compromissos previstos, faturas e itens de revisão aparecerão aqui.",
    );
  }

  return `<div class="rows next-action-rows">${actions
    .map((action) =>
      renderNextActionRow(action.title, action.description, action.href, action.linkLabel),
    )
    .join("")}</div>`;
}

function renderDecisionModules(modules: readonly DashboardDecisionModuleViewModel[]): string {
  return `
    <section class="decision-section" aria-labelledby="decision-title">
      <div class="section-heading"><div><p class="eyebrow">Horizonte</p><h2 id="decision-title">Ferramentas de decisão</h2></div></div>
      <div class="decision-grid">
        ${modules
          .map(
            (module) => `
              <article class="panel decision-card">
                <p class="eyebrow">${escapeHtml(module.eyebrow)}</p>
                <h3>${escapeHtml(module.title)}</h3>
                <p class="muted">${escapeHtml(module.description)}</p>
                <a class="text-link" href="${escapeHtml(module.href)}">${escapeHtml(module.linkLabel)}</a>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderRecentItems(items: readonly DashboardRecentItemViewModel[]): string {
  return (
    items
      .map(
        (item) => `
          <article class="row">
            <div><strong>${escapeHtml(item.description)}</strong><span>${escapeHtml(item.kind)} - ${escapeHtml(item.status)} - ${escapeHtml(item.amount.currency)} - ${escapeHtml(item.occurredOnLabel)}</span></div>
            <strong>${renderMoney(item.amount)}</strong>
          </article>
        `,
      )
      .join("") ||
    renderEmptyState(
      "Nenhum lançamento recente.",
      "Os indicadores acima continuam disponíveis por moeda quando houver saldo ou compromissos.",
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
      <a class="button-link secondary-link" href="${escapeHtml(href)}">${escapeHtml(linkLabel)}</a>
    </article>
  `;
}

function renderMetricCard(metric: DashboardMetricViewModel): string {
  return `
    <article class="metric-card">
      <span>${escapeHtml(metric.title)}</span>
      <strong>${renderMoney(metric.amount)}</strong>
      <p>${escapeHtml(metric.subtitle)}</p>
      <a class="metric-drilldown" href="${escapeHtml(metric.href)}" aria-label="${escapeHtml(metric.linkLabel)}">Ver evidências</a>
    </article>
  `;
}

function renderEmptyState(title: string, description: string): string {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p class="muted">${escapeHtml(description)}</p></div>`;
}

function dashboardStyles(): string {
  return `
    ${sharedShellStyles()}
    main { display: grid; gap: 16px; margin: 0 auto; max-width: 1440px; padding: 20px; width: 100%; }
    .dashboard-hero { align-items: start; display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr) minmax(240px, 360px); }
    .dashboard-heading { display: grid; gap: 4px; min-width: 0; }
    .dashboard-hero h1 { margin-bottom: 6px; }
    .data-quality { background: var(--surface-soft); border: 1px solid var(--line); border-radius: var(--radius); display: grid; gap: 4px; padding: 12px; }
    .data-quality strong { color: var(--primary); font-size: 0.875rem; }
    .data-quality span { color: var(--muted); font-size: 0.8125rem; line-height: 1.4; }
    .data-quality[data-quality="partial"] { border-style: dashed; }
    .secondary-link { background: var(--surface); border: 1px solid var(--line); color: var(--primary); }
    .secondary-link:hover { background: var(--primary-soft); border-color: #c8dde5; }
    .currency-nav { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 12px; }
    .currency-nav > span { color: var(--muted); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
    .currency-chip { border: 1px solid var(--line); border-radius: 999px; color: var(--primary); font-size: 0.8125rem; font-weight: 700; padding: 5px 10px; text-decoration: none; }
    .currency-chip:hover, .currency-chip:focus-visible { background: var(--primary-soft); }
    .currency-summary { display: grid; gap: 8px; scroll-margin-top: 20px; }
    .currency-heading h2 { color: var(--primary); font-size: 1rem; margin: 0; }
    .summary-grid { display: grid; gap: 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .metric-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); display: grid; gap: 6px; min-width: 0; padding: 14px 16px; }
    .metric-card > span { color: var(--muted); font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
    .metric-card > strong { color: var(--primary); font-size: 1.25rem; font-weight: 700; line-height: 1.2; overflow-wrap: anywhere; }
    .metric-card p { color: var(--muted); font-size: 0.8125rem; line-height: 1.4; }
    .metric-drilldown, .text-link { color: var(--primary); font-size: 0.8125rem; font-weight: 700; justify-self: start; text-underline-offset: 3px; }
    .metric-drilldown:focus-visible, .text-link:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
    .next-actions { gap: 12px; }
    .section-heading { align-items: center; display: flex; gap: 10px; justify-content: space-between; }
    .quick-links { display: flex; flex-wrap: wrap; gap: 6px; }
    .decision-section { display: grid; gap: 10px; }
    .decision-grid { display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .decision-card { align-content: start; display: grid; gap: 8px; min-width: 0; }
    .decision-card h3 { color: var(--primary); font-size: 1rem; margin: 0; }
    .rows { display: grid; gap: 0; }
    .row { align-items: center; border-top: 1px solid var(--line); display: flex; gap: 12px; justify-content: space-between; min-width: 0; padding: 8px 0; }
    .row:first-child { border-top: 0; padding-top: 0; }
    .row div { display: grid; gap: 2px; min-width: 0; }
    .row div > span { color: var(--muted); font-size: 0.8125rem; line-height: 1.4; }
    .row strong { font-size: 0.875rem; overflow-wrap: anywhere; }
    .row > strong { text-align: right; white-space: nowrap; }
    @media (max-width: 1024px) { .summary-grid, .decision-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .dashboard-hero { grid-template-columns: 1fr; } }
    @media (max-width: 760px) { .summary-grid, .decision-grid { grid-template-columns: 1fr; } .row, .section-heading { align-items: stretch; display: grid; } .row > strong { text-align: left; white-space: normal; } }
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
