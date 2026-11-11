export function statementActionMenusRuntime(): string {
  return `<script data-statement-action-menus-runtime="true">
    (() => {
      const root = document.querySelector('[data-statement-archetype="A2"]');
      if (!root) return;

      const actionMenuSelector = '.statement-row.statement-body details.actions';

      let menuSequence = 0;
      let openState = null;
      let positionFrame = 0;

      const enabledItems = (menu) =>
        Array.from(menu.querySelectorAll('button')).filter((item) => !item.disabled);

      const positionMenu = (state) => {
        if (state.menu.parentElement !== document.body) return;
        const gutter = 8;
        const offset = 6;
        const triggerRect = state.trigger.getBoundingClientRect();
        const menuRect = state.menu.getBoundingClientRect();
        const menuWidth = menuRect.width || state.menu.offsetWidth;
        const menuHeight = menuRect.height || state.menu.offsetHeight;
        const maxLeft = Math.max(gutter, window.innerWidth - menuWidth - gutter);
        const left = Math.min(Math.max(gutter, triggerRect.right - menuWidth), maxLeft);
        const below = triggerRect.bottom + offset;
        const above = triggerRect.top - menuHeight - offset;
        const maxTop = Math.max(gutter, window.innerHeight - menuHeight - gutter);
        const top = below + menuHeight <= window.innerHeight - gutter
          ? below
          : above >= gutter
            ? above
            : Math.min(Math.max(gutter, below), maxTop);

        state.menu.style.left = Math.round(left) + 'px';
        state.menu.style.top = Math.round(top) + 'px';
        state.menu.style.visibility = '';
      };

      const restoreMenu = (state) => {
        if (state.menu.parentElement === document.body) state.placeholder.after(state.menu);
        delete state.menu.dataset.statementActionMenuFixed;
        state.menu.style.left = '';
        state.menu.style.top = '';
        state.menu.style.visibility = '';
        state.trigger.setAttribute('aria-expanded', 'false');
        if (openState === state) openState = null;
      };

      const closeMenu = (state, restoreFocus) => {
        if (!state) return;
        state.pendingFocus = null;
        restoreMenu(state);
        if (state.details.open) state.details.open = false;
        if (restoreFocus) {
          window.requestAnimationFrame(() => state.trigger.focus({ preventScroll: true }));
        }
      };

      const openMenu = (state) => {
        if (openState && openState !== state) closeMenu(openState, false);
        if (state.menu.parentElement !== document.body) document.body.appendChild(state.menu);
        state.menu.dataset.statementActionMenuFixed = 'true';
        state.menu.style.visibility = 'hidden';
        state.trigger.setAttribute('aria-expanded', 'true');
        openState = state;
        positionMenu(state);

        const focusDirection = state.pendingFocus;
        state.pendingFocus = null;
        if (focusDirection) {
          window.requestAnimationFrame(() => {
            const items = enabledItems(state.menu);
            if (items.length === 0) return;
            const item = focusDirection === 'last' ? items[items.length - 1] : items[0];
            item.focus({ preventScroll: true });
          });
        }
      };

      const states = new WeakMap();
      const normalizeMenuItems = (menu) => {
        menu
          .querySelectorAll('button')
          .forEach((button) => button.setAttribute('role', 'menuitem'));
      };

      const registerMenu = (details) => {
        if (!details) return null;
        const trigger = details.querySelector('summary');
        const menu = details.querySelector('.actions-menu');
        if (!trigger || !menu) return null;
        const existing = states.get(details);
        if (existing?.trigger === trigger && existing.menu === menu) {
          normalizeMenuItems(menu);
          return existing;
        }
        if (existing) {
          existing.active = false;
          closeMenu(existing, false);
        }

        menuSequence += 1;
        const menuId = menu.id || 'statement-action-menu-' + menuSequence;
        menu.id = menuId;
        trigger.setAttribute('aria-haspopup', 'menu');
        trigger.setAttribute('aria-controls', menuId);
        trigger.setAttribute('aria-expanded', 'false');
        menu.setAttribute('role', 'menu');
        normalizeMenuItems(menu);

        const placeholder = document.createElement('span');
        placeholder.hidden = true;
        placeholder.setAttribute('aria-hidden', 'true');
        menu.before(placeholder);

        const state = { details, trigger, menu, placeholder, pendingFocus: null, active: true };
        states.set(details, state);
        details.addEventListener('toggle', () => {
          if (!state.active) return;
          if (details.open) openMenu(state);
          else restoreMenu(state);
        });
        trigger.addEventListener('click', (event) => {
          if (!state.active) return;
          if (!details.open && event.detail === 0) state.pendingFocus = 'first';
        });
        trigger.addEventListener('keydown', (event) => {
          if (!state.active) return;
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          state.pendingFocus = event.key === 'ArrowUp' ? 'last' : 'first';
          if (details.open) openMenu(state);
          else details.open = true;
        });
        menu.addEventListener('click', (event) => {
          if (!state.active) return;
          if (!event.target.closest('button')) return;
          window.setTimeout(() => closeMenu(state, false), 0);
        });
        menu.addEventListener('keydown', (event) => {
          if (!state.active) return;
          const items = enabledItems(menu);
          const currentIndex = items.indexOf(document.activeElement);
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            closeMenu(state, true);
            return;
          }
          if (event.key === 'Tab') {
            closeMenu(state, false);
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
          items[nextIndex].focus({ preventScroll: true });
        });
        return state;
      };

      const registerMenusIn = (node) => {
        if (!node || node.nodeType !== 1) return;
        if (node.matches(actionMenuSelector)) registerMenu(node);
        node.querySelectorAll(actionMenuSelector).forEach(registerMenu);
        const parentDetails = node.closest(actionMenuSelector);
        if (parentDetails) registerMenu(parentDetails);
        const parentMenu = node.closest('.actions-menu');
        if (parentMenu) normalizeMenuItems(parentMenu);
      };

      registerMenusIn(root);
      const actionMenuObserver = new MutationObserver((mutations) => {
        mutations.forEach(({ addedNodes, removedNodes }) => {
          Array.from(removedNodes).forEach((node) => {
            if (!openState || node.nodeType !== 1) return;
            if (node === openState.details || node.contains(openState.details)) {
              closeMenu(openState, false);
            }
          });
          Array.from(addedNodes).forEach(registerMenusIn);
        });
      });
      actionMenuObserver.observe(root, { childList: true, subtree: true });

      const schedulePosition = () => {
        if (!openState || positionFrame) return;
        positionFrame = window.requestAnimationFrame(() => {
          positionFrame = 0;
          if (openState) positionMenu(openState);
        });
      };

      document.addEventListener('click', (event) => {
        if (!openState) return;
        if (openState.details.contains(event.target) || openState.menu.contains(event.target)) return;
        closeMenu(openState, false);
      });
      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !openState) return;
        event.preventDefault();
        closeMenu(openState, true);
      });
      window.addEventListener('resize', schedulePosition);
      window.addEventListener('scroll', schedulePosition, true);
    })();
  </script>`;
}
