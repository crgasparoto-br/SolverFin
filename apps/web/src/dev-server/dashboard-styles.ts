import { financialInsightQueueStyles } from "./financial-insight-queue-view.js";
import { sharedShellStyles } from "./shared-styles.js";

export function dashboardStyles(): string {
  return `
    ${sharedShellStyles()}
    ${financialInsightQueueStyles()}
    main { display: grid; gap: 16px; padding: 20px 0; width: 100%; }
    .sf-page-container { display: grid; gap: 16px; }
    .dashboard-hero { align-items: center; display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr) minmax(190px, 260px); }
    .dashboard-heading { display: grid; gap: 4px; min-width: 0; }
    .data-quality { display: grid; gap: 2px; padding: 6px 0 6px 12px; border-left: 2px solid var(--line); }
    .data-quality strong { color: var(--primary); font-size: 0.875rem; }
    .data-quality span { color: var(--muted); font-size: 0.8125rem; line-height: 1.4; }
    .data-quality[data-quality="partial"] { border-color: var(--primary); border-left-style: dashed; }
    .secondary-link { background: var(--surface); border: 1px solid var(--line); color: var(--primary); }
    .secondary-link:hover { background: var(--primary-soft); border-color: #c8dde5; }
    .currency-nav { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; padding: 2px 0; }
    .currency-nav > span { color: var(--muted); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
    .currency-chip { border: 1px solid var(--line); border-radius: 999px; color: var(--primary); font-size: 0.8125rem; font-weight: 700; padding: 5px 10px; text-decoration: none; }
    .currency-chip:hover, .currency-chip:focus-visible { background: var(--primary-soft); }
    .dashboard-primary-currencies { display: grid; gap: 16px; }
    .currency-summary { display: grid; gap: 8px; scroll-margin-top: 20px; }
    .currency-heading h2 { color: var(--primary); font-size: 1rem; margin: 0; }
    .currency-summary .sf-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .dashboard-supporting-section { display: grid; gap: 6px; }
    .dashboard-supporting-title { color: var(--primary); font-size: 0.875rem; margin: 0; }
    .dashboard-supporting-metrics { border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); display: grid; gap: 0; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0; }
    .dashboard-supporting-metric { display: grid; gap: 6px; min-width: 0; padding: 10px 14px 10px 0; }
    .dashboard-supporting-metric + .dashboard-supporting-metric { border-left: 1px solid var(--line); padding-left: 14px; }
    .dashboard-supporting-metric dt { color: var(--muted); font-size: 0.8125rem; }
    .dashboard-supporting-metric dd { display: grid; gap: 4px; margin: 0; min-width: 0; }
    .dashboard-supporting-metric dd strong { color: var(--primary); font-size: 1rem; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    .dashboard-supporting-metric dd a { width: fit-content; }
    .dashboard-metric { min-width: 0; position: relative; }
    .dashboard-metric .sf-metric-card { height: 100%; padding-bottom: 42px; }
    .metric-drilldown, .text-link, .evidence-link { color: var(--primary); font-size: 0.8125rem; font-weight: 700; text-underline-offset: 3px; }
    .metric-drilldown { bottom: 14px; left: 16px; position: absolute; }
    .metric-drilldown:focus-visible, .text-link:focus-visible, .evidence-link:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
    .dashboard-evidence-index { border-top: 1px solid var(--line); display: grid; gap: 12px; padding-top: 12px; }
    .currency-evidence { display: grid; gap: 6px; }
    .currency-evidence h3 { color: var(--primary); font-size: 0.875rem; margin: 6px 0 0; }
    .evidence-detail { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); scroll-margin-top: 20px; }
    .evidence-detail > summary { cursor: pointer; font-size: 0.875rem; font-weight: 700; padding: 10px 12px; }
    .evidence-detail > p { padding: 0 12px; }
    .evidence-links { display: flex; flex-wrap: wrap; gap: 8px; padding: 4px 12px 12px; }
    .evidence-link { border: 1px solid var(--line); border-radius: 999px; padding: 6px 10px; text-decoration: none; }
    .evidence-link:hover { background: var(--primary-soft); }
    .evidence-static { background: var(--surface-soft); border: 1px dashed var(--line); border-radius: var(--radius); display: grid; gap: 2px; padding: 7px 10px; }
    .evidence-static strong { color: var(--primary); font-size: 0.8125rem; }
    .evidence-static small { color: var(--muted); font-size: 0.75rem; }
    .cash-flow-section { display:grid; gap:10px; }
    .cash-flow-dashboard-grid { display:grid; gap:12px; grid-template-columns:repeat(3,minmax(0,1fr)); }
    .cash-flow-dashboard-card .sf-card-body { display:grid; gap:6px; }
    .cash-flow-dashboard-metrics { display:grid; gap:10px; }
    .cash-flow-dashboard-metric { border-top:1px solid var(--line); display:grid; gap:2px; padding-top:8px; }
    .cash-flow-dashboard-metric:first-child { border-top:0; padding-top:0; }
    .cash-flow-dashboard-metric > span { color:var(--muted); font-size:0.8125rem; }
    .cash-flow-dashboard-metric > small { color:var(--muted); line-height:1.4; }
    .cash-flow-dashboard-value { color:var(--primary); font-size:1.15rem; }
    .next-actions { border-top: 1px solid var(--line); display: grid; gap: 10px; padding-top: 12px; }
    .section-heading { align-items: center; display: flex; gap: 10px; justify-content: space-between; }
    .quick-links { display: flex; flex-wrap: wrap; gap: 6px; }
    .decision-section { display: grid; gap: 10px; }
    .decision-grid { display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .decision-card { align-content: start; min-width: 0; }
    .decision-card .sf-card-body { display: grid; gap: 8px; }
    .rows { display: grid; gap: 0; }
    .row { align-items: center; border-top: 1px solid var(--line); display: flex; gap: 12px; justify-content: space-between; min-width: 0; padding: 8px 0; }
    .row:first-child { border-top: 0; padding-top: 0; }
    .row div { display: grid; gap: 2px; min-width: 0; }
    .row div > span { color: var(--muted); font-size: 0.8125rem; line-height: 1.4; }
    .row strong { font-size: 0.875rem; overflow-wrap: anywhere; }
    .row > strong { text-align: right; white-space: nowrap; }

    .dashboard-overview { display: grid; gap: 14px; }
    .dashboard-operations-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .dashboard-widget { align-content: start; display: grid; gap: 12px; min-width: 0; padding: 16px; }
    .dashboard-widget-head { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; }
    .dashboard-widget-head > div { display: grid; gap: 2px; }
    .dashboard-widget-head h2 { color: var(--primary); font-size: 1rem; margin: 0; }
    .dashboard-widget-head .eyebrow { margin: 0; }
    .dashboard-recommendation { background: var(--surface-soft); border: 1px solid var(--line); border-radius: var(--radius); display: grid; gap: 5px; padding: 14px; }
    .dashboard-recommendation-name { color: var(--primary); font-size: 1.05rem; }
    .dashboard-recommendation-days { color: var(--primary); font-size: 1.9rem; font-variant-numeric: tabular-nums; line-height: 1.2; }
    .dashboard-recommendation-days small { color: var(--muted); font-size: 0.8rem; font-weight: normal; }
    .dashboard-comparison, .dashboard-compact-rows { display: grid; gap: 0; min-width: 0; }
    .dashboard-card-rank, .dashboard-account-row, .dashboard-card-spend-row { border-top: 1px solid var(--line); display: grid; gap: 3px; grid-template-columns: minmax(0, 1fr) auto; padding: 9px 0; }
    .dashboard-card-rank > span, .dashboard-account-row > span, .dashboard-card-spend-row > span { align-items: center; display: flex; flex-wrap: wrap; gap: 7px; min-width: 0; }
    .dashboard-card-rank > span svg, .dashboard-account-row > span svg, .dashboard-card-spend-row > span svg { color: var(--muted); flex: 0 0 auto; }
    .dashboard-card-rank small, .dashboard-account-row small, .dashboard-card-spend-row small { color: var(--muted); font-size: 0.75rem; }
    .dashboard-card-rank > small { grid-column: 1 / -1; }
    .dashboard-account-row strong, .dashboard-card-spend-row strong { font-variant-numeric: tabular-nums; text-align: right; }
    .dashboard-widget a { color: var(--primary); text-underline-offset: 3px; }
    .dashboard-widget a:focus-visible, .dashboard-widget button:focus-visible,
    .dashboard-widget input:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
    .dashboard-simulate { align-items: end; display: flex; flex-wrap: wrap; gap: 8px; }
    .dashboard-simulate label { color: var(--muted); flex: 1 0 100%; font-size: 0.8rem; }
    .dashboard-simulate input { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); color: var(--primary); min-height: 38px; padding: 6px; }
    .dashboard-simulate button { cursor: pointer; min-height: 38px; }
    .dashboard-footnote { font-size: 0.75rem; line-height: 1.45; margin: 0; }
    .dashboard-payable-totals { display: flex; flex-wrap: wrap; gap: 10px; }
    .dashboard-payable-totals > div { background: var(--surface-soft); border: 1px solid var(--line); border-radius: var(--radius); display: grid; gap: 4px; min-width: 140px; padding: 9px 12px; }
    .dashboard-payable-totals span { color: var(--muted); font-size: 0.75rem; }
    .dashboard-payable-totals strong { font-variant-numeric: tabular-nums; }
    .dashboard-danger { color: #bd3b4b; display: block; font-size: 0.75rem; }
    .dashboard-table-scroll { max-height: 268px; overflow: auto; }
    .dashboard-mini-table { border-collapse: collapse; font-size: 0.8125rem; width: 100%; }
    .dashboard-mini-table th { color: var(--muted); position: sticky; top: 0; background: var(--surface); text-align: left; }
    .dashboard-mini-table td, .dashboard-mini-table th { border-bottom: 1px solid var(--line); padding: 8px 6px; vertical-align: top; }
    .dashboard-mini-table td small { color: var(--muted); display: block; }
    .dashboard-mini-table .dashboard-money { font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
    .dashboard-mini-table th:last-child { text-align: right; }
    .dashboard-bar-list, .dashboard-trend { display: grid; gap: 12px; }
    .dashboard-bar-item { display: grid; gap: 5px; }
    .dashboard-bar-item > div:first-child { display: flex; flex-wrap: wrap; gap: 5px; justify-content: space-between; font-size: 0.8125rem; }
    .dashboard-bar-track { background: var(--surface-soft); border: 1px solid var(--line); border-radius: 999px; height: 9px; overflow: hidden; }
    .dashboard-bar-track span { background: var(--primary); border-radius: inherit; display: block; height: 100%; }
    .dashboard-trend { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .dashboard-trend-item { display: grid; gap: 7px; min-width: 0; }
    .dashboard-trend-item > strong { font-size: 0.75rem; }
    .dashboard-trend-item > div { display: grid; gap: 4px; }
    .dashboard-trend-item span { border-radius: 3px; display: block; height: 9px; min-width: 2px; }
    .dashboard-trend-income { background: #0d9488; }
    .dashboard-trend-expense { background: #e76276; }
    .dashboard-trend-item small { color: var(--muted); font-size: 0.72rem; }
    .dashboard-projection-chart { display: grid; gap: 8px; margin-top: 10px; }
    .dashboard-projection-chart svg { height: 96px; max-width: 100%; overflow: visible; width: 100%; }
    .dashboard-projection-chart p { color: var(--muted); font-size: 0.75rem; margin: 0; }
    @media (max-width: 1024px) { .dashboard-operations-grid { grid-template-columns: 1fr; } }
    @media (max-width: 760px) {
      .dashboard-operations-grid, .dashboard-trend { grid-template-columns: 1fr; }
      .dashboard-overview { gap: 10px; }
      .dashboard-widget { gap: 10px; padding: 12px; }
      .dashboard-recommendation-days { font-size: 1.5rem; }
      .dashboard-mini-table { font-size: 0.75rem; }
      .dashboard-mini-table th, .dashboard-mini-table td { padding: 7px 3px; }
      .dashboard-trend { gap: 8px; }
      .dashboard-trend-item { border-top: 1px solid var(--line); padding-top: 8px; }
    }
    @media (max-width: 1024px) { .decision-grid, .cash-flow-dashboard-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .dashboard-hero { grid-template-columns: 1fr; } .data-quality { padding-left: 10px; } }
    @media (max-width: 760px) {
      main { gap: 10px; padding-top: 8px; }
      .sf-page-container.dashboard-page { gap: 9px; }
      .dashboard-hero { gap: 4px; }
      .dashboard-hero .sf-page-header { gap: 2px; }
      .dashboard-hero .sf-page-header-description { font-size: 0.75rem; line-height: 1.35; }
      .data-quality { padding: 4px 0 4px 9px; }
      .data-quality[data-quality="complete"] span { display: none; }
      .dashboard-primary-currencies { gap: 9px; }
      .currency-summary { gap: 5px; }
      .currency-summary .sf-summary-grid, .dashboard-supporting-metrics, .decision-grid, .cash-flow-dashboard-grid { grid-template-columns: 1fr; }
      .currency-summary .sf-summary-grid { gap: 6px; }
      .dashboard-metric .sf-metric-card { display: grid; grid-template-columns: minmax(0, 1fr); padding: 9px 11px 30px; row-gap: 2px; }
      .dashboard-metric .sf-metric-card-label { font-size: 0.75rem; }
      .dashboard-metric .sf-metric-card-value { font-size: clamp(0.875rem, 4vw, 1rem); text-align: left; white-space: nowrap; }
      .dashboard-metric .sf-metric-card-detail { font-size: 0.75rem; grid-column: 1 / -1; line-height: 1.2; }
      .dashboard-metric .metric-drilldown { bottom: 8px; left: 11px; font-size: 0.75rem; }
      /* Compact currency rows on mobile so the first action remains usable in every state. */
      .dashboard-primary-currencies { gap: 6px; }
      .dashboard-primary-currencies .currency-summary { gap: 3px; }
      .dashboard-primary-currencies .currency-heading .eyebrow { display: none; }
      .dashboard-primary-currencies .currency-heading h2 { font-size: 0.875rem; }
      .dashboard-primary-currencies .currency-summary .sf-summary-grid { background: var(--sf-color-surface); border: 1px solid var(--sf-color-border); border-radius: var(--sf-radius-lg); gap: 0; }
      .dashboard-primary-currencies .dashboard-metric { display: grid; gap: 1px; min-width: 0; padding: 5px 10px; }
      .dashboard-primary-currencies .dashboard-metric + .dashboard-metric { border-top: 1px solid var(--sf-color-border); }
      .dashboard-primary-currencies .dashboard-metric .sf-metric-card { background: transparent; border: 0; border-radius: 0; box-shadow: none; column-gap: 10px; display: grid; grid-template-columns: minmax(0, 1fr) max-content; height: auto; padding: 0; row-gap: 1px; }
      .dashboard-primary-currencies .sf-metric-card-label { align-self: baseline; font-size: 0.75rem; line-height: 1.25; }
      .dashboard-primary-currencies .sf-metric-card-value { align-self: baseline; font-size: 0.8rem; line-height: 1.25; overflow-wrap: normal; text-align: right; white-space: nowrap; }
      .dashboard-primary-currencies .sf-metric-card-detail { font-size: 0.69rem; grid-column: 1 / -1; line-height: 1.2; }
      .dashboard-primary-currencies .metric-drilldown { font-size: 0.7rem; line-height: 1.2; position: static; width: fit-content; }
      /* KPI labels and links identify values; retain
         supplementary copy for assistive technology without hiding actions. */
      .dashboard-hero .sf-page-header-description,
      .dashboard-primary-currencies .sf-metric-card-detail {
        border: 0; clip-path: inset(50%); height: 1px; margin: -1px; overflow: hidden;
        padding: 0; position: absolute; white-space: nowrap; width: 1px;
      }
      .dashboard-hero .data-quality[data-quality="partial"] span { font-size: 0.75rem; line-height: 1.2; }
      .dashboard-primary-currencies .dashboard-metric { padding-block: 4px; }
      .next-actions { gap: 5px; padding-top: 6px; }
      .next-action-rows .row { padding: 6px 0; }
      .dashboard-supporting-metric { grid-template-columns: minmax(0, 1fr) auto; align-items: center; padding: 8px 0; }
      .dashboard-supporting-metric + .dashboard-supporting-metric { border-left: 0; border-top: 1px solid var(--line); padding-left: 0; }
      .dashboard-supporting-metric dd { justify-items: end; text-align: right; }
      .row, .section-heading { align-items: stretch; display: grid; }
      .row > strong { text-align: left; white-space: normal; }
      .evidence-links { display: grid; }
    }

    /* Dashboard #811 — approved visual mockup is the layout contract, not a collection of loose cards. */
    .dashboard-hero[data-dashboard-region="overview"] {
      align-items: start;
      border-bottom: 1px solid var(--line);
      gap: 16px;
      grid-template-columns: minmax(260px, 1fr) auto;
      padding-bottom: 12px;
    }
    .dashboard-header-controls { align-items: end; display: flex; flex-wrap: wrap; gap: 12px; justify-content: flex-end; }
    .dashboard-period-pill { align-items: center; background: var(--surface-soft); border: 1px solid var(--line); border-radius: var(--radius); display: flex; gap: 7px; min-height: 39px; padding: 7px 11px; white-space: nowrap; }
    .dashboard-period-pill span { color: var(--muted); font-size: 0.75rem; }
    .dashboard-period-pill strong { font-size: 0.8125rem; font-variant-numeric: tabular-nums; }
    .dashboard-currency-filter { align-items: end; display: grid; gap: 6px; grid-template-columns: 110px auto; min-width: 160px; }
    .dashboard-currency-filter label { color: var(--muted); font-size: 0.72rem; grid-column: 1 / -1; line-height: 1; }
    .dashboard-currency-filter select { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); color: var(--primary); min-height: 39px; min-width: 0; padding: 7px 9px; }
    .dashboard-currency-filter button { cursor: pointer; min-height: 39px; padding: 7px 12px; }
    .dashboard-currency-filter select:focus-visible, .dashboard-currency-filter button:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .dashboard-header-controls .data-quality { max-width: 180px; }
    .dashboard-primary-currencies { gap: 16px; }
    .dashboard-primary-currencies .currency-summary { gap: 9px; }
    .dashboard-primary-currencies .currency-summary .sf-summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .dashboard-kpi { position: relative; min-width: 0; }
    .dashboard-primary-currencies .dashboard-kpi .sf-metric-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); display: grid; min-height: 122px; gap: 5px; padding: 16px 14px 34px; }
    .dashboard-primary-currencies .dashboard-kpi .sf-metric-card-label { color: var(--muted); font-size: 0.8rem; font-weight: 600; }
    .dashboard-primary-currencies .dashboard-kpi .sf-metric-card-value { color: var(--primary); font-size: clamp(1rem, 1.45vw, 1.45rem); font-variant-numeric: tabular-nums; line-height: 1.25; overflow-wrap: anywhere; text-align: left; }
    .dashboard-primary-currencies .dashboard-kpi .sf-metric-card-detail { color: var(--muted); font-size: 0.74rem; line-height: 1.3; }
    .dashboard-primary-currencies .dashboard-kpi .metric-drilldown { bottom: 11px; left: 14px; }
    .dashboard-primary-currencies .dashboard-kpi[data-kpi="balance"] .sf-metric-card-value,
    .dashboard-primary-currencies .dashboard-kpi[data-kpi="free"] .sf-metric-card-value { color: var(--primary); font-weight: 800; }
    .dashboard-actions { border: 1px solid var(--line); border-radius: var(--radius); display: grid; gap: 11px; padding: 16px 18px; }
    .dashboard-actions .section-heading h2, .dashboard-flow-wide h2, .dashboard-final-grid h2 { font-size: 1.025rem; margin: 0; }
    .dashboard-actions .next-action-rows { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .dashboard-actions .next-action-rows .next-action-row { align-items: center; background: var(--surface-soft); border: 1px solid var(--line); border-radius: var(--radius); gap: 10px; min-height: 64px; padding: 10px 12px; }
    .dashboard-actions .next-action-row .button-link { flex: 0 0 auto; white-space: nowrap; }
    .dashboard-actions .quick-links { gap: 8px; }
    .dashboard-mobile-additional { display: none; }
    .dashboard-flow-wide { display: grid; gap: 14px; padding: 17px 18px; }
    .dashboard-flow-wide .cash-flow-dashboard-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
    .dashboard-flow-wide .cash-flow-dashboard-card { border: 1px solid var(--line); box-shadow: none; min-width: 0; }
    .dashboard-flow-wide .cash-flow-dashboard-metrics { display: grid; grid-template-columns: minmax(0, 2.2fr) repeat(2, minmax(0, 1fr)); align-items: start; gap: 16px; }
    .dashboard-flow-wide .cash-flow-dashboard-metric, .dashboard-flow-wide .cash-flow-dashboard-metric > * { min-width: 0; overflow-wrap: anywhere; }
    .dashboard-flow-wide .cash-flow-dashboard-metric { align-content: start; border-top: 0; gap: 5px; padding: 8px 0 0; }
    .dashboard-flow-wide .cash-flow-dashboard-metric + .cash-flow-dashboard-metric { border-left: 1px solid var(--line); padding-left: 14px; }
    .dashboard-flow-wide .dashboard-projection-chart { display: grid; gap: 6px; grid-row: 1 / span 2; margin: 0; min-width: 0; }
    .dashboard-flow-wide .dashboard-projection-chart svg { color: var(--primary); height: 182px; max-width: none; width: 100%; }
    .dashboard-flow-wide .dashboard-projection-chart p { font-size: 0.75rem; }
    .dashboard-flow-wide .dashboard-chart-empty { background: var(--surface-soft); border: 1px dashed var(--line); border-radius: var(--radius); grid-row: 1 / span 2; padding: 20px; }
    .dashboard-operations-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .dashboard-operations-grid .dashboard-widget-slot { min-width: 0; }
    .dashboard-operations-grid .dashboard-widget-slot > .dashboard-widget { height: 100%; }
    .dashboard-operations-grid .dashboard-widget { border: 1px solid var(--line); border-radius: var(--radius); gap: 12px; padding: 17px 18px; }
    .dashboard-operations-grid .dashboard-widget-head h2 { font-size: 1.025rem; }
    .dashboard-other-accounts { border-top: 1px solid var(--line); padding-top: 8px; }
    .dashboard-other-accounts summary { color: var(--primary); cursor: pointer; font-size: 0.8rem; font-weight: 650; }
    .dashboard-other-accounts .dashboard-compact-rows { margin-top: 6px; }
    .dashboard-card-spend-bars { display: grid; gap: 9px; }
    .dashboard-spend-visual-item { display: grid; gap: 5px; }
    .dashboard-spend-visual-item .dashboard-card-spend-row { border-top: 0; padding: 3px 0; }
    .dashboard-spend-visual-item .dashboard-bar-track { height: 10px; }
    .dashboard-spend-visual-item .dashboard-bar-track > span { background: #4361d0; }
    .dashboard-card-advice .dashboard-recommendation { border-color: #b7d9cd; background: linear-gradient(110deg, var(--surface-soft), var(--surface)); gap: 7px; }
    .dashboard-card-advice .dashboard-recommendation-name { font-size: 1.15rem; }
    .dashboard-card-advice .dashboard-recommendation-days { font-size: 2rem; }
    .dashboard-trend { align-items: end; display: flex; gap: 8px; min-height: 205px; overflow-x: auto; padding-top: 7px; }
    .dashboard-trend-item { align-items: center; display: flex; flex: 1 0 42px; flex-direction: column; gap: 5px; justify-content: flex-end; min-width: 42px; }
    .dashboard-trend-columns { align-items: end; border-bottom: 1px solid var(--line); display: flex; gap: 3px; height: 145px; justify-content: center; width: 100%; }
    .dashboard-trend-columns > span { border-radius: 4px 4px 0 0; display: block; flex: 1; height: 0; max-width: 24px; min-width: 6px; }
    .dashboard-trend-item > strong { font-size: 0.75rem; white-space: nowrap; }
    .dashboard-trend-item > small { color: var(--muted); font-size: 0.7rem; }
    .dashboard-trend-sr { clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
    .dashboard-trend-legend { display: flex; flex-wrap: wrap; gap: 16px; }
    .dashboard-trend-legend span { align-items: center; color: var(--muted); display: flex; font-size: 0.75rem; gap: 6px; }
    .dashboard-trend-legend i { border-radius: 2px; display: inline-block; height: 9px; width: 13px; }
    .dashboard-trend-legend i.dashboard-trend-income { background: #0d9488; }
    .dashboard-trend-legend i.dashboard-trend-expense { background: #e76276; }
    .dashboard-final-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .dashboard-final-grid > .panel { align-content: start; display: grid; gap: 12px; min-width: 0; padding: 16px 18px; }
    .dashboard-final-grid .row { padding: 9px 0; }
    .dashboard-additional-tools { border-top: 1px solid var(--line); color: var(--primary); padding: 10px 0; }
    .dashboard-additional-tools > summary { cursor: pointer; font-size: 0.82rem; font-weight: 700; }
    .dashboard-additional-tools[open] { display: grid; gap: 14px; }
    .dashboard-additional-tools .decision-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    @media (max-width: 1050px) {
      .dashboard-hero[data-dashboard-region="overview"] { grid-template-columns: minmax(0, 1fr); }
      .dashboard-header-controls { justify-content: flex-start; }
      .dashboard-primary-currencies .currency-summary .sf-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .dashboard-flow-wide .cash-flow-dashboard-metrics { grid-template-columns: minmax(0, 1.6fr) minmax(130px, 1fr); }
      .dashboard-flow-wide .dashboard-projection-chart { grid-row: 1 / span 3; }
    }
    @media (max-width: 760px) {
      .dashboard-hero[data-dashboard-region="overview"] { align-items: start; gap: 7px; padding-bottom: 8px; }
      .dashboard-header-controls { align-items: center; gap: 6px; }
      .dashboard-period-pill { background: transparent; border: 0; min-height: 28px; padding: 0; }
      .dashboard-period-pill span { display: none; }
      .dashboard-header-controls .data-quality { border-left: 1px solid var(--line); max-width: 100%; padding-left: 8px; }
      .dashboard-currency-filter { grid-template-columns: minmax(92px, 1fr) auto; min-width: 155px; }
      .dashboard-currency-filter select, .dashboard-currency-filter button { min-height: 34px; padding: 5px 8px; }
      .dashboard-primary-currencies .currency-summary .sf-summary-grid { display: grid; gap: 0; grid-template-columns: 1fr; }
      .dashboard-primary-currencies .dashboard-kpi[data-kpi="result"],
      .dashboard-primary-currencies .dashboard-kpi[data-kpi="payables"],
      .dashboard-primary-currencies .dashboard-kpi[data-kpi="cards"],
      .dashboard-primary-currencies .dashboard-kpi[data-kpi="minimum"] { display: none; }
      .dashboard-primary-currencies .dashboard-kpi[data-kpi="balance"],
      .dashboard-primary-currencies .dashboard-kpi[data-kpi="free"] { border-bottom: 1px solid var(--line); display: block; padding: 6px 10px; }
      .dashboard-primary-currencies .dashboard-kpi .sf-metric-card { background: transparent; border: 0; border-radius: 0; box-shadow: none; display: grid; grid-template-columns: minmax(0, 1fr) max-content; gap: 2px 8px; height: auto; min-height: 0; padding: 0; }
      .dashboard-primary-currencies .dashboard-kpi .sf-metric-card-label { align-self: baseline; font-size: 0.78rem; line-height: 1.35; }
      .dashboard-primary-currencies .dashboard-kpi .sf-metric-card-value { align-self: baseline; font-size: clamp(0.84rem, 3.6vw, 1.02rem); line-height: 1.3; overflow-wrap: normal; text-align: right; white-space: nowrap; }
      .dashboard-primary-currencies .dashboard-kpi .sf-metric-card-detail { grid-column: 1 / -1; }
      .dashboard-primary-currencies .dashboard-kpi .metric-drilldown { font-size: 0.72rem; margin-top: 2px; position: static; width: fit-content; }
      .dashboard-actions { gap: 8px; padding: 11px 12px; }
      .dashboard-actions .section-heading h2 { font-size: 0.93rem; }
      .dashboard-actions .next-action-rows { grid-template-columns: 1fr; gap: 6px; }
      .dashboard-actions .next-action-rows .next-action-row { align-items: start; display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; min-height: 53px; padding: 7px 9px; }
      .dashboard-actions .next-action-row > div { min-width: 0; }
      .dashboard-actions .next-action-row > div > span { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
      .dashboard-actions .next-action-row .button-link { justify-self: start; max-width: 100%; padding: 7px; white-space: normal; }
      .dashboard-mobile-additional { display: grid; gap: 7px; }
      .dashboard-mobile-additional > h2 { font-size: 0.9rem; margin: 0; }
      .dashboard-mobile-kpi-group { display: grid; gap: 5px; }
      .dashboard-mobile-currency { color: var(--muted); font-size: 0.75rem; }
      .dashboard-mobile-additional .dashboard-kpi-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .dashboard-mobile-additional .dashboard-kpi { border: 1px solid var(--line); border-radius: var(--radius); min-width: 0; padding: 11px; }
      .dashboard-mobile-additional .dashboard-kpi .sf-metric-card { background: none; border: 0; display: grid; gap: 5px; height: auto; min-height: 70px; padding: 0 0 21px; }
      .dashboard-mobile-additional .dashboard-kpi .sf-metric-card-label { color: var(--muted); font-size: 0.75rem; }
      .dashboard-mobile-additional .dashboard-kpi .sf-metric-card-value { font-size: 0.93rem; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; text-align: left; }
      .dashboard-mobile-additional .dashboard-kpi .sf-metric-card-detail { font-size: 0.7rem; }
      .dashboard-mobile-additional .dashboard-kpi .metric-drilldown { bottom: 8px; font-size: 0.7rem; left: 11px; }
      .dashboard-operations-grid, .dashboard-final-grid { grid-template-columns: 1fr; gap: 10px; }
      .dashboard-operations-grid .dashboard-widget { padding: 12px; }
      .dashboard-flow-wide { padding: 12px; }
      .dashboard-flow-wide .cash-flow-dashboard-metrics { display: grid; grid-template-columns: 1fr; }
      .dashboard-flow-wide .dashboard-projection-chart { grid-row: auto; }
      .dashboard-flow-wide .dashboard-projection-chart svg { height: 160px; }
      .dashboard-flow-wide .cash-flow-dashboard-metric + .cash-flow-dashboard-metric { border-left: 0; border-top: 1px solid var(--line); padding: 8px 0 0; }
      .dashboard-final-grid > .panel { padding: 12px; }
      .dashboard-trend { min-height: 180px; }
      .dashboard-trend-columns { height: 120px; }
      .dashboard-additional-tools .decision-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 390px) {
      .dashboard-currency-filter label { display: none; }
      .dashboard-header-controls .data-quality { font-size: 0.75rem; }
      .dashboard-mobile-additional .dashboard-kpi-grid { grid-template-columns: 1fr; }
      .dashboard-primary-currencies .dashboard-kpi .sf-metric-card-value { font-size: 0.81rem; }
      .dashboard-trend-item { min-width: 38px; }
    }

  `;
}
