import { solverFinDesignTokens } from "../design-system/tokens.js";

import {
  statementMockupControlsRuntime,
  statementMockupControlsStyles,
} from "./statement-mockup-controls.js";

/** Progressive DOM grouping preserves the original nodes, handlers and no-JS markup. */
export function statementGoldenRefinementRuntime(): string {
  return `<script data-statement-golden-refinements>
    (() => {
      const root = document.currentScript?.closest('[data-golden-screen="statement"]');
      if (!root) return;
      const primary = root.querySelector('[data-quick-kind="expense"]');
      const actions = primary?.parentElement;
      actions?.prepend(primary);
      if (actions && !actions.querySelector('.statement-secondary-actions')) {
        const secondary = Array.from(actions.querySelectorAll('button[data-quick-kind]'))
          .filter((button) => button !== primary);
        if (secondary.length) {
          const menu = document.createElement('details');
          menu.className = 'statement-secondary-actions';
          const trigger = document.createElement('summary');
          trigger.textContent = 'Mais ações';
          trigger.setAttribute('aria-label', 'Mais ações do extrato');
          const content = document.createElement('div');
          content.className = 'statement-secondary-actions-content';
          content.append(...secondary);
          menu.append(trigger, content);
          actions.append(menu);
          menu.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            menu.open = false;
            trigger.focus();
          });
          let returnFocus = false;
          content.addEventListener('click', (event) => {
            if (!event.target.closest('button[data-quick-kind]')) return;
            returnFocus = true;
            menu.open = false;
          });
          document.addEventListener('close', (event) => {
            if (!returnFocus || !event.target.matches('dialog[data-modal]')) return;
            returnFocus = false;
            trigger.focus();
          }, true);
          document.addEventListener('pointerdown', (event) => {
            if (!menu.contains(event.target)) menu.open = false;
          });
        }
      }

      const overview = root.querySelector('.statement-overview');
      const accountSummary = overview?.querySelector('.account-summary');
      const context = overview?.querySelector('.statement-context');
      const balance = accountSummary?.querySelector('.summary-balance');
      if (accountSummary && context && balance && !accountSummary.querySelector('.statement-account-heading')) {
        const duplicateHeading = accountSummary.querySelector(':scope > div:first-child');
        if (duplicateHeading) {
          duplicateHeading.hidden = true;
          duplicateHeading.classList.add('statement-summary-duplicate');
        }
        const heading = document.createElement('header');
        heading.className = 'statement-account-heading';
        heading.append(context, balance);
        accountSummary.prepend(heading);
        accountSummary.dataset.mockupComposition = 'true';
      }
      const listTitle = root.querySelector('#statement-list-title');
      if (listTitle) listTitle.textContent = 'Movimentações';

      for (const row of root.querySelectorAll('.statement-body')) {
        if (row.hasAttribute('data-statement-row-refined')) continue;
        const category = row.querySelector('.col-category');
        const kind = row.querySelector('.col-kind');
        const date = row.querySelector('.col-date');
        const balance = row.querySelector('.col-balance');
        if (!category || !kind || !date || !balance) continue;
        const metadata = document.createElement('div');
        metadata.className = 'statement-row-metadata';
        category.before(metadata);
        metadata.append(category, kind);
        const footer = document.createElement('div');
        footer.className = 'statement-row-footer';
        const actions = row.querySelector('.col-actions');
        if (actions) actions.before(footer);
        else row.append(footer);
        footer.append(date, balance);
        const description = row.querySelector('.col-description');
        const amount = row.querySelector('.col-amount');
        if (description && amount) description.after(amount);
        row.setAttribute('data-statement-row-refined', 'true');
      }
      const status = root.querySelector('.status-overview');
      if (status && !status.querySelector('.statement-status-details')) {
        const details = document.createElement('details');
        details.className = 'statement-status-details';
        const summary = document.createElement('summary');
        summary.textContent = 'Situação do período';
        const content = document.createElement('div');
        content.className = 'statement-status-content';
        status.querySelector('h3')?.remove();
        while (status.firstChild) content.append(status.firstChild);
        details.append(summary, content);
        status.append(details);
      }
    })();
  </script>${statementMockupControlsRuntime()}`;
}

