import { formatMinorCurrency } from "@solverfin/shared";

import {
  renderCard,
  renderEmptyState,
  renderLoading,
  renderMetricCard as renderFoundationMetricCard,
  renderPageContainer,
  renderPageHeader,
  renderRecoverableError,
  renderSummaryGrid,
} from "../design-system/primitives.js";
import { renderMoney } from "../design-system/money.js";
import { apiGet } from "./api.js";
import {
  DASHBOARD_FINANCIAL_INSIGHTS_RESOURCE,
  presentDashboard,
  presentDashboardLoading,
  type DashboardCashFlowProjection,
  type DashboardCashFlowProjectionViewModel,
  type DashboardContentViewModel,
  type DashboardCurrencySummaryViewModel,
  type DashboardDecisionModuleViewModel,
  type DashboardFinancialSummary,
  type DashboardMetricViewModel,
  type DashboardOpenInvoice,
  type DashboardPresenterInput,
  type DashboardRecentItemViewModel,
  type DashboardScreenViewModel,
} from "./dashboard-presenter.js";
import type { FinancialInsightQueueApiPage } from "./financial-insight-queue-presenter.js";
import { renderDashboardFinancialInsights } from "./financial-insight-queue-view.js";
import { icon } from "./icons.js";
import { renderAuthenticatedShellDocument } from "./shell.js";
import { dashboardStyles } from "./dashboard-styles.js";

const DASHBOARD_LOADING_GRACE_MS = 75;
const DASHBOARD_LOAD_MAX_LIFETIME_MS = 30_000;

interface DashboardLoadEntry {
  promise: Promise<DashboardPresenterInput>;
}

const dashboardLoads = new Map<string, DashboardLoadEntry>();

export async function renderDashboardPage(token: string): Promise<string> {
  const entry = dashboardLoadEntry(token);
  const outcome = await Promise.race([
    entry.promise.then((input) => ({ state: "ready" as const, input })),
    loadingGrace().then(() => ({ state: "loading" as const })),
  ]);

  if (outcome.state === "loading") {
    return renderDashboard(presentDashboardLoading());
  }

  dashboardLoads.delete(token);
  return renderDashboard(presentDashboard(outcome.input));
}

function dashboardLoadEntry(token: string): DashboardLoadEntry {
  const pending = dashboardLoads.get(token);
  if (pending) return pending;

  const promise = Promise.all([
    apiGet<DashboardFinancialSummary>(token, "/api/financial-summary"),
    apiGet<DashboardCashFlowProjection>(token, "/api/cash-flow-projection?horizonDays=30"),
    apiGet<{ messages: unknown[] }>(token, "/api/bank-message-inbox?status=pending_review"),
    apiGet<{ invoices: DashboardOpenInvoice[] }>(token, "/api/invoices?status=open"),
    apiGet<FinancialInsightQueueApiPage>(token, DASHBOARD_FINANCIAL_INSIGHTS_RESOURCE),
  ]).then(([summary, cashFlowProjection, pendingReview, openInvoices, financialInsights]) => ({
    summary,
    cashFlowProjection,
    pendingReview,
    openInvoices,
    financialInsights,
    filters: {},
  }));
  const entry: DashboardLoadEntry = { promise };
  dashboardLoads.set(token, entry);

  const cleanup = setTimeout(() => {
    if (dashboardLoads.get(token) === entry) dashboardLoads.delete(token);
  }, DASHBOARD_LOAD_MAX_LIFETIME_MS);
  cleanup.unref?.();

  return entry;
}

function loadingGrace(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, DASHBOARD_LOADING_GRACE_MS));
}

function renderDashboard(model: DashboardScreenViewModel): string {
  switch (model.status) {
    case "loading":
      return renderAuthenticatedPage(
        renderPageContainer({
          className: "dashboard-page",
          childrenHtml: `${renderLoading({
            title: "Carregando resumo financeiro",
            description: "Estamos preparando os indicadores do cockpit.",
          })}${dashboardLoadingRetryScript()}`,
        }),
      );
    case "error":
      return renderAuthenticatedPage(
        renderPageContainer({
          className: "dashboard-page",
          childrenHtml: renderRecoverableError({
            title: "Não foi possível carregar o Dashboard",
            description: model.error.message,
          }),
        }),
      );
    case "empty":
      return renderAuthenticatedPage(
        renderPageContainer({
          className: "dashboard-page",
          childrenHtml: `
            <section class="panel dashboard-hero" aria-label="Situação financeira atual">
              <div class="dashboard-heading">
                ${renderPageHeader({
                  eyebrow: "Cockpit financeiro",
                  title: "Situação financeira atual",
                })}
              </div>
              ${renderEmptyState({
                title: model.empty.title,
                description: model.empty.description,
              })}
            </section>
          `,
        }),
      );
    case "success":
      return renderAuthenticatedPage(
        renderPageContainer({
          className: "dashboard-page",
          childrenHtml: renderDashboardContent(model.content),
        }),
      );
  }
}

