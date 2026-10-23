import { sharedShellStyles } from "./shared-styles.js";

export function reportPageStyles(): string {
  return `${sharedShellStyles()}
    main { display:grid; gap:16px; grid-template-columns:minmax(0,1fr); margin:0 auto; max-width:100%; min-width:0; overflow-x:clip; padding:18px clamp(14px,2vw,28px) 28px; width:100%; }
    .main-area { max-width:100%; min-width:0; overflow-x:clip; }
    .reports-heading { align-items:start; display:flex; flex-wrap:wrap; gap:10px 16px; justify-content:space-between; min-width:0; }
    .reports-heading > div { display:grid; gap:4px; max-width:820px; min-width:0; }
    .reports-heading h1 { letter-spacing:-.025em; }
    .reports-heading .muted { font-size:var(--sf-font-size-sm); overflow-wrap:anywhere; }
    .readonly-pill { background:var(--surface); border:1px solid var(--line); border-radius:var(--sf-radius-full); color:var(--muted); font-size:var(--sf-font-size-xs); font-weight:600; padding:5px 10px; white-space:nowrap; }
    .report-view-tabs { border-bottom:1px solid var(--line); display:flex; flex-wrap:wrap; gap:6px 18px; min-width:0; }
    .report-view-tabs a { border-bottom:2px solid transparent; color:var(--muted); font-size:var(--sf-font-size-sm); font-weight:600; min-height:var(--sf-density-interactive-target-min); padding:11px 5px 9px; text-decoration:none; transition:color var(--sf-motion-fast),border-color var(--sf-motion-fast); } 
    .report-view-tabs a:hover { color:var(--primary); }
    .report-view-tabs a[aria-current="page"] { border-bottom-color:var(--primary); color:var(--primary); }
    .report-filter-panel { background:var(--surface); border:1px solid var(--line); border-radius:var(--sf-radius-lg); box-shadow:none; min-width:0; padding:12px 14px; }
    .report-filter-panel:focus-within { border-color:var(--sf-color-neutral-control-border-hover); }
    .report-filters { align-items:end; display:grid; gap:10px; min-width:0; }
    .report-filters label { display:grid; gap:5px; min-width:0; }
    .report-filters input,.report-filters select { background:var(--surface); border:1px solid var(--sf-color-border); border-radius:var(--sf-radius-md); box-sizing:border-box; min-height:var(--sf-density-interactive-target-min); min-width:0; width:100%; }
    .report-filters input:hover:not(:disabled),.report-filters select:hover:not(:disabled) { border-color:var(--sf-color-neutral-control-border-hover); }
    .report-filters [aria-invalid="true"] { border-color:var(--danger); }
    .report-filters button[type="submit"] { min-height:var(--sf-density-interactive-target-min); white-space:nowrap; }
    .report-filters button.sf-button-primary { border-radius:var(--sf-radius-md); }
    .report-filters button.sf-button-primary:focus-visible { box-shadow:var(--shadow-focus); }
    .report-view-tabs a:focus-visible,.interval-switcher a:focus-visible,.report-retry:focus-visible { border-radius:3px; outline:3px solid color-mix(in srgb,var(--primary) 40%,transparent); outline-offset:3px; }
    .evolution-filters { grid-template-columns:minmax(12rem,1.35fr) minmax(11rem,1.25fr) minmax(9rem,1fr) minmax(6rem,.55fr) minmax(9rem,.8fr) auto; }
    .installment-filters { grid-template-columns:minmax(8rem,.8fr) minmax(8rem,.8fr) minmax(10rem,1fr) minmax(10rem,1fr) minmax(9rem,.8fr) auto; }
    .cash-flow-filters { grid-template-columns:minmax(12rem,1fr) minmax(10rem,.7fr) minmax(9rem,.7fr) auto; }
    .cash-flow-report-list { display:grid; gap:20px; }
    .cash-flow-summary-grid { display:grid; gap:10px; grid-template-columns:repeat(2,minmax(0,1fr)); }
    .cash-flow-table { border-collapse:collapse; font-variant-numeric:tabular-nums; min-width:760px; table-layout:fixed; width:100%; }
    .cash-flow-table .cash-flow-col-date { width:15%; }
    .cash-flow-table .cash-flow-col-movement { width:20%; }
    .cash-flow-table .cash-flow-col-balance { width:20%; }
    .cash-flow-table .cash-flow-col-evidence { width:45%; }
    .cash-flow-table th,.cash-flow-table td { background:var(--surface); border-bottom:1px solid var(--line); font-size:var(--sf-font-size-sm); line-height:1.25; padding:5px 10px; text-align:right; vertical-align:middle; }
    .cash-flow-table th:first-child,.cash-flow-table td:last-child { text-align:left; }
    .cash-flow-table tbody th { font-weight:600; white-space:nowrap; }
    .cash-flow-table tbody tr:hover > th,.cash-flow-table tbody tr:hover > td { background:var(--sf-color-neutral-control-hover); }
    .cash-flow-table td:nth-child(2),.cash-flow-table td:nth-child(3),.cash-flow-table .sf-money { white-space:nowrap; }
    .cash-flow-table thead th { background:var(--surface-strong,#f8fafc); font-size:var(--sf-font-size-xs); font-weight:700; position:sticky; top:0; white-space:nowrap; z-index:2; }
    .cash-flow-evidence-cell { min-width:0; white-space:normal; }
    .cash-flow-evidence { align-items:center; display:flex; flex-wrap:wrap; gap:2px 10px; min-width:0; padding:0; }
    .cash-flow-evidence + .cash-flow-evidence { border-top:1px dashed var(--line); margin-top:4px; padding-top:4px; }
    .cash-flow-evidence-main { align-items:baseline; display:inline-flex; flex-wrap:wrap; gap:2px 8px; min-width:0; overflow-wrap:break-word; }
    .cash-flow-evidence-main strong { font-size:var(--sf-font-size-sm); font-weight:600; }
    .cash-flow-evidence > .text-link { margin-left:auto; white-space:nowrap; }
    .cash-flow-evidence small { color:var(--muted); font-size:var(--sf-font-size-xs); white-space:nowrap; }
    .filter-hint { color:var(--muted); font-size:.75rem; margin-top:8px; }
    .filter-invalid-value { color:var(--danger,#b91c1c); font-size:.75rem; margin:2px 0 0; width:100%; }
    .filter-invalid-value code { font:inherit; font-weight:700; }
    .interval-switcher { align-items:center; border:0; display:flex; flex-wrap:wrap; gap:5px; margin:0; min-width:0; padding:0; }
    .interval-switcher legend { color:var(--text); font-size:.8125rem; font-weight:700; margin-bottom:5px; width:100%; }
    .interval-switcher a { background:var(--surface); border:1px solid var(--sf-color-border); border-radius:var(--sf-radius-md); color:var(--primary); display:inline-flex; align-items:center; font-size:var(--sf-font-size-xs); font-weight:650; min-height:36px; padding:6px 10px; text-decoration:none; transition:background var(--sf-motion-fast),border-color var(--sf-motion-fast); }
    .interval-switcher a:hover { background:var(--sf-color-neutral-control-hover); border-color:var(--sf-color-neutral-control-border-hover); }
    .interval-switcher a[aria-current="page"],.interval-switcher a[aria-current="page"]:hover { background:var(--sf-color-neutral-control-active-hover); border-color:var(--sf-color-neutral-control-border-hover); color:var(--sf-color-neutral-control-text-hover); }
    .report-state { display:grid; gap:4px; }
    .report-state-filter-error,.report-state-api-error { border-color:#fecaca; }
    .currency-report-list { display:grid; gap:24px; grid-template-columns:minmax(0,1fr); min-width:0; overflow-x:clip; width:100%; }
    .report-analysis-block { display:grid; gap:16px; grid-template-columns:minmax(0,1fr); min-width:0; padding:0 0 18px; }
    .report-analysis-block + .report-analysis-block { border-top:1px solid var(--line); padding-top:22px; }
    .report-layer-heading { display:grid; gap:3px; }
    .report-analysis-layer { display:grid; gap:10px; grid-template-columns:minmax(0,1fr); min-width:0; }
    .report-layer-topline { align-items:end; display:flex; gap:12px; justify-content:space-between; min-width:0; }
    .report-layer-topline .report-layer-heading { min-width:0; }
    .report-layer-topline h2 { font-size:1rem; line-height:1.35; margin:0; }
    .report-period-count { color:var(--muted); flex-shrink:0; font-size:.75rem; font-weight:600; white-space:nowrap; }
    /* Cada secao da moeda possui um titulo explicito. Repetir o codigo em cada valor
       nao ajuda a leitura e aumenta a largura das grades; preserve Money e o simbolo. */
    .currency-report-list .sf-money .sf-money-currency,.cash-flow-report-list .sf-money .sf-money-currency { display:none; }
    .report-analysis-layer > .sf-summary-grid:not(.summary-grid) { display:grid; gap:10px; grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr)); }
    .report-visual-legend { color:var(--muted); font-size:.75rem; line-height:1.55; margin:0; }
    .report-retry { align-items:center; border:1px solid var(--line); border-radius:8px; color:var(--primary); display:inline-flex; font-weight:700; justify-self:start; margin-top:6px; padding:8px 12px; text-decoration:none; }
    .report-retry:hover { background:var(--primary-soft); }
    .report-layer-heading h3 { font-size:1rem; margin:0; }
    .report-layer-heading .eyebrow { margin:0; }
    .report-summary-metric { background:var(--surface); border:1px solid var(--line); border-top:2px solid var(--sf-color-border); border-radius:var(--sf-radius-lg); display:grid; gap:5px; min-width:0; overflow-wrap:anywhere; padding:11px 12px; }
    .report-summary-metric[data-emphasis="true"] { background:var(--primary-soft); border-color:var(--sf-color-neutral-control-border-hover); border-top:2px solid var(--primary); }
    .report-summary-metric[data-emphasis="true"] > strong { color:var(--text); font-size:1.35rem; font-variant-numeric:tabular-nums; }
    .report-summary-metric[data-tone="positive"] { border-top-color:var(--success); }
    .report-summary-metric[data-tone="negative"] { border-top-color:var(--danger); }
    .report-summary-metric[data-tone="attention"] { border-top-color:var(--warning); }
    .report-summary-metric[data-tone="information"] { border-top-color:var(--primary); }
    .report-summary-metric > span { color:var(--muted); font-size:.75rem; font-weight:700; }
    .report-summary-metric > strong { font-size:1.05rem; min-width:0; }
    .report-summary-secondary { color:var(--muted); font-size:.8125rem; }
    .report-summary-secondary .sf-money { font-size:.8125rem; }
    .report-trend { contain:inline-size; display:grid; gap:0; grid-auto-columns:minmax(12rem,1fr); grid-auto-flow:column; list-style:none; margin:0; max-width:100%; min-width:0; overflow-x:auto; overscroll-behavior-x:contain; padding:2px 0 8px; scrollbar-gutter:stable; width:100%; }
    .report-analysis-layer[data-analysis-layer="visualization"] { container-type:inline-size; }
    /* Apenas Evolucao por categoria distribui todos os periodos sem barra horizontal. */
    .report-trend-grid { grid-auto-columns:auto; grid-auto-flow:row; grid-template-columns:repeat(auto-fit,minmax(min(100%,9rem),1fr)); overflow-x:visible; padding:0; scrollbar-gutter:auto; }
    .report-trend-grid .report-trend-point { border-right:0; border-bottom:1px solid var(--line); gap:6px; padding:7px 10px; }
    .report-trend-grid .report-trend-point:first-child { padding-left:10px; }
    .report-trend-grid .report-trend-track { align-self:end; }
    .report-trend-grid .report-trend-copy strong { font-size:.75rem; }
    /* Na largura que comporta os valores completos, 12 meses ocupam uma unica linha.
       O fallback auto-fit e mantido no tablet/mobile, evitando overflow e truncamento. */
    @container (min-width:1120px) {
      .report-trend-grid { grid-template-columns:repeat(var(--report-trend-columns),minmax(0,1fr)); }
      .report-trend-grid .report-trend-point { padding:6px 6px; }
      .report-trend-grid .report-trend-copy strong { font-size:.6875rem; overflow-wrap:normal; white-space:nowrap; }
    }
    .report-trend-grid .report-trend-copy .sf-money { flex-wrap:nowrap; }
    .report-trend-grid .report-trend-copy .sf-money-value { overflow-wrap:normal; white-space:nowrap; word-break:normal; }
    .report-trend:focus-visible { border-radius:3px; outline:3px solid color-mix(in srgb,var(--primary) 40%,transparent); outline-offset:2px; }
    .report-trend-point { border-right:1px solid var(--line); display:grid; gap:7px; min-width:0; padding:8px 12px; }
    .report-trend-point:first-child { padding-left:0; }
    .report-trend-point:last-child { border-right:0; }
    .report-trend-copy { display:grid; gap:3px; min-width:0; }
    .report-trend-copy > span:first-child { color:var(--muted); font-size:.75rem; font-weight:700; }
    .report-trend-copy strong { font-size:.875rem; max-width:100%; min-width:0; overflow-wrap:anywhere; }
    .report-trend-copy .sf-money { display:inline-flex; flex-wrap:wrap; gap:4px; max-width:100%; min-width:0; }
    .report-trend-copy .sf-money-value { min-width:0; overflow-wrap:anywhere; word-break:break-word; }
    .report-trend-track { background:var(--surface-strong,#f8fafc); border-radius:999px; height:6px; overflow:hidden; }
    .report-trend-bar { background:var(--primary); display:block; height:100%; width:var(--report-trend-size); }
    .report-trend-point[data-sign="negative"] .report-trend-bar { background:var(--danger); }
    .report-trend-point[data-sign="neutral"] .report-trend-bar { background:var(--muted); }
    .report-highlights-grid { align-items:start; display:grid; gap:8px; grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr)); min-width:0; }
    .report-highlights-grid > .sf-alert { align-items:start; background:transparent; border:0; border-left:2px solid var(--sf-state-border); border-radius:0; column-gap:8px; font-size:var(--sf-font-size-sm); min-width:0; padding:5px 10px; }
    .report-highlights-grid .sf-alert-content { gap:2px; }
    .report-highlights-grid .sf-alert-content strong { font-size:var(--sf-font-size-sm); line-height:1.3; }
    .report-highlights-grid .sf-alert-description { color:var(--muted); font-size:var(--sf-font-size-xs); line-height:1.35; }
    .report-highlight { border-left:2px solid var(--primary); display:grid; gap:2px; min-width:0; padding:5px 10px; }
    .report-highlight .sf-money { font-size:var(--sf-font-size-sm); }
    .report-highlight > span { color:var(--muted); font-size:.75rem; font-weight:700; }
    .report-highlight > strong { font-size:.875rem; }
    .report-detail-layer { border-top:1px solid var(--line); padding-top:14px; }
    .evolution-block { min-width:0; width:100%; }
    .evolution-table-scroll { border:1px solid var(--line); border-radius:8px; max-width:100%; min-width:0; overflow:auto; overscroll-behavior-x:contain; width:100%; }
    .evolution-table-scroll:focus-visible { outline:3px solid color-mix(in srgb,var(--primary) 35%,transparent); outline-offset:2px; }
    .evolution-table { border-collapse:separate; border-spacing:0; min-width:max(920px,100%); width:100%; }
    .evolution-table th,.evolution-table td { background:var(--surface); border-bottom:1px solid var(--line); font-variant-numeric:tabular-nums; line-height:1.25; padding:3px 8px; text-align:right; vertical-align:middle; white-space:nowrap; }
    .evolution-table thead th { background:var(--surface-strong,#f8fafc); font-size:.6875rem; position:sticky; top:0; z-index:3; }
    .evolution-table .sticky-description { font-size:.75rem; left:0; min-width:15rem; position:sticky; text-align:left; white-space:nowrap; z-index:2; }
    .evolution-table thead .sticky-description { z-index:4; }
    .evolution-table tbody th { padding-left:calc(8px + var(--report-depth,0) * 16px); }
    .evolution-table tbody th > span:not(.report-category-label) { display:block; }
    .report-category-label { align-items:center; display:flex; gap:6px; min-width:0; }
    .report-category-label > span:last-child { display:block; font-size:.75rem; overflow-wrap:normal; white-space:nowrap; }
    .category-tree-toggle { align-items:center; background:transparent; border:1px solid transparent; border-radius:5px; color:var(--sf-color-primary); display:inline-flex; flex:0 0 24px; font:inherit; height:24px; justify-content:center; padding:0; transition:background var(--sf-motion-fast),border-color var(--sf-motion-fast),color var(--sf-motion-fast); width:24px; }
    /* Mais especifico que button:hover:not(:disabled) do shell: hover nunca vira azul escuro. */
    .evolution-table button.category-tree-toggle:hover:not(:disabled) { background:var(--sf-color-neutral-control-hover); border-color:var(--sf-color-neutral-control-border-hover); color:var(--sf-color-neutral-control-text-hover); }
    .evolution-table button.category-tree-toggle:active:not(:disabled) { background:var(--sf-color-neutral-control-active-hover); border-color:var(--sf-color-neutral-control-border-hover); color:var(--sf-color-neutral-control-text-hover); }
    .evolution-table button.category-tree-toggle:focus-visible { background:var(--sf-color-neutral-control-hover); border-color:var(--sf-color-neutral-control-border-hover); color:var(--sf-color-neutral-control-text-hover); outline:2px solid var(--sf-color-primary); outline-offset:2px; }
    .category-tree-spacer { display:inline-block; flex:0 0 24px; height:24px; width:24px; }
    .evolution-table tbody th small { color:var(--muted); display:inline; font-size:.6875rem; font-weight:500; margin-left:6px; }
    .evolution-table td strong { display:inline; font-size:.75rem; }
    .evolution-table td > span { color:var(--muted); display:inline-block; font-size:.6875rem; margin:0 0 0 6px; vertical-align:baseline; white-space:nowrap; }
    .evolution-table td .sf-money { display:inline-flex; gap:4px; justify-content:flex-end; white-space:nowrap; }
    .evolution-table td .sf-money span,.evolution-table td .sf-money small { display:inline; margin:0; }
    .report-section-row th,.report-section-row td { background:var(--primary-soft); font-weight:700; }
    .report-row-result th,.report-row-result td { border-top:2px solid var(--primary); }
    .report-value-negative strong,.report-value-negative span { color:var(--danger); }
    .summary-grid { display:grid; gap:8px; grid-template-columns:repeat(5,minmax(0,1fr)); }
    .metric-card { display:grid; gap:5px; min-width:0; padding:10px 12px; }
    .metric-card span { color:var(--muted); font-size:.6875rem; font-weight:700; text-transform:uppercase; }
    .metric-card strong { color:var(--primary); font-size:1.25rem; }
    /* Os cards resumem informacoes decisivas; rotulos e valores seguem a hierarquia do Extrato. */
    .summary-grid .report-summary-metric > span { font-size:var(--sf-font-size-sm); text-transform:none; }
    .summary-grid .report-summary-metric > strong { color:var(--text); font-size:1.125rem; }
    .report-summary-metric[data-tone="positive"] > strong { color:var(--success); }
    .report-summary-metric[data-tone="negative"] > strong { color:var(--danger); }
    .report-summary-metric[data-emphasis="true"] > strong { font-size:1.25rem; }
    .metric-card p { color:var(--muted); font-size:.8125rem; }
    .metric-primary { background:var(--primary-soft); border-color:var(--sf-color-neutral-control-border-hover); }
    .metric-primary span,.metric-primary strong,.metric-primary p { color:var(--primary); }
    .metric-warning { background:var(--warning-bg); border-color:#fde68a; }
    .metric-warning strong,.metric-warning p { color:var(--warning); }
    .report-results { background:transparent; border:0; box-shadow:none; min-width:0; padding:0; }
    .report-results .section-heading { border-bottom:1px solid var(--line); padding-bottom:8px; }
    .report-results .section-heading h2 { font-size:.875rem; margin:0; }
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
    /* Indicadores de parcelas: uma faixa comparavel, nao cinco cards altos. */
    .sf-summary-grid.summary-grid.installment-summary-grid { background:var(--surface); border:1px solid var(--line); border-radius:var(--sf-radius-lg); display:grid; gap:0; grid-template-columns:repeat(5,minmax(0,1fr)); overflow:hidden; }
    .installment-summary-grid .installment-summary-metric { background:transparent; border:0; border-right:1px solid var(--line); border-radius:0; box-shadow:none; display:grid; gap:3px 8px; grid-template-columns:minmax(0,1fr) auto; grid-template-rows:auto auto; min-width:0; padding:8px 12px; }
    .installment-summary-grid .installment-summary-metric:last-child { border-right:0; }
    .installment-summary-grid .installment-summary-metric > span { grid-column:1/-1; white-space:normal; }
    .installment-summary-grid .installment-summary-metric > strong { align-self:end; font-size:1rem; grid-column:1; min-width:0; }
    .installment-summary-grid .installment-summary-metric .report-summary-secondary { align-self:end; grid-column:2; white-space:nowrap; }
    .installment-summary-grid .installment-summary-metric .report-summary-secondary .sf-money { font-size:.75rem; white-space:nowrap; }
    .installment-summary-grid .installment-summary-metric[data-emphasis="true"] { background:var(--primary-soft); border-top:0; }
    /* Agrupamentos: contexto mensal compacto, rankings comparaveis lado a lado. */
    .installment-distribution { display:grid; gap:12px; min-width:0; }
    .installment-month-strip { align-items:center; background:var(--surface-soft); border:1px solid var(--line); border-radius:var(--sf-radius-md); display:grid; gap:14px; grid-template-columns:auto minmax(0,1fr); min-width:0; padding:7px 12px; }
    .installment-month-strip .section-heading { white-space:nowrap; }
    .installment-month-strip .section-heading h2 { font-size:.8125rem; margin:0; }
    .installment-month-strip .aggregate-row { border:0; padding:0; }
    .installment-month-strip .aggregate-copy { align-items:center; display:flex; flex-direction:row; flex-wrap:wrap; gap:4px 10px; }
    .installment-month-strip .aggregate-copy > span:nth-child(2) { white-space:nowrap; }
    .installment-month-strip .aggregate-bar { display:none; }
    .installment-distribution-grid { align-items:start; display:grid; gap:22px; grid-template-columns:repeat(2,minmax(0,1fr)); min-width:0; }
    .installment-distribution-grid > section { min-width:0; }
    .installment-distribution .report-results .section-heading { padding-bottom:6px; }
    .installment-distribution .aggregate-row { gap:12px; padding:6px 0; }
    .installment-distribution-grid .aggregate-copy { align-items:center; column-gap:8px; display:grid; gap:3px 8px; grid-template-columns:minmax(0,1fr) auto; }
    .installment-distribution-grid .aggregate-copy > span:nth-child(2) { justify-self:end; white-space:nowrap; }
    .installment-distribution-grid .aggregate-bar { grid-column:1/-1; }
    .installment-distribution .aggregate-row > strong { flex-shrink:0; font-variant-numeric:tabular-nums; }
    .installment-distribution .aggregate-drilldown { color:var(--sf-color-primary); min-width:0; overflow-wrap:break-word; }
    /* Uma so grade nativa para thead e tbody: sem grid em tr, sem cabecalhos partidos. */
    .installment-table { display:block; max-width:100%; min-width:0; overflow-x:auto; overscroll-behavior-x:contain; width:100%; }
    .installment-table:focus-visible { border-radius:3px; outline:3px solid color-mix(in srgb,var(--primary) 35%,transparent); outline-offset:2px; }
    .installment-table .installment-detail-table { border-collapse:collapse; display:table; min-width:1020px; table-layout:fixed; width:100%; }
    .installment-detail-table .installment-col-due { width:11%; }
    .installment-detail-table .installment-col-number { width:8%; }
    .installment-detail-table .installment-col-origin { width:22%; }
    .installment-detail-table .installment-col-card { width:13%; }
    .installment-detail-table .installment-col-category { width:18%; }
    .installment-detail-table .installment-col-status { width:17%; }
    .installment-detail-table .installment-col-amount { width:11%; }
    .installment-table .installment-detail-table thead th { background:var(--surface-strong); color:var(--muted); font-size:.75rem; font-weight:700; text-align:left; white-space:nowrap; }
    .installment-table .installment-detail-table th,.installment-table .installment-detail-table td { border-top:0; border-bottom:1px solid var(--line); font-size:.8125rem; font-variant-numeric:tabular-nums; line-height:1.35; padding:8px 10px; text-align:left; vertical-align:middle; }
    .installment-table .installment-detail-table tbody tr { background:var(--surface); }
    .installment-table .installment-detail-table tbody tr:nth-child(even) { background:var(--surface-soft); }
    .installment-table .installment-detail-table tbody tr:hover { background:var(--sf-color-neutral-control-hover); }
    .installment-table .installment-detail-table td:first-child,.installment-table .installment-detail-table td:nth-child(2) { white-space:nowrap; }
    .installment-table .installment-detail-table td:nth-child(3),.installment-table .installment-detail-table td:nth-child(4),.installment-table .installment-detail-table td:nth-child(5),.installment-table .installment-detail-table td:nth-child(6) { overflow-wrap:break-word; white-space:normal; word-break:normal; }
    .installment-table .installment-detail-table th:last-child,.installment-table .installment-detail-table td:last-child { text-align:right; white-space:nowrap; }
    .installment-table .installment-detail-table td .sf-money { display:inline-flex; justify-content:flex-end; white-space:nowrap; }
    @media(max-width:1180px){.sf-summary-grid.summary-grid.installment-summary-grid{grid-template-columns:repeat(3,minmax(0,1fr));}.installment-summary-grid .installment-summary-metric{border-bottom:1px solid var(--line);}.installment-distribution-grid{gap:14px;}}
    @media(max-width:760px){.sf-summary-grid.summary-grid.installment-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr));}.installment-distribution-grid{grid-template-columns:minmax(0,1fr);}.installment-month-strip{grid-template-columns:minmax(0,1fr);gap:4px;}.installment-month-strip .aggregate-copy{justify-content:space-between;}}
    @media(max-width:480px){.sf-summary-grid.summary-grid.installment-summary-grid{grid-template-columns:minmax(0,1fr);}.installment-summary-grid .installment-summary-metric{align-items:center;grid-template-columns:minmax(0,1fr) auto auto;grid-template-rows:auto;padding:7px 10px;}.installment-summary-grid .installment-summary-metric > span{grid-column:1;}.installment-summary-grid .installment-summary-metric > strong{grid-column:2;}.installment-summary-grid .installment-summary-metric .report-summary-secondary{grid-column:3;}}

    .sr-only { clip:rect(0 0 0 0); clip-path:inset(50%); height:1px; overflow:hidden; position:absolute; white-space:nowrap; width:1px; }
    /* Três colunas preservam o contexto selecionado sem forçar seis controles estreitos em desktop. */
    @media(min-width:1181px) and (max-width:1920px){.evolution-filters,.installment-filters{grid-template-columns:repeat(3,minmax(0,1fr));}}
    @media(max-width:1180px){.evolution-filters,.installment-filters,.cash-flow-filters{grid-template-columns:repeat(2,minmax(0,1fr));}.report-filters button[type="submit"]{grid-column:1/-1;}.summary-grid{grid-template-columns:repeat(3,minmax(0,1fr));}}
    @media(max-width:760px){main{padding:14px 14px 24px;}.reports-heading,.section-heading,.report-layer-topline{align-items:stretch;display:grid;}.report-filters{grid-template-columns:repeat(2,minmax(0,1fr));}.evolution-filters{grid-template-columns:minmax(0,1.3fr) minmax(0,.7fr);}.evolution-filters .interval-switcher,.evolution-filters .report-origin-filter,.report-filters button[type="submit"]{grid-column:1/-1;}.summary-grid,.cash-flow-summary-grid{grid-template-columns:1fr;}.readonly-pill{justify-self:start;}.evolution-table .sticky-description{min-width:12rem;}.report-analysis-block{padding:0 0 16px;}.report-trend{grid-auto-columns:minmax(14rem,72%);}.report-trend-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,7rem),1fr));}.report-highlights-grid{grid-template-columns:repeat(2,minmax(0,1fr));}.report-highlights-grid > .sf-alert{grid-column:1/-1;}.report-view-tabs{gap:6px 12px;}.report-filter-panel{padding:12px;}}
    /* Campos financeiros com valor selecionado longo precisam de uma coluna inteira no celular. */
    @media(max-width:480px){.installment-filters,.cash-flow-filters{grid-template-columns:minmax(0,1fr);}}
    @media(max-width:360px){.report-filters,.evolution-filters{grid-template-columns:minmax(0,1fr);}.report-trend{grid-auto-columns:minmax(14rem,84%);}.report-view-tabs a{font-size:var(--sf-font-size-xs);}}
    @media(min-width:361px) and (max-width:440px){.report-trend{grid-auto-columns:minmax(14rem,84%);}}
  `;
}