export function statementGoldenRefinementStyles(): string {
  const { spacing, breakpoints, density, typography } = solverFinDesignTokens;
  const root = '[data-statement-archetype="A2"][data-golden-screen="statement"]';
  const dialog = 'body:has([data-golden-screen="statement"]) dialog[data-modal]';
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
    ${root} .statement-account-heading .statement-context{border:0;display:grid;gap:${spacing[1]};padding:0}
    ${root} .statement-account-heading .statement-context-main{flex:none}
    ${root} .statement-account-heading .statement-context-copy>.muted{display:none}
    ${root} .statement-account-heading .statement-context-copy strong{font-size:${typography.sizes.lg}}
    ${root} .statement-account-heading .statement-context-meta{gap:${spacing[1]} ${spacing[3]}}
    ${root} .statement-account-heading .summary-balance{border-left:1px solid var(--line);padding-left:${spacing[4]}}
    ${root} .statement-account-heading .summary-balance strong{font-size:${typography.sizes["2xl"]};overflow-wrap:anywhere}
    ${root} .account-summary[data-mockup-composition] .summary-total{padding:0;gap:${spacing[1]}}
    ${root} .account-summary[data-mockup-composition] .summary-total strong{font-size:${typography.sizes.xl};overflow-wrap:anywhere}
    ${root} .account-summary[data-mockup-composition] .status-overview{border:0;padding:0;grid-column:auto}
    ${root} .statement-status-details{width:100%}
    ${root} .statement-status-details>summary{box-sizing:border-box;color:var(--muted);cursor:pointer;font-size:${typography.sizes.sm};min-height:${density.interactiveTargetMin};padding-block:${spacing[1]}}
    ${root} .statement-status-content{display:flex;flex-wrap:wrap;gap:${spacing[2]} ${spacing[4]};padding-bottom:${spacing[3]}}
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
    @media(max-width:${breakpoints.shellCompact}){
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
      ${root} .statement-account-heading .summary-balance{text-align:left}
      ${root} .account-summary[data-mockup-composition]{column-gap:${spacing[2]};grid-template-columns:repeat(2,minmax(0,1fr))}
      ${root} .account-summary[data-mockup-composition] .summary-total{align-items:start;display:grid;gap:${spacing[1]};min-width:0}
      ${root} .account-summary[data-mockup-composition] .summary-total strong{font-size:${typography.sizes.xs};letter-spacing:-.02em;max-width:100%;overflow-wrap:anywhere}
    }

    /* Mockup parity layer: route-scoped so the Golden Screen can evolve without changing other surfaces. */
    body:has(${root}){background:#f5f7fb}
    body:has(${root}) .app-shell{grid-template-columns:200px minmax(0,1fr)}
    body:has(${root}) .sidebar{background:#fff;border-right:1px solid var(--line);box-shadow:none;color:var(--text);padding:14px 12px}
    body:has(${root}) .brand{color:var(--text)}
    body:has(${root}) .nav-section-label{color:#94a3b8}
    body:has(${root}) .sidebar nav a{color:#334155}
    body:has(${root}) .sidebar nav a:hover{background:#f1f5f9;color:#0f172a}
    body:has(${root}) .sidebar nav a[aria-current="page"]{background:#eef4ff;color:#1d4ed8}
    body:has(${root}) .sidebar .logout{background:transparent;border-color:transparent;color:#475569}
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
    ${root} .statement-account-heading{background:#fff;border:1px solid var(--line);border-radius:9px;grid-template-columns:minmax(0,1fr) minmax(220px,.58fr);margin:-${spacing[3]} -${spacing[3]} 0;padding:${spacing[3]}}
    ${root} .statement-account-heading .statement-context-main .account-select-icon{height:44px;width:44px}
    ${root} .statement-account-heading .statement-context-copy strong{font-size:${typography.sizes.md}}
    ${root} .statement-account-heading .summary-balance strong{color:#07883f;font-size:${typography.sizes.xl}}
    ${root} .summary-totals{display:contents}
    ${root} .account-summary[data-mockup-composition] .summary-total{background:#fff;border:1px solid var(--line);border-radius:8px;gap:${spacing[1]};min-height:64px;padding:${spacing[3]}}
    ${root} .account-summary[data-mockup-composition] .summary-total strong{font-size:${typography.sizes.md}}
    ${root} .summary-total .credit{color:#07883f}
    ${root} .summary-total .debit{color:#dc2626}
    ${root} .summary-total .neutral{color:#0f172a}
    ${root} .account-summary[data-mockup-composition] .status-overview{grid-column:1/-1}
    ${root} .statement-query{background:#fff;border-radius:10px;padding:${spacing[2]}}
    ${root} .statement-query-heading>span{display:none}
    ${root} .filter-form{align-items:end;grid-template-columns:minmax(170px,.95fr) minmax(180px,.9fr) minmax(260px,1.6fr) auto}
    ${root} .filter-form :is(.account-field,.month-field)>label,${root} .statement-search-field{font-size:0}
    ${root} .statement-search-field input{font-size:${typography.sizes.sm}}
    ${root} .statement-filter-actions{align-self:end;grid-column:auto}
    ${root} .statement-filter-actions>a{display:none}
    ${root} .statement-filter-actions>[data-month-current]{border:1px solid var(--line);border-radius:999px}
    ${root} .statement-filter-actions>button[type="submit"]{background:#fff;border:1px solid var(--line);border-radius:7px}
    ${root} .statement-panel.panel{background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden}
    ${root} .statement-toolbar{display:none}
    ${root} .statement-table{max-width:100%;overflow-x:auto;overflow-y:visible}
    ${root} .statement-head{background:#f8fafc;padding-inline:${spacing[3]}}
    ${root} .statement-body{border-bottom:1px solid #eef2f7;padding-inline:${spacing[3]}}
    ${root} .statement-date-group{display:none}
    ${root} .statement-body .col-description>strong{font-size:${typography.sizes.sm}}
    ${root} .statement-body .col-description>span,${root} .statement-body :is(.col-category,.col-kind,.col-balance){font-size:${typography.sizes.xs}}
    ${root} .statement-body .col-amount{font-size:${typography.sizes.sm}}
    ${dialog}{border:1px solid var(--line);border-radius:10px;height:calc(100dvh - 32px);margin:16px 16px 16px auto;max-height:calc(100dvh - 32px);max-width:min(440px,calc(100% - 32px));padding:0;width:min(440px,calc(100% - 32px))}
    ${dialog}::backdrop{background:rgba(15,23,42,.38)}
    ${dialog} .modal-panel{box-sizing:border-box;min-height:100%;padding:${spacing[4]}}
    ${dialog} .statement-entry-heading>.eyebrow{display:none!important}
    ${dialog} .statement-entry-heading{border-bottom:1px solid #eef2f7;grid-column:1!important;grid-row:1;padding-bottom:${spacing[3]};padding-right:${spacing[2]}}
    ${dialog} .statement-entry-heading p{font-size:${typography.sizes.sm}}
    ${dialog} .close-form button{background:transparent;border:0;color:#475569;font-size:0}
    ${dialog} .close-form button::before{content:'×';font-size:${typography.sizes.xl}}
    ${dialog} .modal-panel form[data-form]{display:grid;gap:${spacing[3]};grid-template-columns:repeat(2,minmax(0,1fr));margin-top:${spacing[3]}}
    ${dialog} .modal-panel form[data-form]>label.full,
    ${dialog} .modal-panel form[data-form]>.statement-entry-advanced,
    ${dialog} .modal-panel form[data-form]>.save-row,
    ${dialog} .modal-panel form[data-form]>.statement-entry-kinds{grid-column:1/-1}
    ${dialog} .statement-entry-account input{background:#f8fafc}
    ${dialog} .statement-entry-advanced{border-top:1px solid #eef2f7;padding-top:${spacing[2]}}
    ${dialog} .statement-entry-advanced>summary{color:var(--primary);cursor:pointer;font-size:${typography.sizes.sm};font-weight:${typography.weights.medium};min-height:${density.interactiveTargetMin}}
    ${dialog} .statement-entry-advanced-grid{display:grid;gap:${spacing[3]};grid-template-columns:repeat(2,minmax(0,1fr));padding-top:${spacing[2]}}
    ${dialog} .statement-entry-advanced-grid>.full{grid-column:1/-1}
    ${dialog} .save-row{align-items:center;border-top:1px solid #eef2f7;justify-content:flex-end;padding-top:${spacing[3]}}
    ${dialog} .save-row .status-icons{margin-right:auto}
    @media(max-width:${breakpoints.shellCompact}){
      body:has(${root}) .app-shell{grid-template-columns:1fr}
      body:has(${root}) .sidebar{background:var(--primary);border-right:0;color:#fff}
      body:has(${root}) .sidebar nav a{color:rgba(255,255,255,.78)}
      body:has(${root}) .sidebar nav a[aria-current="page"]{background:rgba(34,211,238,.18);color:#fff}
      body:has(${root}) .main-area>main{padding:${spacing[2]} ${spacing[3]} ${spacing[6]}}
      ${root} .statement-breadcrumb{display:none}
      ${root} .account-summary[data-mockup-composition]{grid-template-columns:repeat(2,minmax(0,1fr));padding:${spacing[2]};row-gap:${spacing[1]}}
      ${root} .account-summary[data-mockup-composition] .summary-total{min-height:0;padding:${spacing[2]}}
      ${root} .statement-status-details>summary{min-height:32px;padding:0}
      ${root} .statement-query{padding:${spacing[1]}}
      ${root} .filter-form{row-gap:${spacing[1]}}
      ${root} .statement-account-heading{grid-column:1/-1;margin:-${spacing[2]} -${spacing[2]} 0;padding:${spacing[1]} ${spacing[2]}}
      ${root} .filter-form{grid-template-columns:1fr}
      ${root} .statement-filter-actions{grid-column:1/-1;justify-content:stretch}
      ${root} .statement-filter-actions>button{flex:1}
      ${dialog}{height:calc(100dvh - 16px);margin:8px;max-height:calc(100dvh - 16px);max-width:calc(100% - 16px);width:calc(100% - 16px)}
      ${dialog} .modal-panel form[data-form],${dialog} .statement-entry-advanced-grid{grid-template-columns:1fr}
      ${dialog} .statement-entry-advanced-grid>.full{grid-column:auto}
    }

    ${statementMockupControlsStyles()}
  `;
}
