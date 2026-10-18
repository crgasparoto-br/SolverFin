import { sharedShellStyles } from "./shared-styles.js";

export function reportPageStyles(): string {
  return `${sharedShellStyles()}
    main { display:grid; gap:18px; margin:0 auto; max-width:100%; min-width:0; padding:18px clamp(14px,2vw,28px); width:100%; }
    .reports-heading { align-items:center; display:flex; gap:12px; justify-content:space-between; }
    .reports-heading > div { display:grid; gap:4px; max-width:820px; }
    .readonly-pill { background:var(--primary-soft); border:1px solid #d4e6ec; border-radius:999px; color:var(--primary); font-size:.75rem; font-weight:700; padding:3px 10px; white-space:nowrap; }
    .report-view-tabs { border-bottom:1px solid var(--line); display:flex; flex-wrap:wrap; gap:14px; min-width:0; }
    .report-view-tabs a { border-bottom:2px solid transparent; color:var(--muted); font-size:.8125rem; font-weight:650; padding:10px 2px; text-decoration:none; }
    .report-view-tabs a[aria-current="page"] { border-bottom-color:var(--primary); color:var(--primary); }
    .report-filter-panel { box-shadow:none; min-width:0; padding:12px 16px; }
    .report-filters { align-items:end; display:grid; gap:12px; min-width:0; }
    .report-filters label { display:grid; gap:5px; min-width:0; }
    .report-filters input,.report-filters select { box-sizing:border-box; min-height:40px; min-width:0; width:100%; }
    .report-filters button[type="submit"] { min-height:40px; white-space:nowrap; }
    .report-view-tabs a:focus-visible,.interval-switcher a:focus-visible,.report-retry:focus-visible { border-radius:3px; outline:3px solid color-mix(in srgb,var(--primary) 40%,transparent); outline-offset:3px; }
    .evolution-filters { grid-template-columns:minmax(12rem,1.2fr) minmax(11rem,1fr) minmax(10rem,.8fr) minmax(8rem,.55fr) auto; }
    .installment-filters { grid-template-columns:minmax(9rem,.8fr) minmax(9rem,.8fr) minmax(11rem,1fr) minmax(11rem,1fr) auto; }
    .cash-flow-filters { grid-template-columns:minmax(12rem,1fr) minmax(10rem,.7fr) auto; }
    .cash-flow-report-list { display:grid; gap:20px; }
    .cash-flow-summary-grid { display:grid; gap:10px; grid-template-columns:repeat(2,minmax(0,1fr)); }
    .cash-flow-table { border-collapse:separate; border-spacing:0; min-width:760px; width:100%; }
    .cash-flow-table th,.cash-flow-table td { background:var(--surface); border-bottom:1px solid var(--line); padding:9px 10px; text-align:right; vertical-align:top; }
    .cash-flow-table th:first-child,.cash-flow-table td:last-child { text-align:left; }
    .cash-flow-table thead th { background:var(--surface-strong,#f8fafc); font-size:.6875rem; position:sticky; top:0; z-index:2; }
    .cash-flow-evidence-cell { min-width:15rem; white-space:normal; }
    .cash-flow-evidence { align-items:start; display:grid; gap:3px; grid-template-columns:minmax(0,1fr) auto; padding:4px 0; }
    .cash-flow-evidence + .cash-flow-evidence { border-top:1px dashed var(--line); margin-top:4px; padding-top:8px; }
    .cash-flow-evidence > span { display:grid; gap:2px; }
    .cash-flow-evidence small { color:var(--muted); font-size:.6875rem; }
    .filter-hint { color:var(--muted); font-size:.75rem; margin-top:8px; }
    .filter-invalid-value { color:var(--danger,#b91c1c); font-size:.75rem; margin:2px 0 0; width:100%; }
    .filter-invalid-value code { font:inherit; font-weight:700; }
    .interval-switcher { align-items:center; border:0; display:flex; flex-wrap:wrap; gap:5px; margin:0; min-width:0; padding:0; }
    .interval-switcher legend { color:var(--text); font-size:.8125rem; font-weight:700; margin-bottom:5px; width:100%; }
    .interval-switcher a { border:1px solid var(--line); border-radius:999px; color:var(--text); font-size:.75rem; font-weight:700; padding:7px 10px; text-decoration:none; }
    .interval-switcher a[aria-current="page"] { background:var(--primary); border-color:var(--primary); color:#fff; }
    .report-state { display:grid; gap:4px; }
    .report-state-filter-error,.report-state-api-error { border-color:#fecaca; }
    .currency-report-list { display:grid; gap:24px; min-width:0; }
    .report-analysis-block { display:grid; gap:18px; min-width:0; padding:0 0 20px; }
    .report-analysis-block + .report-analysis-block { border-top:1px solid var(--line); padding-top:22px; }
    .report-analysis-heading { align-items:end; border-bottom:1px solid var(--line); display:flex; gap:12px; justify-content:space-between; padding-bottom:12px; }
    .report-analysis-heading h2 { font-size:1.35rem; letter-spacing:-.025em; }
    .report-analysis-heading .muted { overflow-wrap:anywhere; }
    .report-analysis-heading > div,.report-layer-heading { display:grid; gap:3px; }
    .report-analysis-heading > span { color:var(--muted); font-size:.75rem; font-weight:600; white-space:normal; }
    .report-analysis-layer { display:grid; gap:10px; min-width:0; }
    .report-analysis-layer > .sf-summary-grid { display:grid; gap:10px; grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr)); }
    .report-visual-legend { color:var(--muted); font-size:.75rem; line-height:1.55; margin:0; }
    .report-retry { align-items:center; border:1px solid var(--line); border-radius:8px; color:var(--primary); display:inline-flex; font-weight:700; justify-self:start; margin-top:6px; padding:8px 12px; text-decoration:none; }
    .report-retry:hover { background:var(--primary-soft); }
    .report-layer-heading h3 { font-size:1rem; margin:0; }
    .report-layer-heading .eyebrow { margin:0; }
    .report-summary-metric { border-left:2px solid var(--line); display:grid; gap:4px; min-width:0; overflow-wrap:anywhere; padding:8px 12px; }
    .report-summary-metric[data-emphasis="true"] { background:var(--primary-soft); border-left:3px solid var(--primary); border-radius:0 8px 8px 0; }
    .report-summary-metric[data-emphasis="true"] > strong { color:var(--text); font-size:1.35rem; font-variant-numeric:tabular-nums; }
    .report-summary-metric[data-tone="positive"] { border-left-color:var(--success); }
    .report-summary-metric[data-tone="negative"] { border-left-color:var(--danger); }
    .report-summary-metric[data-tone="attention"] { border-left-color:var(--warning); }
    .report-summary-metric[data-tone="information"] { border-left-color:var(--primary); }
    .report-summary-metric > span { color:var(--muted); font-size:.75rem; font-weight:700; }
    .report-summary-metric > strong { font-size:1.05rem; min-width:0; }
    .report-summary-secondary { color:var(--muted); font-size:.8125rem; }
    .report-summary-secondary .sf-money { font-size:.8125rem; }
    .report-trend { display:grid; gap:0; grid-auto-columns:minmax(9.5rem,1fr); grid-auto-flow:column; list-style:none; margin:0; max-width:100%; overflow-x:auto; padding:2px 0 8px; scrollbar-gutter:stable; }
    .report-trend:focus-visible { border-radius:3px; outline:3px solid color-mix(in srgb,var(--primary) 40%,transparent); outline-offset:2px; }
    .report-trend-point { border-right:1px solid var(--line); display:grid; gap:8px; min-width:0; padding:8px 12px; }
    .report-trend-point:first-child { padding-left:0; }
    .report-trend-point:last-child { border-right:0; }
    .report-trend-copy { display:grid; gap:3px; min-width:0; }
    .report-trend-copy > span:first-child { color:var(--muted); font-size:.75rem; font-weight:700; }
    .report-trend-copy strong { font-size:.875rem; min-width:0; }
    .report-trend-track { background:var(--surface-strong,#f8fafc); border-radius:999px; height:6px; overflow:hidden; }
    .report-trend-bar { background:var(--primary); display:block; height:100%; width:var(--report-trend-size); }
    .report-trend-point[data-sign="negative"] .report-trend-bar { background:var(--danger); }
    .report-trend-point[data-sign="neutral"] .report-trend-bar { background:var(--muted); }
    .report-highlights-grid { display:grid; gap:10px; grid-template-columns:repeat(2,minmax(0,1fr)); }
    .report-highlight { border-left:3px solid var(--primary); display:grid; gap:3px; min-width:0; padding:6px 10px; }
    .report-highlight > span { color:var(--muted); font-size:.75rem; font-weight:700; }
    .report-highlight > strong { font-size:.875rem; }
    .report-detail-layer { border-top:1px solid var(--line); padding-top:14px; }
    .evolution-block { min-width:0; }
    .evolution-table-scroll { border:1px solid var(--line); border-radius:8px; max-width:100%; min-width:0; overflow:auto; overscroll-behavior-x:contain; }
    .evolution-table-scroll:focus-visible { outline:3px solid color-mix(in srgb,var(--primary) 35%,transparent); outline-offset:2px; }
    .evolution-table { border-collapse:separate; border-spacing:0; min-width:max(920px,100%); width:100%; }
    .evolution-table th,.evolution-table td { background:var(--surface); border-bottom:1px solid var(--line); padding:8px 10px; text-align:right; vertical-align:middle; white-space:nowrap; }
    .evolution-table thead th { background:var(--surface-strong,#f8fafc); font-size:.6875rem; position:sticky; top:0; z-index:3; }
    .evolution-table .sticky-description { left:0; min-width:15rem; position:sticky; text-align:left; z-index:2; }
    .evolution-table thead .sticky-description { z-index:4; }
    .evolution-table tbody th { padding-left:calc(10px + var(--report-depth,0) * 18px); }
    .evolution-table tbody th > span:not(.report-category-label) { display:block; }
    .report-category-label { align-items:center; display:flex; gap:6px; min-width:0; }
    .report-category-label > span:last-child { display:block; overflow-wrap:anywhere; white-space:normal; }
    .category-tree-toggle { align-items:center; background:transparent; border:1px solid transparent; border-radius:5px; color:var(--text); display:inline-flex; flex:0 0 24px; font:inherit; height:24px; justify-content:center; padding:0; width:24px; }
    .category-tree-toggle:hover { background:var(--primary-soft); border-color:var(--line); }
    .category-tree-toggle:focus-visible { outline:3px solid color-mix(in srgb,var(--primary) 35%,transparent); outline-offset:1px; }
    .category-tree-spacer { display:inline-block; flex:0 0 24px; height:24px; width:24px; }
    .evolution-table tbody th small { color:var(--muted); display:block; font-size:.6875rem; font-weight:500; margin-left:30px; }
    .evolution-table td strong { display:block; font-size:.8125rem; }
    .evolution-table td span { color:var(--muted); display:block; font-size:.6875rem; margin-top:2px; }
    .evolution-table td .sf-money { display:inline-flex; gap:4px; justify-content:flex-end; }
    .evolution-table td .sf-money span,.evolution-table td .sf-money small { display:inline; margin:0; }
    .report-section-row th,.report-section-row td { background:var(--primary-soft); font-weight:700; }
    .report-row-result th,.report-row-result td { border-top:2px solid var(--primary); }
    .report-value-negative strong,.report-value-negative span { color:var(--danger); }
    .summary-grid { display:grid; gap:8px; grid-template-columns:repeat(5,minmax(0,1fr)); }
    .metric-card { display:grid; gap:5px; min-width:0; padding:10px 12px; }
    .metric-card span { color:var(--muted); font-size:.6875rem; font-weight:700; text-transform:uppercase; }
    .metric-card strong { color:var(--primary); font-size:1.25rem; }
    .metric-card p { color:var(--muted); font-size:.8125rem; }
    .metric-primary { background:var(--primary); border-color:var(--primary); }
    .metric-primary span,.metric-primary strong,.metric-primary p { color:#fff; }
    .metric-warning { background:var(--warning-bg); border-color:#fde68a; }
    .metric-warning strong,.metric-warning p { color:var(--warning); }
    .report-grid { align-items:start; display:grid; gap:18px; grid-template-columns:repeat(3,minmax(0,1fr)); }
    .report-results { background:transparent; border:0; box-shadow:none; min-width:0; padding:0; }
    .report-results .section-heading { border-bottom:1px solid var(--line); padding-bottom:8px; }
    .report-results .section-heading h4 { font-size:.875rem; margin:0; }
    .report-results .section-heading > span { background:transparent; color:var(--muted); padding:0; }
    .section-heading { align-items:center; display:flex; gap:10px; justify-content:space-between; }
    .section-heading > div { display:grid; gap:3px; }
    .section-heading > span { background:var(--primary-soft); border-radius:999px; color:var(--primary); font-size:.6875rem; font-weight:700; padding:2px 7px; white-space:nowrap; }
    .aggregate-list { display:grid; gap:0; }
    .aggregate-row { align-items:center; border-top:1px solid var(--line); display:flex; gap:10px; justify-content:space-between; padding:8px 0; }
    .aggregate-row:first-child { border-top:0; }
    .aggregate-copy { display:grid; gap:3px; min-width:0; width:100%; }
    .aggregate-row span { color:var(--muted); font-size:.8125rem; }
    .aggregate-row > strong { font-size:.875rem; white-space:nowrap; }
    .aggregate-bar { background:var(--surface-strong,#f8fafc); border-radius:999px; display:block; height:4px; overflow:hidden; width:100%; }
    .aggregate-bar > span { background:var(--primary); display:block; height:100%; width:var(--aggregate-size); }
    .report-detail-count { justify-content:flex-end; }
    .report-detail-layer .sf-table-wrap { max-width:100%; overflow-x:auto; }
    .report-detail-layer .sf-table { min-width:860px; }
    .report-detail-layer th,.report-detail-layer td { font-variant-numeric:tabular-nums; }
    .report-detail-layer .sf-table td:nth-child(3),.report-detail-layer .sf-table td:nth-child(4),.report-detail-layer .sf-table td:nth-child(5) { overflow-wrap:anywhere; white-space:normal; }
    .report-detail-layer .sf-table td[data-align="end"] { white-space:nowrap; }
    .installment-table { display:grid; max-width:100%; min-width:0; overflow-x:auto; overscroll-behavior-x:contain; }
    .cash-flow-evidence > span { min-width:0; overflow-wrap:anywhere; }
    .installment-table-head,.installment-table-row { align-items:center; border-bottom:1px solid var(--line); display:grid; gap:10px; grid-template-columns:6rem 4rem minmax(11rem,1.2fr) minmax(8rem,1fr) minmax(8rem,1fr) minmax(9rem,1fr) 7rem; min-width:860px; padding:8px 0; }
    .installment-table-head { color:var(--muted); font-size:.6875rem; font-weight:700; text-transform:uppercase; }
    .installment-table-row:last-child { border-bottom:0; }
    .installment-table-row time,.installment-table-row span { color:var(--muted); font-size:.8125rem; }
    .installment-table-row strong:last-child { text-align:right; white-space:nowrap; }
    .sr-only { clip:rect(0 0 0 0); clip-path:inset(50%); height:1px; overflow:hidden; position:absolute; white-space:nowrap; width:1px; }
    @media(max-width:1180px){.evolution-filters,.installment-filters,.cash-flow-filters{grid-template-columns:repeat(2,minmax(0,1fr));}.report-filters button[type="submit"]{grid-column:1/-1;}.summary-grid{grid-template-columns:repeat(3,minmax(0,1fr));}.report-grid{grid-template-columns:1fr 1fr;}}
    @media(max-width:760px){main{padding:14px 14px 24px;}.reports-heading,.section-heading,.report-analysis-heading{align-items:stretch;display:grid;}.report-filters,.summary-grid,.report-grid,.report-highlights-grid,.cash-flow-summary-grid{grid-template-columns:1fr;}.readonly-pill,.report-analysis-heading>span{justify-self:start;}.evolution-table .sticky-description{min-width:12rem;}.report-analysis-block{padding:0 0 16px;}.report-trend{grid-auto-columns:minmax(10rem,72%);}.report-view-tabs{gap:10px;}}
    @media(max-width:440px){.report-trend{grid-auto-columns:minmax(9rem,84%);}}
  `;
}
