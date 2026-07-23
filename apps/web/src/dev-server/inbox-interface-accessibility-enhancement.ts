const ACCESSIBILITY_MARKER = 'data-inbox-interface-accessibility="enhanced"';
const ACCESSIBILITY_SCRIPT_MARKER = 'data-inbox-interface-accessibility-script="enhanced"';

export function enhanceInboxInterfaceAccessibility(html: string): string {
  let enhanced = html;

  if (!enhanced.includes(ACCESSIBILITY_MARKER)) {
    enhanced = enhanced.replace(
      "</head>",
      `<style ${ACCESSIBILITY_MARKER}>${inboxAccessibilityStyles()}</style></head>`,
    );
  }

  if (!enhanced.includes(ACCESSIBILITY_SCRIPT_MARKER)) {
    enhanced = enhanced.replace(
      "</body>",
      `<script ${ACCESSIBILITY_SCRIPT_MARKER}>${inboxAccessibilityScript()}</script></body>`,
    );
  }

  return enhanced;
}

function inboxAccessibilityStyles(): string {
  return `
    .inbox-page .heading-actions button,
    .inbox-page .compact-filters button,
    .inbox-page .line-filter-bar button,
    .inbox-page .detail-heading .inline-actions button,
    .inbox-page .detail-heading .inline-actions .button-link,
    .inbox-page .row-editor > .inline-actions button,
    .inbox-page .row-editor > .button-link,
    .inbox-page .candidate-card .inline-actions button,
    .inbox-page .maintenance-actions button,
    .inbox-page .maintenance-actions .button-link,
    .inbox-page .bulk-actions button {
      min-height: 34px !important;
    }
    .inbox-page button:disabled,
    .inbox-page .button-link[aria-disabled="true"] {
      background: #e2e8f0 !important;
      border-color: #cbd5e1 !important;
      color: #334155 !important;
      opacity: 1 !important;
    }
    .inbox-page .import-layout {
      gap: 0 !important;
    }
    .inbox-page .import-batch-list,
    .inbox-page .import-rows {
      gap: 0 !important;
    }
    .inbox-page .batch-item {
      border-radius: 0 !important;
      gap: 1px !important;
      min-height: 34px !important;
    }
    .inbox-page .bulk-actions {
      min-height: 36px;
      padding-block: 1px !important;
    }
    .inbox-page .bulk-actions > label input[type="checkbox"],
    .inbox-page .import-row > input[type="checkbox"] {
      flex-basis: 24px;
      height: 24px;
      min-height: 24px;
      width: 24px;
    }
    .inbox-page .import-row {
      border: 0 !important;
      border-bottom: 1px solid var(--line) !important;
      border-radius: 0 !important;
      gap: 3px !important;
      padding: 2px 4px !important;
    }
    .inbox-page .import-row > input[type="checkbox"] {
      margin-top: 5px;
    }
    .inbox-page .row-editor {
      gap: 3px !important;
    }
    .inbox-page .row-heading .status-pill,
    .inbox-page .row-summary dt {
      font-size: 0.6875rem !important;
    }
    .inbox-page .row-heading .status-pill {
      padding: 2px 6px !important;
    }
    .inbox-page .row-summary dd[data-full-value-enhanced="true"] {
      overflow: visible !important;
      position: relative;
      text-overflow: clip !important;
      white-space: normal !important;
    }
    .inbox-page .row-summary-value-preview {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .inbox-page .row-summary-full-value {
      background: var(--text);
      border: 1px solid #334155;
      border-radius: var(--radius);
      box-shadow: 0 8px 20px rgba(15, 23, 42, 0.18);
      color: var(--surface);
      display: none;
      font-size: 0.75rem;
      font-weight: 500;
      inset-inline-start: 0;
      line-height: 1.35;
      max-width: min(360px, calc(100vw - 32px));
      min-width: min(220px, calc(100vw - 32px));
      overflow-wrap: anywhere;
      padding: 6px 8px;
      position: absolute;
      top: calc(100% + 4px);
      white-space: normal;
      z-index: 40;
    }
    .inbox-page .row-summary dd[data-full-value-enhanced="true"]:hover .row-summary-full-value,
    .inbox-page .row-summary dd[data-full-value-enhanced="true"]:focus .row-summary-full-value,
    .inbox-page .row-summary dd[data-full-value-enhanced="true"]:focus-visible .row-summary-full-value {
      display: block;
    }
    .inbox-page .row-summary dd[data-full-value-enhanced="true"]:focus-visible {
      border-radius: 2px;
      outline: 2px solid var(--cyan);
      outline-offset: 2px;
    }
    .inbox-page .row-summary > div:nth-child(n + 5) .row-summary-full-value {
      inset-inline-end: 0;
      inset-inline-start: auto;
    }
    .inbox-page .detail-heading {
      margin-bottom: 3px;
      padding-bottom: 3px !important;
    }
    .inbox-page .import-summary {
      margin-bottom: 3px;
    }
    @media (max-width: 800px) {
      .inbox-page .bulk-actions {
        align-items: flex-start !important;
        display: flex !important;
        flex-wrap: wrap !important;
      }
      .inbox-page .bulk-actions > label {
        flex: 0 0 auto !important;
        width: auto !important;
      }
      .inbox-page .bulk-actions > div {
        flex: 1 1 auto;
        min-width: 0;
      }
    }
    @media (max-width: 520px) {
      .inbox-page .compact-filters button,
      .inbox-page .line-filter-bar button {
        flex: 0 0 auto !important;
        justify-self: start !important;
        max-width: 100%;
        width: max-content !important;
      }
    }
  `;
}

function inboxAccessibilityScript(): string {
  return `(() => {
    const revealableLabels = new Set([
      "Data",
      "Tipo",
      "Valor",
      "Descrição",
      "Conta de referência",
      "Outra conta",
    ]);

    const enhanceGroup = (group) => {
      const label = group.querySelector("dt")?.textContent?.trim();
      const value = group.querySelector("dd");
      if (!label || !value || !revealableLabels.has(label)) return;
      if (value.dataset.fullValueEnhanced === "true") return;

      const fullValue = (value.textContent || "").trim();
      value.dataset.fullValueEnhanced = "true";
      value.dataset.fullValue = fullValue;
      value.tabIndex = 0;
      value.setAttribute("aria-label", label + ": " + fullValue);
      value.setAttribute("title", fullValue);

      const preview = document.createElement("span");
      preview.className = "row-summary-value-preview";
      preview.setAttribute("aria-hidden", "true");
      preview.textContent = fullValue;

      const popover = document.createElement("span");
      popover.className = "row-summary-full-value";
      popover.setAttribute("aria-hidden", "true");
      popover.textContent = fullValue;

      value.replaceChildren(preview, popover);
    };

    const enhanceValues = (root) => {
      const selector = ".row-summary > div";
      const groups = [];
      if (root instanceof Element && root.matches(selector) && root.closest(".inbox-page")) {
        groups.push(root);
      }
      if ("querySelectorAll" in root) {
        groups.push(...[...root.querySelectorAll(selector)].filter((group) => group.closest(".inbox-page")));
      }
      groups.forEach(enhanceGroup);
    };

    const start = () => {
      enhanceValues(document);
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) enhanceValues(node);
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  })();`;
}
