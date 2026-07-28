export function renderCategoryEvolutionRuntime(): string {
  return `<script>
    (() => {
      const tableRoots = Array.from(document.querySelectorAll('[data-category-tree]'));
      for (const tableRoot of tableRoots) {
        const collapsed = new Set();
        const toggles = Array.from(tableRoot.querySelectorAll('[data-category-toggle]'));
        const rows = Array.from(tableRoot.querySelectorAll('[data-tree-ancestors]'));

        const updateToggle = (button) => {
          const rowId = button.getAttribute('data-category-toggle') || '';
          const expanded = !collapsed.has(rowId);
          const categoryName = button.getAttribute('data-category-name') || 'categoria';
          button.setAttribute('aria-expanded', String(expanded));
          const label = button.querySelector('[data-category-toggle-label]');
          if (label) label.textContent = (expanded ? 'Recolher ' : 'Expandir ') + categoryName;
          const icon = button.querySelector('[data-category-toggle-icon]');
          if (icon) icon.textContent = expanded ? '−' : '+';
        };

        const refresh = () => {
          for (const row of rows) {
            const ancestors = (row.getAttribute('data-tree-ancestors') || '')
              .split(' ')
              .filter(Boolean);
            row.hidden = ancestors.some((ancestorId) => collapsed.has(ancestorId));
          }
          for (const button of toggles) updateToggle(button);
        };

        for (const button of toggles) {
          button.addEventListener('click', () => {
            const rowId = button.getAttribute('data-category-toggle') || '';
            if (!rowId) return;
            if (collapsed.has(rowId)) collapsed.delete(rowId);
            else collapsed.add(rowId);
            refresh();
          });
        }
      }

      const form = document.querySelector('form.evolution-filters');
      const accountSelect = form?.querySelector('select[name="accountId"]');
      form?.addEventListener('submit', () => {
        if (accountSelect instanceof HTMLSelectElement && accountSelect.value === '') {
          accountSelect.removeAttribute('name');
        }
      });

      document.addEventListener('change', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLSelectElement) || target.name !== 'profileId') return;
        if (accountSelect instanceof HTMLSelectElement) accountSelect.value = '';
      });

      document.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const link = target.closest('a[href]');
        if (!(link instanceof HTMLAnchorElement)) return;
        const destination = new URL(link.href, window.location.href);
        if (destination.origin !== window.location.origin) return;
        const currentProfileId = form?.getAttribute('data-current-profile-id') || '';
        const destinationProfileId = destination.searchParams.get('profileId') || '';
        if (destinationProfileId === currentProfileId) return;
        destination.searchParams.delete('accountId');
        link.href = destination.pathname + destination.search + destination.hash;
      });
    })();
  </script>`;
}
