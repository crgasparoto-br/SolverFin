import { icon } from "./icons.js";

export function enhanceAccountsCardsActionMenus(html: string): string {
  if (!html.includes('data-tab-panel="accounts"')) return html;

  let enhanced = html;

  if (!enhanced.includes("data-accounts-cards-action-menu-styles")) {
    enhanced = enhanced.replace("</head>", `${actionMenuStyles()}</head>`);
  }

  if (!enhanced.includes("data-accounts-cards-action-menu-script")) {
    enhanced = enhanced.replace("</body>", `${actionMenuScript()}</body>`);
  }

  return enhanced;
}

function actionMenuStyles(): string {
  return `
    <style data-accounts-cards-action-menu-styles>
      .item-actions[data-action-menu-ready],
      .instrument-actions[data-action-menu-ready] { align-items: center; display: flex; justify-content: flex-end; position: relative; }
      .action-menu { display: inline-flex; position: relative; }
      .action-menu-trigger { align-items: center; background: #fff; border: 1px solid #d8e2e8; border-radius: 8px; color: #475569; display: inline-flex; height: 40px; justify-content: center; min-height: 40px; min-width: 40px; padding: 0; width: 40px; }
      .action-menu-trigger:hover:not(:disabled),
      .action-menu-trigger:focus-visible,
      .action-menu-trigger[aria-expanded="true"] { background: #f1f5f9; border-color: #94a3b8; color: #0f172a; }
      .action-menu-popover { background: #fff; border: 1px solid #d8e2e8; border-radius: 10px; box-shadow: 0 14px 32px rgba(15, 23, 42, .16); display: grid; gap: 2px; min-width: 220px; padding: 6px; position: absolute; right: 0; top: calc(100% + 6px); z-index: 1200; }
      .action-menu-popover[hidden] { display: none !important; }
      .action-menu-popover form { display: block; margin: 0; width: 100%; }
      .action-menu-item { align-items: center; background: transparent; border: 0; border-radius: 7px; color: #334155; display: flex; font: inherit; font-size: .8125rem; font-weight: 650; gap: 10px; height: auto !important; justify-content: flex-start; line-height: 1.25; min-height: 40px !important; min-width: 0 !important; padding: 8px 10px !important; text-align: left; white-space: nowrap; width: 100% !important; }
      .action-menu-item:hover:not(:disabled), .action-menu-item:focus-visible { background: #f1f5f9; color: #0f172a; }
      .action-menu-item:disabled { cursor: not-allowed; opacity: .5; }
      .action-menu-item.is-danger { color: #b42318; }
      .action-menu-item.is-danger:hover:not(:disabled), .action-menu-item.is-danger:focus-visible { background: #fff1f0; color: #8f1d15; }
      .action-menu-item-icon { align-items: center; display: inline-flex; flex: 0 0 auto; height: 18px; justify-content: center; width: 18px; }
      .action-menu-item-icon svg { height: 16px; width: 16px; }
      .item-actions[data-action-menu-ready] > .form-status,
      .instrument-actions[data-action-menu-ready] > .form-status { flex-basis: 100%; margin: 4px 0 0; }
      .item-actions[data-action-menu-ready] > .form-status:empty,
      .instrument-actions[data-action-menu-ready] > .form-status:empty { display: none; }
      @media (max-width: 760px) {
        .action-menu-popover { max-width: calc(100vw - 32px); min-width: min(240px, calc(100vw - 32px)); }
      }
    </style>`;
}

