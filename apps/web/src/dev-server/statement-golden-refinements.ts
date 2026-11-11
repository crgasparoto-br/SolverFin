import { statementGoldenRefinementStylesPart1 } from "./statement-golden-refinement-style-part-1.js";
import { statementGoldenRefinementStylesPart2 } from "./statement-golden-refinement-style-part-2.js";
import { statementGoldenRefinementStylesPart3 } from "./statement-golden-refinement-style-part-3.js";

import { statementMockupControlsRuntime } from "./statement-mockup-controls.js";

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
          const dayField = filterForm.querySelector('.statement-day-field');
          const searchField = filterForm.querySelector('.statement-search-field');
          const narrowPhone = window.matchMedia('(max-width: 360px)');
          const details = document.createElement('details');
          details.className = 'statement-mobile-advanced-filters';
          const trigger = document.createElement('summary');
          const activeCount = () => fields.filter((field) => {
            const select = field.querySelector('select');
            return select && select.value !== '' && !(select.name === 'sort' && select.value === 'date_asc');
          }).length + (dayField?.querySelector('input[name="day"]')?.value ? 1 : 0);
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
            // At 320px the day input is a progressive filter, not a vanished
            // control. Restore its canonical position when the viewport grows.
            if (dayField && searchField) {
              if (narrowPhone.matches) content.prepend(dayField);
              else searchField.before(dayField);
            }
            updateTrigger();
            if (!compact.matches) {
              details.open = true;
              details.removeAttribute('data-mobile-initialized');
            } else if (!details.hasAttribute('data-mobile-initialized')) {
              details.open = activeCount() > 0;
              details.setAttribute('data-mobile-initialized', 'true');
            }
          };
          compact.addEventListener('change', sync);
          narrowPhone.addEventListener('change', sync);
          dayField?.querySelector('input[name="day"]')?.addEventListener('change', updateTrigger);
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
        const currencyInput = accountField.querySelector('[data-auto-currency]');
        if (currencyInput) {
          currencyInput.setAttribute('form', filterForm.id);
          currencyInput.addEventListener('change', () => filterForm.requestSubmit());
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
  const root = '[data-statement-archetype="A2"][data-golden-screen="statement"]';
  const dialog = 'body:has([data-golden-screen="statement"]) dialog[data-modal]';
  return (
    statementGoldenRefinementStylesPart1(root, dialog) +
    statementGoldenRefinementStylesPart2(root, dialog) +
    statementGoldenRefinementStylesPart3(root, dialog)
  );
}
