import { sharedDialogStyles, sharedShellStyles } from "./shared-styles.js";

export function baseCss(): string {
  return `
    ${sharedShellStyles()}
    ${sharedDialogStyles()}

    .settings-page { display: grid; gap: var(--sf-space-4); grid-template-columns: minmax(0, 1fr); min-width: 0; }
    .settings-section { display: grid; gap: var(--sf-space-4); grid-template-columns: minmax(0, 1fr); min-width: 0; }
    .settings-section-heading { align-items: start; display: flex; gap: var(--sf-space-5); justify-content: space-between; min-width: 0; }
    .settings-section-heading > div { display: grid; gap: var(--sf-space-1); max-width: 780px; min-width: 0; }
    .settings-section-heading .sf-button { flex: 0 0 auto; }
    .settings-section-heading p { overflow-wrap: anywhere; }
    .settings-collection-heading { align-items: center; border-bottom: 1px solid var(--line); display: flex; gap: var(--sf-space-3); justify-content: space-between; padding-bottom: var(--sf-space-2); }
    .settings-collection-heading h3 { font-size: var(--sf-font-size-md); }
    .settings-collection-heading span, .settings-priority-note, .rule-priority { color: var(--muted); font-size: var(--sf-font-size-sm); }
    .settings-priority-note { margin: 0; }
    .maintenance-rows { display: grid; grid-template-columns: minmax(0, 1fr); }
    .maintenance-item { border-bottom: 1px solid var(--line); display: grid; gap: var(--sf-space-3); grid-template-columns: minmax(0, 1fr); min-width: 0; padding: var(--sf-space-4) 0; }
    .maintenance-item:first-child { padding-top: var(--sf-space-2); }
    .profile-item.is-current-profile { background: var(--sf-color-primary-soft); border-radius: var(--radius); padding: var(--sf-space-3); }
    .maintenance-summary { display: flex; min-width: 0; }
    .profile-identity { display: grid; gap: var(--sf-space-1); min-width: 0; }
    .profile-identity > span, .profile-disabled-note { color: var(--muted); font-size: var(--sf-font-size-sm); }
    .item-title-line { align-items: center; display: flex; flex-wrap: wrap; gap: var(--sf-space-2); min-width: 0; }
    .item-title-line strong { min-width: 0; overflow-wrap: anywhere; }
    .status-badge { border-radius: var(--sf-radius-sm); display: inline-flex; font-size: var(--sf-font-size-xs); font-weight: var(--sf-font-weight-semibold); padding: 2px var(--sf-space-2); }
    .status-active { background: var(--sf-color-success-surface); color: var(--sf-color-success); }
    .status-archived { background: var(--sf-color-surface-soft); color: var(--sf-color-muted-text); }
    .status-in-use { background: var(--sf-color-primary); color: var(--sf-color-on-primary); }
    .status-neutral { background: var(--sf-color-warning-surface); color: var(--sf-color-warning-text); }
    .maintenance-actions { align-items: center; display: flex; flex-wrap: wrap; gap: var(--sf-space-3); justify-content: space-between; min-width: 0; }
    .settings-page .sf-tabs { min-width: 0; width: 100%; }
    .settings-page .icon-button { min-height: var(--sf-density-interactive-target-min); min-width: var(--sf-density-interactive-target-min); }
    .item-actions { align-items: center; display: flex; flex: 0 0 auto; gap: var(--sf-space-2); margin-left: auto; }
    .profile-links { align-items: center; display: flex; flex-wrap: wrap; gap: var(--sf-space-1); min-width: 0; }
    .profile-links .secondary-link { background: transparent; border-color: transparent; border-radius: var(--radius); font-size: var(--sf-font-size-sm); min-height: var(--sf-density-interactive-target-min); padding: 0 var(--sf-space-3); text-decoration: underline; text-underline-offset: 3px; }
    .profile-links .secondary-link:hover, .profile-links .secondary-link:focus-visible { background: var(--sf-color-neutral-control-hover); border-color: var(--sf-color-neutral-control-border-hover); }
    .rule-summary { align-items: baseline; display: flex; flex-wrap: wrap; gap: var(--sf-space-3); justify-content: space-between; min-width: 0; }
    .rule-detail-grid { display: grid; gap: var(--sf-space-6); grid-template-columns: repeat(2, minmax(0, 1fr)); min-width: 0; }
    .rule-detail { min-width: 0; }
    .rule-detail h3 { color: var(--muted); font-size: var(--sf-font-size-sm); margin-bottom: var(--sf-space-2); }
    .rule-detail ul { display: grid; gap: var(--sf-space-1); margin: 0; padding-left: var(--sf-space-5); }
    .rule-detail li, .rule-explanation, .profile-disabled-note { overflow-wrap: anywhere; }
    .rule-explanation { color: var(--muted); font-size: var(--sf-font-size-sm); margin: 0; }
    .rule-actions { justify-content: flex-end; }
    .settings-operation { align-items: center; border-top: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: var(--sf-space-4); justify-content: space-between; padding-top: var(--sf-space-5); }
    .settings-operation > div:first-child { display: grid; flex: 1 1 300px; gap: var(--sf-space-1); min-width: 0; }
    .settings-operation p { color: var(--muted); font-size: var(--sf-font-size-sm); overflow-wrap: anywhere; }
    .settings-operation-actions { flex: 0 0 auto; }
    .settings-operation > [data-form-status] { flex-basis: 100%; }
    .settings-page .master-dialog { max-height: calc(100dvh - 32px); overflow-y: auto; }
    .settings-page .master-dialog .edit-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .settings-page .master-dialog .edit-grid label { min-width: 0; }
    .settings-page .master-dialog .edit-grid :is(input,select) { width: 100%; }
    .settings-dialog-context { color: var(--muted); font-size: var(--sf-font-size-sm); margin-top: var(--sf-space-2); }
    .settings-dialog-actions { align-items: center; border-top: 1px solid var(--line); display: flex; gap: var(--sf-space-2); grid-column: 1 / -1; justify-content: flex-end; padding-top: var(--sf-space-3); }
    .settings-dialog-actions .sf-button { min-width: 124px; }
    .field-error { color: var(--danger); display: block; font-size: var(--sf-font-size-xs); margin-top: var(--sf-space-1); }
    .field-error[hidden] { display: none; }
    .field-warning { color: var(--sf-color-warning-text); display: block; font-size: var(--sf-font-size-xs); line-height: 1.4; margin-top: var(--sf-space-1); }
    .field-warning a { color: inherit; text-decoration: underline; }
    .load-error { background: var(--sf-color-danger-surface); border: 1px solid var(--sf-color-danger-border); border-radius: var(--radius); display: grid; gap: var(--sf-space-2); padding: var(--sf-space-3); }
    .load-error p { color: var(--danger); overflow-wrap: anywhere; }
    .load-error .button-link { justify-self: start; }
    .empty-state { justify-items: start; }
    .full-span { grid-column: 1 / -1; }
    .form-status { font-size: var(--sf-font-size-sm); overflow-wrap: anywhere; }
    .form-status.error { color: var(--sf-color-danger); }
    .form-status.success { color: var(--sf-color-success); }
    @media (max-width: 760px) {
      /* The shared mobile shell uses a 1fr track; constrain its implicit min-content width on this route. */
      .app-shell { grid-template-columns: minmax(0, 1fr); }
      .sidebar, .main-area, .topbar { max-width: 100%; min-width: 0; }
      .topbar > div { min-width: 0; overflow-wrap: anywhere; }
      .sidebar > nav { min-width: 0; }
      .settings-section-heading { display: grid; gap: var(--sf-space-3); grid-template-columns: minmax(0, 1fr); }
      .settings-section-heading .sf-button { justify-self: start; }
      .rule-detail-grid { gap: var(--sf-space-3); grid-template-columns: 1fr; }
      .settings-operation { align-items: stretch; display: grid; grid-template-columns: minmax(0, 1fr); }
      .settings-operation-actions { justify-self: start; }
    }
    @media (max-width: 430px) {
      .settings-section-heading .sf-button { width: 100%; }
      .settings-operation-actions, .settings-operation-actions .sf-button { width: 100%; }
      .settings-page .master-dialog .edit-grid { grid-template-columns: 1fr; }
      .settings-dialog-actions .sf-button { flex: 1 1 0; min-width: 0; }
      .item-actions { margin-left: 0; }
    }
  `;
}