function renderDashboardContent(content: DashboardContentViewModel): string {
  return `
    <section class="dashboard-hero" aria-label="Situação financeira atual">
      <div class="dashboard-heading">
        ${renderPageHeader({
          eyebrow: "Cockpit financeiro",
          title: "Situação financeira atual",
          description: "Acompanhe posição, entradas, despesas e compromissos sem misturar moedas.",
        })}
      </div>
      <div class="data-quality" data-quality="${content.dataQuality.status}" role="status">
        <strong>${escapeHtml(content.dataQuality.title)}</strong>
        <span>${escapeHtml(content.dataQuality.description)}</span>
      </div>
    </section>
    ${renderCurrencyNavigator(content.currencySummaries)}
    ${renderCurrencySummaries(content.currencySummaries)}
    <section class="next-actions" aria-label="Próximas ações">
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
    ${renderSupportingCurrencySummaries(content.currencySummaries)}
    ${renderCashFlowProjection(content.cashFlowProjection)}
    ${content.financialInsights ? renderDashboardFinancialInsights(content.financialInsights) : ""}
    ${renderDecisionModules(content.decisionModules)}
    <section class="list-panel">
      <div class="section-heading">
        <div><p class="eyebrow">Evidências</p><h2>Itens recentes</h2></div>
      </div>
      <div class="rows">
        ${renderRecentItems(content.recentItems)}
      </div>
    </section>
    ${renderCurrencyEvidenceIndex(content.currencySummaries)}
    ${dashboardEvidenceScript()}
  `;
}

function renderCurrencyNavigator(blocks: readonly DashboardCurrencySummaryViewModel[]): string {
  if (blocks.length < 2) return "";

  return `<nav class="currency-nav" aria-label="Moedas disponíveis"><span>Moedas</span>${blocks
    .map(
      (block) =>
        `<a class="currency-chip" href="#currency-${escapeHtml(block.currency)}">${escapeHtml(block.currency)}</a>`,
    )
    .join("")}</nav>`;
}

function renderCurrencySummaries(blocks: readonly DashboardCurrencySummaryViewModel[]): string {
  if (blocks.length === 0) {
    return renderEmptyState({
      title: "Nenhum total financeiro disponível.",
      description: "Registre lançamentos ou contas para acompanhar os valores deste perfil.",
    });
  }

  return blocks
    .map(
      (block) => `
        <section id="currency-${escapeHtml(block.currency)}" class="currency-summary" aria-label="Indicadores em ${escapeHtml(block.currency)}">
          <div class="section-heading currency-heading">
            <div><p class="eyebrow">Moeda</p><h2>${escapeHtml(block.currency)}</h2></div>
          </div>
          ${renderSummaryGrid({ childrenHtml: block.metrics.slice(0, 2).map(renderDashboardMetric).join("") })}
        </section>
      `,
    )
    .join("");
}

function renderSupportingCurrencySummaries(
  blocks: readonly DashboardCurrencySummaryViewModel[],
): string {
  return blocks
    .map(
      (block) => `
        <section class="dashboard-supporting-section" aria-label="Receitas, despesas e compromissos em ${escapeHtml(block.currency)}">
          <h2 class="dashboard-supporting-title">Demais indicadores — ${escapeHtml(block.currency)}</h2>
          <dl class="dashboard-supporting-metrics" aria-label="Demais indicadores em ${escapeHtml(block.currency)}">
            ${block.metrics.slice(2).map(renderSupportingMetric).join("")}
          </dl>
        </section>
      `,
    )
    .join("");
}

function renderSupportingMetric(metric: DashboardMetricViewModel): string {
  return `
    <div class="dashboard-supporting-metric">
      <dt>${escapeHtml(metric.title)}</dt>
      <dd>
        <strong>${formatMinorCurrency(metric.amount.amountMinor, { currency: metric.amount.currency })}</strong>
        <a class="text-link sf-focus-ring" href="${escapeHtml(metric.href)}" aria-label="${escapeHtml(metric.linkLabel)}">${escapeHtml(metric.linkLabel)}</a>
      </dd>
    </div>
  `;
}

function renderCurrencyEvidenceIndex(blocks: readonly DashboardCurrencySummaryViewModel[]): string {
  if (blocks.length === 0) return "";

  return `
    <section class="dashboard-evidence-index" aria-labelledby="dashboard-evidence-title">
      <div class="section-heading">
        <div><p class="eyebrow">Detalhamento</p><h2 id="dashboard-evidence-title">Evidências dos indicadores</h2></div>
      </div>
      ${blocks
        .map(
          (block) => `
            <div class="currency-evidence" aria-label="Evidências dos indicadores em ${escapeHtml(block.currency)}">
              <h3>${escapeHtml(block.currency)}</h3>
              ${block.metrics.map(renderDashboardEvidence).join("")}
            </div>
          `,
        )
        .join("")}
    </section>
  `;
}

