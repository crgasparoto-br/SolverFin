import { icon } from "./icons.js";

const MONTH_TYPOGRAPHY_CSS = `
  #filter-month,
  [data-invoice-month-input],
  .month-current,
  #filter-month::-webkit-datetime-edit,
  [data-invoice-month-input]::-webkit-datetime-edit,
  #filter-month::-webkit-datetime-edit-fields-wrapper,
  [data-invoice-month-input]::-webkit-datetime-edit-fields-wrapper,
  #filter-month::-webkit-datetime-edit-month-field,
  [data-invoice-month-input]::-webkit-datetime-edit-month-field,
  #filter-month::-webkit-datetime-edit-year-field,
  [data-invoice-month-input]::-webkit-datetime-edit-year-field,
  #filter-month::-webkit-datetime-edit-text,
  [data-invoice-month-input]::-webkit-datetime-edit-text {
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    font-size: 0.875rem !important;
    font-weight: 400 !important;
    line-height: 1.5 !important;
  }
`;

/**
 * Adds the missing visual affordances to the bank statement actions without
 * coupling the behavior to the statement renderer. It also reduces the
 * recurrence badge to an icon with native tooltip and accessible label.
 */
export function statementActionIconsController(): string {
  return `
    (function () {
      const quickActionSelector = '.statement-heading-actions button[data-open-modal][data-quick-kind], .account-summary .quick-actions button[data-open-modal][data-quick-kind]';
      const invoiceCurrentAttribute = "data-invoice-" + "current";
      const currentMonthSelector = '[data-month-current], [' + invoiceCurrentAttribute + ']';
      const monthInputSelector = '#filter-month, [data-invoice-month-input]';
      const quickActionIcons = {
        transfer: ${JSON.stringify(icon("repeat", 14))},
        expense: ${JSON.stringify(icon("arrow-down", 14))},
        income: ${JSON.stringify(icon("arrow-up", 14))},
      };
      const quickActionTitles = {
        transfer: "Transferir entre contas",
        expense: "Registrar nova despesa",
        income: "Registrar nova receita",
      };
      const currentMonthIcon = ${JSON.stringify(icon("calendar", 14))};
      const currentMonthTooltip = "Exibir o mês atual";
      const monthTypographyStyleId = "solverfin-month-typography";
      const monthTypographyCss = ${JSON.stringify(MONTH_TYPOGRAPHY_CSS)};

      function markedIcon(svg) {
        return String(svg || "").replace(
          "<svg",
          '<svg data-statement-action-icon style="display:inline-block;flex-shrink:0;margin-right:5px;vertical-align:middle"',
        );
      }

      function ensureMonthTypographyStyle() {
        if (!document.head || typeof document.createElement !== "function") return;
        if (
          typeof document.getElementById === "function" &&
          document.getElementById(monthTypographyStyleId)
        ) {
          return;
        }

        const style = document.createElement("style");
        style.id = monthTypographyStyleId;
        style.textContent = monthTypographyCss;
        document.head.appendChild(style);
      }

      function decorateQuickAction(button) {
        if (!button || typeof button.querySelector !== "function") return;
        if (button.querySelector("svg")) return;
        const kind = button.dataset ? String(button.dataset.quickKind || "") : "";
        const svg = quickActionIcons[kind];
        if (!svg || typeof button.insertAdjacentHTML !== "function") return;

        button.insertAdjacentHTML("afterbegin", markedIcon(svg));
        if (
          typeof button.getAttribute === "function" &&
          typeof button.setAttribute === "function" &&
          !button.getAttribute("title")
        ) {
          button.setAttribute("title", quickActionTitles[kind]);
        }
      }

      function decorateCurrentMonthButton(button) {
        if (!button || typeof button.querySelector !== "function") return;
        if (!button.querySelector("svg") && typeof button.insertAdjacentHTML === "function") {
          button.insertAdjacentHTML("afterbegin", markedIcon(currentMonthIcon));
        }
        if (typeof button.setAttribute === "function") {
          button.setAttribute("title", currentMonthTooltip);
          button.setAttribute("aria-label", currentMonthTooltip);
        }
      }

      function normalizeMonthInput(input) {
        if (!input || !input.style) return;
        input.style.fontWeight = "400";
      }

      function decorateRecurrenceIndicator(indicator) {
        if (!indicator || typeof indicator.querySelector !== "function") return;
        if (indicator.dataset && indicator.dataset.recurrenceIconOnly === "true") return;

        if (typeof indicator.setAttribute === "function") {
          indicator.setAttribute("title", "Lançamento recorrente");
          indicator.setAttribute("aria-label", "Lançamento recorrente");
          indicator.setAttribute("role", "img");
          indicator.setAttribute("tabindex", "0");
        }

        const label = indicator.querySelector("span");
        if (label) {
          label.hidden = true;
          if (typeof label.setAttribute === "function") label.setAttribute("aria-hidden", "true");
        }

        const svg = indicator.querySelector("svg");
        if (svg && typeof svg.setAttribute === "function") {
          svg.setAttribute("width", "14");
          svg.setAttribute("height", "14");
        }
        if (svg && svg.style) {
          svg.style.width = "14px";
          svg.style.height = "14px";
        }

        if (indicator.style) {
          indicator.style.gap = "0";
          indicator.style.padding = "3px";
        }
        if (indicator.dataset) indicator.dataset.recurrenceIconOnly = "true";
      }

      function decorateStatement(root) {
        if (!root || typeof root.querySelectorAll !== "function") return;
        root.querySelectorAll(quickActionSelector).forEach(decorateQuickAction);
        root.querySelectorAll(currentMonthSelector).forEach(decorateCurrentMonthButton);
        root.querySelectorAll(monthInputSelector).forEach(normalizeMonthInput);
        root.querySelectorAll(".recurrence-indicator").forEach(decorateRecurrenceIndicator);
      }

      if (typeof document.querySelectorAll === "function") {
        ensureMonthTypographyStyle();
        decorateStatement(document);

        if (typeof MutationObserver !== "undefined" && document.body) {
          const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              mutation.addedNodes.forEach((node) => {
                if (!node || typeof node !== "object") return;
                if (typeof node.matches === "function" && node.matches(quickActionSelector)) {
                  decorateQuickAction(node);
                }
                if (typeof node.matches === "function" && node.matches(currentMonthSelector)) {
                  decorateCurrentMonthButton(node);
                }
                if (typeof node.matches === "function" && node.matches(monthInputSelector)) {
                  normalizeMonthInput(node);
                }
                if (typeof node.matches === "function" && node.matches(".recurrence-indicator")) {
                  decorateRecurrenceIndicator(node);
                }
                decorateStatement(node);
              });
            });
          });
          observer.observe(document.body, { childList: true, subtree: true });
        }
      }
    })();
  `;
}