function actionMenuScript(): string {
  const moreIcon = JSON.stringify(icon("more-vertical", 18, "action-icon"));

  return `
    <script data-accounts-cards-action-menu-script>
      (() => {
        if (window.__solverFinAccountsCardsActionMenus === true) return;
        window.__solverFinAccountsCardsActionMenus = true;

        const moreIcon = ${moreIcon};
        let menuSequence = 0;
        let openMenuState = null;

        function enabledItems(menu) {
          return Array.from(menu.querySelectorAll('[role="menuitem"]')).filter((item) => !item.disabled);
        }

        function closeMenu(state, options) {
          if (!state) return;
          state.menu.hidden = true;
          state.trigger.setAttribute('aria-expanded', 'false');
          if (openMenuState === state) openMenuState = null;
          if (options && options.restoreFocus && typeof state.trigger.focus === 'function') {
            state.trigger.focus();
          }
        }

        function openMenu(state, focusTarget) {
          if (openMenuState && openMenuState !== state) closeMenu(openMenuState, { restoreFocus: false });
          state.menu.hidden = false;
          state.trigger.setAttribute('aria-expanded', 'true');
          openMenuState = state;
          const items = enabledItems(state.menu);
          const target = focusTarget === 'last' ? items[items.length - 1] : items[0];
          if (target && typeof target.focus === 'function') target.focus();
        }

        function accessibleContainerLabel(container) {
          return container.getAttribute('aria-label') || 'Ações do item';
        }

        function inferActionLabel(button, form) {
          const dialogId = String(button.dataset.openDialog || '');
          const apiPath = String(form && form.dataset.apiPath || '');
          const method = String(form && form.dataset.apiMethod || 'POST').toUpperCase();

          if (dialogId.startsWith('edit-account-dialog-')) return 'Editar conta';
          if (dialogId.startsWith('edit-card-dialog-')) return 'Editar cartão';
          if (dialogId.startsWith('edit-card-instrument-dialog-')) return 'Editar instrumento';
          if (dialogId.startsWith('new-card-instrument-dialog-')) return 'Adicionar instrumento';
          if (button.hasAttribute('data-view-instruments')) return 'Ver instrumentos';
          if (button.hasAttribute('data-account-remuneration-action')) {
            return button.getAttribute('aria-label') || button.title || 'Configurar remuneração pelo CDI';
          }
          if (apiPath.endsWith('/default-instrument')) return 'Definir como padrão';
          if (apiPath.endsWith('/archive')) return 'Arquivar';
          if (method === 'DELETE') return 'Excluir';

          return button.getAttribute('aria-label') || button.title || String(button.textContent || 'Ação').trim();
        }

        function extractStatus(form, container) {
          const status = form && form.querySelector(':scope > [data-form-status]');
          if (status) container.appendChild(status);
        }

        function normalizeAction(action, menu, container) {
          const form = action.matches && action.matches('form') ? action : null;
          const button = form ? form.querySelector('button') : action;
          if (!button || !button.matches('button')) return false;

          const label = inferActionLabel(button, form);
          const iconMarkup = button.querySelector('svg') ? button.querySelector('svg').outerHTML : '';
          const destructive = button.classList.contains('danger-icon-button') ||
            String(form && form.dataset.apiMethod || '').toUpperCase() === 'DELETE' ||
            String(form && form.dataset.apiPath || '').endsWith('/archive');

          button.classList.remove('icon-button', 'danger-icon-button', 'cdi-action-button');
          button.classList.add('action-menu-item');
          if (destructive) button.classList.add('is-danger');
          button.setAttribute('role', 'menuitem');
          button.setAttribute('aria-label', label);
          button.removeAttribute('title');
          button.innerHTML =
            (iconMarkup ? '<span class="action-menu-item-icon" aria-hidden="true">' + iconMarkup + '</span>' : '') +
            '<span>' + label + '</span>';

          button.addEventListener('click', () => {
            if (openMenuState) closeMenu(openMenuState, { restoreFocus: false });
          }, { capture: true });

          if (form) {
            extractStatus(form, container);
            menu.appendChild(form);
          } else {
            menu.appendChild(button);
          }
          return true;
        }

        function buildActionMenu(container) {
          if (container.dataset.actionMenuReady === 'true') return;

          const actions = Array.from(container.children).filter((child) => {
            if (child.matches && child.matches('[data-form-status]')) return false;
            return child.matches && (child.matches('button') || child.matches('form'));
          });
          if (actions.length === 0) return;

          menuSequence += 1;
          const menuId = 'accounts-cards-action-menu-' + menuSequence;
          const wrapper = document.createElement('div');
          wrapper.className = 'action-menu';
          const trigger = document.createElement('button');
          trigger.type = 'button';
          trigger.className = 'action-menu-trigger';
          trigger.setAttribute('aria-haspopup', 'menu');
          trigger.setAttribute('aria-expanded', 'false');
          trigger.setAttribute('aria-controls', menuId);
          trigger.setAttribute('aria-label', accessibleContainerLabel(container));
          trigger.title = accessibleContainerLabel(container);
          trigger.innerHTML = moreIcon;

          const menu = document.createElement('div');
          menu.id = menuId;
          menu.className = 'action-menu-popover';
          menu.setAttribute('role', 'menu');
          menu.setAttribute('aria-label', accessibleContainerLabel(container));
          menu.hidden = true;

          const state = { wrapper, trigger, menu };
          actions.forEach((action) => normalizeAction(action, menu, container));
          if (menu.querySelectorAll('[role="menuitem"]').length === 0) return;

          wrapper.append(trigger, menu);
          container.prepend(wrapper);
          container.dataset.actionMenuReady = 'true';

          trigger.addEventListener('click', () => {
            if (menu.hidden) openMenu(state, 'first');
            else closeMenu(state, { restoreFocus: true });
          });

          trigger.addEventListener('keydown', (event) => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            event.preventDefault();
            openMenu(state, event.key === 'ArrowUp' ? 'last' : 'first');
          });

          menu.addEventListener('keydown', (event) => {
            const items = enabledItems(menu);
            const currentIndex = items.indexOf(document.activeElement);
            if (event.key === 'Escape') {
              event.preventDefault();
              closeMenu(state, { restoreFocus: true });
              return;
            }
            if (event.key === 'Tab') {
              closeMenu(state, { restoreFocus: false });
              return;
            }
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || items.length === 0) return;
            event.preventDefault();
            const nextIndex = event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? items.length - 1
                : event.key === 'ArrowDown'
                  ? (currentIndex + 1 + items.length) % items.length
                  : (currentIndex - 1 + items.length) % items.length;
            items[nextIndex].focus();
          });
        }

        document.querySelectorAll('.item-actions, .instrument-actions').forEach(buildActionMenu);

        document.addEventListener('click', (event) => {
          if (!openMenuState || openMenuState.wrapper.contains(event.target)) return;
          closeMenu(openMenuState, { restoreFocus: false });
        });

        document.addEventListener('keydown', (event) => {
          if (event.key === 'Escape' && openMenuState) {
            event.preventDefault();
            closeMenu(openMenuState, { restoreFocus: true });
          }
        });
      })();
    </script>`;
}
