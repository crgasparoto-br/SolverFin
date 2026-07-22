const ACCESSIBILITY_MARKER = 'data-inbox-interface-accessibility="enhanced"';

export function enhanceInboxInterfaceAccessibility(html: string): string {
  if (html.includes(ACCESSIBILITY_MARKER)) return html;

  return html.replace(
    "</head>",
    `<style ${ACCESSIBILITY_MARKER}>${inboxAccessibilityStyles()}</style></head>`,
  );
}

function inboxAccessibilityStyles(): string {
  return `
    .inbox-page .heading-actions button,
    .inbox-page .compact-filters button,
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
  `;
}
