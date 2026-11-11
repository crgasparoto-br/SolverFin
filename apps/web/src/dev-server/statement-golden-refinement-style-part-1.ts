import { solverFinDesignTokens } from "../design-system/tokens.js";

export function statementGoldenRefinementStylesPart1(root: string, dialog: string): string {
  const { spacing, density, typography } = solverFinDesignTokens;
  return `
    ${root} :is(.statement-row-metadata,.statement-row-footer){display:contents}
    ${root} .statement-heading-actions{display:flex;align-items:center;gap:${spacing[2]}}
    ${root} .statement-secondary-actions{position:relative}
    ${root} .statement-secondary-actions>summary{align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);color:var(--primary);cursor:pointer;display:flex;font-size:${typography.sizes.sm};gap:${spacing[2]};min-height:${density.interactiveTargetMin};padding-inline:${spacing[3]}}
    ${root} .statement-secondary-actions>summary::after{content:'+';font-size:${typography.sizes.lg}}
    ${root} .statement-secondary-actions[open]>summary::after{content:'-'}
    ${root} .statement-secondary-actions>summary::-webkit-details-marker{display:none}
    ${root} .statement-secondary-actions-content{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--sf-shadow-sm);display:grid;gap:${spacing[1]};min-width:12rem;padding:${spacing[2]};position:absolute;right:0;top:calc(100% + ${spacing[1]});z-index:20}
    ${root} .statement-secondary-actions-content button{justify-content:flex-start;width:100%}
    ${root} .account-summary[data-mockup-composition]{display:grid;gap:${spacing[2]} ${spacing[3]};grid-template-columns:repeat(3,minmax(0,1fr));padding:0}
    ${root} .statement-summary-duplicate[hidden]{display:none}
    ${root} .statement-account-heading{align-items:center;border-bottom:1px solid var(--line);display:grid;gap:${spacing[3]};grid-column:1/-1;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);padding-bottom:${spacing[2]}}
    ${root} .statement-account-heading .statement-context{border:0;display:grid;gap:${spacing[1]};grid-template-columns:minmax(0,1fr);justify-content:stretch;padding:0}
    ${root} .statement-account-heading .statement-context-main{flex:none}
    ${root} .statement-account-heading .statement-context-copy>.muted{display:none}
    ${root} .statement-account-heading .statement-context-copy strong{font-size:${typography.sizes.lg}}
    ${root} .statement-account-heading .statement-context-meta{gap:${spacing[1]} ${spacing[3]}}
    ${root} .statement-account-control{min-width:0;width:100%}
    ${root} .statement-account-control .account-field{display:grid;gap:${spacing[1]};max-width:none;min-width:0;width:100%}
    ${root} .statement-account-control .account-select-trigger{width:100%}
    ${root} .statement-account-control :is(label,.account-select,.account-select-trigger){box-sizing:border-box;max-width:100%;min-width:0;width:100%}
    ${root} .statement-account-control .account-select-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    /* G3: the account control reads as the financial identity, not as a form field. */
    ${root} .statement-account-control .account-select-copy{align-content:center;display:grid;flex:1 1 auto;gap:2px;min-width:0}
    ${root} .statement-account-control .account-select-text{font-size:${typography.sizes.md};font-weight:${typography.weights.semibold};text-align:left}
    ${root} .statement-account-control .account-select-text{overflow:visible;overflow-wrap:anywhere;text-overflow:clip;white-space:normal}
    ${root} .statement-account-control .account-select-copy{min-width:0;overflow-wrap:anywhere}
    ${root} .statement-account-control .account-select-sub{color:var(--muted);font-size:${typography.sizes.xs};line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    ${root} .statement-account-control .account-select-trigger{background:transparent;border:1px solid var(--line);border-radius:10px;column-gap:${spacing[2]};padding:0 ${spacing[4]} 0 ${spacing[1]}}
    ${root} .statement-account-control .account-select-chevron{flex:0 0 auto;margin-inline-start:auto}
    ${root} .statement-account-control .account-select-icon{border-radius:11px;flex:0 0 auto;height:44px;overflow:hidden;width:44px}
    ${root} .statement-account-control .account-select-icon :is(img,svg){height:100%;width:100%}
    ${root} .summary-balance-line{align-items:center;display:flex;gap:${spacing[2]};min-width:0}
    ${root} .summary-balance-toggle{align-items:center;background:transparent;border:0;color:var(--muted);cursor:pointer;display:inline-flex;flex:0 0 auto;justify-content:center;min-height:24px;min-width:24px;padding:0}
    ${root} .summary-balance-toggle:hover{color:var(--text)}
    ${root} .summary-balance-toggle[aria-pressed="true"]{color:var(--primary)}
        ${root} .statement-account-heading .summary-balance{border-left:1px solid var(--line);padding-left:${spacing[4]};text-align:right}
    ${root} .statement-account-heading .summary-balance-line{justify-content:flex-end}
    ${root} .statement-account-heading .summary-balance strong{font-size:${typography.sizes["2xl"]};overflow-wrap:anywhere}
    ${root} .account-summary[data-mockup-composition] .summary-total{padding:0;gap:${spacing[1]}}
    ${root} .account-summary[data-mockup-composition] .summary-total strong{font-size:${typography.sizes.xl};overflow-wrap:anywhere}
    ${root} .account-summary[data-mockup-composition] .status-overview{border:0;padding:0;grid-column:auto}
    ${root} .statement-status-details{width:100%}
    ${root} .statement-status-details>summary{box-sizing:border-box;color:var(--muted);cursor:pointer;font-size:${typography.sizes.sm};min-height:${density.interactiveTargetMin};padding-block:${spacing[1]}}
    ${root} .statement-status-content{display:flex;flex-wrap:wrap;gap:${spacing[2]} ${spacing[4]};padding-bottom:${spacing[3]}}
    ${root} .statement-context:has(.statement-account-control) .statement-context-main{display:none}
    @media(min-width:1101px){
      ${root} .statement-mobile-advanced-filters,${root} .statement-mobile-advanced-fields{display:contents}
      ${root} .statement-mobile-advanced-filters>summary{display:none}
    }
    @media(min-width:1101px){
      ${root} .filter-form{grid-template-columns:repeat(20,minmax(0,1fr));gap:${spacing[2]}}
      ${root} .filter-form .statement-search-field{grid-column:span 4}
      ${root} .filter-form :is(.statement-kind-field,.statement-status-field,.statement-reconciliation-field,.statement-category-field){grid-column:span 3}
      ${root} .filter-form .statement-filter-actions{grid-column:span 4;flex-wrap:nowrap;justify-content:end}
      ${root} .statement-account-control .account-field>label#account-picker-label{clip-path:inset(50%);height:1px;overflow:hidden;position:absolute;width:1px}
    }
    ${root} .statement-toolbar .chips{display:none}
    ${root} .statement-toolbar{padding-block:${spacing[1]}}
    ${root} .statement-query-heading{margin-bottom:${spacing[1]}}
    ${root} .filter-form .account-select-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    ${root} .filter-form :is(input,select,button),${root} [data-statement-options-toggle]{min-height:${density.interactiveTargetMin}}
    ${dialog} .modal-panel{display:grid;grid-template-columns:minmax(0,1fr) auto}
    ${dialog} .close-form{align-self:start;grid-column:2;grid-row:1;justify-self:end;margin:0;position:static}
    ${dialog} .modal-panel>div:nth-child(2){display:grid;gap:${spacing[2]};grid-column:1/-1;grid-row:1;grid-template-columns:subgrid;padding-right:0}
    ${dialog} .modal-panel>div:nth-child(2)>.eyebrow{align-items:center;display:flex;grid-column:1;grid-row:1;margin:0;max-width:none;min-height:${density.interactiveTargetMin};min-width:0;padding-right:${spacing[2]};width:auto}
    ${dialog} .modal-panel>div:nth-child(2)>:is(h2,p:not(.eyebrow)){grid-column:1/-1;margin:0}
    ${dialog} .modal-panel>form[data-form]{grid-column:1/-1}
    ${dialog} .close-form button{min-height:${density.interactiveTargetMin};min-width:${density.interactiveTargetMin}}
    ${dialog} [data-modal-title]{font-size:${typography.sizes.xl};line-height:${typography.lineHeights.compact};overflow-wrap:anywhere}
    ${dialog} .modal-panel form[data-form] :is(input,select,textarea){min-height:${density.interactiveTargetMin}}
    ${dialog} .modal-panel form[data-form]>label.full{grid-column:1/-1}
    @media(max-width:1100px){
      ${root},${root} .statement-a2-workspace{gap:${spacing[1]}}
      ${root} .sf-page-header-description{display:none}
      ${root} .statement-heading-actions{display:flex;justify-content:space-between;width:100%}
      ${root} .statement-heading-actions>button{flex:1;min-width:0}
      ${root} .statement-heading-actions button{font-size:${typography.sizes.sm};min-width:0;padding-inline:${spacing[2]}}
      ${root} .statement-heading-actions button[data-quick-kind="expense"]{grid-column:auto;grid-row:auto}
      ${root} .statement-account-heading{align-items:center;gap:${spacing[2]};grid-template-columns:minmax(0,1fr)}
      ${root} .statement-account-heading .summary-balance{border-left:0;border-top:1px solid #eef2f7;padding:${spacing[2]} 0 0;text-align:right}
      ${root} .statement-account-heading .summary-balance strong{font-size:${typography.sizes.lg}}
      ${root} .statement-account-heading .summary-balance p{display:none}
      ${root} .account-summary[data-mockup-composition]{grid-template-columns:repeat(2,minmax(0,1fr))}
      ${root} .account-summary[data-mockup-composition] .status-overview{border-top:0;grid-column:1/-1}
      ${root} .account-summary[data-mockup-composition] .summary-total{align-items:baseline;display:flex;flex-wrap:wrap;gap:${spacing[1]} ${spacing[2]};justify-content:space-between}
      ${root} .account-summary[data-mockup-composition] .summary-total strong{font-size:${typography.sizes.md}}
      ${root} .statement-context{gap:${spacing[1]};padding-bottom:${spacing[1]}}
      ${root} .statement-context-meta{gap:${spacing[1]} ${spacing[3]}}
      ${root} .statement-account-heading .statement-context-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      ${root} .statement-account-heading .statement-context-meta{display:flex;gap:${spacing[1]} ${spacing[2]}}
      ${root} .statement-account-heading .statement-context-pill{font-size:${typography.sizes.xs}}
      ${dialog} form[data-installment-mode="true"] .statement-entry-advanced{display:none}
      ${root} .statement-body[data-statement-row-refined]{grid-template-columns:24px minmax(0,1fr) ${density.interactiveTargetMin};grid-template-areas:"select description actions" "select amount amount" "select metadata status" "select footer footer";gap:${spacing[1]} ${spacing[2]}}
      ${root} .statement-body .statement-row-metadata{align-items:baseline;display:flex;flex-wrap:wrap;gap:${spacing[1]} ${spacing[2]};grid-area:metadata;min-width:0}
      ${root} .statement-body .statement-row-footer{align-items:baseline;display:flex;flex-wrap:wrap;gap:${spacing[1]} ${spacing[2]};grid-area:footer;justify-content:space-between;min-width:0}
      ${root} .statement-body .statement-row-footer .col-balance{margin-left:auto}
      ${root} .statement-body .actions summary{height:${density.interactiveTargetMin};width:${density.interactiveTargetMin}}
    }
    @media(max-width:360px){
      ${root} .statement-account-heading{grid-template-columns:minmax(0,1fr)}
      ${root} .statement-account-heading .statement-context{gap:${spacing[1]}}
      ${root} .statement-account-heading .statement-context-main{gap:${spacing[1]}}
      ${root} .statement-account-heading .statement-context-main .account-select-icon{height:32px;width:32px}
      ${root} .statement-account-heading .statement-context-meta{gap:2px ${spacing[1]}}
      ${root} .statement-account-heading .statement-context-pill{background:transparent;border:0;font-size:10px;min-height:20px;padding:0 2px}
      ${root} .statement-account-heading .summary-balance{text-align:left}
      ${root} .account-summary[data-mockup-composition]{column-gap:${spacing[2]};grid-template-columns:repeat(2,minmax(0,1fr))}
      ${root} .account-summary[data-mockup-composition] .summary-total{align-items:start;display:grid;gap:${spacing[1]};min-width:0}
      ${root} .account-summary[data-mockup-composition] .summary-total strong{font-size:9px;font-variant-numeric:tabular-nums;letter-spacing:-.035em;line-height:1.15;max-width:100%;min-width:0;overflow-wrap:anywhere;white-space:normal;width:100%;word-break:break-word}
      ${root}[data-statement-options="collapsed"] .statement-query-heading{margin-bottom:0}
    }

    /* Mockup parity layer: route-scoped so the Golden Screen can evolve without changing other surfaces. */
    body:has(${root}){background:#f5f7fb}
    body:has(${root}) .app-shell{grid-template-columns:200px minmax(0,1fr)}
    body:has(${root}) .topbar{display:none}
    body:has(${root}) .main-area>main{box-sizing:border-box;margin:0;max-width:none;padding:18px 20px 32px;width:100%}
    ${root}{gap:${spacing[2]}}
    ${root} .statement-breadcrumb{align-items:center;color:#64748b;display:flex;font-size:${typography.sizes.xs};gap:${spacing[2]};margin:0;min-height:auto;padding:0}
    ${root} .statement-breadcrumb strong{color:#334155;font-weight:${typography.weights.medium}}
    ${root} .sf-page-header{align-items:flex-start;margin-bottom:${spacing[1]}}
    ${root} .sf-page-header-title{font-size:${typography.sizes["2xl"]};line-height:${typography.lineHeights.compact}}
    ${root} .sf-page-header-description{font-size:${typography.sizes.sm}}
    ${root} .statement-heading-actions{margin-left:auto}
    ${root} [data-statement-new-entry]{background:#07883f;border-color:#07883f;border-radius:7px;color:#fff;min-height:40px;padding-inline:${spacing[4]}}
    ${root} .statement-secondary-actions>summary{font-size:0;height:40px;justify-content:center;padding:0;width:40px}
    ${root} .statement-secondary-actions>summary::after{content:'⋮';font-size:${typography.sizes.xl};line-height:1}
    ${root} .statement-secondary-actions[open]>summary::after{content:'⋮'}
    ${root} .statement-overview{padding:0}
    ${root} .account-summary[data-mockup-composition]{background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 1px 2px rgba(15,23,42,.03);gap:${spacing[3]};grid-template-columns:repeat(4,minmax(0,1fr));padding:${spacing[3]}}
    ${root} .statement-account-heading{background:#fff;border:1px solid var(--line);border-radius:9px;grid-template-columns:minmax(0,1fr) auto minmax(220px,.58fr);margin:-${spacing[3]} -${spacing[3]} 0;padding:${spacing[3]}}
    ${root} .statement-account-heading .statement-context-main .account-select-icon{height:44px;width:44px}
    ${root} .statement-account-heading .statement-context-copy strong{font-size:${typography.sizes.md}}
    ${root} .statement-account-heading .statement-institution-name{color:var(--muted);display:block;font-size:${typography.sizes.xs};line-height:1.3}
    ${root} .statement-account-heading .summary-balance strong{color:#07883f;font-size:${typography.sizes.xl}}
    ${root} .statement-period-control{align-items:end;display:flex;gap:${spacing[2]};min-width:0}
    ${root} .statement-period-control .month-field{min-width:190px}
    ${root} .statement-period-control .month-field>label{clip-path:inset(50%);height:1px;overflow:hidden;position:absolute;width:1px}
    ${root} .statement-period-control .month-nav{background:#f8fafc;border:1px solid var(--line);border-radius:8px}
    ${root} .statement-period-control [data-month-current]{background:transparent;border:1px solid var(--line);border-radius:999px;color:var(--primary);min-height:40px;padding-inline:${spacing[3]}}
    /* On desktop, align both period controls to the account selector (top and bottom). */
    @media(min-width:1101px){
      ${root} .statement-period-control{align-items:stretch;align-self:end}
      ${root} .statement-period-control .month-nav{box-sizing:border-box;height:46px}
      ${root} .statement-period-control [data-month-current]{box-sizing:border-box;height:46px}
    }
    /* G2: period shortcuts reuse the canonical month/day/range query, never new state. */
    ${root} .statement-period-shortcuts{align-items:center;display:flex;flex-wrap:wrap;gap:${spacing[1]};grid-column:1/-1;min-width:0}
    ${root} .statement-period-chip{align-items:center;background:#f8fafc;border:1px solid var(--line);border-radius:999px;color:#334155;display:inline-flex;font-size:${typography.sizes.xs};font-weight:${typography.weights.medium};min-height:32px;padding:0 ${spacing[3]};text-decoration:none;white-space:nowrap}
    ${root} .statement-period-chip:hover{background:#eef2f7;color:#0f172a}
    ${root} .statement-period-chip[aria-current="true"]{background:#eef4ff;border-color:#c7d7fe;color:#1d4ed8}
    ${root} .statement-period-range{align-items:center;color:var(--muted);display:inline-flex;font-size:${typography.sizes.xs};font-weight:${typography.weights.medium};padding-inline:${spacing[1]};white-space:nowrap}
    /* G4: each filter carries its own glyph and the bar reports the active filter count. */
    ${root} .filter-field-heading{align-items:center;display:inline-flex;gap:6px;min-width:0}
    ${root} .filter-field-icon{color:var(--muted);flex:0 0 auto}
    ${root} .statement-filter-count{align-items:center;background:#eef4ff;border-radius:999px;color:#1d4ed8;display:inline-flex;font-size:${typography.sizes.xs};font-weight:${typography.weights.semibold};min-height:26px;padding:0 ${spacing[2]};white-space:nowrap}
    ${root} .statement-search-field input{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%2364748b' stroke-width='1.7' stroke-linecap='round'%3E%3Ccircle cx='9' cy='9' r='5.5'/%3E%3Cpath d='M13.2 13.2 17 17'/%3E%3C/svg%3E");background-position:10px 50%;background-repeat:no-repeat;background-size:14px 14px;padding-left:30px}
    ${root} .statement-context-pill[data-context="period"]{display:none}
    ${root} .summary-totals{display:contents}
    ${root} .account-summary[data-mockup-composition] .summary-total{background:#fff;border:1px solid var(--line);border-radius:8px;gap:${spacing[1]};min-height:64px;padding:${spacing[3]}}
    ${root} .account-summary[data-mockup-composition] .summary-total strong{font-size:${typography.sizes.md}}
    ${root} .summary-total .credit{color:#07883f}
    ${root} .summary-total .debit{color:#dc2626}
    ${root} .summary-total .neutral{color:#0f172a}
    ${root} .account-summary[data-mockup-composition] .status-overview{grid-column:1/-1}
    ${root} .statement-query{align-items:end;background:#fff;border-radius:10px;display:block;position:relative;gap:${spacing[2]};padding:${spacing[2]}}
    ${root} #statement-query-fields{flex:1 1 auto;min-width:0}
    ${root} .statement-query-heading{flex:0 0 auto;margin:0;order:2}
    ${root} .statement-query-heading>span{display:none}
    ${root} [data-statement-options-toggle]{border-radius:7px;min-height:40px;white-space:nowrap}
    ${root} .filter-form{align-items:end;grid-template-columns:minmax(190px,.9fr) minmax(280px,1.7fr) minmax(170px,.8fr) auto}
    ${root} .filter-form{grid-template-columns:repeat(6,minmax(0,1fr));align-items:end;column-gap:${spacing[2]};row-gap:${spacing[1]}}
    ${root} .filter-form>.statement-search-field{grid-column:span 2}
    ${root} .filter-form>.statement-filter-actions{grid-column:span 2}
    ${root} .statement-query{padding:${spacing[1]} ${spacing[2]}}
    ${root} .statement-query :is(label,select,input){font-size:${typography.sizes.xs}}
    ${root} .statement-query-heading{display:flex;align-items:center;justify-content:flex-end;gap:${spacing[2]};position:static;min-width:0;margin:0 0 ${spacing[1]}}

    ${root} .filter-form :is(.statement-kind-field,.statement-status-field,.statement-reconciliation-field,.statement-category-field){min-width:0}
    ${root} .filter-form :is(.statement-kind-field,.statement-status-field,.statement-reconciliation-field) select{background:#fff;border:1px solid var(--line);border-radius:7px;width:100%}
    ${root} .filter-form .statement-search-field{grid-column:span 2}
    ${root} .filter-form .statement-category-field{min-width:0}
    ${root} .filter-form .statement-category-field select{background:#fff;border:1px solid var(--line);border-radius:7px;width:100%}
        ${root} .filter-form .account-field>label,${root} .statement-search-field{font-size:0}
    ${root} .statement-search-field input{font-size:${typography.sizes.xs}}
    ${root} .statement-filter-actions{align-self:end;grid-column:auto}
    ${root} .statement-filter-actions>a{display:inline-flex}
    ${root} .statement-filter-actions>button[type="submit"]{background:#fff;border:1px solid var(--line);border-radius:7px}

    /* G1: four glanceable indicators, each with its own glyph tile, instead of one ruled strip. */
    ${root} .account-summary[data-mockup-composition] .summary-total{align-items:flex-start;background:#fff;border:1px solid var(--line);border-radius:10px;column-gap:${spacing[2]};display:flex;min-height:0;min-width:0;padding:${spacing[3]}}
    ${root} .account-summary[data-mockup-composition] .summary-total:last-of-type{border-right:1px solid var(--line)}
    ${root} .summary-total-icon{align-items:center;border-radius:9px;display:inline-flex;flex:0 0 auto;height:34px;justify-content:center;width:34px}
    ${root} .summary-total-copy{display:grid;gap:2px;min-width:0}
    ${root} .summary-total-copy>span{color:var(--muted);font-size:${typography.sizes.xs};font-weight:${typography.weights.medium};line-height:1.3}
    ${root} .summary-total-copy>strong{font-size:${typography.sizes.md};line-height:1.25;overflow-wrap:anywhere}
    ${root} .summary-total[data-summary-total="opening"]{background:#f8fafc}
    ${root} .summary-total[data-summary-total="opening"] .summary-total-icon{background:#e2e8f0;color:#475569}
`;
}
