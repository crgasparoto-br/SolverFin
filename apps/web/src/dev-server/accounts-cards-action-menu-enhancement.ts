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
      .instrument-actions[data-action-menu-ready] { align-items: center; display: flex; flex-wrap: wrap; justify-content: flex-end; position: relative; }
      .action-menu { display: inline-flex; position: relative; }
      .action-menu-trigger { align-items: center; background: #fff; border: 1px solid #d8e2e8; border-radius: 8px; color: #475569; display: inline-flex; height: 40px; justify-content: center; min-height: 40px; min-width: 40px; padding: 0; width: 40px; }
      .action-menu-trigger:hover:not(:disabled),
      .action-menu-trigger:focus-visible,
      .action-menu-trigger[aria-expanded="true"] { background: #f1f5f9; border-color: #94a3b8; color: #0f172a; }
      .action-menu-popover { background: #fff; border: 1px solid #d8e2e8; border-radius: 10px; box-shadow: 0 14px 32px rgba(15, 23, 42, .16); display: grid; gap: 2px; left: 0; min-width: 220px; padding: 6px; position: fixed; top: 0; z-index: 1200; }
      .action-menu-popover[hidden] { display: none !important; }
      .action-menu-popover form { display: block; margin: 0; width: 100%; }
      .action-menu-popover .action-menu-item { align-items: center; background: transparent; border: 0; border-radius: 7px; color: #334155; display: flex; font: inherit; font-size: .8125rem; font-weight: 650; gap: 10px; height: auto !important; justify-content: flex-start; line-height: 1.25; min-height: 40px !important; min-width: 0 !important; padding: 8px 10px !important; text-align: left; white-space: nowrap; width: 100% !important; }
      .action-menu-popover .action-menu-item:hover:not(:disabled), .action-menu-popover .action-menu-item:focus-visible { background: #f1f5f9; color: #0f172a; }
      .action-menu-popover .action-menu-item:disabled { cursor: not-allowed; opacity: .5; }
      .action-menu-popover .action-menu-item.is-danger { color: #b42318; }
      .action-menu-popover .action-menu-item.is-danger:hover:not(:disabled), .action-menu-popover .action-menu-item.is-danger:focus-visible { background: #fff1f0; color: #8f1d15; }
      .action-menu-popover .action-menu-item::after { content: attr(data-action-menu-label); }
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
        const actionIcons = new WeakMap();
        const menuStates = new WeakMap();
        let menuSequence = 0;
        let openMenuState = null;
        let refreshScheduled = false;

        function enabledItems(menu) {
          return Array.from(menu.querySelectorAll('[role="menuitem"]')).filter((item) => !item.disabled);
        }

        function resolveTrigger(state) {
          if (state?.trigger?.isConnected) return state.trigger;
          const label = state?.trigger?.getAttribute('aria-label');
          if (!label) return null;
          return Array.from(document.querySelectorAll('.action-menu-trigger')).find(
            (candidate) => candidate.getAttribute('aria-label') === label,
          ) || null;
        }

        function focusTrigger(state) {
          const focusCurrentTrigger = (onlyIfFocusWasLost = false) => {
            const trigger = resolveTrigger(state);
            if (!trigger || typeof trigger.focus !== 'function') return;
            const activeElement = document.activeElement;
            if (
              onlyIfFocusWasLost &&
              activeElement &&
              activeElement !== document.body &&
              !state.menu.contains(activeElement)
            ) {
              return;
            }
            trigger.focus({ preventScroll: true });
          };
          focusCurrentTrigger();
          window.requestAnimationFrame(() => {
            focusCurrentTrigger();
            window.requestAnimationFrame(focusCurrentTrigger);
          });
          window.setTimeout(() => focusCurrentTrigger(true), 50);
          window.setTimeout(() => focusCurrentTrigger(true), 75);
          window.setTimeout(() => focusCurrentTrigger(true), 150);
        }

        function closeMenu(state, options) {
          if (!state) return;
          state.menu.hidden = true;
          state.menu.style.visibility = '';
          state.trigger.setAttribute('aria-expanded', 'false');
          if (openMenuState === state) openMenuState = null;
          if (options && options.restoreFocus) focusTrigger(state);
        }

        function positionMenu(state) {
          const gutter = 8;
          const offset = 6;
          const triggerRect = state.trigger.getBoundingClientRect();
          const menuWidth = state.menu.offsetWidth;
          const menuHeight = state.menu.offsetHeight;
          const maxLeft = Math.max(gutter, window.innerWidth - menuWidth - gutter);
          const preferredLeft = triggerRect.right - menuWidth;
          const left = Math.min(Math.max(gutter, preferredLeft), maxLeft);
          const below = triggerRect.bottom + offset;
          const above = triggerRect.top - menuHeight - offset;
          const top = below + menuHeight <= window.innerHeight - gutter || above < gutter ? below : above;

          state.menu.style.left = Math.round(left) + 'px';
          state.menu.style.top = Math.round(Math.max(gutter, top)) + 'px';
          state.menu.style.visibility = '';
        }

        function openMenu(state, focusTarget) {
          if (openMenuState && openMenuState !== state) closeMenu(openMenuState, { restoreFocus: false });
          state.menu.style.visibility = 'hidden';
          state.menu.hidden = false;
          positionMenu(state);
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
            return String(button.textContent || '').trim() ||
              button.getAttribute('aria-label') ||
              'Configurar remuneração pelo CDI';
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

        function renderMenuItem(button, form) {
          const label = inferActionLabel(button, form);
          const currentIcon = button.querySelector('svg')?.outerHTML || '';
          if (currentIcon) actionIcons.set(button, currentIcon);
          const iconMarkup = currentIcon || actionIcons.get(button) || '';
          const iconHtml = iconMarkup
            ? '<span class="action-menu-item-icon" aria-hidden="true">' + iconMarkup + '</span>'
            : '';
          button.setAttribute('aria-label', label);
          button.dataset.actionMenuLabel = label;
          if (button.innerHTML !== iconHtml) button.innerHTML = iconHtml;
        }

        function observeDynamicActionLabel(button, form) {
          if (!button.hasAttribute('data-account-remuneration-action') || button.dataset.actionMenuLabelObserved === 'true') return;
          button.dataset.actionMenuLabelObserved = 'true';
          let rendering = false;
          const observer = new MutationObserver(() => {
            if (rendering) return;
            rendering = true;
            renderMenuItem(button, form);
            queueMicrotask(() => { rendering = false; });
          });
          observer.observe(button, { attributes: true, attributeFilter: ['title'], childList: true, subtree: true });
        }

        function dialogForAction(button, form) {
          const dialogId = String(button.dataset.openDialog || '');
          if (dialogId) return document.getElementById(dialogId);
          if (form && form.dataset.confirm) return document.querySelector('.confirm-dialog');
          if (button.hasAttribute('data-account-remuneration-action')) {
            return button.closest('[data-master-item]')?.querySelector('[data-account-remuneration-dialog]') || null;
          }
          return null;
        }

        function normalizeAction(action, state, container) {
          const form = action.matches && action.matches('form') ? action : null;
          const button = form ? form.querySelector('button') : action;
          if (!button || !button.matches('button') || button.dataset.actionMenuNormalized === 'true') return false;

          const destructive = button.classList.contains('danger-icon-button') ||
            String(form && form.dataset.apiMethod || '').toUpperCase() === 'DELETE' ||
            String(form && form.dataset.apiPath || '').endsWith('/archive');

          button.dataset.actionMenuNormalized = 'true';
          button.classList.remove('icon-button', 'danger-icon-button', 'cdi-action-button');
          button.classList.add('action-menu-item');
          if (destructive) button.classList.add('is-danger', 'danger-menu-item');
          button.setAttribute('role', 'menuitem');
          renderMenuItem(button, form);
          observeDynamicActionLabel(button, form);

          button.addEventListener('click', () => {
            const dialog = dialogForAction(button, form);
            if (dialog) {
              dialog.addEventListener('close', () => {
                window.setTimeout(() => focusTrigger(state), 0);
              }, { once: true });
            }
            if (openMenuState) closeMenu(openMenuState, { restoreFocus: !dialog });
          }, { capture: true });

          if (form) {
            extractStatus(form, container);
            form.setAttribute('role', 'none');
            state.menu.appendChild(form);
          } else {
            state.menu.appendChild(button);
          }
          return true;
        }

        function createMenuState(container) {
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
          wrapper.append(trigger, menu);
          container.prepend(wrapper);
          container.dataset.actionMenuReady = 'true';
          menuStates.set(container, state);

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
              event.stopPropagation();
              document.addEventListener(
                'keyup',
                (keyupEvent) => {
                  if (keyupEvent.key !== 'Escape') return;
                  keyupEvent.preventDefault();
                  keyupEvent.stopPropagation();
                  window.setTimeout(() => focusTrigger(state), 0);
                },
                { capture: true, once: true },
              );
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

          return state;
        }

        function buildActionMenu(container) {
          const actions = Array.from(container.children).filter((child) => {
            if (!child.matches || child.matches('[data-form-status], .action-menu')) return false;
            return child.matches('button') || child.matches('form');
          });
          if (actions.length === 0 && !menuStates.has(container)) return;

          const state = menuStates.get(container) || createMenuState(container);
          actions.forEach((action) => normalizeAction(action, state, container));
        }

        function wireActionMenus() {
          document.querySelectorAll('.item-actions, .instrument-actions').forEach(buildActionMenu);
        }

        function scheduleActionMenuRefresh() {
          if (refreshScheduled) return;
          refreshScheduled = true;
          queueMicrotask(() => {
            refreshScheduled = false;
            wireActionMenus();
          });
        }

        function startActionMenus() {
          wireActionMenus();
          const actionObserver = new MutationObserver(scheduleActionMenuRefresh);
          actionObserver.observe(document.body, { childList: true, subtree: true });
        }

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', startActionMenus, { once: true });
        } else {
          startActionMenus();
        }

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

        window.addEventListener('resize', () => {
          if (openMenuState) closeMenu(openMenuState, { restoreFocus: false });
        });
        window.addEventListener('scroll', () => {
          if (openMenuState) closeMenu(openMenuState, { restoreFocus: false });
        }, true);
      })();
    </script>`;
}
