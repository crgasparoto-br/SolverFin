const finalizerMarker = "data-cards-interface-finalizer";

export function finalizeCardsInterface(html: string): string {
  if (html.includes(finalizerMarker)) return html;

  const controller = `
    <script ${finalizerMarker}>
      (() => {
        const root = document.querySelector("main[data-cards-interface-enhanced]");
        if (!root) return;

        const search = root.querySelector("input[data-purchase-search]");
        if (search) {
          search.style.height = "44px";
          search.style.minHeight = "44px";
        }

        const list = root.querySelector('.purchase-list[aria-label="Compras da fatura"]');
        const rows = Array.from(root.querySelectorAll("[data-purchase-item]"));
        const groups = Array.from(root.querySelectorAll("[data-instrument-purchase-group]"));
        const toggles = Array.from(root.querySelectorAll("[data-reconciliation-toggle]"));
        const resultStatus = root.querySelector("[data-purchase-results-status]");
        const filteredEmpty = root.querySelector("[data-purchase-filter-empty]");

        const rowMatchesFilters = (row) => {
          const group = row.closest("[data-instrument-purchase-group]");
          return !row.hidden && !group?.hidden;
        };

        const rowIsDisplayed = (row) => {
          if (!rowMatchesFilters(row)) return false;
          const group = row.closest("[data-instrument-purchase-group]");
          return !group || group.open;
        };

        const formatCount = (count) =>
          count + (count === 1 ? " compra exibida" : " compras exibidas");

        const updateDisplayedResults = () => {
          const matchingCount = rows.filter(rowMatchesFilters).length;
          const displayedCount = rows.filter(rowIsDisplayed).length;
          if (resultStatus) resultStatus.textContent = formatCount(displayedCount);
          if (filteredEmpty) filteredEmpty.hidden = rows.length === 0 || matchingCount > 0;
          if (list) list.setAttribute("aria-rowcount", String(displayedCount));
        };

        search?.addEventListener("input", () => requestAnimationFrame(updateDisplayedResults));
        toggles.forEach((toggle) =>
          toggle.addEventListener("click", () => requestAnimationFrame(updateDisplayedResults)),
        );
        groups.forEach((group) =>
          group.addEventListener("toggle", () => requestAnimationFrame(updateDisplayedResults)),
        );

        if (list) {
          const observer = new MutationObserver(() => requestAnimationFrame(updateDisplayedResults));
          observer.observe(list, {
            attributes: true,
            attributeFilter: ["hidden", "open"],
            subtree: true,
          });
        }

        const focusableFieldSelector =
          "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])";

        root.querySelectorAll("dialog[data-modal]").forEach((dialog) => {
          dialog.querySelector(focusableFieldSelector)?.setAttribute("autofocus", "");
        });

        root.querySelectorAll("[data-open-modal]").forEach((button) => {
          button.addEventListener("click", () => {
            window.setTimeout(() => {
              const dialog = root.querySelector(
                'dialog[data-modal="' + button.dataset.openModal + '"]',
              );
              dialog?.querySelector(focusableFieldSelector)?.focus();
            }, 0);
          });
        });

        updateDisplayedResults();
      })();
    </script>`;

  return html.replace("</body>", `${controller}</body>`);
}
