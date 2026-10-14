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
      let heading = accountSummary?.querySelector('.statement-account-heading');
      if (accountSummary && context && balance && !heading) {
        const duplicateHeading = accountSummary.querySelector(':scope > div:first-child');
        if (duplicateHeading) {
          duplicateHeading.hidden = true;
          duplicateHeading.classList.add('statement-summary-duplicate');
        }
        heading = document.createElement('header');
        heading.className = 'statement-account-heading';
        heading.append(context, balance);
        accountSummary.prepend(heading);
        accountSummary.dataset.mockupComposition = 'true';
      }

      const filterForm = root.querySelector('.filter-form');
      if (filterForm && !filterForm.querySelector('.statement-mobile-advanced-filters')) {
        const selectors = ['.statement-kind-field', '.statement-status-field',
          '.statement-reconciliation-field', '.statement-category-field', '.statement-sort-field'];
        const fields = selectors.map((selector) => filterForm.querySelector(selector)).filter(Boolean);
        if (fields.length === selectors.length) {
          const details = document.createElement('details');
          details.className = 'statement-mobile-advanced-filters';
          const trigger = document.createElement('summary');
          const activeCount = () => fields.filter((field) => {
            const select = field.querySelector('select');
            return select && select.value !== '' && !(select.name === 'sort' && select.value === 'date_asc');
          }).length;
          const updateTrigger = () => {
            const count = activeCount();
            trigger.textContent = count ? 'Filtros ativos (' + count + ')' : 'Filtros e ordenação';
          };
          updateTrigger();
          const content = document.createElement('div');
          content.className = 'statement-mobile-advanced-fields';
          fields[0].before(details);
          content.append(...fields);
          details.append(trigger, content);
          const compact = window.matchMedia('(max-width: 760px)');
          const sync = () => {
            if (!compact.matches) {
              details.open = true;
              details.removeAttribute('data-mobile-initialized');
            } else if (!details.hasAttribute('data-mobile-initialized')) {
              details.open = activeCount() > 0;
              details.setAttribute('data-mobile-initialized', 'true');
            }
          };
          compact.addEventListener('change', sync);
          for (const field of fields) field.addEventListener('change', updateTrigger);
          filterForm.addEventListener('reset', () => queueMicrotask(updateTrigger));
          sync();
        }
      }
      // Keep the account selector with the financial context, not in the search/filter strip.
      // Its canonical GET field still belongs to the original form after the move.
      const accountField = filterForm?.querySelector('.account-field');
      if (filterForm && context && accountField && !context.querySelector('.statement-account-control')) {
        if (!filterForm.id) filterForm.id = 'statement-filters';
        const accountInput = accountField.querySelector('input[name="accountId"]');
        if (accountInput) {
          accountInput.setAttribute('form', filterForm.id);
          // Moving the field outside its form also moves its bubbling change event.
          // Preserve the original automatic account navigation without cloning listeners.
          accountInput.addEventListener('change', () => filterForm.requestSubmit());
        }
        const accountControl = document.createElement('div');
        accountControl.className = 'statement-account-control';
        accountControl.append(accountField);
        context?.append(accountControl);
      }
      const monthField = filterForm?.querySelector('.month-field');
      const currentMonth = filterForm?.querySelector('[data-month-current]');
      if (filterForm && monthField && heading && !heading.querySelector('.statement-period-control')) {
        if (!filterForm.id) filterForm.id = 'statement-filters';
        const monthInput = monthField.querySelector('input[name="month"]');
        if (monthInput) monthInput.setAttribute('form', filterForm.id);
        const periodControl = document.createElement('div');
        periodControl.className = 'statement-period-control';
        periodControl.setAttribute('aria-label', 'Período do extrato');
        periodControl.append(monthField);
        if (currentMonth) periodControl.append(currentMonth);
        heading.insertBefore(periodControl, balance);
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

      // Balance visibility: the amount keeps its slot so the layout never shifts.
      for (const toggle of root.querySelectorAll('[data-balance-toggle]')) {
        const target = toggle.closest('.summary-balance')?.querySelector('strong');
        if (!target) continue;
        toggle.addEventListener('click', () => {
          const hidden = toggle.getAttribute('aria-pressed') === 'true';
          if (hidden) {
            target.textContent = target.dataset.balanceValue ?? target.textContent;
          } else {
            target.dataset.balanceValue = target.textContent;
            target.textContent = '••••••';
          }
          toggle.setAttribute('aria-pressed', String(!hidden));
          toggle.setAttribute('aria-label', hidden ? 'Ocultar saldo atual' : 'Mostrar saldo atual');
        });
      }
    })();
  </script>${statementMockupControlsRuntime()}`;
}

export function statementGoldenRefinementStyles(): string {
  const { spacing, density, typography } = solverFinDesignTokens;
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
    ${root} .statement-account-control{min-width:0;width:100%}
    ${root} .statement-account-control .account-field{display:grid;gap:${spacing[1]};max-width:none;min-width:0;width:100%}
    ${root} .statement-account-control .account-select-trigger{width:100%}
    ${root} .statement-account-control :is(label,.account-select,.account-select-trigger){box-sizing:border-box;max-width:100%;min-width:0;width:100%}
    ${root} .statement-account-control .account-select-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    /* G3: the account control reads as the financial identity, not as a form field. */
    ${root} .statement-account-control .account-select-copy{align-content:center;display:grid;gap:2px;min-width:0}
    ${root} .statement-account-control .account-select-text{font-size:${typography.sizes.md};font-weight:${typography.weights.semibold};text-align:left}
    ${root} .statement-account-control .account-select-text{overflow:visible;overflow-wrap:anywhere;text-overflow:clip;white-space:normal}
    ${root} .statement-account-control .account-select-copy{min-width:0;overflow-wrap:anywhere}
    ${root} .statement-account-control .account-select-sub{color:var(--muted);font-size:${typography.sizes.xs};line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    ${root} .statement-account-control .account-select-trigger{background:transparent;border:0;column-gap:${spacing[2]};padding:0}
    ${root} .statement-account-control .account-select-icon{border-radius:11px;flex:0 0 auto;height:44px;overflow:hidden;width:44px}
    ${root} .statement-account-control .account-select-icon :is(img,svg){height:100%;width:100%}
    ${root} .summary-balance-line{align-items:center;display:flex;gap:${spacing[2]};min-width:0}
    ${root} .summary-balance-toggle{align-items:center;background:transparent;border:0;color:var(--muted);cursor:pointer;display:inline-flex;flex:0 0 auto;justify-content:center;min-height:24px;min-width:24px;padding:0}
    ${root} .summary-balance-toggle:hover{color:var(--text)}
    ${root} .summary-balance-toggle[aria-pressed="true"]{color:var(--primary)}
        ${root} .statement-account-heading .summary-balance{border-left:1px solid var(--line);padding-left:${spacing[4]}}
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
      ${root} .statement-account-control .account-field>label{clip-path:inset(50%);height:1px;overflow:hidden;position:absolute;width:1px}
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
    ${root} .summary-total[data-summary-total="income"]{background:#f0fdf4}
    ${root} .summary-total[data-summary-total="income"] .summary-total-icon{background:#dcfce7;color:#15803d}
    ${root} .summary-total[data-summary-total="expense"]{background:#fef2f2}
    ${root} .summary-total[data-summary-total="expense"] .summary-total-icon{background:#fee2e2;color:#b91c1c}
    ${root} .summary-total[data-summary-total="closing"]{background:#f8fafc}
    ${root} .summary-total[data-summary-total="closing"] .summary-total-icon{background:#e2e8f0;color:#334155}
    ${root} .statement-body .col-description>strong{font-weight:700;line-height:1.4}
    ${root} .statement-body .col-amount{font-variant-numeric:tabular-nums;font-weight:700;letter-spacing:-.015em}
    /* Reference glyph: a soft tile per movement, tinted by its own direction or category. */
    ${root} .statement-body .col-row-icon{align-items:center;background:#f1f5f9;border-radius:12px;color:#64748b;display:inline-flex;flex:0 0 auto;height:44px;justify-content:center;width:44px}
    ${root} .statement-body .col-row-icon svg{display:block;height:21px;width:21px}
    ${root} .statement-row[data-row-glyph="expense"] .col-row-icon{background:#fef2f2;color:#b91c1c}
    ${root} .statement-row[data-row-glyph="income"] .col-row-icon{background:#ecfdf5;color:#047857}
    ${root} .statement-row[data-row-glyph="incomeCategory"] .col-row-icon{background:#ecfdf5;color:#047857}
    ${root} .statement-row[data-row-glyph="transfer"] .col-row-icon{background:#eef2ff;color:#4338ca}
    ${root} .statement-row[data-row-glyph="food"] .col-row-icon{background:#fff7ed;color:#c2410c}
    ${root} .statement-row[data-row-glyph="health"] .col-row-icon{background:#fdf2f8;color:#be185d}
    ${root} .statement-row[data-row-glyph="transport"] .col-row-icon{background:#eff6ff;color:#1d4ed8}
    ${root} .statement-row[data-row-glyph="home"] .col-row-icon{background:#f5f3ff;color:#6d28d9}
    ${root} .statement-row[data-row-glyph="utility"] .col-row-icon{background:#fefce8;color:#a16207}
    ${root} .statement-row[data-row-glyph="education"] .col-row-icon{background:#ecfeff;color:#0e7490}
    ${root} .statement-row[data-row-glyph="leisure"] .col-row-icon{background:#f0fdfa;color:#0f766e}
    ${root} .statement-row[data-row-glyph="investment"] .col-row-icon{background:#f0fdf4;color:#15803d}
    ${root} .statement-row[data-row-glyph="tax"] .col-row-icon{background:#f8fafc;color:#475569}
    ${root} .statement-row[data-row-glyph="receipt"] .col-row-icon{background:#f8fafc;color:#475569}
    ${root} .statement-body .col-category{align-items:center;align-self:start;background:#f1f5f9;border-radius:999px;color:#475569;display:inline-flex;gap:5px;max-width:100%;padding:3px 9px;width:max-content}
    ${root} .statement-body .col-category:empty{display:none}
    ${root} .statement-body .col-category svg{display:block;flex:0 0 auto}
    ${root} .statement-body .col-category-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    /* The chip wears the tint of its own category, matching the glyph tile. */
    /* The chip wears the colour of the movement direction it leads with: entry green,
       exit red, transfer grey. */
    ${root} .statement-body .col-category[data-category-direction="in"]{background:#ecfdf5;color:#047857}
    ${root} .statement-body .col-category[data-category-direction="out"]{background:#fef2f2;color:#b91c1c}
    ${root} .statement-body .col-category[data-category-direction="transfer"]{background:#f1f5f9;color:#475569}
    /* Reference description: a strong title over a muted second line. */
    ${root} .statement-body .description-note{color:var(--muted);display:block;font-size:${typography.sizes.xs};line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    /* Reference selection control: a rounded square, not a native circle. */
    ${root} .statement-body .col-select input[type="checkbox"]{appearance:none;background:#fff;border:1.5px solid #cbd5e1;border-radius:5px;cursor:pointer;height:18px;margin:0;position:relative;width:18px}
    ${root} .statement-body .col-select input[type="checkbox"]:hover{border-color:#94a3b8}
    ${root} .statement-body .col-select input[type="checkbox"]:checked{background:var(--primary);border-color:var(--primary)}
    ${root} .statement-body .col-select input[type="checkbox"]:checked::after{border:solid #fff;border-width:0 0 2px 2px;content:"";height:4px;left:5px;position:absolute;top:2px;transform:rotate(-45deg);width:8px}
    ${root} .statement-body .col-select input[type="checkbox"]:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
    ${root} .statement-body .col-select input[type="checkbox"]:disabled{cursor:not-allowed;opacity:.45}
    ${root} .statement-body :is(.col-kind,.col-balance){color:var(--muted)}
    /* M02/M04: metadata stays secondary and on one line so it neither competes with the
       description/amount nor inflates the row height of the movement list. */
    /* Status keeps the semantic label in aria-label/title, while only its glyph is visible. */
    ${root} .statement-body .statement-status{align-items:center;border:1px solid transparent;border-radius:999px;display:inline-flex;flex:0 0 auto;height:32px;justify-content:center;max-width:100%;min-width:32px;padding:0;width:32px}
    ${root} .statement-body .col-status{justify-self:center}
    ${root} .statement-body .statement-status-label{display:none}
    ${root} .statement-body .statement-status svg{flex:0 0 auto;height:14px;width:14px}
    ${root} .statement-body .statement-status-label{font-size:inherit;font-weight:inherit;line-height:1.25;overflow:hidden;text-overflow:ellipsis}
    ${root} .statement-body .statement-status-ok{background:#dcfce7;border-color:#bbf7d0;color:#166534}
    ${root} .statement-body .statement-status-posted{background:#f1f5f9;border-color:#e2e8f0;color:#475569}
    ${root} .statement-body .statement-status-pending{background:#fef3c7;border-color:#fde68a;color:#92400e}
    ${root} .statement-body .statement-status-planned{background:#eff6ff;border-color:#dbeafe;color:#1d4ed8}
    ${root} .statement-panel.panel{background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden}
    /* Keep existing canonical GET sorting reachable; do not synthesize unsupported filters. */
    ${root} .statement-query-heading>span{display:block;color:var(--muted);font-size:${typography.sizes.xs}}
    ${root} .statement-mobile-advanced-filters,
    ${root} .statement-mobile-advanced-fields{display:contents}
    ${root} .statement-mobile-advanced-filters>summary{display:none}
    ${root} .filter-form .statement-sort-field{min-width:0}
    ${root} .statement-body .col-amount{font-size:${typography.sizes.md};font-variant-numeric:tabular-nums;font-weight:700}
    ${root} .statement-body .col-description>strong{font-size:${typography.sizes.md};font-weight:700}
    @media(max-width:1100px){
      /* Progressive reduction: compact widths drop the decorative glyph so the long values
         keep their full width, and label and value stay on one line. */
      ${root} .account-summary[data-mockup-composition] .summary-total{align-items:baseline;display:flex;flex-wrap:wrap;justify-content:space-between;padding:${spacing[1]} ${spacing[2]}}
      ${root} .summary-total-copy{align-items:baseline;display:flex;flex-wrap:wrap;gap:2px ${spacing[1]};justify-content:space-between;width:100%}
      ${root} .summary-total-icon{display:none}
    ${root} .statement-body .col-amount{font-size:${typography.sizes.sm}}
    }
    ${root} .statement-toolbar{display:none}
    ${root} .statement-table{max-width:100%;overflow-x:auto;overflow-y:visible}
    ${root} .statement-head{background:transparent;border-bottom:1px solid var(--line);color:#94a3b8;font-size:${typography.sizes.xs};font-weight:${typography.weights.medium};letter-spacing:0;padding-inline:${spacing[3]};text-transform:none}
    ${root} .statement-body{border-bottom:1px solid #eef2f7;padding-block:${spacing[2]};padding-inline:${spacing[3]}}
    ${root} .statement-date-group{display:none}
    ${root} .statement-body .col-description>strong{font-size:${typography.sizes.md}}
    ${root} .statement-body .col-description>span,${root} .statement-body :is(.col-category,.col-kind,.col-balance){font-size:${typography.sizes.xs}}
    ${root} .statement-body .col-amount{font-size:${typography.sizes.md}}
    html:has(body [data-golden-screen="statement"]):has(dialog[data-modal][open]){overflow-y:hidden}
    ${dialog}{border:1px solid var(--line);border-radius:10px;height:fit-content;margin:auto;max-height:calc(100dvh - 32px);max-width:min(440px,calc(100% - 32px));overflow:hidden;padding:0;width:min(440px,calc(100% - 32px))}
    /* Both create and edit dialogs use the same centered viewport contract. Keep the PATCH
       selector for compatibility with the existing edit flow without moving either dialog. */
    ${dialog}:has(form[data-method="PATCH"]){height:fit-content;margin:auto;max-height:calc(100dvh - 32px)}
    ${dialog}::backdrop{background:rgba(15,23,42,.38)}
    ${dialog} .modal-panel{box-sizing:border-box;max-height:calc(100dvh - 34px);min-height:100%;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;padding:${spacing[4]}}
    ${dialog} .statement-entry-heading>.eyebrow{display:none!important}
    ${dialog} .statement-entry-heading{border-bottom:1px solid #eef2f7;grid-column:1!important;grid-row:1;padding-bottom:${spacing[3]};padding-right:${spacing[2]}}
    ${dialog} .statement-entry-heading p{font-size:${typography.sizes.sm}}
    ${dialog} .close-form button{background:transparent;border:0;color:#475569;font-size:${typography.sizes.xl};line-height:1}
    ${dialog} .close-form button::before,${dialog} .close-form button::after{content:none}
    ${dialog} .close-form button>[data-popup-action-icon]{display:none!important}
    body:has(${root}) dialog[data-group-modal] button[data-group-close][aria-label="Fechar"]>[data-popup-action-icon]{display:none!important}
    ${dialog} .modal-panel form[data-form]{display:grid;gap:${spacing[3]};grid-template-columns:repeat(2,minmax(0,1fr));margin-top:${spacing[3]}}
    ${dialog} .modal-panel form[data-form]>label.full,
    ${dialog} .modal-panel form[data-form]>.statement-entry-advanced,
    ${dialog} .modal-panel form[data-form]>.save-row,
    ${dialog} .modal-panel form[data-form]>.statement-entry-kinds{grid-column:1/-1}
    ${dialog} .statement-entry-account input{background:#f8fafc}
    ${dialog} [data-account-readonly-full-name]{align-items:center;background:#f8fafc;border:1px solid var(--line);border-radius:var(--radius);display:flex;font-size:${typography.sizes.sm};line-height:1.4;min-height:${density.interactiveTargetMin};overflow-wrap:anywhere;padding:${spacing[2]} ${spacing[3]};white-space:normal}
    ${dialog} .statement-entry-account-selector{grid-column:1/-1;min-width:0}
    ${dialog} .statement-entry-account-selector select{min-width:0;max-width:100%;width:100%}
    ${dialog} [data-edit-account-full-name]{display:block;font-size:${typography.sizes.xs};line-height:1.4;overflow-wrap:anywhere;white-space:normal}
    ${dialog} .statement-entry-advanced{border-top:1px solid #eef2f7;padding-top:${spacing[2]}}
    ${dialog} .statement-entry-advanced>summary{color:var(--primary);cursor:pointer;font-size:${typography.sizes.sm};font-weight:${typography.weights.medium};min-height:${density.interactiveTargetMin}}
    ${dialog} .statement-entry-advanced-grid{display:grid;gap:${spacing[3]};grid-template-columns:repeat(2,minmax(0,1fr));padding-top:${spacing[2]}}
    ${dialog} .statement-entry-advanced-grid>.full{grid-column:1/-1}
    ${dialog} .save-row{align-items:center;border-top:1px solid #eef2f7;justify-content:flex-end;padding-top:${spacing[3]}}
    ${dialog} .save-row .status-icons{margin-right:auto}
    @media(max-width:1100px){
      body:has(${root}) .app-shell{grid-template-columns:1fr}
      body:has(${root}) .sidebar{background:var(--primary);border-right:0;color:#fff}
      body:has(${root}) .sidebar nav a{color:rgba(255,255,255,.78)}
      body:has(${root}) .sidebar nav a[aria-current="page"]{background:rgba(34,211,238,.18);color:#fff}
      body:has(${root}) .main-area>main{padding:${spacing[2]} ${spacing[3]} ${spacing[6]}}
      ${root} .statement-breadcrumb{display:none}
      body:has(${root}) .sidebar{overflow-x:hidden}
      body:has(${root}) .brand{flex:0 0 var(--sf-density-compact-action-min-height);font-size:0;justify-content:center;overflow:hidden;padding-inline:0;width:var(--sf-density-compact-action-min-height)}
      body:has(${root}) nav{display:grid;flex:1 1 auto;grid-template-columns:repeat(6,minmax(0,1fr));min-width:0;overflow:visible;padding-bottom:0}
      body:has(${root}) nav a{flex:1 1 auto;justify-content:center;min-width:0;padding-inline:0}
      body:has(${root}) nav a[data-nav-priority="primary"]{font-size:0}
      body:has(${root}) .nav-more-toggle{font-size:0;min-width:var(--sf-density-compact-action-min-height);padding:0}
      body:has(${root}) .nav-more-toggle::after{content:"⋯";font-size:var(--sf-font-size-lg);line-height:1}
      ${root} .account-summary[data-mockup-composition]{grid-template-columns:repeat(2,minmax(0,1fr));padding:${spacing[2]};row-gap:${spacing[1]}}
      ${root} .account-summary[data-mockup-composition] .summary-total{min-height:0;padding:${spacing[1]} ${spacing[2]}}
      ${root} .statement-status-details>summary{min-height:32px;padding:0}
      ${root} .statement-query{padding:${spacing[1]}}
      ${root} .filter-form{row-gap:${spacing[1]}}
      ${root} .statement-account-heading{grid-column:1/-1;grid-template-columns:minmax(0,1fr);margin:-${spacing[2]} -${spacing[2]} 0;padding:${spacing[1]} ${spacing[2]}}
      ${root} .statement-period-control{align-items:center;justify-content:space-between;width:100%}
      ${root} .statement-period-control .month-field{flex:1 1 auto;min-width:0}
      ${root} .statement-period-control [data-month-current]{flex:0 0 auto}
      ${root} .statement-query{align-items:stretch;display:grid;grid-template-columns:minmax(0,1fr) auto}
      ${root} #statement-query-fields{grid-column:1/-1}
      ${root} .statement-query-heading{grid-column:2;grid-row:1}
      ${root} .filter-form{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:${spacing[2]}}
      ${root} .filter-form .statement-search-field{grid-column:1/-1}
      /* Progressive reduction: compact widths keep the month stepper and "Mês atual"
         instead of a second row of period shortcuts, which the density budget rejects. */
      ${root} .statement-period-shortcuts{display:none}
      ${root} .statement-filter-count{display:none}
      ${root} .statement-body{box-sizing:border-box;max-width:100%;min-width:0}
      ${root} .statement-body :is(.col-description,.description,.account-remuneration-summary){max-width:100%;min-width:0;overflow-wrap:anywhere}
      ${root} .statement-body .description details.account-remuneration-audit{max-width:100%;min-width:0}
      ${root} .statement-row.account-remuneration-row .col-description{min-width:0;max-width:100%;overflow-wrap:anywhere}
      ${root} .statement-row.account-remuneration-row .description{display:block;min-width:0;max-width:100%}
      ${root} .statement-body.account-remuneration-row .description>strong{max-width:100%;min-width:0;overflow-wrap:anywhere;white-space:normal}
      ${root} .statement-body.account-remuneration-row .account-remuneration-audit summary{max-width:100%;overflow-wrap:anywhere;white-space:normal}
      ${root} .statement-mobile-advanced-filters{display:block;grid-column:1/-1;min-width:0}
      ${root} .statement-mobile-advanced-filters>summary{align-items:center;cursor:pointer;display:flex;min-height:36px;padding:${spacing[1]} ${spacing[2]};border:1px solid var(--line);border-radius:7px;font-size:${typography.sizes.sm}}
      ${root} .statement-mobile-advanced-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:${spacing[2]};padding-top:${spacing[2]}}
      ${root} .statement-mobile-advanced-filters:not([open]) .statement-mobile-advanced-fields{display:none}

      ${root} .filter-form :is(.statement-kind-field,.statement-status-field,.statement-reconciliation-field,.statement-category-field,.statement-sort-field){min-width:0}
      ${root} .filter-form :is(.statement-kind-field,.statement-status-field,.statement-reconciliation-field,.statement-category-field,.statement-sort-field) select{min-width:0;width:100%}
      ${root} .statement-filter-actions{grid-column:1/-1;justify-content:stretch}
      ${root} .statement-filter-actions>button{flex:1}
      ${dialog}{height:fit-content;margin:auto;max-height:calc(100dvh - 32px);max-width:calc(100% - 32px);width:calc(100% - 32px)}
      ${dialog} .modal-panel form[data-form],${dialog} .statement-entry-advanced-grid{grid-template-columns:1fr}
      ${dialog} .statement-entry-advanced-grid>.full{grid-column:auto}
    }

    /* State selectors in the A2 compatibility layer otherwise win over the Golden grid. */
    @media(min-width:1101px){
      /* Content-aware compact bar: each control keeps its complete default value instead of
         inheriting a fractional track that clips the native select and the search placeholder. */
      ${root}[data-statement-options] .filter-form{
        column-gap:${spacing[2]};
        row-gap:${spacing[2]};
        grid-template-columns:minmax(14rem,1.5fr) repeat(4,minmax(9.375rem,1fr)) minmax(0,max-content);
      }
      ${root}[data-statement-options] .filter-form>.statement-search-field{grid-column:auto}
      ${root}[data-statement-options] .filter-form :is(.statement-kind-field,.statement-status-field,.statement-reconciliation-field,.statement-category-field){grid-column:auto}
      ${root}[data-statement-options] .filter-form>.statement-sort-field{grid-column:auto;min-width:0}
      ${root}[data-statement-options] .filter-form>.statement-filter-actions{grid-column:auto;flex-wrap:nowrap;min-width:0}
    }
    /* Intermediate desktops cannot fit six content-sized tracks beside the sidebar.
       Reflow instead of extending the document beyond the viewport. */
    @media(min-width:1101px) and (max-width:1339px){
      ${root}[data-statement-options] .filter-form{grid-template-columns:repeat(3,minmax(0,1fr))}
      ${root}[data-statement-options] .filter-form>.statement-search-field{grid-column:1/-1}
      ${root}[data-statement-options] .filter-form>.statement-filter-actions{grid-column:1/-1;justify-content:end}
    }
    /* Below this width the action group keeps its own row so no filter loses legibility. */
    @media(min-width:1101px) and (max-width:1339px){
      ${root}[data-statement-options] .filter-form>.statement-filter-actions{grid-column:1/-1;justify-content:end}
    }
    @media(min-width:1101px){
      ${root}[data-statement-options="expanded"] .filter-form>.statement-filter-actions{grid-column:1/-1;justify-content:end}
    }
    @media(min-width:1101px){
      ${root} .statement-mobile-advanced-filters::details-content{display:contents}
      /* Reference anatomy: check | glyph | date | description | category | value | status | actions.
         Rows and header share one track list, so the columns always line up. */
      ${root} .statement-row{column-gap:${spacing[2]};grid-template-columns:24px 48px 5.5rem minmax(0,1fr) minmax(0,10rem) minmax(9rem,auto) 3.5rem 36px}
      ${root} .statement-body{grid-template-areas:"select icon date description category amount status actions" "select icon date . . balance . actions"}
      ${root} .statement-body .col-row-icon{grid-area:icon}
      ${root} .statement-body .statement-row-footer{display:contents}
      ${root} .statement-body .col-date{grid-area:date}
      ${root} .statement-body .col-description{grid-area:description}
      ${root} .statement-body .statement-row-metadata{align-items:flex-start;display:flex;flex-direction:column;gap:2px;grid-area:category}
      ${root} .statement-body .col-status{grid-area:status;justify-self:start}
      ${root} .statement-body .col-amount{grid-area:amount}
      ${root} .statement-body .col-balance{grid-area:balance}
      ${root} .statement-body .col-actions{grid-area:actions}
      ${root} .statement-head{grid-template-areas:"select icon date description category amount status actions";row-gap:0}
      ${root} .statement-head .col-row-icon{grid-area:icon}
      ${root} .statement-head .col-date{grid-area:date}
      ${root} .statement-head .col-description{grid-area:description}
      ${root} .statement-head .col-category{clip-path:none;grid-area:category;height:auto;overflow:visible;position:static;width:auto}
      ${root} .statement-head .col-amount{grid-area:amount}
      ${root} .statement-head .col-status{grid-area:status;justify-self:center;text-align:center}
      ${root} .statement-head .col-actions{grid-area:actions}
    }
    @media(max-width:1100px){
      ${root} .statement-body[data-statement-row-refined]{grid-template-areas:"select description actions" "select amount amount" "select metadata metadata" "select status status" "select footer footer"}
      ${root} .statement-body .col-row-icon{display:none}
      ${root} .statement-body .col-status{justify-self:start}
      ${root} .statement-query-heading{display:none}
      ${root} .filter-form .statement-sort-field{display:grid}
      ${root} .statement-query .statement-search-field{font-size:0;line-height:0;gap:0}
      ${root} .statement-query .statement-search-field input{font-size:${typography.sizes.sm};line-height:normal}
    }
    @media(max-width:430px){
      ${root} .statement-period-control{display:grid;grid-template-columns:minmax(0,1fr)}
      ${root} .statement-period-control [data-month-current]{justify-self:end}
    }
    @media(max-width:360px){
      /* Keep the 320px first-viewport budget without truncating the selected account. */
      ${root} .statement-account-heading{gap:${spacing[1]}}
      ${root} .statement-account-control .account-field>label{clip-path:inset(50%);height:1px;overflow:hidden;position:absolute;width:1px}
      ${root} .statement-account-heading .summary-balance{align-items:baseline;display:flex;gap:${spacing[1]};justify-content:space-between}
      ${root} .statement-account-heading .summary-balance strong{font-size:${typography.sizes.md};white-space:nowrap}
      ${root} .account-summary[data-mockup-composition]{grid-template-columns:minmax(0,1fr);row-gap:0}
      ${root} .account-summary[data-mockup-composition] .summary-total{align-items:baseline;display:flex;flex-wrap:nowrap;gap:${spacing[1]};justify-content:space-between;padding:2px 0}
      ${root} .account-summary[data-mockup-composition] .summary-total strong{font-size:${typography.sizes.sm};line-height:${typography.lineHeights.compact};white-space:nowrap;word-break:normal;width:auto}
    }

    ${statementMockupControlsStyles()}
  `;
}
