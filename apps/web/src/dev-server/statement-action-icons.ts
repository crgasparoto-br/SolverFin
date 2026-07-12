import { icon } from "./icons.js";

/**
 * Adds the missing visual affordances to the bank statement actions without
 * coupling the behavior to the statement renderer. It also reduces the
 * recurrence badge to an icon with native tooltip and accessible label.
 */
export function statementActionIconsController(): string {
  return `
    (function () {
      const quickActionSelector = '.statement-heading-actions button[data-open-modal][data-quick-kind], .account-summary .quick-actions button[data-open-modal][data-quick-kind]';
      const currentMonthSelector = '[data-month-current], [data-invoice-current]';
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

      function markedIcon(svg) {
        return String(svg || "").replace(
          "<svg",
          '<svg data-statement-action-icon style="display:inline-block;flex-shrink:0;margin-right:5px;vertical-align:middle"',
        );
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
        root.querySelectorAll(".recurrence-indicator").forEach(decorateRecurrenceIndicator);
      }

      if (typeof document.querySelectorAll === "function") {
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
