/** Page-scoped Golden Screen composition for the credit-card master/detail workspace. */
export function cardsGoldenCompositionStyles(): string {
  return `
    /* Restore the card's contextual left panel: invoice and purchases remain the primary task. */
    .cards-a3-page{max-width:var(--sf-layout-content-max-width);gap:12px;padding:18px var(--sf-layout-gutter-desktop) 24px}
    .cards-a3-page .sf-page-header{align-items:center;margin:0 0 2px}
    .cards-a3-page .sf-page-header h1{letter-spacing:-.025em}
    .cards-a3-page .sf-detail-layout{align-items:start;display:grid;gap:16px;grid-template-columns:minmax(238px,258px) minmax(0,1fr)}
    .cards-a3-page :is(.sf-detail-layout-master,.sf-detail-layout-detail){min-width:0}
    .cards-master-panel{align-items:stretch;display:grid;gap:11px;grid-template-columns:minmax(0,1fr);padding:14px;position:sticky;top:16px}
    .cards-master-heading{align-items:baseline;gap:8px}
    .cards-master-heading h2{font-size:1rem;line-height:1.3;white-space:nowrap}
    .cards-edit-link{font-size:.77rem;white-space:nowrap}
    .cards-card-picker{gap:6px;min-width:0}
    .cards-card-picker label{color:var(--muted);font-size:.76rem;font-weight:650}
    .cards-card-picker select{min-height:44px;min-width:0;width:100%}
    .cards-card-identity{align-items:center;background:transparent;border:0;border-top:1px solid var(--line);border-radius:0;gap:8px;grid-template-columns:28px minmax(0,1fr) auto;min-height:40px;padding:9px 0 0}
    .cards-card-icon,.cards-card-icon .brand-icon,.cards-card-icon .brand-icon-wrap,.cards-card-icon img{height:28px;width:28px}
    .cards-card-identity>div strong{font-size:.91rem;line-height:1.3}
    .cards-card-identity>div span{color:var(--muted);font-size:.72rem;line-height:1.4}
    .cards-card-identity>.sf-badge{grid-column:3;justify-self:end}
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
    .cards-invoice-period-link>span:not([aria-hidden]){align-items:baseline;display:flex;flex-wrap:wrap;gap:3px 6px}
    .cards-invoice-period-link small{white-space:nowrap}
    .cards-invoice-current>strong{font-size:1rem;line-height:1.4}
    .cards-invoice-header{align-items:center;gap:8px;grid-template-columns:minmax(0,1fr) minmax(235px,auto);padding:8px 14px}
    .cards-invoice-title-block{gap:4px;min-width:0}
    .cards-invoice-heading-row{align-items:center;display:flex;flex-wrap:wrap;gap:4px 10px;min-width:0}
    .cards-invoice-title-row{align-items:center;flex-wrap:wrap;gap:8px}
    .cards-invoice-status-actions{align-items:center;display:flex;flex-wrap:wrap;gap:9px}
    .cards-close-invoice{align-items:center;display:inline-flex;gap:6px;min-height:40px;padding:7px 10px}
    .cards-invoice-metadata{align-items:center;display:flex;flex-wrap:wrap;gap:5px 12px}
    .cards-invoice-metadata p{margin:0}
    .cards-invoice-documents{align-items:center;background:transparent;border:0;border-radius:8px;color:var(--primary);cursor:pointer;display:inline-flex;font-size:.77rem;font-weight:700;gap:7px;min-height:40px;padding:7px 9px;text-align:left}
    .cards-invoice-documents:hover{background:var(--primary-soft)}
    .cards-invoice-documents:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
    .cards-invoice-title-block h2{font-size:1.18rem;line-height:1.3;margin:0}
    .cards-invoice-title-block p{font-size:.77rem;line-height:1.5}
    .cards-invoice-primary{align-items:end;gap:5px;justify-items:end;min-width:0}
    .cards-invoice-primary>strong{font-size:1.55rem;line-height:1.15;overflow-wrap:anywhere;text-align:right}
    .cards-invoice-actions{align-items:center;display:flex;gap:7px;justify-content:flex-end;margin-top:5px}
    .cards-invoice-actions .sf-button{min-height:44px;white-space:nowrap}
    .cards-purchase-section-header{align-items:center;border-top:1px solid var(--line);border-bottom:0;display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;padding:8px 14px 4px}
    .cards-purchase-section-header h3{font-size:.96rem;font-weight:800;line-height:1.4;margin:0}
    .cards-purchase-title{align-items:baseline;display:flex;flex-wrap:wrap;gap:6px 10px}
    .cards-purchase-title>span{color:var(--muted);font-size:.72rem;font-weight:700}
    .cards-purchase-section-header .sf-button{align-items:center;display:inline-flex;justify-content:center;min-height:44px}
    .cards-settlement-note{font-size:.73rem}
    /* Quiet, comparable financial strip: semantic labels and values, no nested boxes or decorative icons. */
    .cards-invoice-summary{gap:0;padding:0 16px}
    .cards-invoice-summary .sf-summary-grid{display:grid;gap:0;grid-template-columns:repeat(4,minmax(0,1fr))}
    .cards-summary-metric{align-items:start;background:transparent;border:0;border-radius:0;display:flex;gap:0;min-height:64px;min-width:0;padding:10px 12px}
    .cards-summary-metric:first-child{padding-left:0}
    .cards-summary-metric:not(:first-child){border-left:1px solid var(--line)}
    .cards-summary-copy{display:grid;gap:4px;min-width:0;width:100%}
    .cards-summary-copy>span{color:var(--muted);font-size:.72rem;line-height:1.3}
    .cards-summary-copy>strong{font-size:.91rem;font-variant-numeric:tabular-nums;line-height:1.3;min-width:0;white-space:nowrap}
    .cards-summary-copy>strong .sf-money{white-space:nowrap}
    .cards-limit-detail{align-self:start;min-width:0;position:relative}
    .cards-limit-detail>summary{min-height:22px}
    .cards-limit-detail[open]>dl{background:var(--surface);border:1px solid var(--line);border-radius:9px;box-shadow:0 12px 32px rgba(15,23,42,.12);display:grid;gap:6px;min-width:200px;padding:10px;position:absolute;right:0;top:100%;z-index:35}
    .cards-detail-panel .sf-filter-bar{border-bottom:1px solid var(--line);gap:6px;padding:5px 14px 9px}
    .cards-purchase-filter-form{align-items:end;gap:8px;grid-template-columns:minmax(0,1fr) auto auto}
    .cards-search-field{font-size:.77rem!important;gap:5px!important;line-height:1.35!important}
    .cards-search-field input{min-height:44px}
    .cards-advanced-filters>summary{min-height:44px}
    .cards-reconciliation-filters{gap:4px;padding-top:2px}
    .cards-filter-chip{background:transparent;border-color:transparent;border-radius:8px;min-height:34px;padding:6px 9px}
    .cards-filter-chip.is-active{background:var(--primary-soft);border-color:transparent}
    .cards-results-status{font-size:.73rem;margin-left:auto}
    .cards-purchase-groups{gap:8px;padding:8px 14px 14px}
    .cards-section-heading{align-items:baseline}
    .cards-section-heading h3{font-size:1rem}
    .cards-instrument-group{border:0;border-top:1px solid var(--line);border-radius:0;overflow:visible}
    .cards-instrument-group>summary{background:var(--bg);border-radius:8px;gap:8px;min-height:44px;padding:8px 10px}
    .cards-instrument-group>summary strong{font-size:.8rem;overflow-wrap:anywhere}
    .cards-instrument-totals{font-size:.79rem;white-space:nowrap}
    .cards-purchase-table-head,.cards-purchase-row{gap:8px;grid-template-columns:5.7rem minmax(0,1.4fr) minmax(5.7rem,.65fr) 4.2rem minmax(7.5rem,.68fr) 3rem}
    .cards-purchase-table-head{background:var(--surface);padding:6px 10px}
    .cards-purchase-row{min-height:54px;padding:7px 10px}
    .cards-purchase-row:hover{background:var(--bg)}
    .cards-purchase-description strong{font-size:.86rem;line-height:1.35}
    /* Golden Screen: category label follows the outgoing movement arrow, as in Extrato. */
    .cards-purchase-category{align-items:start;color:var(--muted);display:grid;font-size:.75rem;gap:6px;grid-template-columns:13px minmax(0,1fr);line-height:1.4;min-width:0;overflow-wrap:anywhere}
    .cards-purchase-category>svg{display:block;flex-shrink:0;height:13px;margin-top:2px;width:13px}
    .cards-purchase-category-label{min-width:0;overflow-wrap:anywhere}
    @media(max-width:760px){.cards-purchase-row>.cards-purchase-category[data-label="Categoria"]::before{grid-column:1/-1}}
    .cards-purchase-amount{font-size:.82rem;font-variant-numeric:tabular-nums;white-space:normal}
    .cards-summary-copy>strong{overflow-wrap:normal;word-break:normal}
    @media(max-width:1190px){
      .cards-a3-page .sf-detail-layout{gap:12px;grid-template-columns:minmax(205px,225px) minmax(0,1fr)}
      .cards-master-panel{padding:12px}
      .cards-summary-metric:nth-child(3){border-left:0}
      .cards-summary-metric:nth-child(n+3){border-top:1px solid var(--line)}
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
      .cards-a3-page{gap:7px;padding:8px var(--sf-layout-gutter-mobile) 20px}
      .cards-a3-page .sf-detail-layout{gap:7px;grid-template-columns:1fr}
      .cards-master-panel{display:grid;gap:4px 8px;grid-template-columns:minmax(0,1fr) auto;padding:8px 10px;position:static}
    .cards-card-picker{position:relative}
    .cards-card-picker label{clip-path:inset(50%);height:1px;overflow:hidden;position:absolute;white-space:nowrap;width:1px}
      .cards-master-heading{grid-column:2;grid-row:1}
      .cards-master-heading>div{display:none}
      .cards-card-picker{grid-column:1;grid-row:1}
      .cards-card-identity{grid-column:1/-1;grid-row:2;grid-template-columns:28px minmax(0,1fr) auto;gap:6px;min-height:30px;padding:5px 0 0}
      .cards-card-identity>div strong{display:none}
      .cards-card-identity>div span{font-size:.71rem}
      .cards-card-identity>.sf-badge{grid-column:3;justify-self:end}
      .cards-master-details{grid-column:1;grid-row:3}
      .cards-instrument-nav{display:block;grid-column:2;grid-row:3}
      .cards-master-details,.cards-instrument-nav{border-top:0;padding:0}
      .cards-master-details>summary,.cards-instrument-nav>summary{color:var(--primary);font-size:.75rem;min-height:40px}
      .cards-master-details[open]>.cards-master-meta,.cards-instrument-nav[open]>ul{border-top:1px solid var(--line);padding-top:9px}
      .cards-invoice-navigation{display:grid;gap:4px;grid-template-columns:minmax(0,1fr) auto;padding:8px 10px}
      .cards-invoice-period-row{grid-template-columns:40px minmax(0,1fr) 40px;gap:2px}
      .cards-invoice-period-link{justify-content:center;min-height:44px;padding:5px}
      .cards-invoice-current>strong{font-size:.91rem}
      .cards-invoice-header{align-items:stretch;display:flex;flex-direction:column;gap:6px;padding:9px 12px}
    .cards-invoice-primary{order:-1}
    .cards-invoice-title-block{order:0}
    .cards-invoice-title-block h2{clip-path:inset(50%);height:1px;overflow:hidden;position:absolute;white-space:nowrap;width:1px}
    .cards-invoice-title-row>.cards-kicker{clip-path:inset(50%);height:1px;overflow:hidden;position:absolute;white-space:nowrap;width:1px}
    .cards-invoice-heading-row{gap:0}
    .cards-invoice-metadata{gap:3px}
    .cards-invoice-period-link>span:not([aria-hidden]){display:none}
      .cards-invoice-primary{justify-items:start}
      .cards-invoice-primary>strong{font-size:1.6rem;text-align:left}
    .cards-invoice-actions{margin-top:2px}
      .cards-purchase-section-header{align-items:stretch;padding:9px 10px}
      .cards-purchase-section-header .sf-button{margin-left:auto}
      .cards-invoice-actions{display:flex;flex-wrap:wrap;gap:7px;width:100%}
      .cards-invoice-actions .sf-button{flex:1 1 120px;min-width:0}
      .cards-invoice-summary{padding:0 10px}
    .cards-limit-detail[open]>dl{left:0;right:auto}
      .cards-invoice-summary .sf-summary-grid{gap:0;grid-template-columns:repeat(2,minmax(0,1fr))}
      .cards-summary-metric{min-height:54px;padding:7px 8px}
      .cards-summary-copy>strong{font-size:.78rem}
      .cards-summary-metric:nth-child(3){border-left:0}
      .cards-summary-metric:nth-child(n+3){border-top:1px solid var(--line)}
      .cards-summary-metric>strong{font-size:.83rem}
      .cards-detail-panel .sf-filter-bar{padding:6px 10px 8px}
      .cards-purchase-filter-form{grid-template-columns:minmax(0,1fr) auto}
      .cards-search-field{grid-column:1/-1}
      .cards-results-status{margin-left:0}
      .cards-purchase-groups{padding:6px 10px 10px}
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
      .cards-invoice-title-row{align-items:flex-start;flex-direction:column;gap:4px}
      .cards-invoice-status-actions{gap:6px}
      .cards-close-invoice{min-height:40px}
      .cards-purchase-section-header{gap:8px}
      .cards-purchase-section-header .sf-button{margin-left:0;width:100%}
      .cards-invoice-summary .sf-summary-grid{grid-template-columns:1fr}
      .cards-summary-metric:nth-child(n){border-left:0;border-top:1px solid var(--line)}
      .cards-summary-metric:first-child{border-top:0}
      .cards-summary-copy{align-items:baseline;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px}
      .cards-summary-copy>strong{font-size:.82rem;text-align:right;white-space:nowrap}
      .cards-limit-detail{grid-column:1/-1}
      .cards-summary-metric{min-height:42px;padding:6px 8px}
      .cards-invoice-actions{display:grid;grid-template-columns:minmax(0,1fr)}
      .cards-invoice-actions .sf-button{white-space:normal;width:100%}
      .cards-invoice-period-row{grid-template-columns:40px minmax(0,1fr) 40px}
    }
    /* Invoice decision bar: financial amount first, factual context second, actions in a quiet footer. */
    .cards-invoice-navigation{align-items:center;background:var(--bg);display:flex;gap:8px;justify-content:flex-start;padding:4px 14px}
    .cards-invoice-period-row{align-items:center;display:grid;flex:0 1 auto;gap:4px;grid-template-columns:44px minmax(150px,auto) 44px;max-width:100%;min-width:0}
    .cards-invoice-period-link{align-items:center;justify-content:center;min-height:44px;min-width:0;padding:4px}
    .cards-invoice-period-link>span:not([aria-hidden]){display:none}
    .cards-invoice-period-link:focus-visible,.cards-month-picker>summary:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
    .cards-invoice-current>strong{font-size:.95rem;font-weight:800;letter-spacing:-.02em}
    .cards-month-picker{margin-left:auto;min-width:0}
    .cards-month-picker>summary{background:var(--surface);border:1px solid var(--line);border-radius:8px;font-size:.73rem;font-weight:750;min-height:44px;padding:7px 10px}
    .cards-month-picker[open]>summary{background:var(--primary-soft);border-color:var(--primary)}
    .cards-invoice-header{align-items:stretch;display:grid;gap:9px 18px;grid-template-areas:"amount context" "secondary secondary";grid-template-columns:minmax(0,1.2fr) minmax(255px,.8fr);padding:12px 16px 0}
    .cards-invoice-primary{align-content:center;align-items:end;border:0;display:grid;gap:5px 12px;grid-area:amount;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto;justify-items:start;min-width:0;order:0;padding:0}
    .cards-invoice-primary>span{color:var(--muted);font-size:.76rem;grid-column:1/-1;grid-row:1}
    .cards-invoice-primary>strong{font-size:clamp(1.45rem,2vw,1.9rem);font-variant-numeric:tabular-nums;grid-column:1;grid-row:2;letter-spacing:-.03em;line-height:1.16;min-width:0;overflow-wrap:normal;text-align:left;white-space:nowrap}
    .cards-invoice-actions{grid-column:2;grid-row:2;justify-content:flex-end;margin:0;width:auto}
    .cards-invoice-actions .sf-button{min-height:44px;white-space:nowrap}
    .cards-invoice-title-block{align-content:center;border-left:1px solid var(--line);display:grid;gap:6px;grid-area:context;min-width:0;order:0;padding-left:16px}
    .cards-invoice-title-row{align-items:center;display:flex;gap:8px}
    .cards-invoice-heading-row{clip-path:inset(50%);height:1px;overflow:hidden;position:absolute;white-space:nowrap;width:1px}
    .cards-invoice-metadata{align-items:start;display:flex;flex-wrap:wrap;gap:6px 15px;margin:0;min-width:0}
    .cards-invoice-metadata>div{display:grid;gap:3px;min-width:0}
    .cards-invoice-metadata dt{color:var(--muted);font-size:.69rem;line-height:1.2}
    .cards-invoice-metadata dd{color:var(--text);font-size:.8rem;font-weight:750;line-height:1.2;margin:0;white-space:nowrap}
    .cards-invoice-due dd{font-weight:800}
    .cards-invoice-secondary-actions{align-items:center;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:6px;grid-area:secondary;min-height:46px;order:0;padding:2px 0}
    .cards-invoice-secondary-actions :is(.cards-invoice-documents,.cards-close-invoice){align-items:center;background:transparent;border:1px solid transparent;border-radius:8px;box-shadow:none;color:var(--muted);display:inline-flex;font-size:.76rem;font-weight:750;gap:6px;min-height:44px;padding:7px 9px;white-space:normal}
    .cards-invoice-secondary-actions :is(.cards-invoice-documents,.cards-close-invoice):hover{background:var(--primary-soft);color:var(--primary)}
    .cards-invoice-secondary-actions :is(.cards-invoice-documents,.cards-close-invoice):focus-visible{outline:2px solid var(--primary);outline-offset:2px}
    .cards-settlement-note{flex:0 0 auto;font-size:.72rem;margin:0 0 0 auto;max-width:100%;position:relative;text-align:right}
    .cards-settlement-note>summary{align-items:center;color:var(--muted);cursor:pointer;display:inline-flex;justify-content:flex-end;min-height:44px;padding:7px 5px}
    .cards-settlement-note>summary:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
    .cards-settlement-note[open]>p{background:var(--surface);border:1px solid var(--line);border-radius:9px;box-shadow:0 10px 28px rgba(15,23,42,.12);margin:0;padding:12px;position:absolute;right:0;text-align:left;top:calc(100% + 4px);width:min(290px,calc(100vw - 28px));z-index:25}
    @media(max-width:1190px) and (min-width:761px){
      .cards-invoice-header{gap:8px 12px;grid-template-columns:minmax(0,1fr) minmax(220px,.9fr);padding:10px 12px 0}
      .cards-invoice-primary{gap:5px 8px}
      .cards-invoice-primary>strong{font-size:1.48rem}
      .cards-invoice-actions .sf-button{font-size:.76rem;padding:8px 10px}
      .cards-invoice-title-block{padding-left:12px}
    }
    @media(max-width:760px){
      .cards-invoice-navigation{gap:6px;padding:4px 10px}
      .cards-invoice-period-row{flex:1 1 auto;gap:2px;grid-template-columns:38px minmax(0,1fr) 38px;max-width:none}
      .cards-invoice-current>strong{font-size:.87rem}
      .cards-month-picker{flex:0 0 auto}
      .cards-month-picker>summary{font-size:.69rem;padding:7px 8px}
      .cards-invoice-header{gap:8px;grid-template-areas:"amount" "context" "secondary";grid-template-columns:minmax(0,1fr);padding:10px 12px 0}
      .cards-invoice-primary{align-items:start;display:grid;gap:4px 10px;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto;justify-items:start;min-width:0;order:0}
      .cards-invoice-primary>strong{font-size:1.6rem;grid-column:1;grid-row:2;overflow-wrap:anywhere;text-align:left;white-space:normal}
      .cards-invoice-actions{grid-column:2;grid-row:2;justify-content:flex-end;margin:0;width:auto}
      .cards-invoice-actions .sf-button{min-height:44px;min-width:130px;width:auto}
      .cards-invoice-title-block{border-left:0;border-top:1px solid var(--line);gap:5px;order:0;padding:8px 0 0}
      .cards-invoice-title-row{align-items:center;flex-direction:row}
      .cards-invoice-metadata{gap:5px 14px}
      .cards-invoice-secondary-actions{align-items:center;display:grid;gap:3px 6px;grid-template-columns:repeat(2,minmax(0,1fr));min-height:44px;padding:2px 0}
      .cards-invoice-secondary-actions :is(.cards-invoice-documents,.cards-close-invoice){justify-content:center;min-height:44px;min-width:0;padding:7px 4px;width:100%}
      .cards-settlement-note{grid-column:1/-1;justify-self:end;margin:0;min-width:0;text-align:right}
      .cards-settlement-note[open]{justify-self:stretch;text-align:left}
      .cards-settlement-note[open]>p{box-shadow:none;max-width:100%;padding:8px;position:static;right:auto;width:auto}
    }
    @media(max-width:430px){
      .cards-invoice-primary{grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto auto}
      .cards-invoice-primary>strong{grid-column:1;grid-row:2;font-size:1.6rem}
      .cards-invoice-actions{grid-column:1;grid-row:3;justify-content:flex-start;margin-top:3px;width:100%}
      .cards-invoice-actions .sf-button{max-width:300px;min-height:44px;width:100%}
      .cards-invoice-metadata{gap:5px 12px}
      .cards-invoice-secondary-actions :is(.cards-invoice-documents,.cards-close-invoice){font-size:.72rem}
    }
    @media(max-width:350px){
      .cards-invoice-header{padding:8px 10px 0}
      .cards-invoice-primary>strong{font-size:1.5rem}
      .cards-invoice-current>strong{font-size:.72rem;letter-spacing:-.03em;white-space:nowrap}
      .cards-invoice-secondary-actions{gap:2px}
      .cards-invoice-secondary-actions :is(.cards-invoice-documents,.cards-close-invoice){font-size:.68rem;gap:3px;padding:7px 1px;white-space:nowrap}
      .cards-settlement-note{margin-left:0}
    }

  `;
}
