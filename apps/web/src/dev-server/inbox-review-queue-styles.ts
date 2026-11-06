/** Local review-queue presentation rules; tokens stay owned by the shared design system. */
export function inboxReviewQueueStyles(): string {
  return `
      .review-filter-bar { align-items: end; display: grid; gap: var(--sf-space-2); grid-template-columns: repeat(2, minmax(0, 1fr)); margin: var(--sf-space-2) 0 var(--sf-space-3); }
      .review-filter-bar label { display: grid; font-size: var(--sf-font-size-xs); gap: var(--sf-space-1); min-width: 0; }
      .review-filter-bar select, .review-filter-bar button { min-height: var(--sf-density-interactive-target-min); min-width: 0; width: 100%; }
      .review-queue-status { align-items: center; display: flex; flex-wrap: wrap; font-size: 0.8125rem; gap: 8px; margin: 0 0 10px; }
      .review-queue-status.error { color: var(--sf-color-danger); }
      .review-queue-status.unavailable { background: var(--sf-color-warning-surface); border: 1px solid var(--sf-color-warning-border); border-radius: var(--sf-radius-md); color: var(--sf-color-warning-text); padding: var(--sf-space-2) var(--sf-space-3); }
      .review-queue-status.success { color: var(--sf-color-success); }
      .form-status.unavailable, .review-unavailable { color: var(--sf-color-warning-text); }
      .review-risk { background: var(--sf-color-warning-surface); border: 1px solid var(--sf-color-warning-border); border-radius: var(--sf-radius-full); color: var(--sf-color-warning-text); font-size: var(--sf-font-size-xs); font-weight: var(--sf-font-weight-bold); padding: var(--sf-space-1) var(--sf-space-2); }
      .ai-review-dialog { width: min(720px, calc(100vw - 24px)); }
      .ai-review-dialog #ai-review-dialog-body { display: grid; gap: 12px; max-height: min(70vh, 680px); overflow: auto; }
      .review-detail-grid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); margin: 0; }
      .review-detail-grid div { background: var(--surface-soft); border-radius: var(--radius); padding: 8px; }
      .review-detail-grid dt { color: var(--muted); font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; }
      .review-detail-grid dd { margin: 3px 0 0; overflow-wrap: anywhere; }
      .review-money-value { font-variant-numeric: tabular-nums; text-align: right; }
      .review-warning { background: var(--sf-color-warning-surface); border: 1px solid var(--sf-color-warning-border); border-radius: var(--sf-radius-md); padding: var(--sf-space-2) var(--sf-space-3); }
      @media (max-width: 640px) {
        .review-filter-bar { grid-template-columns: 1fr; }
        .review-filter-bar > * { min-width: 0; width: 100%; }
        .review-card .maintenance-summary { align-items: flex-start; flex-direction: column; }
        .ai-review-dialog { margin: 12px auto; max-height: calc(100vh - 24px); }
      }
      @media (min-resolution: 1.5dppx) {
        .review-card, .review-filter-bar { min-width: 0; }
      }
    `;
}
