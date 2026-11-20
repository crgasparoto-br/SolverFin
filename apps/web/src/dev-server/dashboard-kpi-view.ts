import { formatMinorCurrency } from "@solverfin/shared";

import {
  renderEmptyState,
  renderMetricCard as renderFoundationMetricCard,
  renderSummaryGrid,
} from "../design-system/primitives.js";
import type {
  DashboardCashFlowProjectionViewModel,
  DashboardCurrencySummaryViewModel,
  DashboardMetricViewModel,
} from "./dashboard-presenter.js";
import type { DashboardOverview } from "./dashboard-overview-view.js";
import { escapeHtml } from "./transactions-render-helpers.js";

export function renderCurrencyFilter(
  blocks: readonly DashboardCurrencySummaryViewModel[],
  selectedCurrency?: string,
  purchaseOn?: string,
): string {
  return `<form action="/dashboard" method="get" class="dashboard-currency-filter">
    <label for="dashboard-currency">Moeda dos valores</label>
    <select id="dashboard-currency" name="currency">
      <option value="">Todas</option>
      ${blocks
        .map(
          (block) =>
            `<option value="${escapeHtml(block.currency)}"${selectedCurrency === block.currency ? " selected" : ""}>${escapeHtml(block.currency)}</option>`,
        )
        .join("")}
    </select>
    ${purchaseOn ? `<input type="hidden" name="purchaseOn" value="${escapeHtml(purchaseOn)}">` : ""}
    <button type="submit" class="button-link secondary-link">Aplicar</button>
  </form>`;
}

function renderKpiCard(
  label: string,
  value: string,
  detail: string,
  href: string,
  linkLabel: string,
  key: string,
): string {
  return `<div class="dashboard-metric dashboard-kpi" data-kpi="${escapeHtml(key)}">
    ${renderFoundationMetricCard({ label, value, detail })}
    <a class="metric-drilldown sf-focus-ring" href="${escapeHtml(href)}" aria-label="${escapeHtml(linkLabel)}">${escapeHtml(linkLabel)}</a>
  </div>`;
}

function renderDashboardKpis(
  block: DashboardCurrencySummaryViewModel,
  projection: DashboardCashFlowProjectionViewModel | undefined,
  overview: DashboardOverview | undefined,
  secondaryOnly = false,
): string {
  const currency = block.currency;
  const available = block.metrics[0];
  const variation = block.metrics[1];
  if (!available || !variation) return "";
  const projected = projection?.currencies.find((item) => item.currency === currency);
  const payables = overview?.payableTotals.find((item) => item.currency === currency);
  const spending = overview?.cardSpendingTotals?.find((item) => item.currency === currency);
  const forecastHref = projected?.href ?? "/relatorios?view=cash-flow";
  const missing = "Indisponível";
  const money = (amount: number): string => formatMinorCurrency(amount, { currency });
  const secondary = [
    renderKpiCard(
      "Resultado do mês",
      money(variation.amount.amountMinor),
      "Receitas menos despesas realizadas",
      variation.href,
      variation.linkLabel,
      "result",
    ),
    renderKpiCard(
      "Contas a pagar",
      overview ? money(payables?.amountMinor ?? 0) : missing,
      "Pendentes e vencidas até o fim do mês",
      "#dashboard-payables",
      "Ver contas a pagar",
      "payables",
    ),
    renderKpiCard(
      "Gastos nos cartões",
      overview ? money(spending?.amountMinor ?? 0) : missing,
      "Compras realizadas no mês, sem duplicar a fatura",
      "#dashboard-credit-cards",
      "Ver gastos por cartão",
      "cards",
    ),
    renderKpiCard(
      "Saldo mínimo projetado",
      projected?.freeToSpend.status === "available"
        ? money(projected.freeToSpend.minimumBalance.amountMinor)
        : missing,
      "Menor posição de caixa nos próximos 30 dias",
      forecastHref,
      "Ver projeção de caixa",
      "minimum",
    ),
  ];
  if (secondaryOnly) return secondary.join("");
  return [
    renderKpiCard(
      "Saldo das contas",
      money(available.amount.amountMinor),
      "Posição atual por moeda",
      available.href,
      available.linkLabel,
      "balance",
    ),
    renderKpiCard(
      "Livre para gastar",
      projected?.freeToSpend.status === "available"
        ? money(projected.freeToSpend.amount.amountMinor)
        : missing,
      "Disponibilidade conservadora para 30 dias",
      forecastHref,
      "Ver disponibilidade de caixa",
      "free",
    ),
    ...secondary,
  ].join("");
}

export function renderMobileAdditionalKpis(
  blocks: readonly DashboardCurrencySummaryViewModel[],
  projection: DashboardCashFlowProjectionViewModel | undefined,
  overview: DashboardOverview | undefined,
): string {
  return `<section class="dashboard-mobile-additional" aria-label="Outros indicadores financeiros">
    <h2>Outros indicadores do mês</h2>
    ${blocks
      .map(
        (block) => `<div class="dashboard-mobile-kpi-group">
      <strong class="dashboard-mobile-currency">${escapeHtml(block.currency)}</strong>
      <div class="dashboard-kpi-grid">${renderDashboardKpis(block, projection, overview, true)}</div>
    </div>`,
      )
      .join("")}
  </section>`;
}

export function renderCurrencyNavigator(
  blocks: readonly DashboardCurrencySummaryViewModel[],
): string {
  if (blocks.length < 2) return "";

  return `<nav class="currency-nav" aria-label="Moedas disponíveis"><span>Moedas</span>${blocks
    .map(
      (block) =>
        `<a class="currency-chip" href="#currency-${escapeHtml(block.currency)}">${escapeHtml(block.currency)}</a>`,
    )
    .join("")}</nav>`;
}

export function renderCurrencySummaries(
  blocks: readonly DashboardCurrencySummaryViewModel[],
  projection?: DashboardCashFlowProjectionViewModel,
  overview?: DashboardOverview,
): string {
  if (blocks.length === 0) {
    return renderEmptyState({
      title: "Nenhum total financeiro disponível.",
      description: "Registre lançamentos ou contas para acompanhar os valores deste perfil.",
    });
  }
  const sections = blocks
    .map(
      (block) => `<section id="currency-${escapeHtml(block.currency)}"
      class="currency-summary" aria-label="Indicadores em ${escapeHtml(block.currency)}">
      <div class="section-heading currency-heading">
        <div><p class="eyebrow">Moeda</p><h2>${escapeHtml(block.currency)}</h2></div>
      </div>
      ${renderSummaryGrid({
        childrenHtml: renderDashboardKpis(block, projection, overview),
      })}
    </section>`,
    )
    .join("");
  return `<div class="dashboard-primary-currencies" data-dashboard-region="kpis"
    data-multicurrency="${blocks.length > 1}">${sections}</div>`;
}

export function renderSupportingCurrencySummaries(
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

export function renderCurrencyEvidenceIndex(
  blocks: readonly DashboardCurrencySummaryViewModel[],
): string {
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
