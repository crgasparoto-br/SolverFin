import {
  renderFilterBar,
  renderPageContainer,
  renderPageHeader,
} from "../design-system/primitives.js";

import {
  statementGoldenRefinementRuntime,
  statementGoldenRefinementStyles,
} from "./statement-golden-refinements.js";

export interface StatementListArchetypeProps {
  actionsHtml: string;
  filtersHtml: string;
  contextHtml: string;
  summaryHtml: string;
  listHtml: string;
  statusHtml?: string;
}

/** Composes the statement without parsing fragments or recalculating financial data. */
export function renderStatementListArchetype(props: StatementListArchetypeProps): string {
  const headerHtml = renderPageHeader({
    title: "Extrato Bancário",
    description: "Acompanhe o saldo e as movimentações da sua conta.",
    actionsHtml: props.actionsHtml,
  });
  const filterHtml = renderFilterBar({
    label: "Filtros do extrato",
    childrenHtml: props.filtersHtml,
  });
  const workspaceHtml = renderPageContainer({
    className: "statement-a2-workspace",
    childrenHtml: `
      <section class="statement-overview" aria-label="Conta e resumo financeiro">
        ${props.contextHtml}${props.summaryHtml}
      </section>
      <section class="statement-query" aria-label="Consulta de movimentações">
        <div class="statement-query-heading">
          <span data-statement-order-summary aria-live="polite">Buscar e filtrar movimentações</span>
          <button type="button" class="ghost-btn" data-statement-options-toggle
            aria-expanded="true" aria-controls="statement-query-fields" hidden>Ordenação e opções</button>
        </div>
        <div id="statement-query-fields">${filterHtml}</div>
      </section>
      ${props.statusHtml ?? ""}
      <section class="statement-layout" data-statement-workspace="true">${props.listHtml}</section>`,
  });

  return `<div data-statement-archetype="A2" data-golden-screen="statement" data-golden-screen-state="candidate">${headerHtml}${workspaceHtml}${statementListArchetypeRuntime()}${statementGoldenRefinementRuntime()}</div>`;
}

