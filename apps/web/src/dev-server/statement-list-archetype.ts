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

/**
 * Canonical A2 list/statement composition for the account statement.
 *
 * The renderer receives already prepared view-model fragments. It does not inspect or
 * rewrite final HTML, keeping the Phase 3B composition boundary explicit.
 */
export function renderStatementListArchetype(props: StatementListArchetypeProps): string {
  const headerHtml = renderPageHeader({
    eyebrow: "Conta e movimentações",
    title: "Extrato Bancário",
    description: "Saldo, período e movimentações da conta selecionada em um único contexto.",
    actionsHtml: props.actionsHtml,
  });
  const filterHtml = renderFilterBar({
    label: "Filtros do extrato",
    childrenHtml: props.filtersHtml,
  });
  const workspaceHtml = renderPageContainer({
    className: "statement-a2-workspace",
    childrenHtml: `${props.contextHtml}${filterHtml}${props.statusHtml ?? ""}<section class="statement-layout" data-statement-workspace="true">${props.summaryHtml}${props.listHtml}</section>`,
  });

  return `<div data-statement-archetype="A2" data-golden-screen="statement">${headerHtml}${workspaceHtml}${statementListArchetypeRuntime()}</div>`;
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
    [data-statement-archetype="A2"] { display: grid; gap: 14px; min-width: 0; }
    [data-statement-archetype="A2"] .sf-page-header { align-items: end; padding-bottom: 2px; }
    [data-statement-archetype="A2"] .sf-page-header-copy { max-width: 48rem; }
    [data-statement-archetype="A2"] .sf-page-header-description { max-width: 42rem; }
    [data-statement-archetype="A2"] .sf-page-header-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
    [data-statement-archetype="A2"] .statement-heading-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; }
    [data-statement-archetype="A2"] .statement-heading-actions button { min-height: 44px; }
    [data-statement-archetype="A2"] .statement-heading-actions button[data-quick-kind="transfer"],
    [data-statement-archetype="A2"] .statement-heading-actions button[data-quick-kind="income"] { background: var(--surface); border: 1px solid var(--line); color: var(--primary); }
    [data-statement-archetype="A2"] .statement-heading-actions button[data-quick-kind="expense"] { box-shadow: 0 6px 18px color-mix(in srgb, var(--primary) 18%, transparent); }

    .statement-a2-workspace { display: grid; gap: 12px; max-width: none; padding: 0; }
    .statement-a2-workspace .sf-filter-bar { align-items: end; background: transparent; border: 0; box-shadow: none; display: grid; gap: 10px; grid-template-columns: minmax(0, 1fr); padding: 0; }
    .statement-a2-workspace .sf-filter-bar > :first-child { color: var(--muted); font-size: .75rem; font-weight: 700; letter-spacing: .02em; }

    .statement-context { align-items: center; background: transparent; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; display: flex; flex-wrap: wrap; gap: 8px 16px; justify-content: space-between; min-width: 0; padding: 2px 0 12px; }
    .statement-context-main { align-items: center; display: flex; gap: 10px; min-width: 0; }
    .statement-context-main .account-select-icon { height: 28px; width: 28px; }
    .statement-context-copy { display: grid; gap: 1px; min-width: 0; }
    .statement-context-copy strong { font-size: 1rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .statement-context-meta { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; }
    .statement-context-pill { align-items: center; background: var(--primary-soft); border: 0; border-radius: 999px; color: var(--primary); display: inline-flex; font-size: .72rem; font-weight: 750; min-height: 28px; padding: 3px 9px; white-space: nowrap; }
    .statement-context-pill[data-context="currency"] { letter-spacing: .04em; }

    [data-statement-archetype="A2"] .filter-form { align-items: end; display: grid; gap: 8px 10px; grid-template-columns: minmax(13rem, 1.15fr) minmax(12rem, .72fr) minmax(15rem, 1.2fr) minmax(10rem, .65fr) auto; }
    [data-statement-archetype="A2"] .filter-form label,
    [data-statement-archetype="A2"] .filter-form .account-field,
    [data-statement-archetype="A2"] .filter-form .month-field { color: var(--muted); font-size: .75rem; font-weight: 700; }
    [data-statement-archetype="A2"] .statement-sort-field { opacity: .84; }
    [data-statement-archetype="A2"] .statement-filter-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; }
    [data-statement-archetype="A2"] .statement-filter-actions > button[type="submit"] { min-height: 40px; }
    [data-statement-archetype="A2"] .statement-filter-actions .ghost-btn,
    [data-statement-archetype="A2"] .statement-filter-actions .secondary-button { background: transparent; border-color: transparent; box-shadow: none; min-height: 40px; padding-inline: 8px; }
    [data-statement-archetype="A2"] .account-select-menu li:focus-visible { background: var(--primary-soft); outline: 2px solid var(--primary); outline-offset: -2px; }

    .statement-insight-context { background: var(--primary-soft); border: 0; border-left: 3px solid var(--primary); border-radius: 0 var(--radius) var(--radius) 0; color: var(--text); font-size: .8125rem; line-height: 1.45; margin: 0; padding: 8px 10px; }
    .statement-insight-context strong { color: var(--primary); }

    [data-statement-archetype="A2"] .statement-layout { align-items: start; display: grid; gap: 18px; grid-template-columns: minmax(220px, 260px) minmax(0, 1fr); }
    [data-statement-archetype="A2"] .account-summary { background: transparent; border: 0; box-shadow: none; display: grid; gap: 14px; padding: 0 4px 0 0; position: sticky; top: 68px; }
    [data-statement-archetype="A2"] .account-summary > div:first-child { display: grid; gap: 3px; }
    [data-statement-archetype="A2"] .account-summary .statement-context-pill { justify-self: start; }
    [data-statement-archetype="A2"] .summary-balance { background: transparent; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; gap: 3px; padding: 2px 0 12px; }
    [data-statement-archetype="A2"] .summary-balance strong { font-size: 1.55rem; letter-spacing: -.02em; }
    [data-statement-archetype="A2"] .summary-balance p { margin-top: 2px; }
    [data-statement-archetype="A2"] .summary-totals { display: grid; gap: 12px; grid-template-columns: 1fr; }
    [data-statement-archetype="A2"] .summary-total { border: 0; border-radius: 0; display: grid; gap: 2px; padding: 0; }
    [data-statement-archetype="A2"] .summary-total strong { font-size: .95rem; }
    [data-statement-archetype="A2"] .status-overview { border-top: 1px solid var(--line); gap: 7px; padding-top: 12px; }
    [data-statement-archetype="A2"] .status-line { gap: 7px; grid-template-columns: auto minmax(0, 1fr) auto; }
    [data-statement-archetype="A2"] .status-line .chip { min-width: 26px; padding-inline: 6px; }
    [data-statement-archetype="A2"] .status-line p,
    [data-statement-archetype="A2"] .status-line strong { font-size: .78rem; }

    [data-statement-archetype="A2"] .statement-panel.panel { border: 1px solid var(--line); box-shadow: none; }
    [data-statement-archetype="A2"] .statement-toolbar { padding: 13px 14px 10px; }
    [data-statement-archetype="A2"] .statement-toolbar h2 { font-size: 1rem; }
    [data-statement-archetype="A2"] .statement-toolbar .chips { opacity: .82; }
    [data-statement-archetype="A2"] .statement-date-group { align-items: center; background: color-mix(in srgb, var(--surface) 78%, var(--bg)); border-bottom: 1px solid var(--line); color: var(--muted); display: flex; font-size: .7rem; font-weight: 750; gap: 8px; justify-content: space-between; letter-spacing: .02em; padding: 6px 12px; text-transform: uppercase; }
    [data-statement-archetype="A2"] .statement-body .col-description > strong { font-size: .9rem; font-weight: 720; }
    [data-statement-archetype="A2"] .statement-body .col-category,
    [data-statement-archetype="A2"] .statement-body .col-kind,
    [data-statement-archetype="A2"] .statement-body .col-balance { color: var(--muted); font-size: .76rem; }
    [data-statement-archetype="A2"] .statement-body .col-amount { font-size: .92rem; font-weight: 780; }
    [data-statement-archetype="A2"] .statement-status { opacity: .82; }
    [data-statement-archetype="A2"] .chip { border-color: transparent; }

    dialog[data-modal],
    dialog[data-group-modal] { max-width: min(760px, calc(100% - 32px)); }
    body dialog[data-modal] .modal-panel,
    body dialog[data-group-modal] .modal-panel { gap: 18px; padding: 22px; }
    body dialog[data-modal] .close-form { min-height: 0; position: absolute; right: 14px; top: 12px; z-index: 2; }
    body dialog[data-modal] .close-form button { background: transparent; border-color: transparent; color: var(--muted); min-height: 36px; padding-inline: 8px; }
    body dialog[data-modal] .modal-panel > div:nth-child(2) { border-bottom: 1px solid var(--line); padding-bottom: 12px; padding-right: 48px; }
    body dialog[data-modal] .modal-panel form[data-form] { display: grid; gap: 12px 14px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    body dialog[data-modal] .modal-panel form[data-form] label { color: var(--muted); font-size: .78rem; font-weight: 700; gap: 5px; }
    body dialog[data-modal] .modal-panel form[data-form] input,
    body dialog[data-modal] .modal-panel form[data-form] select,
    body dialog[data-modal] .modal-panel form[data-form] textarea { color: var(--text); font-size: .9rem; }
    body dialog[data-modal] .modal-panel .save-row,
    body dialog[data-group-modal] .modal-panel .save-row { border-top: 1px solid var(--line); margin-top: 4px; padding-top: 14px; }
    body dialog[data-modal] .status-icons { flex-wrap: wrap; }
    body dialog[data-group-modal] .group-members { border-left: 0; border-right: 0; border-radius: 0; }

    @media (max-width: 1279px) {
      [data-statement-archetype="A2"] .statement-layout { grid-template-columns: 1fr; }
      [data-statement-archetype="A2"] .account-summary { gap: 10px; grid-template-columns: minmax(12rem, 1.2fr) repeat(2, minmax(8rem, .7fr)) minmax(15rem, 1fr); padding: 0; position: static; }
      [data-statement-archetype="A2"] .account-summary > div:first-child { align-self: center; }
      [data-statement-archetype="A2"] .summary-balance { border-bottom: 0; border-left: 1px solid var(--line); padding: 0 0 0 14px; }
      [data-statement-archetype="A2"] .summary-totals { align-content: center; gap: 8px; }
      [data-statement-archetype="A2"] .status-overview { border-left: 1px solid var(--line); border-top: 0; padding: 0 0 0 14px; }
    }
    @media (max-width: 1100px) {
      [data-statement-archetype="A2"] .filter-form { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      [data-statement-archetype="A2"] .statement-filter-actions { grid-column: 1 / -1; }
      [data-statement-archetype="A2"] .account-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      [data-statement-archetype="A2"] .summary-balance,
      [data-statement-archetype="A2"] .status-overview { border-left: 0; }
    }
    @media (max-width: 760px) {
      [data-statement-archetype="A2"] .sf-page-header { align-items: stretch; display: grid; }
      [data-statement-archetype="A2"] .sf-page-header-actions { justify-content: stretch; }
      [data-statement-archetype="A2"] .statement-heading-actions { display: grid; grid-template-columns: 1fr 1fr; width: 100%; }
      [data-statement-archetype="A2"] .statement-heading-actions button[data-quick-kind="expense"] { grid-column: 1 / -1; grid-row: 1; }
      [data-statement-archetype="A2"] .statement-context { align-items: stretch; display: grid; }
      [data-statement-archetype="A2"] .statement-context-meta { justify-content: flex-start; }
      [data-statement-archetype="A2"] .filter-form { grid-template-columns: 1fr; }
      [data-statement-archetype="A2"] .statement-filter-actions { align-items: stretch; display: grid; }
      [data-statement-archetype="A2"] .statement-filter-actions > * { width: 100%; }
      [data-statement-archetype="A2"] .account-summary { border-bottom: 1px solid var(--line); grid-template-columns: 1fr 1fr; padding-bottom: 12px; }
      [data-statement-archetype="A2"] .account-summary > div:first-child,
      [data-statement-archetype="A2"] .summary-balance,
      [data-statement-archetype="A2"] .status-overview { grid-column: 1 / -1; }
      [data-statement-archetype="A2"] .summary-balance { border-bottom: 1px solid var(--line); padding-bottom: 10px; }
      body dialog[data-modal] .modal-panel,
      body dialog[data-group-modal] .modal-panel { padding: 18px 16px; }
      body dialog[data-modal] .modal-panel form[data-form] { grid-template-columns: 1fr; }
      body dialog[data-modal] .modal-panel .save-row,
      body dialog[data-group-modal] .modal-panel .save-row { align-items: stretch; }
    }
  `;
}
