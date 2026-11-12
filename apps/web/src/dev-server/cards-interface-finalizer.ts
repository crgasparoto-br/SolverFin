import { icon } from "./icons.js";

const finalizerMarker = "data-cards-interface-finalizer";
const statusAlignmentMarker = "data-cards-status-alignment";
const postedIcon =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>';

export function finalizeCardsInterface(html: string): string {
  if (html.includes(finalizerMarker)) return html;

  const normalizedHtml = finalizePurchaseStatuses(finalizePurchaseSearch(html))
    .replace(/\s*<script data-cards-interface-controller>[\s\S]*?<\/script>/, "")
    .replace(/\saria-rowcount="[^"]*"/g, "");

  const statusStyles = `
    <style ${statusAlignmentMarker}>
      main[data-cards-interface-enhanced] .purchase-status.statement-status {
        align-items: center;
        border-radius: 999px;
        display: inline-flex;
        height: 30px;
        justify-content: center;
        justify-self: center;
        padding: 0;
        width: 30px;
      }
      main[data-cards-interface-enhanced] .purchase-status.statement-status svg {
        flex: 0 0 auto;
      }
    </style>`;

  const controller = `
    <script ${finalizerMarker}>
      (() => {
        const root = document.querySelector("main[data-cards-interface-enhanced]");
        if (!root) return;

        const search = root.querySelector('input[type="search"][data-purchase-search]');
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

  return normalizedHtml.replace("</body>", `${statusStyles}${controller}</body>`);
}

function finalizePurchaseStatuses(html: string): string {
  return html.replace(
    /<span class="purchase-status purchase-status-(ok|pending)" role="cell" data-label="Situação" title="([^"]+)">([\s\S]*?)<span>[^<]+<\/span><\/span>/g,
    (_match, tone: "ok" | "pending", label: string, iconHtml: string) => {
      const statementTone = tone === "ok" ? "ok" : "posted";
      const statusIcon = tone === "ok" ? icon("check", 15) : postedIcon;
      return `<span class="statement-status statement-status-${statementTone} purchase-status" role="img" tabindex="0" aria-label="${label}" title="${label}" data-tooltip="${label}" data-label="Situação">${statusIcon || iconHtml}</span>`;
    },
  );
}

function finalizePurchaseSearch(html: string): string {
  const misplacedSearchWrapper =
    /<label class="purchase-search" for="purchase-search-input">\s*<span class="visually-hidden">Buscar compras da fatura<\/span>\s*<span class="purchase-search-icon" aria-hidden="true">[\s\S]*?<\/span>\s*(<input(?=[^>]*\sdata-purchase-search-state(?:\s|\/?>))[^>]*>)\s*<button type="button" class="purchase-search-clear"[\s\S]*?<\/button>\s*<\/label>/;
  let normalized = html.replace(misplacedSearchWrapper, "$1");
  normalized = normalized.replace(
    /<input(?=[^>]*\sdata-purchase-search-state(?:\s|\/?>))([^>]*)>/,
    (_match, rawAttributes: string) => {
      let attributes = removeAttribute(rawAttributes, "id");
      attributes = removeAttribute(attributes, "aria-label");
      attributes = removeAttribute(attributes, "autocomplete");
      return `<input${attributes}>`;
    },
  );

  if (
    /<label class="purchase-search"[^>]*>[\s\S]*?<input(?=[^>]*\stype="search")(?=[^>]*\sdata-purchase-search(?:\s|\/?>))/.test(
      normalized,
    )
  ) {
    return normalized;
  }

  return normalized.replace(
    /<input(?=[^>]*\stype="search")(?=[^>]*\sdata-purchase-search(?:\s|\/?>))([^>]*)>/,
    (_match, rawAttributes: string) => {
      let attributes = upsertAttribute(rawAttributes, "id", "purchase-search-input");
      attributes = upsertAttribute(attributes, "aria-label", "Buscar compras da fatura");
      attributes = upsertAttribute(attributes, "autocomplete", "off");
      return `<label class="purchase-search" for="purchase-search-input">
                <span class="visually-hidden">Buscar compras da fatura</span>
                <span class="purchase-search-icon" aria-hidden="true">${icon("search", 15)}</span>
                <input${attributes}>
                <button type="button" class="purchase-search-clear" data-clear-purchase-search aria-label="Limpar busca" title="Limpar busca" hidden>${icon("x", 14)}</button>
              </label>`;
    },
  );
}

function upsertAttribute(attributes: string, name: string, value: string): string {
  const pattern = new RegExp(`\\s${name}="[^"]*"`);
  if (pattern.test(attributes)) {
    return attributes.replace(pattern, ` ${name}="${value}"`);
  }
  return `${attributes} ${name}="${value}"`;
}

function removeAttribute(attributes: string, name: string): string {
  return attributes.replace(new RegExp(`\\s${name}="[^"]*"`, "g"), "");
}
