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
        display: grid;
        gap: 8px 12px;
        grid-template-columns: auto auto minmax(0, 1fr) auto auto;
        height: auto;
        max-width: 100%;
        min-height: 0;
        min-width: 0;
        position: relative;
        width: 100%;
      }
      .selection-bar > strong { grid-column: 1; grid-row: 1; }
      .selection-bar > [data-selection-total] { grid-column: 2; grid-row: 1; }
      .selection-bar > [data-selection-clear] { grid-column: 4; grid-row: 1; }
      .selection-bar > [data-group-open] { grid-column: 5; grid-row: 1; }
      .selection-bar .bulk-selection-actions {
        grid-column: 1 / -1;
        grid-row: 2;
        justify-self: end;
        min-width: 0;
      }
      .selection-bar .bulk-selection-help,
      .selection-bar .bulk-selection-status {
        grid-column: 1 / -1;
        min-width: 0;
        overflow-wrap: anywhere;
        text-align: left;
      }
      .selection-bar .bulk-selection-help { grid-row: 3; }
      .selection-bar .bulk-selection-status { grid-row: 4; }
      .selection-bar .bulk-selection-status:empty { display: none; }
      @media(max-width:760px) {
        .selection-bar {
          grid-template-columns: 1fr 1fr;
        }
        .selection-bar > strong,
        .selection-bar > [data-selection-total],
        .selection-bar .bulk-selection-actions,
        .selection-bar .bulk-selection-help,
        .selection-bar .bulk-selection-status {
          grid-column: 1 / -1;
        }
        .selection-bar > strong { grid-row: 1; }
        .selection-bar > [data-selection-total] { grid-row: 2; }
        .selection-bar .bulk-selection-actions { grid-row: 3; justify-self: stretch; }
        .selection-bar > [data-selection-clear] { grid-column: 1; grid-row: 4; }
        .selection-bar > [data-group-open] { grid-column: 2; grid-row: 4; }
        .selection-bar .bulk-selection-help { grid-row: 5; }
        .selection-bar .bulk-selection-status { grid-row: 6; }
      }
    </style>`;

  return html.replace("</head>", `${styles}</head>`);
}