function statementListArchetypeRuntime(): string {
  return `<template data-statement-profile-context-template><span class="statement-context-pill" data-context="profile" data-profile-context role="status" aria-live="polite">Perfil: carregando…</span></template>
  <script data-statement-a2-context-runtime="true">
    (() => {
      const root = document.currentScript?.closest('[data-statement-archetype="A2"]');
      if (!root) return;

      const context = root.querySelector('.statement-context');
      const contextMeta = root.querySelector('.statement-context-meta');
      const profileTemplate = root.querySelector('[data-statement-profile-context-template]');
      const profileNode = profileTemplate?.content?.firstElementChild?.cloneNode(true);
      if (profileNode) {
        if (contextMeta) contextMeta.prepend(profileNode);
        else context?.append(profileNode);

        const profileId = new URL(window.location.href).searchParams.get('profileId');
        const profilePath = '/api/financial-profiles' +
          (profileId ? '?profileId=' + encodeURIComponent(profileId) : '');
        fetch(profilePath, { headers: { accept: 'application/json' } })
          .then((response) => {
            if (!response.ok) throw new Error('profile-unavailable');
            return response.json();
          })
          .then((body) => {
            const profiles = Array.isArray(body?.profiles) ? body.profiles : [];
            const profile = profiles.find((candidate) => candidate.id === body?.activeProfileId);
            profileNode.textContent = profile?.name ? 'Perfil: ' + profile.name : 'Perfil indisponível';
          })
          .catch(() => {
            profileNode.textContent = 'Perfil indisponível';
          });
      }

      // Without JavaScript the complete GET form remains visible and operable.
      const optionsToggle = root.querySelector('[data-statement-options-toggle]');
      const sort = root.querySelector('#statement-sort');
      const orderSummary = root.querySelector('[data-statement-order-summary]');
      if (optionsToggle && sort) {
        const syncOrder = () => {
          orderSummary.textContent = 'Ordenação: ' + (sort.selectedOptions[0]?.textContent || sort.value);
        };
        const setExpanded = (expanded) => {
          root.dataset.statementOptions = expanded ? 'expanded' : 'collapsed';
          optionsToggle.setAttribute('aria-expanded', String(expanded));
        };
        optionsToggle.hidden = false;
        setExpanded(sort.value !== 'date_asc');
        syncOrder();
        sort.addEventListener('change', syncOrder);
        optionsToggle.addEventListener('click', () => {
          setExpanded(optionsToggle.getAttribute('aria-expanded') !== 'true');
        });
      }

      const picker = root.querySelector('[data-account-picker]');
      const trigger = picker?.querySelector('[data-account-trigger]');
      const menu = picker?.querySelector('[data-account-menu]');
      if (!picker || !trigger || !menu) return;

      const options = () => Array.from(menu.querySelectorAll('[data-account-option]'));
      const selectedIndex = (items) => {
        const index = items.findIndex((option) => option.getAttribute('aria-selected') === 'true');
        return index >= 0 ? index : 0;
      };
      const close = (restoreFocus = false) => {
        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        if (restoreFocus) trigger.focus();
      };
      const focusOption = (index) => {
        const items = options();
        if (items.length === 0) return;
        const normalized = ((index % items.length) + items.length) % items.length;
        items[normalized].focus();
      };
      const openFromKeyboard = (direction) => {
        const items = options();
        if (items.length === 0) return;
        menu.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        const current = selectedIndex(items);
        focusOption(direction > 0 ? current + 1 : current - 1);
      };

      trigger.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          openFromKeyboard(1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          openFromKeyboard(-1);
        }
      });

      menu.addEventListener('keydown', (event) => {
        const current = event.target?.closest?.('[data-account-option]');
        if (!current) return;
        const items = options();
        const index = items.indexOf(current);
        if (index < 0) return;

        if (event.key === 'ArrowDown') {
          event.preventDefault();
          focusOption(index + 1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          focusOption(index - 1);
        } else if (event.key === 'Home') {
          event.preventDefault();
          focusOption(0);
        } else if (event.key === 'End') {
          event.preventDefault();
          focusOption(items.length - 1);
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          current.click();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          close(true);
        } else if (event.key === 'Tab') {
          close(false);
        }
      });
    })();
  </script>`;
}

