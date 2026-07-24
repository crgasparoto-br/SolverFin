const STYLE_MARKER = "data-transaction-bulk-selection-layout-enhancement";

export function enhanceTransactionBulkSelectionLayout(html: string): string {
  if (
    !html.includes("data-transaction-bulk-selection-enhancement") ||
    html.includes(STYLE_MARKER)
  ) {
    return html;
  }

  const styles = `
    <style ${STYLE_MARKER}>
      .selection-bar {
        align-self: end;
        bottom: auto;
        height: auto;
        max-width: 100%;
        min-height: 0;
        min-width: 0;
        position: relative;
        width: 100%;
      }
      .selection-bar .bulk-selection-help,
      .selection-bar .bulk-selection-status {
        flex: 1 1 100%;
        min-width: 0;
        overflow-wrap: anywhere;
        text-align: left;
      }
    </style>`;

  return html.replace("</head>", `${styles}</head>`);
}
