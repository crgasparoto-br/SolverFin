import {
  renderCard,
  renderEmptyState,
  renderLoading,
  renderPageContainer,
  renderPageHeader,
  renderRecoverableError,
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
  type DashboardDecisionModuleViewModel,
  type DashboardFinancialSummary,
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
import {
  renderCurrencyEvidenceIndex,
  renderCurrencyFilter,
  renderCurrencyNavigator,
  renderCurrencySummaries,
  renderMobileAdditionalKpis,
  renderSupportingCurrencySummaries,
} from "./dashboard-kpi-view.js";
import { renderProjectionChart } from "./dashboard-cashflow-chart.js";
import { escapeHtml } from "./transactions-render-helpers.js";
import { renderDashboardOverview, type DashboardOverview } from "./dashboard-overview-view.js";

const DASHBOARD_LOADING_GRACE_MS = 75;
const DASHBOARD_LOAD_MAX_LIFETIME_MS = 30_000;

interface DashboardLoadEntry {
  promise: Promise<DashboardPresenterInput>;
}

const dashboardLoads = new Map<string, DashboardLoadEntry>();

export async function renderDashboardPage(token: string, url?: URL): Promise<string> {
  const entry = dashboardLoadEntry(
    token,
    url?.searchParams.get("purchaseOn"),
    url?.searchParams.get("currency"),
  );
  const outcome = await Promise.race([
    entry.promise.then((input) => ({ state: "ready" as const, input })),
    loadingGrace().then(() => ({ state: "loading" as const })),
  ]);

  if (outcome.state === "loading") {
    return renderDashboard(presentDashboardLoading());
  }

  dashboardLoads.delete(
    dashboardLoadKey(token, url?.searchParams.get("purchaseOn"), url?.searchParams.get("currency")),
  );
  return renderDashboard(presentDashboard(outcome.input));
}

function dashboardLoadKey(
  token: string,
  purchaseOn?: string | null,
  currency?: string | null,
): string {
  return token + ":" + (purchaseOn ?? "today") + ":" + (currency ?? "all");
}

function dashboardLoadEntry(
  token: string,
  purchaseOn?: string | null,
  currency?: string | null,
): DashboardLoadEntry {
  const key = dashboardLoadKey(token, purchaseOn, currency);
  const pending = dashboardLoads.get(key);
  if (pending) return pending;

  const promise = Promise.all([
    apiGet<DashboardFinancialSummary>(token, "/api/financial-summary"),
    apiGet<DashboardCashFlowProjection>(token, "/api/cash-flow-projection?horizonDays=30"),
    apiGet<{ messages: unknown[] }>(token, "/api/bank-message-inbox?status=pending_review"),
    apiGet<{ invoices: DashboardOpenInvoice[] }>(token, "/api/invoices?status=open"),
    apiGet<FinancialInsightQueueApiPage>(token, DASHBOARD_FINANCIAL_INSIGHTS_RESOURCE),
    apiGet<DashboardOverview>(
      token,
      `/api/dashboard-overview${purchaseOn ? "?purchaseOn=" + encodeURIComponent(purchaseOn) : ""}`,
    ),
  ]).then(
    ([summary, cashFlowProjection, pendingReview, openInvoices, financialInsights, overview]) => ({
      summary,
      cashFlowProjection,
      pendingReview,
      openInvoices,
      financialInsights,
      overview,
      filters: { ...(currency ? { currency } : {}), ...(purchaseOn ? { purchaseOn } : {}) },
    }),
  );
  const entry: DashboardLoadEntry = { promise };
  dashboardLoads.set(key, entry);

  const cleanup = setTimeout(() => {
    if (dashboardLoads.get(key) === entry) dashboardLoads.delete(key);
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
  const blocks = content.selectedCurrency
    ? content.currencySummaries.filter((block) => block.currency === content.selectedCurrency)
    : content.currencySummaries;
  const projection = content.cashFlowProjection
    ? {
        ...content.cashFlowProjection,
        currencies: content.cashFlowProjection.currencies.filter(
          (item) => !content.selectedCurrency || item.currency === content.selectedCurrency,
        ),
      }
    : undefined;
  const overview = filterDashboardOverview(content.overview, content.selectedCurrency);

  return `
    <header class="dashboard-hero" data-dashboard-region="overview" data-multicurrency="${content.currencySummaries.length > 1}" aria-label="Visão geral financeira">
      <div class="dashboard-heading">
        ${renderPageHeader({
          eyebrow: "Cockpit financeiro",
          title: "Visão geral financeira",
          description:
            "Posição atual, resultado do mês e decisões financeiras sem misturar moedas.",
        })}
      </div>
      <div class="dashboard-header-controls">
        <div class="dashboard-period-pill" aria-label="Período financeiro">
          ${icon("calendar", 16)}
          <span>Mês corrente</span>
          <strong>${escapeHtml(overview?.periodStartOn.slice(0, 7) ?? "Atual")}</strong>
        </div>
        ${renderCurrencyFilter(content.currencySummaries, content.selectedCurrency, content.purchaseOn)}
        <div class="data-quality" data-quality="${content.dataQuality.status}" role="status">
          <strong>${escapeHtml(content.dataQuality.title)}</strong>
          <span>${escapeHtml(content.dataQuality.description)}</span>
        </div>
      </div>
    </header>
    ${renderCurrencyNavigator(blocks)}
    ${renderCurrencySummaries(blocks, projection, overview)}
    <section class="next-actions dashboard-actions panel" id="dashboard-actions" data-dashboard-region="alerts" aria-label="Próximas ações e alertas financeiros">
      <div class="section-heading">
        <div><p class="eyebrow">Acompanhar agora</p><h2>Próximas ações e alertas financeiros</h2></div>
      </div>
      ${renderNextActions(content.nextActions)}
      <div class="quick-links" aria-label="Atalhos da rotina">
        <a class="button-link secondary-link" href="/lancamentos" title="Ver extrato da conta">${icon("receipt", 14)} Extrato</a>
        <a class="button-link secondary-link" href="/cartoes" title="Ver cartões de crédito">${icon("credit-card", 14)} Cartões</a>
        <a class="button-link secondary-link" href="/inbox" title="Inbox e revisão de sugestões">${icon("inbox", 14)} Inbox</a>
      </div>
    </section>
    ${renderMobileAdditionalKpis(blocks, projection, overview)}
    ${renderCashFlowProjection(projection)}
    ${renderDashboardOverview(overview, content.selectedCurrency)}
    <section class="dashboard-final-grid" data-dashboard-region="activity" aria-label="Últimos lançamentos e insights">
      <div class="list-panel panel dashboard-last-items">
        <div class="section-heading">
          <div><p class="eyebrow">Atividade recente</p><h2>Últimos lançamentos</h2></div>
        </div>
        <div class="rows">${renderRecentItems(content.recentItems)}</div>
        <a class="text-link" href="/lancamentos">Ver todos os lançamentos</a>
      </div>
      <div class="panel dashboard-last-insights">
        <div class="section-heading">
          <div><p class="eyebrow">Análise prática</p><h2>Insights financeiros</h2></div>
        </div>
        ${
          content.financialInsights
            ? renderDashboardFinancialInsights(content.financialInsights)
            : renderEmptyState({
                title: "Nenhum insight disponível.",
                description: "A análise financeira será exibida quando houver dados suficientes.",
              })
        }
      </div>
    </section>
    <details class="dashboard-additional-tools" data-dashboard-region="additional">
      <summary>Mais indicadores e ferramentas de decisão</summary>
      ${renderSupportingCurrencySummaries(blocks)}
      ${renderDecisionModules(content.decisionModules)}
    </details>
    ${renderCurrencyEvidenceIndex(blocks)}
    ${dashboardEvidenceScript()}
  `;
}

function filterDashboardOverview(
  overview: DashboardOverview | undefined,
  selectedCurrency: string | undefined,
): DashboardOverview | undefined {
  if (!overview || !selectedCurrency) return overview;
  return {
    ...overview,
    accountBalances: overview.accountBalances.filter((item) => item.currency === selectedCurrency),
    cardSpending: overview.cardSpending.filter((item) => item.currency === selectedCurrency),
    ...(overview.cardSpendingTotals
      ? {
          cardSpendingTotals: overview.cardSpendingTotals.filter(
            (item) => item.currency === selectedCurrency,
          ),
        }
      : {}),
    payables: overview.payables.filter((item) => item.currency === selectedCurrency),
    payableTotals: overview.payableTotals.filter((item) => item.currency === selectedCurrency),
    categoryExpenses: overview.categoryExpenses.filter(
      (item) => item.currency === selectedCurrency,
    ),
    monthlyTrend: overview.monthlyTrend.filter((item) => item.currency === selectedCurrency),
  };
}

function renderCashFlowProjection(
  projection: DashboardCashFlowProjectionViewModel | undefined,
): string {
  if (!projection || projection.currencies.length === 0) {
    return `<section class="panel cash-flow-section dashboard-flow-wide" data-dashboard-region="cash-flow"
      aria-labelledby="dashboard-cash-flow-title">
      <div class="section-heading"><div><p class="eyebrow">Horizonte de 30 dias</p>
        <h2 id="dashboard-cash-flow-title">Fluxo de caixa projetado</h2></div></div>
      ${renderEmptyState({ title: "Projeção indisponível.", description: "Não há dados suficientes para montar a série de caixa neste momento." })}
    </section>`;
  }
  return `<section class="panel cash-flow-section dashboard-flow-wide" data-dashboard-region="cash-flow"
    aria-labelledby="dashboard-cash-flow-title">
    <div class="section-heading"><div>
      <p class="eyebrow">Horizonte · ${projection.horizonDays} dias</p>
      <h2 id="dashboard-cash-flow-title">Fluxo de caixa projetado</h2>
      <p class="muted">Projeção de caixa — ${projection.horizonDays} dias · Referência: ${escapeHtml(projection.referenceDateLabel)}.
        Séries independentes por moeda; valores previstos não são saldo disponível.</p>
    </div></div>
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
  </section>`;
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
      ${renderProjectionChart(item.points)}
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
