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

const STATEMENT_PRESENTATION_CSS = `
  main {
    max-width: 1800px !important;
  }

  .statement-layout {
    grid-template-columns: minmax(280px, 320px) minmax(0, 1fr) !important;
  }

  .account-summary {
    position: sticky !important;
    top: 68px;
  }

  .summary-balance strong,
  .summary-total strong,
  .status-line strong,
  .col-amount,
  .col-balance {
    font-variant-numeric: tabular-nums;
    overflow-wrap: normal !important;
    white-space: nowrap;
    word-break: normal !important;
  }

  .summary-balance strong {
    font-size: 1.125rem !important;
  }

  .summary-total strong,
  .status-line strong {
    font-size: 0.8125rem !important;
  }

  .statement-head > span:nth-child(7),
  .col-balance {
    text-align: right;
  }

  .statement-status {
    align-items: center;
    border: 1px solid currentColor;
    border-radius: 999px;
    cursor: default;
    display: inline-flex;
    height: 26px;
    justify-content: center;
    justify-self: start;
    padding: 0 !important;
    position: relative;
    width: 26px;
  }

  .statement-status svg {
    flex-shrink: 0;
    height: 15px;
    margin: 0;
    width: 15px;
  }

  .statement-status::after {
    background: var(--text, #0f172a);
    border-radius: 4px;
    color: var(--surface, #fff);
    content: attr(data-tooltip);
    font-size: 0.75rem;
    font-weight: 600;
    left: 50%;
    opacity: 0;
    padding: 5px 7px;
    pointer-events: none;
    position: absolute;
    top: calc(100% + 6px);
    transform: translate(-50%, -2px);
    transition: opacity 0.15s ease, transform 0.15s ease;
    visibility: hidden;
    white-space: nowrap;
    z-index: 60;
  }

  .statement-status:hover::after,
  .statement-status:focus::after {
    opacity: 1;
    transform: translate(-50%, 0);
    visibility: visible;
  }

  .statement-status:focus-visible {
    outline: 2px solid var(--cyan, #22d3ee);
    outline-offset: 2px;
  }

  .statement-status-ok {
    background: var(--success-bg, #dcfce7);
    color: var(--success, #16a34a);
  }

  .statement-status-posted {
    background: #e0f2fe;
    color: #0369a1;
  }

  .statement-status-pending {
    background: var(--warning-bg, #fffbeb);
    color: var(--warning, #d97706);
  }

  .statement-status-planned {
    background: var(--primary-soft, #eff6ff);
    color: var(--primary, #0f3d4c);
  }

  @media (max-width: 1180px) {
    .statement-layout {
      grid-template-columns: 1fr !important;
    }

    .account-summary {
      position: static !important;
    }
  }
`;

export interface StatementStatusPresentation {
  label: string;
  tone: "ok" | "posted" | "pending" | "planned";
  icon: string;
}

const STATEMENT_STATUS_PRESENTATIONS: Record<
  StatementStatusPresentation["tone"],
  StatementStatusPresentation
> = {
  ok: { label: "Conciliado", tone: "ok", icon: icon("check", 16) },
  posted: {
    label: "Efetivado não conciliado",
    tone: "posted",
    icon: icon("stop-circle", 16),
  },
  pending: { label: "Pendente", tone: "pending", icon: icon("alert-triangle", 16) },
  planned: { label: "Previsto", tone: "planned", icon: icon("clock", 16) },
};

export function resolveStatementStatusPresentation(transaction: {
  status: string;
  effectiveOn?: string | null;
}): StatementStatusPresentation {
  if (transaction.status === "reconciled") return STATEMENT_STATUS_PRESENTATIONS.ok;
  if (transaction.effectiveOn) return STATEMENT_STATUS_PRESENTATIONS.posted;
  if (transaction.status === "suggested") return STATEMENT_STATUS_PRESENTATIONS.pending;
  return STATEMENT_STATUS_PRESENTATIONS.planned;
}

/**
 * Adds the missing visual affordances to the bank statement without coupling
 * browser-only enhancements to the server renderer. It decorates quick actions,
 * normalizes month inputs, reduces recurrence/status badges to accessible icons,
 * and applies the responsive statement layout refinements.
 */
