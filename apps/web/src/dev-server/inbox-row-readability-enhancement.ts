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
      --inbox-table-columns: 28px minmax(92px, 120px) 42px minmax(82px, 96px) minmax(96px, 112px) minmax(180px, 1.45fr) minmax(120px, 136px) minmax(150px, 1fr) minmax(210px, 1.35fr) 122px;
    }
    .inbox-page .import-table-select-cell {
      min-width: 28px;
      padding-inline: 2px !important;
    }
    .inbox-page .import-table-header > span,
    .inbox-page .import-table-status,
    .inbox-page .row-heading .status-pill,
    .inbox-page .import-table-line,
    .inbox-page .import-table-cell,
    .inbox-page .import-table-cell .row-summary-value-preview,
    .inbox-page .import-table-observations,
    .inbox-page .import-table-observations .warning,
    .inbox-page .import-table-observations .candidate-card,
    .inbox-page .import-table-observations .candidate-card strong,
    .inbox-page .import-table-observations .candidate-card p {
      max-width: 100%;
      min-width: 0;
      overflow: visible !important;
      overflow-wrap: anywhere;
      text-overflow: clip !important;
      white-space: normal !important;
      word-break: normal;
    }
    .inbox-page .import-table-cell-date,
    .inbox-page .import-table-cell-date .row-summary-value-preview,
    .inbox-page .import-table-cell-amount,
    .inbox-page .import-table-cell-amount .row-summary-value-preview {
      overflow: visible !important;
      text-overflow: clip !important;
      white-space: nowrap !important;
    }
    .inbox-page .import-table-cell-type,
    .inbox-page .import-table-cell-type .row-summary-value-preview {
      min-width: 0;
      overflow: visible !important;
      overflow-wrap: anywhere;
      text-overflow: clip !important;
      white-space: normal !important;
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
    .inbox-page .import-table-header-date,
    .inbox-page .import-table-header-amount {
      white-space: nowrap !important;
    }

    @media (min-width: 1024px) {
      .inbox-page .import-table-header,
      .inbox-page .import-row {
        min-width: 1152px;
      }
      .inbox-page .import-table-header-actions,
      .inbox-page .row-action-cluster {
        background: var(--surface);
        box-shadow: -1px 0 0 var(--line), -8px 0 12px -12px rgba(15, 23, 42, 0.45);
        position: sticky;
        right: 0;
        z-index: 4;
      }
      .inbox-page .import-table-header-actions {
        background: var(--surface-soft);
        z-index: 5;
      }
      .inbox-page .import-row:hover .row-action-cluster {
        background: var(--surface-soft);
      }
      .inbox-page .import-row:has(.import-table-select-cell input:checked) .row-action-cluster {
        background: var(--primary-soft);
      }
      .inbox-page .import-table-observations .candidate-card {
        gap: 2px;
        padding-block: 0;
      }
      .inbox-page .import-table-observations .candidate-card p {
        line-height: 1.15;
      }
      .inbox-page .import-table-observations .candidate-card .inline-actions {
        display: grid !important;
        gap: 3px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        width: 100%;
      }
    }

    @media (max-width: 1023px) {
      .inbox-page .import-table-cell-date,
      .inbox-page .import-table-cell-date .row-summary-value-preview,
      .inbox-page .import-table-cell-amount,
      .inbox-page .import-table-cell-amount .row-summary-value-preview {
        overflow-wrap: anywhere;
        white-space: normal !important;
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
