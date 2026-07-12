import { keepCardInstrumentsInsideEditDialog } from "./accounts-cards-page-dialog-only.js";

export function enhanceAccountsCardsTabs(html: string): string {
  if (!html.includes('data-tab-panel="accounts"')) return html;

  let enhanced = keepCardInstrumentsInsideEditDialog(injectActiveFilter(html));
  enhanced = injectNeutralStyles(enhanced);

  if (!enhanced.includes("data-accounts-cards-direct-enhancement")) {
    enhanced = enhanced.replace("</body>", `${accountsCardsDirectEnhancementScript()}</body>`);
  }

  return enhanced;
}

function injectActiveFilter(html: string): string {
  if (html.includes("active-filter-switch")) return html;

  const activeFilterToggleHtml = `          <label class="active-filter-switch" data-active-filter aria-pressed="false">
            <input type="checkbox" class="active-filter-input" data-active-filter-input />
            <span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>
            <span>Exibir apenas ativos</span>
          </label>`;
  const htmlWithoutStatusFilter = html.replace(
    `          <label>Status
            <select data-master-status>
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
          </label>`,
    "",
  );

  return htmlWithoutStatusFilter.replace(
    `          <button type="button" data-open-dialog="new-card-dialog">Adicionar cartão</button>`,
    `          <button type="button" data-open-dialog="new-card-dialog">Adicionar cartão</button>
${activeFilterToggleHtml}`,
  );
}

function injectNeutralStyles(html: string): string {
  if (html.includes("data-accounts-cards-neutral-styles")) return html;

  const styles = `
      <style data-accounts-cards-neutral-styles>
        .tab-list { background: #f8fafc; border-color: #e2e8f0; }
        button.tab-button { background: transparent; border: 1px solid transparent; color: #475569; }
        button.tab-button span { background: #f1f5f9; color: #64748b; }
        button.tab-button:hover:not(:disabled), button.tab-button:focus-visible { background: #f1f5f9; border-color: #e2e8f0; color: #334155; }
        button.tab-button[aria-selected="true"] { background: #ffffff; border-color: #cbd5e1; color: #0f172a; box-shadow: 0 1px 2px rgba(15, 23, 42, .05); }
        button.tab-button[aria-selected="true"]:hover:not(:disabled), button.tab-button[aria-selected="true"]:focus-visible { background: #ffffff; border-color: #94a3b8; color: #0f172a; }
        button.tab-button[aria-selected="true"] span { background: #e2e8f0; color: #334155; }
        .active-filter-switch { align-items: center; align-self: stretch; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; color: #475569; cursor: pointer; display: inline-flex; font: inherit; font-size: 0.8125rem; font-weight: 600; gap: 8px; justify-content: center; line-height: 1.15; min-height: 34px; padding: 0 10px; text-align: left; user-select: none; width: fit-content; }
        .active-filter-switch:hover, .active-filter-switch:focus-within { background: #f1f5f9; border-color: #cbd5e1; color: #334155; }
        .active-filter-switch[aria-pressed="true"] { background: #ffffff; border-color: #cbd5e1; color: #334155; }
        .active-filter-input { border: 0; height: 1px; margin: 0; opacity: 0; padding: 0; position: absolute; width: 1px; }
        .active-filter-switch .toggle-track { align-items: center; background: #cbd5e1; border-radius: 999px; display: inline-flex; flex: 0 0 auto; height: 20px; padding: 2px; width: 38px; }
        .active-filter-switch .toggle-thumb { background: #fff; border-radius: 999px; box-shadow: 0 1px 3px rgba(15, 23, 42, .18); display: block; height: 16px; transform: translateX(0); transition: transform .18s ease; width: 16px; }
        .active-filter-switch[aria-pressed="true"] .toggle-track { background: #94a3b8; }
        .active-filter-switch[aria-pressed="true"] .toggle-thumb { transform: translateX(18px); }
        @media (max-width: 760px) { .active-filter-switch { width: 100%; } }
      </style>`;

  return html.replace("</head>", `${styles}</head>`);
}

function accountsCardsDirectEnhancementScript(): string {
  return `
      <script data-accounts-cards-direct-enhancement>
        (() => {
          if (window.__solverFinAccountsCardsDirect === true) return;
          window.__solverFinAccountsCardsDirect = true;

          const activeFilterStorageKey = "solverfin.accountsCards.activeOnly";

          function wireActiveFilter() {
            const button = document.querySelector("[data-active-filter]");
            const input = button ? button.querySelector("[data-active-filter-input]") : null;
            if (!button || !input) return;
            let activeOnly = false;
            try { activeOnly = window.localStorage.getItem(activeFilterStorageKey) === "true"; } catch (_error) { activeOnly = false; }
            input.checked = activeOnly;
            button.setAttribute("aria-pressed", String(activeOnly));
            input.dispatchEvent(new Event("change", { bubbles: true }));
            input.addEventListener("change", () => {
              button.setAttribute("aria-pressed", String(input.checked === true));
              try { window.localStorage.setItem(activeFilterStorageKey, String(input.checked === true)); } catch (_error) {}
            });
          }

          function boot() {
            wireActiveFilter();
          }

          if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", boot);
          } else {
            boot();
          }
        })();
      </script>`;
}
