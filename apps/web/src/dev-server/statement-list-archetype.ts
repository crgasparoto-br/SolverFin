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
    description: "Acompanhe lançamentos, saldo e pendências no contexto da conta selecionada.",
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

  return `<div data-statement-archetype="A2">${headerHtml}${workspaceHtml}${statementListArchetypeRuntime()}</div>`;
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
    [data-statement-archetype="A2"] { display: grid; gap: 12px; min-width: 0; }
    [data-statement-archetype="A2"] .sf-page-header { align-items: center; }
    [data-statement-archetype="A2"] .sf-page-header-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
    .statement-a2-workspace { display: grid; gap: 12px; max-width: none; padding: 0; }
    .statement-a2-workspace .sf-filter-bar { align-items: end; display: grid; gap: 10px; grid-template-columns: minmax(0, 1fr); padding: 0; }
    .statement-context { align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); display: flex; flex-wrap: wrap; gap: 8px 12px; justify-content: space-between; min-width: 0; padding: 10px 12px; }
    .statement-context-main { align-items: center; display: flex; gap: 9px; min-width: 0; }
    .statement-context-copy { display: grid; gap: 2px; min-width: 0; }
    .statement-context-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .statement-context-meta { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; }
    .statement-context-pill { align-items: center; background: var(--primary-soft); border: 1px solid var(--line); border-radius: 999px; color: var(--primary); display: inline-flex; font-size: .75rem; font-weight: 750; min-height: 28px; padding: 3px 9px; white-space: nowrap; }
    .statement-context-pill[data-context="currency"] { letter-spacing: .04em; }
    .account-select-menu li:focus-visible { background: var(--primary-soft); outline: 2px solid var(--primary); outline-offset: -2px; }
    .statement-insight-context { background: var(--primary-soft); border: 1px solid var(--line); border-radius: var(--radius); color: var(--text); font-size: .8125rem; line-height: 1.45; margin: 0; padding: 9px 11px; }
    .statement-insight-context strong { color: var(--primary); }
    .statement-date-group { align-items: center; background: var(--bg); border-bottom: 1px solid var(--line); color: var(--muted); display: flex; font-size: .72rem; font-weight: 750; gap: 8px; justify-content: space-between; letter-spacing: .02em; padding: 6px 12px; text-transform: uppercase; }
    .statement-search-field, .statement-sort-field { display: grid; gap: 6px; min-width: 0; }
    .statement-search-field { min-width: min(20rem, 100%); }
    .statement-search-field input, .statement-sort-field select { width: 100%; }
    .statement-filter-actions { align-items: end; display: flex; flex-wrap: wrap; gap: 8px; }
    .statement-filter-actions .button-link { min-height: 44px; }
    @media (max-width: 760px) {
      [data-statement-archetype="A2"] .sf-page-header { align-items: stretch; display: grid; }
      [data-statement-archetype="A2"] .sf-page-header-actions { justify-content: stretch; }
      [data-statement-archetype="A2"] .sf-page-header-actions > * { flex: 1 1 auto; }
      .statement-context { align-items: stretch; display: grid; }
      .statement-context-meta { justify-content: flex-start; }
      .statement-search-field { min-width: 0; }
    }
  `;
}