export function statementListArchetypeStyles(): string {
  const root = '[data-statement-archetype="A2"][data-golden-screen="statement"]';
  return `
    [data-statement-archetype="A2"] { display: grid; gap: 14px; min-width: 0; }
    ${root} .sf-page-header { align-items: center; padding: 0; }
    ${root} .sf-page-header-copy { max-width: 48rem; }
    ${root} .sf-page-header-title { letter-spacing: -.025em; }
    ${root} .sf-page-header-description { color: var(--muted); max-width: 42rem; }
    ${root} .statement-heading-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; }
    ${root} .statement-heading-actions button { min-height: 44px; }
    ${root} .statement-heading-actions button[data-quick-kind="transfer"],
    ${root} .statement-heading-actions button[data-quick-kind="income"] { background: var(--surface); border: 1px solid var(--line); color: var(--primary); font-weight: 500; }
    ${root} .statement-heading-actions button[data-quick-kind="expense"] { box-shadow: 0 4px 12px color-mix(in srgb, var(--primary) 12%, transparent); font-weight: 750; }
    ${root} :is(button, a, input, select, summary):focus-visible,
    body:has([data-golden-screen="statement"]) dialog :is(button, input, select, textarea):focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }

    .statement-a2-workspace { display: grid; gap: 14px; max-width: none; min-width: 0; padding: 0; }
    ${root} .statement-overview { background: transparent; border: 0; border-radius: 0; min-width: 0; padding: 6px 0 10px; }
    ${root} .statement-context { align-items: center; background: transparent; border: 0; border-bottom: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 12px 24px; justify-content: space-between; min-width: 0; padding: 0 0 10px; }
    ${root} .statement-context-main { align-items: center; display: flex; flex: 1 1 16rem; gap: 12px; min-width: 0; }
    ${root} .statement-context-copy { display: grid; gap: 3px; min-width: 0; }
    ${root} .statement-context-copy strong { font-size: 1.125rem; overflow-wrap: anywhere; white-space: normal; }
    ${root} .statement-context-copy .muted { font-size: .75rem; }
    ${root} .account-select-icon { align-items: center; display: inline-flex; flex-shrink: 0; justify-content: center; overflow: hidden; }
    ${root} .statement-context-main .account-select-icon { background: var(--bg); border-radius: var(--radius); height: 44px; padding: 6px; width: 44px; }
    ${root} .account-select-icon :is(img, svg) { height: auto; max-height: 100%; max-width: 100%; object-fit: contain; width: 100%; }
    ${root} .statement-context-meta { align-items: center; display: flex; flex-wrap: wrap; gap: 6px 12px; }
    ${root} .statement-context-pill { align-items: center; background: transparent; border: 0; color: var(--muted); display: inline-flex; font-size: .75rem; font-weight: 600; min-height: 24px; padding: 0; white-space: normal; }
    ${root} .statement-context-pill[data-context="currency"] { color: var(--primary); letter-spacing: .04em; }

    ${root} .account-summary { background: transparent; border: 0; box-shadow: none; display: grid; gap: 10px 20px; grid-template-columns: repeat(3, minmax(0, 1fr)); min-width: 0; padding: 12px 0 0; position: static; }
    ${root} .account-summary > div:first-child { clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
    ${root} .summary-balance { background: transparent; border: 0; border-radius: 0; display: grid; gap: 2px; min-width: 0; padding: 0; }
    ${root} .summary-balance strong { font-size: 1.55rem; letter-spacing: -.03em; line-height: 1.2; }
    ${root} .summary-balance p { color: var(--muted); font-size: .75rem; line-height: 1.4; margin: 0; }
    ${root} .summary-totals { display: contents; }
    ${root} .summary-total { border: 0; border-radius: 0; align-content: start; display: grid; gap: 7px; min-width: 0; padding: 0 0 0 16px; }
    ${root} .summary-total strong { font-size: 1.25rem; letter-spacing: -.02em; }
    ${root} :is(.summary-total, .summary-balance) > span { color: var(--muted); font-size: .75rem; font-weight: 500; letter-spacing: 0; text-transform: none; }
    ${root} .status-overview { align-items: baseline; border-top: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 6px 16px; grid-column: 1 / -1; padding: 8px 0 0; }
    ${root} .status-overview h3 { color: var(--muted); font-size: .75rem; font-weight: 500; margin: 0; }
    ${root} .status-line { align-items: center; display: inline-grid; gap: 6px; grid-template-columns: auto auto auto; }
    ${root} .status-line :is(p, strong) { font-size: .75rem; font-weight: 500; margin: 0; }
    ${root} .status-line p { color: var(--muted); }
    ${root} .status-line .chip { min-height: 22px; min-width: 22px; padding: 2px 5px; }

    ${root} .statement-query { min-width: 0; }
    ${root} #statement-query-fields { min-width: 0; }
    ${root} .statement-query-heading { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; margin-bottom: 4px; }
    ${root} .statement-query-heading > span { color: var(--muted); font-size: .75rem; }
    ${root} [data-statement-options-toggle] { background: transparent; border-color: var(--line); color: var(--primary); font-size: .75rem; font-weight: 500; min-height: 28px; }
    ${root} [data-statement-options-toggle][aria-expanded="true"] { background: var(--primary-soft); }
    ${root} .sf-filter-bar { background: transparent; border: 0; box-shadow: none; display: block; padding: 0; }
    ${root} .filter-form { align-items: end; display: grid; gap: 10px; grid-template-columns: minmax(12rem, 1fr) minmax(12rem, .9fr) minmax(14rem, 1.3fr) minmax(10rem, .8fr); min-width: 0; }
    ${root}[data-statement-options="collapsed"] .statement-sort-field { display: none; }
    ${root}[data-statement-options="collapsed"] .filter-form { grid-template-columns: minmax(11rem, 1fr) minmax(11rem, .85fr) minmax(12rem, 1.15fr) auto; }
    ${root} .filter-form label,
    ${root} .filter-form :is(.account-field, .month-field) { gap: 4px; color: var(--muted); font-size: .75rem; font-weight: 500; min-width: 0; }
    ${root} .filter-form :is(input, select, button) { max-width: 100%; min-height: 40px; min-width: 0; }
    ${root} .filter-form :is(label, .account-select) { min-width: 0; max-width: 100%; }
    ${root} .filter-form .account-select-trigger { width: 100%; }
    ${root} .filter-form .account-select-text { min-width: 0; overflow-wrap: anywhere; white-space: normal; }
    ${root} .month-nav { background: var(--surface); border-color: var(--line); }
    ${root} .month-nav input { font-weight: 700; }
    ${root} .statement-filter-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; grid-column: 1 / -1; justify-content: flex-end; }
    ${root}[data-statement-options="collapsed"] .statement-filter-actions { flex-wrap: nowrap; grid-column: auto; }
    ${root} .statement-filter-actions > :is(button, a) { background: transparent; border: 1px solid transparent; color: var(--primary); font-size: .8125rem; font-weight: 500; min-height: 36px; padding-inline: 10px; }
    ${root} .statement-filter-actions > button[type="submit"] { border-color: var(--line); }
    ${root} .statement-filter-actions > :is(button, a):hover,
    ${root} [data-statement-options-toggle]:hover { background: var(--primary-soft); color: var(--primary); }
    ${root} .account-select-menu li:focus-visible { background: var(--primary-soft); outline: 2px solid var(--primary); outline-offset: -2px; }
    ${root} .statement-insight-context { background: var(--primary-soft); border: 0; border-left: 3px solid var(--primary); border-radius: var(--radius); font-size: .8125rem; margin: 0; padding: 10px 12px; }

    ${root} .statement-layout { display: grid; gap: 0; grid-template-columns: minmax(0, 1fr); min-width: 0; }
    ${root} .statement-panel.panel { gap: 0; background: transparent; border: 0; border-radius: 0; box-shadow: none; min-width: 0; }
    ${root} .statement-toolbar { align-items: center; border-bottom: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; padding: 8px 0; }
    ${root} .statement-toolbar .eyebrow { display: none; }
    ${root} .statement-toolbar h2 { font-size: .9375rem; }
    ${root} .statement-toolbar .chips { gap: 6px; }
    ${root} .chip { border-color: transparent; font-size: .7rem; font-weight: 500; }
    ${root} .statement-table { max-width: 100%; min-width: 0; overflow-x: auto; }
    ${root} .statement-row { align-items: center; column-gap: 12px; display: grid; grid-template-columns: 24px 6rem minmax(0, 1fr) minmax(4rem, .45fr) 40px minmax(9rem, auto) 36px; min-width: 0; padding: 10px 4px; }
    ${root} .statement-body { grid-template-areas: "select date description description status amount actions" "select date category kind status balance actions"; min-height: 68px; row-gap: 4px; }
    ${root} .statement-row > * { min-width: 0; order: 0; }
    ${root} .statement-body .col-select { grid-area: select; left: auto; position: static; }
    ${root} .statement-body .col-date { padding-left: 0; color: var(--muted); font-size: .8125rem; grid-area: date; }
    ${root} .statement-body .col-description { display: block; grid-area: description; overflow-wrap: anywhere; white-space: normal; }
    ${root} .statement-body .col-description > strong { color: var(--text); font-size: 1rem; font-weight: 700; }
    ${root} .statement-body .col-description > span { color: var(--muted); display: block; font-size: .75rem; margin-top: 3px; }
    ${root} .statement-body .col-category { display: block; grid-area: category; overflow-wrap: anywhere; }
    ${root} .statement-body .col-kind { display: block; grid-area: kind; }
    ${root} .statement-body .col-status { grid-area: status; justify-self: center; }
    ${root} .statement-body .col-amount { margin-left: 0; font-size: 1rem; font-weight: 750; grid-area: amount; justify-self: end; text-align: right; }
    ${root} .statement-body .col-balance { display: block; font-weight: 500; grid-area: balance; justify-self: end; text-align: right; }
    ${root} .statement-body .col-balance::before { content: "Saldo "; font-size: .7rem; font-weight: 400; }
    ${root} .statement-body .col-category,
    ${root} .statement-body .col-kind,
    ${root} .statement-body .col-balance { color: var(--muted); font-size: .75rem; }
    ${root} .statement-body .col-actions { margin-left: 0; grid-area: actions; justify-self: end; }
    ${root} .statement-head { background: transparent; border-bottom: 1px solid var(--line); color: var(--muted); font-size: .75rem; font-weight: 500; padding-block: 8px; }
    ${root} .statement-head .col-select { left: auto; position: static; }
    ${root} .statement-head .col-date { grid-column: 2; }
    ${root} .statement-head .col-description { grid-column: 3 / 5; }
    ${root} .statement-head .col-status { grid-column: 5; }
    ${root} .statement-head .col-amount { grid-column: 6; text-align: right; }
    ${root} .statement-head .col-actions { grid-column: 7; }
    ${root} .statement-head :is(.col-category, .col-kind, .col-balance) { clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; width: 1px; }
    ${root} .statement-date-group { align-items: center; background: transparent; border-bottom: 1px solid var(--line); color: var(--muted); display: flex; font-size: .6875rem; gap: 8px; justify-content: space-between; padding: 6px 4px; }
    ${root} .actions summary { background: transparent; border: 0; border-radius: var(--radius); height: 36px; width: 36px; }
    ${root} .actions summary:hover { background: var(--primary-soft); }
    ${root} .actions-menu { padding: 6px; }
    ${root} .actions-item { min-height: 40px; }
    ${root} .empty { background: transparent; border: 0; margin: 0; padding: 32px 20px; }
    ${root} .statement-row.account-remuneration-row .description { display: block; min-width: 0; }

    body:has([data-golden-screen="statement"]) dialog { border: 1px solid var(--line); border-radius: var(--radius-lg); max-height: calc(100dvh - 32px); overflow-y: auto; }
    body dialog[data-modal], body dialog[data-group-modal] { max-width: min(760px, calc(100% - 32px)); }
    body:has([data-golden-screen="statement"]) dialog[data-modal] { margin-right: 16px; max-width: min(640px, calc(100% - 32px)); }
    body dialog[data-modal] .modal-panel,
    body dialog[data-group-modal] .modal-panel { gap: 12px; min-width: 0; padding: 20px; }
    body dialog[data-modal] .close-form { min-height: 0; position: absolute; right: 14px; top: 12px; z-index: 2; }
    body dialog[data-modal] .close-form button { background: transparent; border-color: transparent; color: var(--muted); min-height: 36px; padding-inline: 8px; }
    body dialog[data-modal] .modal-panel > div:nth-child(2) { border-bottom: 1px solid var(--line); padding-bottom: 10px; padding-right: 104px; }
    body dialog[data-modal] .modal-panel form[data-form] { display: grid; gap: 10px 14px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    body dialog[data-modal] .modal-panel form[data-form] > [data-field="kind"] { grid-column: 1 / -1; }
    body dialog[data-modal] .modal-panel form[data-form] label { color: var(--text); font-size: .8125rem; font-weight: 500; gap: 4px; }
    body dialog[data-modal] .modal-panel form[data-form] :is(input, select, textarea) { color: var(--text); font-size: .875rem; min-height: 36px; }
    body dialog[data-modal] .modal-panel .save-row,
    body dialog[data-group-modal] .modal-panel .save-row { background: var(--surface); border-top: 1px solid var(--line); bottom: 0; margin-top: 4px; padding-top: 12px; position: sticky; z-index: 3; }
    body dialog[data-modal] .status-icons { flex-wrap: wrap; }
    body dialog[data-group-modal] .group-members { border-left: 0; border-right: 0; border-radius: 0; }

    @media (max-width: 1100px) {
      ${root} .filter-form,
      ${root}[data-statement-options="collapsed"] .filter-form { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      ${root} .statement-search-field { grid-column: 1 / -1; }
      ${root}[data-statement-options="collapsed"] .statement-filter-actions { flex-wrap: wrap; grid-column: 1 / -1; }
      ${root} .statement-row { column-gap: 8px; grid-template-columns: 24px 5.5rem minmax(0, 1fr) minmax(3rem, .3fr) 32px minmax(8rem, auto) 28px; padding-inline: 14px; }
    }
    @media (max-width: 760px) {
      ${root} { gap: 10px; }
      body:has(${root}) .topbar { display: none; }
      ${root} .sf-page-header { align-items: stretch; display: grid; }
      ${root} .statement-heading-actions { display: grid; grid-template-columns: 1fr 1fr; width: 100%; }
      ${root} .statement-heading-actions button[data-quick-kind="expense"] { grid-column: 1 / -1; grid-row: 1; }
      ${root} .statement-overview { padding: 0 0 4px; }
      ${root} .sf-page-header-description { font-size: .8125rem; line-height: 1.35; }
      ${root} .statement-context { gap: 12px; }
      ${root} .statement-context-meta { justify-content: flex-start; }
      ${root} .account-summary { gap: 6px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      ${root} .summary-balance { grid-column: 1 / -1; }
      ${root} .summary-balance strong { font-size: clamp(1rem, 5vw, 1.5rem); }
      ${root} .summary-total { align-items: baseline; display: flex; flex-wrap: wrap; gap: 4px 12px; justify-content: space-between; padding: 0; }
      ${root} .summary-total strong { font-size: 1rem; }
      ${root} .status-overview { align-items: start; display: flex; gap: 4px 8px; }
      ${root} .status-overview h3 { flex-basis: 100%; }
      ${root} .status-line { align-items: baseline; display: flex; flex-wrap: wrap; gap: 4px 6px; }
      ${root} .filter-form,
      ${root}[data-statement-options="collapsed"] .filter-form { gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      ${root}[data-statement-options="collapsed"] .statement-query-heading { justify-content: flex-end; margin-bottom: 0; }
      ${root}[data-statement-options="collapsed"] .statement-query-heading > span { display: none; }
      ${root}[data-statement-options="collapsed"] .statement-filter-actions > :is([data-month-current], a) { display: none; }
      ${root}[data-statement-options="collapsed"] .statement-filter-actions { justify-content: flex-end; }
      ${root} .statement-search-field { grid-column: 1 / -1; }
      ${root} .statement-sort-field { grid-column: 1 / -1; }
      ${root} .statement-filter-actions { grid-column: 1 / -1; justify-content: flex-end; }
      ${root} .statement-toolbar { padding: 8px 0; }
      ${root} .statement-head { clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; width: 1px; }
      ${root} .statement-body { display: grid; gap: 4px 8px; grid-template-columns: 24px minmax(0, 1fr) 44px; grid-template-areas: "select description actions" "select amount amount" "select category status" "select kind kind" "select date balance"; padding: 10px 0; }
      ${root} .statement-body .col-description > strong { font-size: .9375rem; }
      ${root} .statement-body .col-status { justify-self: end; }
      ${root} .statement-body .col-amount { font-size: .9375rem; }
      ${root} .statement-body .col-balance { font-size: .7rem; }
      body:has([data-golden-screen="statement"]) dialog[data-modal] { margin-inline: auto; max-width: calc(100% - 16px); }
      body dialog[data-modal] .modal-panel,
      body dialog[data-group-modal] .modal-panel { padding: 20px 16px; }
      body dialog[data-modal] .modal-panel form[data-form] { grid-template-columns: 1fr; }
      body dialog[data-modal] .modal-panel form[data-form] :is(input, select, textarea) { min-height: 44px; }
      body dialog[data-modal] .modal-panel .save-row,
      body dialog[data-group-modal] .modal-panel .save-row { align-items: stretch; }
    }
    ${statementGoldenRefinementStyles()}
  `;
}
