const STATUS_ACTIONS_MARKER = 'data-inbox-status-actions="enhanced"';
const STATUS_ACTIONS_SCRIPT_MARKER = 'data-inbox-status-actions-script="enhanced"';

export function enhanceInboxStatusAndActions(html: string): string {
  if (html.includes(STATUS_ACTIONS_MARKER)) return html;

  return html
    .replace(
      "</head>",
      `<style ${STATUS_ACTIONS_MARKER}>${statusAndActionsStyles()}</style></head>`,
    )
    .replace(
      "</body>",
      `<script ${STATUS_ACTIONS_SCRIPT_MARKER}>${statusAndActionsScript()}</script></body>`,
    );
}

function statusAndActionsStyles(): string {
  return `
    .inbox-page .import-table-status,
    .inbox-page .row-heading .status-pill {
      background: transparent !important;
      box-shadow: none !important;
      color: inherit;
    }
    .inbox-page .row-heading .status-pill:not(.import-table-status) {
      border: 0 !important;
    }
    .inbox-page .import-table-status {
      border-left: 0 !important;
      border-top: 0 !important;
      border-bottom: 0 !important;
    }
    .inbox-page .import-row[data-row-state="rejected"] .import-table-status,
    .inbox-page .import-row[data-row-state="rejected"] .import-table-line,
    .inbox-page .import-row[data-row-state="rejected"] .import-table-cell,
    .inbox-page .import-row[data-row-state="rejected"] .import-table-observations,
    .inbox-page .import-row[data-row-state="rejected"] .row-heading strong,
    .inbox-page .import-row[data-row-state="rejected"] .row-summary dt,
    .inbox-page .import-row[data-row-state="rejected"] .row-summary dd {
      color: #b91c1c !important;
    }
    .inbox-page .import-row[data-controlled-status="confirmed"] .import-table-status,
    .inbox-page .import-row[data-controlled-status="confirmed"] .import-table-line,
    .inbox-page .import-row[data-controlled-status="confirmed"] .import-table-cell,
    .inbox-page .import-row[data-controlled-status="confirmed"] .import-table-observations,
    .inbox-page .import-row[data-controlled-status="confirmed"] .row-heading strong,
    .inbox-page .import-row[data-controlled-status="confirmed"] .row-summary dt,
    .inbox-page .import-row[data-controlled-status="confirmed"] .row-summary dd,
    .inbox-page .import-row[data-row-state="approved_created"] .import-table-status,
    .inbox-page .import-row[data-row-state="approved_created"] .import-table-line,
    .inbox-page .import-row[data-row-state="approved_created"] .import-table-cell,
    .inbox-page .import-row[data-row-state="approved_created"] .import-table-observations {
      color: #15803d !important;
    }
    .inbox-action-tooltip-layer {
      background: var(--text);
      border-radius: 4px;
      color: var(--surface);
      font-size: 0.75rem;
      font-weight: 600;
      left: 0;
      max-width: min(22rem, calc(100vw - 16px));
      overflow-wrap: anywhere;
      padding: 5px 7px;
      pointer-events: none;
      position: fixed;
      top: 0;
      white-space: normal;
      z-index: 1100;
    }
    .inbox-action-tooltip-layer[hidden] {
      display: none;
    }
  `;
}

function statusAndActionsScript(): string {
  return `(() => {
    const tooltipId = "inbox-action-tooltip";
    const actionSelector = ".row-action-cluster .compact-row-action";
    let activeControl;

    function ensureTooltip() {
      let tooltip = document.getElementById(tooltipId);
      if (tooltip) return tooltip;
      tooltip = document.createElement("div");
      tooltip.id = tooltipId;
      tooltip.className = "inbox-action-tooltip-layer";
      tooltip.setAttribute("role", "tooltip");
      tooltip.hidden = true;
      document.body.append(tooltip);
      return tooltip;
    }

    function describeControl(control) {
      const description = control.getAttribute("aria-label") || control.getAttribute("title") || "";
      if (!description) return;
      control.dataset.tooltip = description;
      control.setAttribute("title", description);
    }

    function describeActions(root) {
      const controls = [];
      if (root instanceof Element && root.matches(actionSelector) && root.closest(".inbox-page")) {
        controls.push(root);
      }
      if ("querySelectorAll" in root) {
        controls.push(
          ...Array.from(root.querySelectorAll(actionSelector)).filter((control) =>
            control.closest(".inbox-page"),
          ),
        );
      }
      controls.forEach(describeControl);
    }

    function positionTooltip(control, tooltip) {
      const rect = control.getBoundingClientRect();
      const gap = 7;
      tooltip.hidden = false;
      const tooltipRect = tooltip.getBoundingClientRect();
      let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - tooltipRect.width - 8));
      let top = rect.top - tooltipRect.height - gap;
      if (top < 8) top = rect.bottom + gap;
      tooltip.style.left = left + "px";
      tooltip.style.top = top + "px";
    }

    function showTooltip(control) {
      const description = control?.dataset?.tooltip;
      if (!description) return;
      const tooltip = ensureTooltip();
      activeControl = control;
      tooltip.textContent = description;
      control.setAttribute("aria-describedby", tooltipId);
      positionTooltip(control, tooltip);
    }

    function hideTooltip(control) {
      if (control && activeControl && control !== activeControl) return;
      const tooltip = document.getElementById(tooltipId);
      if (activeControl) activeControl.removeAttribute("aria-describedby");
      activeControl = undefined;
      if (tooltip) tooltip.hidden = true;
    }

    document.addEventListener("pointerover", (event) => {
      const control = event.target?.closest?.(".inbox-page " + actionSelector);
      if (control) showTooltip(control);
    });
    document.addEventListener("pointerout", (event) => {
      const control = event.target?.closest?.(".inbox-page " + actionSelector);
      if (control && !control.contains(event.relatedTarget)) hideTooltip(control);
    });
    document.addEventListener("focusin", (event) => {
      const control = event.target?.closest?.(".inbox-page " + actionSelector);
      if (control) showTooltip(control);
    });
    document.addEventListener("focusout", (event) => {
      const control = event.target?.closest?.(".inbox-page " + actionSelector);
      if (control) hideTooltip(control);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideTooltip();
    });
    window.addEventListener("scroll", () => hideTooltip(), true);
    window.addEventListener("resize", () => hideTooltip());

    const start = () => {
      describeActions(document);
      const detail = document.getElementById("import-batch-detail");
      if (detail) {
        new MutationObserver((records) => {
          for (const record of records) {
            for (const node of record.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE) describeActions(node);
            }
          }
        }).observe(detail, { childList: true, subtree: true });
      }
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  })();`;
}
