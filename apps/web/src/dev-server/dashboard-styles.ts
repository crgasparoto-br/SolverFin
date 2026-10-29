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
  `;
}
