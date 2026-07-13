export function statementPresentationStyles(): string {
  return `
    .statement-status::after { content: none; }
    .statement-tooltip-layer {
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
      z-index: 1000;
    }
    .statement-tooltip-layer[hidden] { display: none; }

    .statement-layout .summary-totals { grid-template-columns: 1fr; }
    .statement-layout .summary-total strong,
    .statement-layout .summary-balance strong,
    .statement-layout .status-line strong {
      max-width: 100%;
      overflow-x: auto;
      scrollbar-width: thin;
    }
    .statement-layout .summary-total strong { justify-self: end; }
    .statement-layout .status-line { grid-template-columns: auto minmax(0, 1fr); }
    .statement-layout .status-line strong {
      grid-column: 1 / -1;
      justify-self: end;
    }

    .statement-table .statement-row {
      grid-template-columns: 6rem minmax(10rem, 1.3fr) minmax(8rem, .9fr) 7rem 4.5rem 10rem 11rem 3rem;
      min-width: 70rem;
    }
    .statement-table .col-amount,
    .statement-table .col-balance { min-width: max-content; }

    @media (min-width: 761px) and (max-width: 900px) {
      .account-filter .filter-form { grid-template-columns: 1fr; }
      .account-filter .month-nav input[type="month"] { min-width: 10rem; }
      .account-filter .ghost-btn { justify-self: start; }
    }

    @media (max-width: 760px) {
      .statement-table .statement-row.statement-body { min-width: 0; }
      .statement-table .statement-row.statement-body .col-amount,
      .statement-table .statement-row.statement-body .col-balance {
        max-width: 100%;
        overflow-x: auto;
      }
    }
  `;
}

export function statementPresentationScript(): string {
  return `
    <script>
      (function () {
        const triggers = Array.from(document.querySelectorAll(".statement-status[data-tooltip]"));
        if (triggers.length === 0) return;

        const tooltipId = "statement-status-tooltip";
        let tooltip = document.getElementById(tooltipId);
        if (!tooltip) {
          tooltip = document.createElement("div");
          tooltip.id = tooltipId;
          tooltip.className = "statement-tooltip-layer";
          tooltip.setAttribute("role", "tooltip");
          tooltip.hidden = true;
          document.body.appendChild(tooltip);
        }

        let activeTrigger = null;

        function restoreNativeTitle(trigger) {
          if (!trigger || !trigger.dataset.nativeTitle) return;
          trigger.setAttribute("title", trigger.dataset.nativeTitle);
          delete trigger.dataset.nativeTitle;
        }

        function positionTooltip() {
          if (!activeTrigger || tooltip.hidden) return;

          const triggerRect = activeTrigger.getBoundingClientRect();
          const tooltipRect = tooltip.getBoundingClientRect();
          const viewportPadding = 8;
          const gap = 7;
          const preferredLeft = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
          const maxLeft = Math.max(viewportPadding, window.innerWidth - tooltipRect.width - viewportPadding);
          const left = Math.min(Math.max(viewportPadding, preferredLeft), maxLeft);
          const above = triggerRect.top - tooltipRect.height - gap;
          const below = triggerRect.bottom + gap;
          const maxTop = Math.max(viewportPadding, window.innerHeight - tooltipRect.height - viewportPadding);
          const top = above >= viewportPadding ? above : Math.min(Math.max(viewportPadding, below), maxTop);

          tooltip.style.left = left + "px";
          tooltip.style.top = top + "px";
        }

        function hideTooltip(trigger, force) {
          if (activeTrigger !== trigger) return;
          if (!force && (document.activeElement === trigger || trigger.matches(":hover"))) return;

          restoreNativeTitle(trigger);
          trigger.removeAttribute("aria-describedby");
          activeTrigger = null;
          tooltip.hidden = true;
          tooltip.textContent = "";
        }

        function showTooltip(trigger) {
          const label = trigger.dataset.tooltip || trigger.getAttribute("aria-label");
          if (!label) return;

          if (activeTrigger && activeTrigger !== trigger) hideTooltip(activeTrigger, true);
          activeTrigger = trigger;
          tooltip.textContent = label;
          if (trigger.hasAttribute("title")) {
            trigger.dataset.nativeTitle = trigger.getAttribute("title") || label;
            trigger.removeAttribute("title");
          }
          trigger.setAttribute("aria-describedby", tooltipId);
          tooltip.hidden = false;
          positionTooltip();
        }

        triggers.forEach((trigger) => {
          trigger.addEventListener("mouseenter", () => showTooltip(trigger));
          trigger.addEventListener("mouseleave", () => hideTooltip(trigger, false));
          trigger.addEventListener("focus", () => showTooltip(trigger));
          trigger.addEventListener("blur", () => hideTooltip(trigger, false));
        });

        window.addEventListener("resize", positionTooltip);
        document.addEventListener("scroll", positionTooltip, true);
      })();
    </script>
  `;
}
