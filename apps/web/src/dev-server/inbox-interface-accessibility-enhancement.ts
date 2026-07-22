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
      min-height: 34px;
    }
    .inbox-page .bulk-actions {
      min-height: 36px;
      padding-block: 1px;
    }
    .inbox-page .bulk-actions > label input[type="checkbox"],
    .inbox-page .import-row > input[type="checkbox"] {
      flex-basis: 24px;
      height: 24px;
      min-height: 24px;
      width: 24px;
    }
    .inbox-page .import-row {
      gap: 5px;
      padding-block: 3px;
    }
    .inbox-page .import-row > input[type="checkbox"] {
      margin-top: 3px;
    }
    .inbox-page .row-heading .status-pill,
    .inbox-page .row-summary dt {
      font-size: 0.6875rem;
    }
    .inbox-page .row-heading .status-pill {
      padding: 2px 6px;
    }
    .inbox-page .detail-heading {
      margin-bottom: 3px;
      padding-bottom: 3px;
    }
    .inbox-page .import-summary {
      margin-bottom: 3px;
    }
  `;
}
