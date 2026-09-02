import { renderMoney } from "../design-system/money.js";
import {
  renderAlert,
  renderSummaryGrid,
  renderText,
} from "../design-system/primitives.js";

export interface AnalysisSummaryItem {
  label: string;
  primaryHtml: string;
  secondaryHtml?: string;
  tone?: "positive" | "negative" | "neutral" | "attention" | "information";
}

export interface ReportAnalysisBlockProps {
  id: string;
  currency: string;
  periodCount: number;
  summaryItems: readonly AnalysisSummaryItem[];
  summaryWrapperClassName?: string;
  summaryItemClassName?: string;
  visualizationTitle: string;
  visualizationHtml: string;
  highlightsHtml: string;
  detailTitle: string;
  detailHtml: string;
}

export interface TrendPoint {
  label: string;
  accessibleLabel: string;
  amountMinor: number;
  currency: string;
}

interface AnalysisSummaryGridOptions {
  wrapperClassName?: string | undefined;
  itemClassName?: string | undefined;
}

export function renderReportAnalysisBlock(props: ReportAnalysisBlockProps): string {
  const periodLabel = `${props.periodCount} período${props.periodCount === 1 ? "" : "s"}`;
  return `<section class="report-analysis-block" data-report-analysis="a5" data-currency="${renderText(props.currency)}" aria-labelledby="${renderText(props.id)}">
    <header class="report-analysis-heading">
      <div><p class="eyebrow">Moeda</p><h2 id="${renderText(props.id)}">${renderText(props.currency)}</h2></div>
      <span>${renderText(periodLabel)}</span>
    </header>
    <section class="report-analysis-layer" data-analysis-layer="summary" aria-label="Resumo em ${renderText(props.currency)}">
      <div class="report-layer-heading"><p class="eyebrow">Resumo</p><h3>Leitura do período</h3></div>
      ${renderAnalysisSummaryGrid(props.summaryItems, {
        wrapperClassName: props.summaryWrapperClassName,
        itemClassName: props.summaryItemClassName,
      })}
    </section>
    <section class="report-analysis-layer" data-analysis-layer="visualization" aria-label="Visualização em ${renderText(props.currency)}">
      <div class="report-layer-heading"><p class="eyebrow">Visualização</p><h3>${renderText(props.visualizationTitle)}</h3></div>
      ${props.visualizationHtml}
    </section>
    <section class="report-analysis-layer" data-analysis-layer="highlights" aria-label="Destaques em ${renderText(props.currency)}">
      <div class="report-layer-heading"><p class="eyebrow">Destaques</p><h3>Pontos para revisar</h3></div>
      ${props.highlightsHtml}
    </section>
    <section class="report-analysis-layer report-detail-layer" data-analysis-layer="detail" aria-label="Detalhe em ${renderText(props.currency)}">
      <div class="report-layer-heading"><p class="eyebrow">Detalhe</p><h3>${renderText(props.detailTitle)}</h3></div>
      ${props.detailHtml}
    </section>
  </section>`;
}

export function renderAnalysisSummaryGrid(
  items: readonly AnalysisSummaryItem[],
  options: AnalysisSummaryGridOptions = {},
): string {
  const itemClassName = options.itemClassName
    ? `report-summary-metric ${options.itemClassName}`
    : "report-summary-metric";
  const grid = renderSummaryGrid({
    childrenHtml: items
      .map((item) => {
        const secondary = item.secondaryHtml
          ? `<div class="report-summary-secondary">${item.secondaryHtml}</div>`
          : "";
        return `<article class="${renderText(itemClassName)}" data-tone="${item.tone ?? "neutral"}"><span>${renderText(item.label)}</span><strong>${item.primaryHtml}</strong>${secondary}</article>`;
      })
      .join(""),
  });

  return options.wrapperClassName
    ? `<div class="${renderText(options.wrapperClassName)}">${grid}</div>`
    : grid;
}

export function renderResultTrend(points: readonly TrendPoint[]): string {
  const maxAbsolute = Math.max(
    1,
    ...points.map((point) => Math.abs(point.amountMinor)),
  );
  return `<ol class="report-trend" aria-label="Resultado por período">${points
    .map((point) => {
      const scale =
        point.amountMinor === 0
          ? 0
          : Math.max(
              4,
              Math.round((Math.abs(point.amountMinor) / maxAbsolute) * 100),
            );
      const sign =
        point.amountMinor < 0
          ? "negative"
          : point.amountMinor > 0
            ? "positive"
            : "neutral";
      return `<li class="report-trend-point" data-sign="${sign}"><div class="report-trend-copy"><span aria-hidden="true">${renderText(point.label)}</span><span class="sr-only">${renderText(point.accessibleLabel)}</span><strong>${renderMoney({ amountMinor: point.amountMinor, currency: point.currency })}</strong></div><div class="report-trend-track" aria-hidden="true"><span class="report-trend-bar" style="--report-trend-size:${scale}%"></span></div></li>`;
    })
    .join("")}</ol>`;
}

export function renderAnalysisHighlights(input: {
  currency: string;
  best?: { label: string; amountMinor: number } | undefined;
  lowest?: { label: string; amountMinor: number } | undefined;
  negativePeriodCount: number;
}): string {
  const items = [
    input.best
      ? `<article class="report-highlight"><span>Melhor resultado</span><strong>${renderText(input.best.label)}</strong>${renderMoney({ amountMinor: input.best.amountMinor, currency: input.currency })}</article>`
      : "",
    input.lowest
      ? `<article class="report-highlight"><span>Menor resultado</span><strong>${renderText(input.lowest.label)}</strong>${renderMoney({ amountMinor: input.lowest.amountMinor, currency: input.currency })}</article>`
      : "",
  ].join("");
  const negativeAlert =
    input.negativePeriodCount > 0
      ? renderAlert({
          tone: "attention",
          title: `${input.negativePeriodCount} período${input.negativePeriodCount === 1 ? "" : "s"} com resultado negativo`,
          description:
            "Revise a evolução e o detalhe por categoria antes de decidir qualquer ajuste.",
        })
      : renderAlert({
          tone: "positive",
          title: "Nenhum período com resultado negativo",
          description:
            "Use a matriz detalhada para entender quais categorias sustentam o resultado.",
        });

  return `<div class="report-highlights-grid">${items}</div>${negativeAlert}`;
}
