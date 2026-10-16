/** Page-scoped Golden Screen composition for the credit-card master/detail workspace. */
export function cardsGoldenCompositionStyles(): string {
  return `
    /* Restore the card's contextual left panel: invoice and purchases remain the primary task. */
    .cards-a3-page{max-width:var(--sf-layout-content-max-width);gap:12px;padding:18px var(--sf-layout-gutter-desktop) 24px}
    .cards-a3-page .sf-page-header{align-items:center;margin:0 0 2px}
    .cards-a3-page .sf-page-header h1{letter-spacing:-.025em}
    .cards-a3-page .sf-detail-layout{align-items:start;display:grid;gap:16px;grid-template-columns:minmax(238px,258px) minmax(0,1fr)}
    .cards-a3-page :is(.sf-detail-layout-master,.sf-detail-layout-detail){min-width:0}
    .cards-master-panel{align-items:stretch;display:grid;gap:13px;grid-template-columns:minmax(0,1fr);padding:16px;position:sticky;top:16px}
    .cards-master-heading{align-items:baseline;gap:8px}
    .cards-master-heading h2{font-size:1rem;line-height:1.3;white-space:normal}
    .cards-edit-link{font-size:.77rem;white-space:nowrap}
    .cards-card-picker{gap:6px;min-width:0}
    .cards-card-picker label{color:var(--muted);font-size:.76rem;font-weight:650}
    .cards-card-picker select{min-height:44px;min-width:0;width:100%}
    .cards-card-identity{align-items:center;background:var(--bg);border:1px solid var(--line);border-radius:12px;gap:8px;grid-template-columns:32px minmax(0,1fr);padding:11px}
    .cards-card-icon,.cards-card-icon .brand-icon,.cards-card-icon .brand-icon-wrap,.cards-card-icon img{height:30px;width:30px}
    .cards-card-identity>div strong{font-size:.91rem;line-height:1.3}
    .cards-card-identity>div span{color:var(--muted);font-size:.72rem;line-height:1.4}
    .cards-card-identity>.sf-badge{grid-column:2;justify-self:start}
    .cards-master-details,.cards-instrument-nav{border:0;border-top:1px solid var(--line);min-width:0;padding:11px 0 0;position:static}
    .cards-master-details>summary,.cards-instrument-nav>summary{align-items:center;color:var(--text);display:flex;font-size:.81rem;font-weight:750;justify-content:space-between;min-height:28px;padding:0;white-space:normal}
    .cards-master-details>summary:hover,.cards-instrument-nav>summary:hover{color:var(--primary)}
    .cards-master-details[open]>.cards-master-meta,.cards-instrument-nav[open]>ul{background:transparent;border:0;border-radius:0;box-shadow:none;display:grid;gap:9px;max-height:none;min-width:0;overflow:visible;padding:10px 0 0;position:static}
    .cards-master-meta>div{align-items:start;display:grid;gap:2px;grid-template-columns:minmax(0,1fr) auto}
    .cards-master-meta dt{color:var(--muted);font-size:.74rem}
    .cards-master-meta dd{font-size:.76rem;font-weight:700;overflow-wrap:anywhere;text-align:right}
    .cards-instrument-nav ul{list-style:none;margin:0}
    .cards-instrument-nav li{align-items:start;border-radius:8px;display:grid;gap:4px;grid-template-columns:minmax(0,1fr) auto;line-height:1.35}
    .cards-instrument-nav li>span{font-size:.75rem;overflow-wrap:anywhere}
    .cards-instrument-nav li :is(strong,small){color:var(--muted);font-size:.68rem}
    .cards-master-panel :is(summary,select,a):focus-visible{outline:2px solid var(--primary);outline-offset:3px}
    /* The detail column uses clean, horizontally aligned decisions rather than stacked boxes. */
    .cards-detail-panel{border-radius:12px;min-width:0;overflow:visible}
    .cards-invoice-navigation{align-items:center;display:flex;gap:8px;justify-content:space-between;padding:8px 14px}
    .cards-invoice-period-row{align-items:center;flex:1 1 auto;gap:8px;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);max-width:none}
    .cards-invoice-period-link{min-height:42px;padding:5px 8px}
    .cards-invoice-period-link strong{font-size:.76rem}
    .cards-invoice-current>strong{font-size:1rem;line-height:1.4}
    .cards-invoice-header{align-items:center;gap:16px;grid-template-columns:minmax(0,1fr) minmax(235px,auto);padding:14px 16px}
    .cards-invoice-title-block{gap:5px;min-width:0}
    .cards-invoice-title-block h2{font-size:1.18rem;line-height:1.3;margin:0}
    .cards-invoice-title-block p{font-size:.77rem;line-height:1.5}
    .cards-invoice-primary{align-items:end;gap:5px;justify-items:end;min-width:0}
    .cards-invoice-primary>strong{font-size:1.55rem;line-height:1.15;overflow-wrap:anywhere;text-align:right}
    .cards-invoice-actions{align-items:center;display:flex;gap:7px;justify-content:flex-end;margin-top:5px}
    .cards-invoice-actions .sf-button{min-height:40px;white-space:nowrap}
    .cards-settlement-note{font-size:.73rem}
    .cards-invoice-summary{gap:8px;padding:10px 14px}
    .cards-invoice-summary .sf-summary-grid{gap:8px;grid-template-columns:repeat(4,minmax(0,1fr))}
    .cards-summary-metric{background:var(--surface);border:1px solid var(--line);border-radius:9px;gap:5px;min-height:64px;padding:9px 11px}
    .cards-summary-metric>span{font-size:.71rem;line-height:1.35}
    .cards-summary-metric{align-items:center;grid-template-columns:32px minmax(0,1fr);gap:9px}
    .cards-summary-icon{align-items:center;background:var(--primary-soft);border-radius:9px;color:var(--primary);display:inline-flex;height:32px;justify-content:center;width:32px}
    .cards-summary-metric:nth-child(2) .cards-summary-icon{background:var(--success-bg);color:var(--success)}
    .cards-summary-metric:nth-child(3) .cards-summary-icon{background:var(--surface-soft);color:var(--muted)}
    .cards-summary-copy{display:grid;gap:4px;min-width:0}
    .cards-summary-copy>span{color:var(--muted);font-size:.71rem;line-height:1.3}
    .cards-summary-copy>strong{font-size:.86rem;font-variant-numeric:tabular-nums;line-height:1.35;overflow-wrap:anywhere}
    .cards-limit-detail>summary{min-height:22px}
    .cards-detail-panel .sf-filter-bar{gap:8px;padding:12px 14px}
    .cards-purchase-filter-form{align-items:end;gap:8px;grid-template-columns:minmax(0,1fr) auto auto}
    .cards-search-field{font-size:.77rem!important;gap:5px!important;line-height:1.35!important}
    .cards-search-field input{min-height:44px}
    .cards-advanced-filters>summary{min-height:44px}
    .cards-reconciliation-filters{gap:6px}
    .cards-filter-chip{min-height:34px;padding:6px 10px}
    .cards-results-status{font-size:.73rem;margin-left:auto}
    .cards-reconciliation-filters [data-open-modal="purchase"]{margin-left:0}
    .cards-purchase-groups{gap:8px;padding:10px 14px 14px}
    .cards-section-heading{align-items:baseline}
    .cards-section-heading h3{font-size:1rem}
    .cards-instrument-group{border:1px solid var(--line);border-radius:10px;overflow:visible}
    .cards-instrument-group>summary{background:var(--bg);border-radius:10px 10px 0 0;gap:12px;min-height:48px;padding:10px 12px}
    .cards-instrument-group>summary strong{font-size:.8rem;overflow-wrap:anywhere}
    .cards-instrument-totals{font-size:.79rem;white-space:nowrap}
    .cards-purchase-table-head,.cards-purchase-row{gap:8px;grid-template-columns:5.7rem minmax(0,1.4fr) minmax(5.7rem,.65fr) 4.2rem minmax(7.5rem,.68fr) 3rem}
    .cards-purchase-table-head{padding:9px 10px}
    .cards-purchase-row{min-height:60px;padding:8px 10px}
    .cards-purchase-description strong{font-size:.86rem;line-height:1.35}
    .cards-purchase-category{font-size:.75rem;line-height:1.4}
    .cards-purchase-amount{font-size:.82rem;font-variant-numeric:tabular-nums;white-space:normal}
    .cards-invoice-document-link{padding:4px 14px 14px}
    .cards-summary-copy>strong{overflow-wrap:normal;word-break:normal}
    .cards-reconciliation-filters [data-open-modal="purchase"]{display:none}
    @media(max-width:1190px){
      .cards-a3-page .sf-detail-layout{gap:12px;grid-template-columns:minmax(205px,225px) minmax(0,1fr)}
      .cards-master-panel{padding:12px}
      .cards-invoice-summary .sf-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      .cards-invoice-header{grid-template-columns:minmax(0,1fr)}
      .cards-invoice-primary{align-items:start;justify-items:start}
      .cards-invoice-primary>strong{text-align:left}
      .cards-invoice-actions{justify-content:flex-start}
      .cards-purchase-table-head,.cards-purchase-row{grid-template-columns:5rem minmax(0,1.3fr) minmax(5.2rem,.6fr) 3.2rem minmax(6.7rem,.7fr) 2.8rem;gap:5px}
    }
    @media(max-width:940px){
      .cards-a3-page .sf-detail-layout{grid-template-columns:minmax(0,1fr)}
      .cards-master-panel{position:static;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px 16px}
      .cards-master-heading{grid-column:1/-1}
      .cards-card-picker{grid-column:1}
      .cards-card-identity{grid-column:2}
      .cards-master-details,.cards-instrument-nav{grid-column:auto}
      .cards-invoice-header{grid-template-columns:minmax(0,1fr) auto}
      .cards-invoice-primary{align-items:end;justify-items:end}
      .cards-invoice-primary>strong{text-align:right}
    }
    @media(max-width:760px){
      .cards-a3-page{gap:10px;padding:10px var(--sf-layout-gutter-mobile) 20px}
      .cards-a3-page .sf-detail-layout{gap:10px;grid-template-columns:1fr}
      .cards-master-panel{display:grid;gap:8px;grid-template-columns:minmax(0,1fr) auto;padding:11px 12px;position:static}
      .cards-master-heading{grid-column:2;grid-row:1}
      .cards-master-heading>div{display:none}
      .cards-card-picker{grid-column:1;grid-row:1}
      .cards-card-identity{grid-column:1/-1;grid-row:2;grid-template-columns:30px minmax(0,1fr) auto;padding:9px}
      .cards-card-identity>.sf-badge{grid-column:3;justify-self:end}
      .cards-master-details{grid-column:1;grid-row:3}
      .cards-instrument-nav{display:block;grid-column:2;grid-row:3}
      .cards-master-details,.cards-instrument-nav{border-top:0;padding:4px 0 0}
      .cards-master-details>summary,.cards-instrument-nav>summary{color:var(--primary);font-size:.75rem;min-height:36px}
      .cards-master-details[open]>.cards-master-meta,.cards-instrument-nav[open]>ul{border-top:1px solid var(--line);padding-top:9px}
      .cards-invoice-navigation{display:grid;gap:4px;grid-template-columns:minmax(0,1fr) auto;padding:8px 10px}
      .cards-invoice-period-row{grid-template-columns:40px minmax(0,1fr) 40px;gap:2px}
      .cards-invoice-period-link{justify-content:center;min-height:44px;padding:5px}
      .cards-invoice-current>strong{font-size:.91rem}
      .cards-invoice-header{grid-template-columns:1fr;gap:10px;padding:12px}
      .cards-invoice-primary{justify-items:start}
      .cards-invoice-primary>strong{font-size:1.5rem;text-align:left}
      .cards-invoice-actions{display:flex;flex-wrap:wrap;gap:7px;width:100%}
      .cards-invoice-actions .sf-button{flex:1 1 120px;min-width:0}
      .cards-invoice-summary{padding:10px}
      .cards-invoice-summary .sf-summary-grid{gap:6px;grid-template-columns:repeat(2,minmax(0,1fr))}
      .cards-summary-metric{min-height:62px;padding:8px}
      .cards-summary-metric>strong{font-size:.83rem}
      .cards-detail-panel .sf-filter-bar{padding:10px}
      .cards-purchase-filter-form{grid-template-columns:minmax(0,1fr) auto}
      .cards-search-field{grid-column:1/-1}
      .cards-reconciliation-filters [data-open-modal="purchase"]{display:inline-flex;justify-content:center;margin-left:auto;min-height:44px}
      .cards-results-status{margin-left:0}
      .cards-purchase-groups{padding:10px}
      .cards-purchase-row{grid-template-columns:minmax(0,1fr) auto;gap:7px}
      .cards-purchase-category{grid-column:1}
      .cards-purchase-amount{grid-column:2;grid-row:1}
      .cards-purchase-actions{grid-column:2;grid-row:2 / span 3}
      .cards-purchase-status-cell{grid-column:1}
      .cards-instrument-group>summary{align-items:flex-start;flex-wrap:wrap}
      .cards-instrument-totals{margin-left:auto}
    }
    @media(max-width:350px){
      .cards-a3-page{padding:8px var(--sf-layout-gutter-mobile)}
      .cards-master-panel{gap:3px;padding:8px}
      .cards-card-picker{gap:2px}
      .cards-card-picker select{min-height:40px}
      .cards-card-picker label{font-size:.7rem}
      .cards-card-identity{gap:4px;grid-template-columns:23px minmax(0,1fr) auto;padding:7px}
      .cards-card-icon,.cards-card-icon .brand-icon,.cards-card-icon .brand-icon-wrap,.cards-card-icon img{height:23px;width:23px}
      .cards-card-identity>div strong{font-size:.76rem}
      .cards-card-identity>div span{font-size:.64rem;line-height:1.2}
      .cards-card-identity>.sf-badge{font-size:.65rem;padding:2px 5px}
      .cards-master-details,.cards-instrument-nav{padding:0}
      .cards-master-details>summary,.cards-instrument-nav>summary{font-size:.72rem;min-height:28px}
      .cards-invoice-navigation{padding:4px 8px}
      .cards-invoice-header{gap:5px;padding:9px 10px}
      .cards-invoice-title-block{gap:3px}
      .cards-invoice-title-block h2{font-size:1.06rem}
      .cards-invoice-title-block p{font-size:.7rem;line-height:1.3}
      .cards-invoice-summary .sf-summary-grid{grid-template-columns:1fr}
      .cards-summary-metric{min-height:56px}
      .cards-invoice-actions{display:grid;grid-template-columns:minmax(0,1fr)}
      .cards-invoice-actions .sf-button{white-space:normal;width:100%}
      .cards-invoice-period-row{grid-template-columns:40px minmax(0,1fr) 40px}
    }
  `;
}
