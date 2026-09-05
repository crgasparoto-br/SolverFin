import { sharedShellStyles } from "../shared-styles.js";

export function accountsCardsPageStyles(): string {
  return `
    ${sharedShellStyles()}
    main { margin: 0 auto; max-width: 1440px; padding: 18px 20px; width: 100%; }
    [hidden] { display: none !important; }
    .accounts-cards-a3-page { display: grid; gap: 16px; min-width: 0; }
    .accounts-cards-a3-page .sf-page-header { align-items: center; }
    .accounts-cards-a3-page .sf-page-header-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .accounts-cards-a3-page .sf-detail-layout { align-items: start; display: grid; gap: 16px; grid-template-columns: minmax(260px, 340px) minmax(0, 1fr); }
    .accounts-cards-a3-page .sf-detail-layout-master, .accounts-cards-a3-page .sf-detail-layout-detail { min-width: 0; }
    .resource-master-panel, .resource-detail-panel { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); min-width: 0; }
    .resource-master-panel { display: grid; gap: 12px; padding: 14px; position: sticky; top: 14px; }
    .resource-master-summary > div { align-items: baseline; display: flex; gap: 8px; justify-content: space-between; }
    .resource-master-summary span, .resource-master-copy > span:not(.resource-master-title) { color: var(--muted); font-size: .78rem; }
    .resource-master-filters { display: grid; gap: 8px; grid-template-columns: minmax(0,1fr) 7.5rem; }
    .resource-master-list { display: grid; gap: 6px; max-height: calc(100vh - 260px); overflow: auto; overscroll-behavior: contain; padding-right: 2px; }
    .resource-master-item { border: 1px solid transparent; border-radius: var(--radius); min-width: 0; }
    .resource-master-item.is-selected { background: var(--primary-soft); border-color: #c8dde5; }
    .resource-master-link { align-items: start; color: inherit; display: grid; gap: 10px; grid-template-columns: 40px minmax(0,1fr); min-height: 64px; padding: 10px; text-decoration: none; }
    .resource-master-link:hover, .resource-master-link:focus-visible { background: var(--surface-soft); border-radius: inherit; outline: 2px solid transparent; }
    .resource-master-icon { align-items: center; background: var(--surface-soft); border-radius: 8px; display: flex; height: 40px; justify-content: center; overflow: hidden; width: 40px; }
    .resource-master-icon .brand-icon { height: 40px; width: 40px; }
    .resource-master-copy { display: grid; gap: 2px; min-width: 0; overflow-wrap: anywhere; }
    .resource-master-title { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; }
    .resource-master-currency { color: var(--text) !important; font-weight: 700; }
    .resource-detail-panel { display: grid; gap: 16px; padding: 18px; }
    .resource-detail-heading { align-items: center; display: grid; gap: 12px; grid-template-columns: 48px minmax(0,1fr) auto; }
    .resource-detail-heading > div:nth-child(2) { display: grid; gap: 3px; min-width: 0; }
    .resource-detail-heading h2, .resource-subheading h3 { margin: 0; overflow-wrap: anywhere; }
    .resource-detail-heading p { color: var(--muted); font-size: .86rem; overflow-wrap: anywhere; }
    .resource-detail-identity { align-items: center; background: var(--surface-soft); border: 1px solid var(--line); border-radius: 10px; display: flex; height: 48px; justify-content: center; overflow: hidden; width: 48px; }
    .resource-detail-identity .brand-icon { height: 48px; width: 48px; }
    .resource-kicker { color: var(--primary); font-size: .7rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
    .resource-detail-grid { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0,1fr)); }
    .resource-detail-field { background: var(--surface-soft); border: 1px solid var(--line); border-radius: var(--radius); display: grid; gap: 4px; min-height: 72px; padding: 10px; }
    .resource-detail-field > span { color: var(--muted); font-size: .72rem; font-weight: 700; text-transform: uppercase; }
    .resource-detail-field > strong { overflow-wrap: anywhere; }
    .resource-detail-field.is-unavailable { background: var(--warning-bg); }
    .resource-detail-field .sf-state-panel { border: 0; padding: 0; }
    .resource-instruments { border-top: 1px solid var(--line); display: grid; gap: 10px; padding-top: 14px; }
    .resource-subheading { align-items: center; display: flex; gap: 10px; justify-content: space-between; }
    .resource-subheading > div { display: grid; gap: 3px; }
    .resource-subheading > span { color: var(--muted); font-size: .78rem; font-weight: 700; }
    .instrument-list { border: 1px solid var(--line); border-radius: var(--radius); display: grid; overflow: hidden; }
    .instrument-list.is-empty { padding: 10px; }
    .instrument-item { align-items: center; background: var(--surface-soft); border-top: 1px solid var(--line); display: grid; gap: 10px; grid-template-columns: minmax(0,1fr) auto; padding: 10px; }
    .instrument-item:first-child { border-top: 0; }
    .instrument-item > div:first-child { min-width: 0; overflow-wrap: anywhere; }
    .instrument-meta { color: var(--muted); font-size: .8rem; line-height: 1.45; margin-top: 3px; }
    .instrument-side { display: grid; gap: 6px; justify-items: end; }
    .instrument-tags, .instrument-actions { display: flex; flex-wrap: wrap; gap: 5px; justify-content: flex-end; }
    .instrument-pill { background: #e0f2fe; border-radius: 999px; color: #075985; font-size: .68rem; font-weight: 700; padding: 2px 7px; }
    .instrument-pill.is-archived { background: #f1f5f9; color: #475569; }
    .instrument-warning { background: var(--warning-bg); border: 1px solid #fde68a; border-radius: var(--radius); color: var(--warning); font-size: .8rem; font-weight: 650; padding: 8px 10px; }
    .resource-detail-actions { align-items: center; border-top: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 8px; padding-top: 14px; }
    .resource-detail-actions form { display: inline-flex; margin: 0; }
    .resource-primary-action { align-items: center; background: var(--primary); border: 1px solid var(--primary); border-radius: var(--radius); color: #fff; display: inline-flex; font: inherit; font-weight: 700; gap: 7px; min-height: 40px; padding: 0 14px; }
    .secondary-button, .danger-button { align-items: center; border-radius: var(--radius); display: inline-flex; font: inherit; font-weight: 650; gap: 7px; min-height: 40px; padding: 0 12px; }
    .secondary-button { background: var(--surface); border: 1px solid var(--line); color: var(--text); }
    .danger-button { background: var(--surface); border: 1px solid #fecaca; color: var(--danger); }
    .danger-button:hover:not(:disabled), .danger-button:focus-visible { background: var(--danger-bg); border-color: var(--sf-color-danger-border); color: var(--danger); }
    .icon-button { align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; color: var(--primary); display: inline-flex; height: 40px; justify-content: center; min-width: 40px; padding: 0; }
    .danger-icon-button { color: var(--danger); }
    .edit-grid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0,1fr)); margin-top: 10px; }
    .edit-grid button, .edit-grid .form-status, .edit-grid .legacy-account-identifier { grid-column: 1 / -1; }
    .master-dialog { border: 1px solid var(--line); border-radius: var(--radius-lg); box-shadow: 0 24px 80px rgba(15,23,42,.18); max-height: 90vh; max-width: 760px; overflow: auto; padding: 18px; width: calc(100% - 32px); }
    .master-dialog::backdrop { background: rgba(15,23,42,.42); }
    .dialog-close-form { display: flex; justify-content: flex-end; margin-bottom: 10px; }
    .dialog-heading { display: grid; gap: 5px; }
    .dialog-subsection { border-top: 1px solid var(--line); display: grid; gap: 10px; margin-top: 14px; padding-top: 14px; }
    .dialog-subsection-heading, .instrument-edit-heading { align-items: center; display: flex; gap: 8px; justify-content: space-between; }
    .dialog-instrument-forms { display: grid; gap: 10px; }
    .instrument-edit-form { background: var(--surface-soft); border: 1px solid var(--line); border-radius: var(--radius); margin-top: 0; padding: 10px; }
    .confirm-dialog { max-width: 520px; }
    .confirm-dialog-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
    [data-resource-loading] { position: sticky; top: 8px; z-index: 20; }
    .form-status { font-size: .8rem; }
    @media (max-width: 1050px) { .accounts-cards-a3-page .sf-detail-layout { grid-template-columns: 260px minmax(0,1fr); } .resource-detail-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
    @media (max-width: 760px) {
      main { padding: 12px; }
      .accounts-cards-a3-page .sf-page-header { align-items: stretch; display: grid; }
      .accounts-cards-a3-page .sf-page-header-actions { display: grid; }
      .accounts-cards-a3-page .sf-page-header-actions > * { width: 100%; }
      .accounts-cards-a3-page .sf-detail-layout { grid-template-columns: 1fr; }
      .resource-master-panel { position: static; }
      .resource-master-list { max-height: none; }
      .resource-master-filters, .resource-detail-grid, .edit-grid, .resource-detail-heading, .instrument-item { grid-template-columns: 1fr; }
      .resource-detail-heading .sf-badge { justify-self: start; }
      .resource-detail-identity { display: none; }
      .instrument-side { justify-items: start; }
      .instrument-tags, .instrument-actions { justify-content: flex-start; }
      .resource-detail-actions, .confirm-dialog-actions { align-items: stretch; display: grid; }
      .resource-detail-actions > *, .resource-detail-actions form > button, .confirm-dialog-actions > button { width: 100%; }
    }
  `;
}