export function statementActionIconsController(): string {
  return `
    (function () {
      const quickActionSelector = '.statement-heading-actions button[data-open-modal][data-quick-kind], .account-summary .quick-actions button[data-open-modal][data-quick-kind]';
      const invoiceCurrentAttribute = "data-invoice-" + "current";
      const currentMonthSelector = '[data-month-current], [' + invoiceCurrentAttribute + ']';
      const monthInputSelector = '#filter-month, [data-invoice-month-input]';
      const statementRowSelector = ".statement-row.statement-body";
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
      const statementPresentationStyleId = "solverfin-statement-presentation";
      const statementPresentationCss = ${JSON.stringify(STATEMENT_PRESENTATION_CSS)};
      const statusPresentations = ${JSON.stringify(STATEMENT_STATUS_PRESENTATIONS)};

      function markedIcon(svg) {
        return String(svg || "").replace(
          "<svg",
          '<svg data-statement-action-icon style="display:inline-block;flex-shrink:0;margin-right:5px;vertical-align:middle"',
        );
      }

      function ensureStyle(id, css) {
        if (!document.head || typeof document.createElement !== "function") return;
        if (typeof document.getElementById === "function" && document.getElementById(id)) return;

        const style = document.createElement("style");
        style.id = id;
        style.textContent = css;
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

      function statusPresentation(transaction) {
        if (transaction.status === "reconciled") return statusPresentations.ok;
        if (transaction.effectiveOn) return statusPresentations.posted;
        if (transaction.status === "suggested") return statusPresentations.pending;
        return statusPresentations.planned;
      }

      function addClass(node, className) {
        if (!node) return;
        if (node.classList && typeof node.classList.add === "function") {
          node.classList.add(className);
          return;
        }
        const current = String(node.className || "").split(/\\s+/).filter(Boolean);
        if (!current.includes(className)) current.push(className);
        node.className = current.join(" ");
      }

      function decorateStatementRow(row) {
        if (!row || typeof row.querySelector !== "function") return;
        const statusNode = row.querySelector(".col-status");
        const transactionNode = row.querySelector("[data-transaction]");

        if (
          statusNode &&
          transactionNode &&
          (!statusNode.dataset || statusNode.dataset.statementStatusIcon !== "true")
        ) {
          try {
            const transaction = JSON.parse(transactionNode.textContent || "{}");
            const presentation = statusPresentation(transaction);
            statusNode.className = "statement-status statement-status-" + presentation.tone + " col-status";
            statusNode.innerHTML = presentation.icon;
            if (typeof statusNode.setAttribute === "function") {
              statusNode.setAttribute("role", "img");
              statusNode.setAttribute("tabindex", "0");
              statusNode.setAttribute("aria-label", presentation.label);
              statusNode.setAttribute("title", presentation.label);
              statusNode.setAttribute("data-tooltip", presentation.label);
            }
            if (statusNode.dataset) statusNode.dataset.statementStatusIcon = "true";
          } catch (_error) {
            // Preserve the server-rendered status when the embedded row data is invalid.
          }
        }

        const balanceNode = row.querySelector(".col-balance");
        if (balanceNode && String(balanceNode.textContent || "").includes("-")) {
          addClass(balanceNode, "debit");
        }
      }

      function decorateStatement(root) {
        if (!root || typeof root.querySelectorAll !== "function") return;
        root.querySelectorAll(quickActionSelector).forEach(decorateQuickAction);
        root.querySelectorAll(currentMonthSelector).forEach(decorateCurrentMonthButton);
        root.querySelectorAll(monthInputSelector).forEach(normalizeMonthInput);
        root.querySelectorAll(".recurrence-indicator").forEach(decorateRecurrenceIndicator);
        root.querySelectorAll(statementRowSelector).forEach(decorateStatementRow);
      }

      if (typeof document.querySelectorAll === "function") {
        ensureStyle(monthTypographyStyleId, monthTypographyCss);
        ensureStyle(statementPresentationStyleId, statementPresentationCss);
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
                if (typeof node.matches === "function" && node.matches(statementRowSelector)) {
                  decorateStatementRow(node);
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