function renderDashboardEvidence(metric: DashboardMetricViewModel): string {
  const evidenceItems = metric.evidenceLinks.length
    ? metric.evidenceLinks
        .map((item) => {
          if (item.href) {
            return `<a class="evidence-link sf-focus-ring" href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`;
          }

          return `<span class="evidence-static"><strong>${escapeHtml(item.label)}</strong>${item.note ? `<small>${escapeHtml(item.note)}</small>` : ""}</span>`;
        })
        .join("")
    : '<p class="muted">Nenhuma conta vinculada a esta evidência.</p>';

  return `
    <details id="${escapeHtml(metric.evidenceId)}" class="evidence-detail">
      <summary>${escapeHtml(metric.title)}</summary>
      <p class="muted">${escapeHtml(metric.evidenceTitle)}</p>
      <div class="evidence-links">${evidenceItems}</div>
    </details>
  `;
}

function renderCashFlowProjection(
  projection: DashboardCashFlowProjectionViewModel | undefined,
): string {
  if (!projection) return "";

  return `
    <section class="cash-flow-section" aria-labelledby="dashboard-cash-flow-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Horizonte</p>
          <h2 id="dashboard-cash-flow-title">Projeção de caixa — ${projection.horizonDays} dias</h2>
          <p class="muted">Referência: ${escapeHtml(projection.referenceDateLabel)}. Cada moeda mantém sua própria série.</p>
        </div>
      </div>
      <div class="cash-flow-dashboard-grid">
        ${projection.currencies
          .map((item) =>
            renderCard({
              title: item.currency,
              className: "cash-flow-dashboard-card",
              bodyHtml: renderCashFlowDecisionMetrics(item),
              footerHtml: `<a class="text-link" href="${escapeHtml(item.href)}">Ver série diária e evidências</a>`,
            }),
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderCashFlowDecisionMetrics(
  item: DashboardCashFlowProjectionViewModel["currencies"][number],
): string {
  const freeToSpend =
    item.freeToSpend.status === "available"
      ? `
        <div class="cash-flow-dashboard-metric">
          <span>Livre para gastar hoje</span>
          <strong class="cash-flow-dashboard-value">${renderMoney(item.freeToSpend.amount)}</strong>
          <small>Menor saldo projetado em ${escapeHtml(item.freeToSpend.minimumBalanceOnLabel)}.</small>
        </div>
        <div class="cash-flow-dashboard-metric">
          <span>Déficit projetado</span>
          <strong>${renderMoney(item.freeToSpend.projectedDeficit)}</strong>
          <small>Zero quando toda a trajetória de 30 dias permanece não negativa.</small>
        </div>
      `
      : `
        <div class="cash-flow-dashboard-metric" data-free-to-spend="unavailable">
          <span>Livre para gastar hoje</span>
          <strong>Indisponível</strong>
          <small>A projeção canônica de 30 dias não possui base suficiente para publicar este valor.</small>
        </div>
      `;

  return `
    <div class="cash-flow-dashboard-metrics">
      <div class="cash-flow-dashboard-metric">
        <span>Saldo projetado no fim do horizonte</span>
        <strong class="cash-flow-dashboard-value">${renderMoney(item.closingBalance)}</strong>
        <small>Saldo no 30º dia; não representa o valor livre para gastar.</small>
      </div>
      ${freeToSpend}
    </div>
  `;
}

function renderNextActions(actions: DashboardContentViewModel["nextActions"]): string {
  if (actions.length === 0) {
    return renderEmptyState({
      title: "Nenhuma pendência agora.",
      description: "Compromissos previstos, faturas e itens de revisão aparecerão aqui.",
    });
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
          .map((module) =>
            renderCard({
              title: module.title,
              className: "decision-card",
              bodyHtml: `<p class="eyebrow">${escapeHtml(module.eyebrow)}</p><p class="muted">${escapeHtml(module.description)}</p>`,
              footerHtml: `<a class="text-link" href="${escapeHtml(module.href)}">${escapeHtml(module.linkLabel)}</a>`,
            }),
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
    renderEmptyState({
      title: "Nenhum lançamento recente.",
      description:
        "Os indicadores acima continuam disponíveis por moeda quando houver saldo ou compromissos.",
    })
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

function renderDashboardMetric(metric: DashboardMetricViewModel): string {
  const metricCard = renderFoundationMetricCard({
    label: metric.title,
    value: formatMinorCurrency(metric.amount.amountMinor, { currency: metric.amount.currency }),
    detail: metric.subtitle,
  });

  return `<div class="dashboard-metric">${metricCard}<a class="metric-drilldown sf-focus-ring" href="${escapeHtml(metric.href)}" aria-label="${escapeHtml(metric.linkLabel)}">${escapeHtml(metric.linkLabel)}</a></div>`;
}

function dashboardLoadingRetryScript(): string {
  return `
    <script>
      window.setTimeout(() => window.location.reload(), 250);
    </script>
  `;
}

function dashboardEvidenceScript(): string {
  return `
    <script>
      function openDashboardEvidence() {
        const id = window.location.hash.slice(1);
        if (!id.startsWith("dashboard-evidence-")) return;
        const target = document.getElementById(id);
        if (target && target.tagName === "DETAILS") target.open = true;
      }
      window.addEventListener("hashchange", openDashboardEvidence);
      openDashboardEvidence();
    </script>
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
