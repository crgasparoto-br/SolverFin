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
        grid-template-columns: auto auto minmax(0, 1fr) auto auto;
        height: auto;
        max-width: 100%;
        min-height: 0;
        min-width: 0;
        position: relative;
        width: 100%;
      }
      .selection-bar .bulk-selection-actions {
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
        .selection-bar .bulk-selection-actions {
          justify-self: stretch;
        }
      }
    </style>`;

  return html.replace("</head>", `${styles}</head>`);
}
