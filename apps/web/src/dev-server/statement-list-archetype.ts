import {
  renderFilterBar,
  renderPageContainer,
  renderPageHeader,
} from "../design-system/primitives.js";

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

  return `<div data-statement-archetype="A2" data-golden-screen="statement" data-golden-screen-state="candidate">${headerHtml}${workspaceHtml}${statementListArchetypeRuntime()}</div>`;
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

      // Enhance the existing kind select; retain its payload, validation and change handlers.
      const enhanceKindControl = () => {
        const dialog = document.querySelector('dialog[data-modal]');
        const form = dialog?.querySelector('form[data-form]');
        const select = form?.querySelector('select[name="kind"]');
        const field = select?.closest('label');
        if (!dialog || !form || !select || !field || dialog.querySelector('[data-statement-kind-tabs]')) return;
        const group = document.createElement('div');
        group.className = 'statement-kind-tabs';
        group.dataset.statementKindTabs = '';
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', 'Tipo de lançamento');
        const names = { expense: 'Despesa', income: 'Receita', transfer: 'Transferência' };
        const buttons = Array.from(select.options).filter((option) => names[option.value]).map((option) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.statementKind = option.value;
          button.textContent = names[option.value];
          button.addEventListener('click', () => {
            if (button.disabled) return;
            select.value = option.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            syncKind();
          });
          group.append(button);
          return { button, option };
        });
        if (buttons.length !== select.options.length) return;
        const syncKind = () => {
          for (const { button, option } of buttons) {
            button.disabled = select.disabled || option.disabled;
            button.setAttribute('aria-pressed', String(select.value === option.value));
          }
        };
        form.before(group);
        // Do not override field.hidden: existing transfer/recurrence logic owns that state.
        field.classList.add('statement-kind-native');
        select.addEventListener('change', syncKind);
        form.addEventListener('reset', () => queueMicrotask(syncKind));
        new MutationObserver(syncKind).observe(dialog, { attributes: true, attributeFilter: ['open'] });
        new MutationObserver(syncKind).observe(select, { attributes: true, subtree: true, attributeFilter: ['disabled'] });
        syncKind();
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhanceKindControl, { once: true });
      else enhanceKindControl();

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
  return `
    [data-statement-archetype="A2"] { display: grid; gap: 20px; min-width: 0; }
    [data-statement-archetype="A2"] .sf-page-header { align-items: center; padding: 0; }
    [data-statement-archetype="A2"] .sf-page-header-copy { max-width: 48rem; }
    [data-statement-archetype="A2"] .sf-page-header-title { letter-spacing: -.025em; }
    [data-statement-archetype="A2"] .sf-page-header-description { color: var(--muted); max-width: 42rem; }
    [data-statement-archetype="A2"] .statement-heading-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; }
    [data-statement-archetype="A2"] .statement-heading-actions button { min-height: 44px; }
    [data-statement-archetype="A2"] .statement-heading-actions button[data-quick-kind="transfer"],
    [data-statement-archetype="A2"] .statement-heading-actions button[data-quick-kind="income"] { background: var(--surface); border: 1px solid var(--line); color: var(--primary); font-weight: 500; }
    [data-statement-archetype="A2"] .statement-heading-actions button[data-quick-kind="expense"] { box-shadow: 0 4px 12px color-mix(in srgb, var(--primary) 12%, transparent); font-weight: 750; }
    [data-statement-archetype="A2"] :is(button, a, input, select, summary):focus-visible,
    body:has([data-golden-screen="statement"]) dialog :is(button, input, select, textarea):focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }

    .statement-a2-workspace { display: grid; gap: 18px; max-width: none; min-width: 0; padding: 0; }
    [data-statement-archetype="A2"] .statement-overview { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); min-width: 0; padding: 20px 24px 14px; }
    [data-statement-archetype="A2"] .statement-context { align-items: center; background: transparent; border: 0; border-bottom: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 12px 24px; justify-content: space-between; min-width: 0; padding: 0 0 16px; }
    [data-statement-archetype="A2"] .statement-context-main { align-items: center; display: flex; flex: 1 1 16rem; gap: 12px; min-width: 0; }
    [data-statement-archetype="A2"] .statement-context-copy { display: grid; gap: 3px; min-width: 0; }
    [data-statement-archetype="A2"] .statement-context-copy strong { font-size: 1.125rem; overflow-wrap: anywhere; white-space: normal; }
    [data-statement-archetype="A2"] .statement-context-copy .muted { font-size: .75rem; }
    [data-statement-archetype="A2"] .account-select-icon { align-items: center; display: inline-flex; flex-shrink: 0; justify-content: center; overflow: hidden; }
    [data-statement-archetype="A2"] .statement-context-main .account-select-icon { background: var(--bg); border-radius: var(--radius); height: 44px; padding: 6px; width: 44px; }
    [data-statement-archetype="A2"] .account-select-icon :is(img, svg) { height: auto; max-height: 100%; max-width: 100%; object-fit: contain; width: 100%; }
    [data-statement-archetype="A2"] .statement-context-meta { align-items: center; display: flex; flex-wrap: wrap; gap: 6px 12px; }
    [data-statement-archetype="A2"] .statement-context-pill { align-items: center; background: transparent; border: 0; color: var(--muted); display: inline-flex; font-size: .75rem; font-weight: 600; min-height: 24px; padding: 0; white-space: normal; }
    [data-statement-archetype="A2"] .statement-context-pill[data-context="currency"] { color: var(--primary); letter-spacing: .04em; }

    [data-statement-archetype="A2"] .account-summary { background: transparent; border: 0; box-shadow: none; display: grid; gap: 16px 24px; grid-template-columns: repeat(3, minmax(0, 1fr)); min-width: 0; padding: 18px 0 0; position: static; }
    [data-statement-archetype="A2"] .account-summary > div:first-child { clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
    [data-statement-archetype="A2"] .summary-balance { background: transparent; border: 0; border-radius: 0; display: grid; gap: 4px; min-width: 0; padding: 0; }
    [data-statement-archetype="A2"] .summary-balance strong { font-size: 1.75rem; letter-spacing: -.03em; }
    [data-statement-archetype="A2"] .summary-balance p { color: var(--muted); font-size: .75rem; line-height: 1.4; margin: 0; }
    [data-statement-archetype="A2"] .summary-totals { display: contents; }
    [data-statement-archetype="A2"] .summary-total { border: 0; border-radius: 0; align-content: start; display: grid; gap: 7px; min-width: 0; padding: 0 0 0 24px; }
    [data-statement-archetype="A2"] .summary-total strong { font-size: 1.4rem; letter-spacing: -.02em; }
    [data-statement-archetype="A2"] :is(.summary-total, .summary-balance) > span { color: var(--muted); font-size: .75rem; font-weight: 500; letter-spacing: 0; text-transform: none; }
    [data-statement-archetype="A2"] .status-overview { align-items: baseline; border-top: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 10px 20px; grid-column: 1 / -1; padding: 12px 0 0; }
    [data-statement-archetype="A2"] .status-overview h3 { color: var(--muted); font-size: .75rem; font-weight: 500; margin: 0; }
    [data-statement-archetype="A2"] .status-line { align-items: center; display: inline-grid; gap: 6px; grid-template-columns: auto auto auto; }
    [data-statement-archetype="A2"] .status-line :is(p, strong) { font-size: .75rem; margin: 0; }
    [data-statement-archetype="A2"] .status-line p { color: var(--muted); }
    [data-statement-archetype="A2"] .status-line .chip { min-height: 22px; min-width: 22px; padding: 2px 5px; }

    [data-statement-archetype="A2"] .statement-query { min-width: 0; }
    [data-statement-archetype="A2"] .statement-query-heading { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; margin-bottom: 8px; }
    [data-statement-archetype="A2"] .statement-query-heading > span { color: var(--muted); font-size: .75rem; }
    [data-statement-archetype="A2"] [data-statement-options-toggle] { background: transparent; border-color: var(--line); color: var(--primary); font-size: .8125rem; font-weight: 500; min-height: 36px; }
    [data-statement-archetype="A2"] [data-statement-options-toggle][aria-expanded="true"] { background: var(--primary-soft); }
    [data-statement-archetype="A2"] .sf-filter-bar { background: transparent; border: 0; box-shadow: none; display: block; padding: 0; }
    [data-statement-archetype="A2"] .filter-form { align-items: end; display: grid; gap: 10px; grid-template-columns: minmax(12rem, 1fr) minmax(12rem, .9fr) minmax(14rem, 1.3fr) minmax(10rem, .8fr); min-width: 0; }
    [data-statement-archetype="A2"][data-statement-options="collapsed"] .statement-sort-field { display: none; }
    [data-statement-archetype="A2"][data-statement-options="collapsed"] .filter-form { grid-template-columns: minmax(12rem, 1fr) minmax(12rem, .9fr) minmax(14rem, 1.3fr); }
    [data-statement-archetype="A2"] .filter-form label,
    [data-statement-archetype="A2"] .filter-form :is(.account-field, .month-field) { color: var(--muted); font-size: .75rem; font-weight: 500; min-width: 0; }
    [data-statement-archetype="A2"] .filter-form :is(input, select, button) { min-height: 40px; }
    [data-statement-archetype="A2"] .month-nav { background: var(--surface); border-color: var(--line); }
    [data-statement-archetype="A2"] .month-nav input { font-weight: 700; }
    [data-statement-archetype="A2"] .statement-filter-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; grid-column: 1 / -1; justify-content: flex-end; }
    [data-statement-archetype="A2"] .statement-filter-actions > :is(button, a) { background: transparent; border: 1px solid transparent; color: var(--primary); font-size: .8125rem; font-weight: 500; min-height: 36px; padding-inline: 10px; }
    [data-statement-archetype="A2"] .statement-filter-actions > button[type="submit"] { border-color: var(--line); }
    [data-statement-archetype="A2"] .statement-filter-actions > :is(button, a):hover,
    [data-statement-archetype="A2"] [data-statement-options-toggle]:hover { background: var(--primary-soft); color: var(--primary); }
    [data-statement-archetype="A2"] .account-select-menu li:focus-visible { background: var(--primary-soft); outline: 2px solid var(--primary); outline-offset: -2px; }
    [data-statement-archetype="A2"] .statement-insight-context { background: var(--primary-soft); border: 0; border-left: 3px solid var(--primary); border-radius: var(--radius); font-size: .8125rem; margin: 0; padding: 10px 12px; }

    [data-statement-archetype="A2"] .statement-layout { display: grid; gap: 0; grid-template-columns: minmax(0, 1fr); min-width: 0; }
    [data-statement-archetype="A2"] .statement-panel.panel { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); box-shadow: none; min-width: 0; }
    [data-statement-archetype="A2"] .statement-toolbar { align-items: center; display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; padding: 16px 20px; }
    [data-statement-archetype="A2"] .statement-toolbar .eyebrow { display: none; }
    [data-statement-archetype="A2"] .statement-toolbar h2 { font-size: 1rem; }
    [data-statement-archetype="A2"] .statement-toolbar .chips { gap: 6px; }
    [data-statement-archetype="A2"] .chip { border-color: transparent; font-size: .7rem; font-weight: 500; }
    [data-statement-archetype="A2"] .statement-table { min-width: 0; }
    [data-statement-archetype="A2"] .statement-row { align-items: center; column-gap: 12px; display: grid; grid-template-columns: 24px 6rem minmax(0, 1fr) minmax(4rem, .45fr) 40px minmax(9rem, auto) 36px; min-width: 0; padding: 12px 20px; }
    [data-statement-archetype="A2"] .statement-body { grid-template-areas: "select date description description status amount actions" "select date category kind status balance actions"; min-height: 76px; row-gap: 6px; }
    [data-statement-archetype="A2"] .statement-row > * { min-width: 0; }
    [data-statement-archetype="A2"] .statement-body .col-select { grid-area: select; }
    [data-statement-archetype="A2"] .statement-body .col-date { color: var(--muted); font-size: .8125rem; grid-area: date; }
    [data-statement-archetype="A2"] .statement-body .col-description { display: block; grid-area: description; overflow-wrap: anywhere; white-space: normal; }
    [data-statement-archetype="A2"] .statement-body .col-description > strong { color: var(--text); font-size: 1rem; font-weight: 700; }
    [data-statement-archetype="A2"] .statement-body .col-description > span { color: var(--muted); display: block; font-size: .75rem; margin-top: 3px; }
    [data-statement-archetype="A2"] .statement-body .col-category { display: block; grid-area: category; overflow-wrap: anywhere; }
    [data-statement-archetype="A2"] .statement-body .col-kind { display: block; grid-area: kind; }
    [data-statement-archetype="A2"] .statement-body .col-status { grid-area: status; justify-self: center; }
    [data-statement-archetype="A2"] .statement-body .col-amount { font-size: 1rem; font-weight: 750; grid-area: amount; justify-self: end; text-align: right; }
    [data-statement-archetype="A2"] .statement-body .col-balance { display: block; font-weight: 500; grid-area: balance; justify-self: end; text-align: right; }
    [data-statement-archetype="A2"] .statement-body .col-balance::before { content: "Saldo "; font-size: .7rem; font-weight: 400; }
    [data-statement-archetype="A2"] .statement-body .col-category,
    [data-statement-archetype="A2"] .statement-body .col-kind,
    [data-statement-archetype="A2"] .statement-body .col-balance { color: var(--muted); font-size: .75rem; }
    [data-statement-archetype="A2"] .statement-body .col-actions { grid-area: actions; justify-self: end; }
    [data-statement-archetype="A2"] .statement-head { background: var(--bg); color: var(--muted); font-size: .75rem; font-weight: 500; padding-block: 10px; }
    [data-statement-archetype="A2"] .statement-head .col-description { grid-column: 3 / 5; }
    [data-statement-archetype="A2"] .statement-head .col-status { grid-column: 5; }
    [data-statement-archetype="A2"] .statement-head .col-amount { grid-column: 6; text-align: right; }
    [data-statement-archetype="A2"] .statement-head .col-actions { grid-column: 7; }
    [data-statement-archetype="A2"] .statement-head :is(.col-category, .col-kind, .col-balance) { clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; width: 1px; }
    [data-statement-archetype="A2"] .statement-date-group { align-items: center; background: var(--bg); border-bottom: 1px solid var(--line); color: var(--muted); display: flex; font-size: .6875rem; gap: 8px; justify-content: space-between; padding: 6px 20px; }
    [data-statement-archetype="A2"] .actions summary { background: transparent; border: 0; border-radius: var(--radius); height: 36px; width: 36px; }
    [data-statement-archetype="A2"] .actions summary:hover { background: var(--primary-soft); }
    [data-statement-archetype="A2"] .actions-menu { padding: 6px; }
    [data-statement-archetype="A2"] .actions-item { min-height: 40px; }
    [data-statement-archetype="A2"] .empty { background: transparent; border: 0; margin: 0; padding: 32px 20px; }
    [data-statement-archetype="A2"] .statement-row.account-remuneration-row .description { display: block; }

    body:has([data-golden-screen="statement"]) dialog { border: 1px solid var(--line); border-radius: var(--radius-lg); max-height: calc(100dvh - 32px); overflow-y: auto; }
    body dialog[data-modal], body dialog[data-group-modal] { max-width: min(760px, calc(100% - 32px)); }
    body:has([data-golden-screen="statement"]) dialog[data-modal] { margin-right: 16px; max-width: min(640px, calc(100% - 32px)); }
    body dialog[data-modal] .modal-panel,
    body dialog[data-group-modal] .modal-panel { gap: 18px; min-width: 0; padding: 24px; }
    body dialog[data-modal] .close-form { min-height: 0; position: absolute; right: 14px; top: 12px; z-index: 2; }
    body dialog[data-modal] .close-form button { background: transparent; border-color: transparent; color: var(--muted); min-height: 36px; padding-inline: 8px; }
    body dialog[data-modal] .modal-panel > div:nth-child(2) { border-bottom: 1px solid var(--line); padding-bottom: 14px; padding-right: 48px; }
    body dialog[data-modal] .modal-panel form[data-form] { display: grid; gap: 14px 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    body dialog[data-modal] .modal-panel form[data-form] > [data-field="kind"] { grid-column: 1 / -1; }
    body dialog[data-modal] .modal-panel form[data-form] .statement-kind-native { display: none; }
    body dialog[data-modal] .modal-panel form[data-form] label { color: var(--text); font-size: .8125rem; font-weight: 500; gap: 6px; }
    body dialog[data-modal] .modal-panel form[data-form] :is(input, select, textarea) { color: var(--text); font-size: .9rem; min-height: 40px; }
    body dialog[data-modal] .modal-panel .save-row,
    body dialog[data-group-modal] .modal-panel .save-row { border-top: 1px solid var(--line); margin-top: 4px; padding-top: 16px; }
    body dialog[data-modal] .status-icons { flex-wrap: wrap; }
    body dialog[data-group-modal] .group-members { border-left: 0; border-right: 0; border-radius: 0; }
    body dialog[data-modal] .statement-kind-tabs { background: var(--bg); border: 1px solid var(--line); border-radius: var(--radius); display: grid; gap: 4px; grid-template-columns: repeat(3, minmax(0, 1fr)); padding: 4px; }
    body dialog[data-modal] .statement-kind-tabs button { background: transparent; border: 1px solid transparent; color: var(--muted); font-size: .8125rem; font-weight: 500; min-height: 40px; min-width: 0; padding: 4px; }
    body dialog[data-modal] .statement-kind-tabs button[aria-pressed="true"] { background: var(--surface); border-color: var(--line); color: var(--primary); font-weight: 700; }
    body dialog[data-modal] .statement-kind-tabs button[data-statement-kind="expense"][aria-pressed="true"] { color: var(--danger); }
    body dialog[data-modal] .statement-kind-tabs button[data-statement-kind="income"][aria-pressed="true"] { color: var(--success); }
    body dialog[data-modal] .statement-kind-tabs button:hover:not(:disabled) { background: var(--primary-soft); color: var(--primary); }

    @media (max-width: 1100px) {
      [data-statement-archetype="A2"] .filter-form,
      [data-statement-archetype="A2"][data-statement-options="collapsed"] .filter-form { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      [data-statement-archetype="A2"] .statement-search-field { grid-column: 1 / -1; }
      [data-statement-archetype="A2"] .statement-row { column-gap: 8px; grid-template-columns: 24px 5.5rem minmax(0, 1fr) minmax(3rem, .3fr) 32px minmax(8rem, auto) 28px; padding-inline: 14px; }
    }
    @media (max-width: 760px) {
      [data-statement-archetype="A2"] { gap: 16px; }
      [data-statement-archetype="A2"] .sf-page-header { align-items: stretch; display: grid; }
      [data-statement-archetype="A2"] .statement-heading-actions { display: grid; grid-template-columns: 1fr 1fr; width: 100%; }
      [data-statement-archetype="A2"] .statement-heading-actions button[data-quick-kind="expense"] { grid-column: 1 / -1; grid-row: 1; }
      [data-statement-archetype="A2"] .statement-overview { padding: 16px; }
      [data-statement-archetype="A2"] .statement-context { gap: 12px; }
      [data-statement-archetype="A2"] .statement-context-meta { justify-content: flex-start; }
      [data-statement-archetype="A2"] .account-summary { gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      [data-statement-archetype="A2"] .summary-balance { grid-column: 1 / -1; }
      [data-statement-archetype="A2"] .summary-total { padding: 0; }
      [data-statement-archetype="A2"] .summary-total strong { font-size: 1.125rem; }
      [data-statement-archetype="A2"] .status-overview { align-items: start; display: grid; gap: 8px; }
      [data-statement-archetype="A2"] .status-line { grid-template-columns: auto minmax(0, 1fr) auto; }
      [data-statement-archetype="A2"] .filter-form,
      [data-statement-archetype="A2"][data-statement-options="collapsed"] .filter-form { grid-template-columns: 1fr; }
      [data-statement-archetype="A2"] .statement-filter-actions { justify-content: flex-start; }
      [data-statement-archetype="A2"] .statement-toolbar { padding: 14px; }
      [data-statement-archetype="A2"] .statement-head { clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; width: 1px; }
      [data-statement-archetype="A2"] .statement-body { gap: 6px 8px; grid-template-columns: 24px minmax(0, 1fr) minmax(7rem, auto) 28px; grid-template-areas: "select description description actions" "select date amount actions" "select category balance actions" "select kind status actions"; padding: 14px 12px; }
      [data-statement-archetype="A2"] .statement-body .col-description > strong { font-size: .9375rem; }
      [data-statement-archetype="A2"] .statement-body .col-status { justify-self: end; }
      [data-statement-archetype="A2"] .statement-body .col-amount { font-size: .9375rem; }
      [data-statement-archetype="A2"] .statement-body .col-balance { font-size: .7rem; }
      body:has([data-golden-screen="statement"]) dialog[data-modal] { margin-inline: auto; max-width: calc(100% - 16px); }
      body dialog[data-modal] .modal-panel,
      body dialog[data-group-modal] .modal-panel { padding: 20px 16px; }
      body dialog[data-modal] .modal-panel form[data-form] { grid-template-columns: 1fr; }
      body dialog[data-modal] .modal-panel .save-row,
      body dialog[data-group-modal] .modal-panel .save-row { align-items: stretch; }
    }
  `;
}
