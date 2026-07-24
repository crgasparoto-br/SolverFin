const finalizerMarker = "data-cards-interface-finalizer";

export function finalizeCardsInterface(html: string): string {
  if (html.includes(finalizerMarker)) return html;

  const normalizedHtml = html
    .replace(/\s*<script data-cards-interface-controller>[\s\S]*?<\/script>/, "")
    .replace(/\saria-rowcount="[^"]*"/g, "");

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
        const clear = root.querySelector("[data-clear-purchase-search]");
        const reset = root.querySelector("[data-reset-purchase-filters]");
        let updateQueued = false;

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
          updateQueued = false;
          const matchingCount = rows.filter(rowMatchesFilters).length;
          const displayedCount = rows.filter(rowIsDisplayed).length;
          const nextStatus = formatCount(displayedCount);
          const nextEmptyHidden = rows.length === 0 || matchingCount > 0;

          if (resultStatus && resultStatus.textContent !== nextStatus) {
            resultStatus.textContent = nextStatus;
          }
          if (filteredEmpty && filteredEmpty.hidden !== nextEmptyHidden) {
            filteredEmpty.hidden = nextEmptyHidden;
          }
          if (clear) clear.hidden = !String(search?.value || "").trim();
        };

        const scheduleDisplayedResultsUpdate = () => {
          if (updateQueued) return;
          updateQueued = true;
          requestAnimationFrame(updateDisplayedResults);
        };

        search?.addEventListener("input", scheduleDisplayedResultsUpdate);
        toggles.forEach((toggle) =>
          toggle.addEventListener("click", scheduleDisplayedResultsUpdate),
        );
        groups.forEach((group) =>
          group.addEventListener("toggle", scheduleDisplayedResultsUpdate),
        );
        clear?.addEventListener("click", () => {
          if (!search) return;
          search.value = "";
          search.dispatchEvent(new Event("input", { bubbles: true }));
          search.focus();
        });
        reset?.addEventListener("click", () => {
          if (search) {
            search.value = "";
            search.dispatchEvent(new Event("input", { bubbles: true }));
          }
          toggles.forEach((toggle) => {
            if (toggle.getAttribute("aria-pressed") !== "true") toggle.click();
          });
        });

        if (list) {
          const observer = new MutationObserver(scheduleDisplayedResultsUpdate);
          observer.observe(list, {
            attributes: true,
            attributeFilter: ["hidden", "open"],
            subtree: true,
          });
        }

        const focusableFieldSelector =
          "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])";
        const modalOpeners = new WeakMap();

        root.querySelectorAll("dialog[data-modal]").forEach((dialog) => {
          dialog.querySelector(focusableFieldSelector)?.setAttribute("autofocus", "");
          dialog.addEventListener("close", () => {
            const opener = modalOpeners.get(dialog);
            if (opener?.isConnected) opener.focus();
            modalOpeners.delete(dialog);
          });
        });

        root.querySelectorAll("[data-open-modal]").forEach((button) => {
          button.addEventListener("click", () => {
            const dialog = root.querySelector(
              'dialog[data-modal="' + button.dataset.openModal + '"]',
            );
            if (dialog) modalOpeners.set(dialog, button);
            window.setTimeout(() => {
              dialog?.querySelector(focusableFieldSelector)?.focus();
            }, 0);
          });
        });

        updateDisplayedResults();
      })();
    </script>`;

  return normalizedHtml.replace("</body>", `${controller}</body>`);
}
