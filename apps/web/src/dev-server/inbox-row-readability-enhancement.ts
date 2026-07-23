const ROW_READABILITY_MARKER = 'data-inbox-row-readability="enhanced"';

export function enhanceInboxRowReadability(html: string): string {
  if (html.includes(ROW_READABILITY_MARKER)) return html;

  return html.replace(
    "</head>",
    `<style ${ROW_READABILITY_MARKER}>${inboxRowReadabilityStyles()}</style></head>`,
  );
}

function inboxRowReadabilityStyles(): string {
  return `
    .inbox-page .import-rows {
      --inbox-table-columns: 28px 84px 38px 68px 60px minmax(110px, 1.05fr) 76px minmax(116px, 0.9fr) minmax(160px, 1.35fr) 122px;
    }
    .inbox-page .import-table-select-cell {
      min-width: 28px;
      padding-inline: 2px !important;
    }
    .inbox-page .import-table-select-cell input[type="checkbox"] {
      -webkit-appearance: none !important;
      appearance: none !important;
      background-color: transparent;
      background-image: radial-gradient(
        circle at center,
        var(--surface) 0 6px,
        #64748b 6px 8px,
        transparent 8px
      );
      border: 0;
      border-radius: 50%;
      box-shadow: none;
      cursor: pointer;
      flex: 0 0 24px !important;
      height: 24px !important;
      margin: 0;
      min-height: 24px !important;
      padding: 0;
      width: 24px !important;
    }
    .inbox-page .import-table-select-cell input[type="checkbox"]:checked {
      background-image: radial-gradient(
        circle at center,
        var(--primary) 0 5px,
        var(--surface) 5px 7px,
        var(--primary) 7px 8px,
        transparent 8px
      );
    }
    .inbox-page .import-table-select-cell input[type="checkbox"]:focus-visible {
      outline: 2px solid var(--cyan);
      outline-offset: 1px;
    }
    .inbox-page .import-table-select-cell input[type="checkbox"]:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }
    .inbox-page .import-table-status,
    .inbox-page .row-heading .status-pill {
      max-width: 100% !important;
      min-width: 0;
      overflow: visible !important;
      overflow-wrap: anywhere;
      text-overflow: clip !important;
      white-space: normal !important;
      word-break: normal;
    }
    .inbox-page .import-table-cell-account,
    .inbox-page .import-table-cell-account .row-summary-value-preview,
    .inbox-page .import-table-account-secondary {
      max-width: 100%;
      min-width: 0;
      overflow: visible !important;
      overflow-wrap: anywhere;
      text-overflow: clip !important;
      white-space: normal !important;
      word-break: break-word;
    }
    .inbox-page .import-table-header-status,
    .inbox-page .import-table-header-account {
      overflow-wrap: anywhere;
      white-space: normal;
    }

    @media (min-width: 1024px) {
      .inbox-page .import-table-header,
      .inbox-page .import-row {
        min-width: 848px;
      }
    }

    @media (max-width: 520px) {
      .inbox-page .import-row {
        grid-template-columns: 24px minmax(0, 1fr) !important;
      }
      .inbox-page .import-table-select-cell {
        min-width: 24px;
        padding-inline: 0 !important;
      }
    }
  `;
}
