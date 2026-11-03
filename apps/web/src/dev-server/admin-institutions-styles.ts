import { sharedDialogStyles, sharedShellStyles } from "./shared-styles.js";

export function adminPageStyles(): string {
  return `
    ${sharedShellStyles()}
    ${sharedDialogStyles()}
    main { display: grid; gap: 14px; margin: 0 auto; max-width: 1440px; padding: 18px 20px; width: 100%; }
    .admin-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; }
    .admin-heading > div { display: grid; gap: 4px; max-width: 760px; }
    .filters-panel { padding: 12px 16px; }
    .filters-panel h2 { font-size: 0.87rem; margin: 0 0 10px; }
    .admin-filter-form { display: grid; gap: 10px; }
    .filters-grid { align-items: end; display: grid; gap: 10px; grid-template-columns: minmax(220px, 2.2fr) repeat(2, minmax(140px, 1fr)); }
    .filters-grid label, .advanced-filters-grid label { display: grid; gap: 5px; min-width: 0; }
    .filters-grid input, .filters-grid select, .advanced-filters-grid input, .advanced-filters-grid select { min-width: 0; width: 100%; }
    .admin-advanced-filters { border-top: 1px solid var(--line); padding-top: 2px; }
    .admin-advanced-filters > summary { color: var(--primary); cursor: pointer; font-size: 0.83rem; font-weight: 700; min-height: 36px; padding: 7px 0; }
    .admin-advanced-filters > summary:focus-visible, .active-filter-chip:focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; }
    .advanced-count { background: var(--primary-soft); border-radius: 999px; color: var(--primary); display: inline-block; font-size: 0.72rem; margin-left: 8px; padding: 2px 8px; }
    .advanced-filters-grid { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); padding: 10px 0 2px; }
    .active-filter-list { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; }
    .active-filter-caption { color: var(--muted); font-size: 0.75rem; font-weight: 700; }
    .active-filter-chip { background: var(--primary-soft); border: 1px solid var(--line); border-radius: 999px; color: var(--primary); display: inline-flex; font-size: 0.75rem; gap: 6px; min-height: 32px; padding: 6px 10px; text-decoration: none; }
    .active-filter-chip:hover { border-color: var(--cyan); }
    .filter-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 10px; min-width: 0; }
    .filter-actions button, .filter-actions .button-link { min-height: 40px; min-width: 140px; }
    .catalog-summary { align-items: center; color: var(--muted); display: flex; flex-wrap: wrap; font-size: 0.78rem; gap: 6px 16px; }
    .admin-summary-item { white-space: nowrap; }
    .admin-summary-item strong { color: var(--text); font-weight: 700; margin-right: 4px; }
    .catalog-refresh-meta { align-items: baseline; display: flex; flex-wrap: wrap; font-size: 0.75rem; gap: 4px 14px; }
    .admin-refresh-actions { display: grid; gap: 4px; }
    .admin-refresh-actions [data-admin-refresh-status]:empty { display: none; }

    .list-panel { gap: 12px; }
    .section-heading { align-items: center; display: flex; gap: 10px; justify-content: space-between; }
    .section-heading > div { display: grid; gap: 3px; }
    .section-heading > span { color: var(--muted); font-size: 0.75rem; font-weight: 700; white-space: nowrap; }
    .admin-institution-list { display: grid; gap: 6px; }
    .admin-institution-row { align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); display: grid; gap: 10px; grid-template-columns: 52px minmax(200px, .85fr) minmax(420px, 1.25fr) minmax(80px, auto); min-height: 58px; padding: 6px 10px; }
    .institution-logo-trigger { align-items: center; align-self: stretch; background: var(--primary-soft); border: 1px solid #d4e6ec; border-radius: 8px; color: var(--primary); display: flex; font-weight: 900; justify-content: center; min-height: 52px; overflow: hidden; padding: 0; position: relative; width: 52px; }
    .institution-logo-trigger:hover, .institution-logo-trigger:focus-visible { border-color: var(--cyan); box-shadow: 0 0 0 3px rgba(34,211,238,.18); }
    .institution-logo-trigger img { height: 40px; max-width: 40px; object-fit: contain; }
    .logo-upload-hint { align-items: center; background: rgba(15,61,76,.86); bottom: 0; color: white; display: flex; font-size: 0.58rem; font-weight: 800; height: 16px; justify-content: center; left: 0; opacity: 0; position: absolute; right: 0; transition: opacity .16s ease; }
    .institution-logo-trigger:hover .logo-upload-hint, .institution-logo-trigger:focus-visible .logo-upload-hint { opacity: 1; }
    .institution-main { display: grid; gap: 3px; min-width: 0; }
    .institution-title-line { align-items: center; display: flex; flex-wrap: wrap; gap: 5px 7px; min-width: 0; }
    .institution-title-line strong { font-size: 0.92rem; overflow-wrap: anywhere; }
    .institution-main span:not(.status-pill) { color: var(--muted); font-size: 0.82rem; line-height: 1.3; overflow-wrap: anywhere; }
    .institution-main code { background: var(--bg); border-radius: 999px; color: var(--muted); font-size: 0.7rem; justify-self: start; max-width: 100%; overflow-wrap: anywhere; padding: 2px 7px; }
    .status-pill { background: var(--warning-bg); border: 1px solid #fde68a; border-radius: 999px; color: var(--warning); flex: 0 0 auto; font-size: 0.68rem; font-weight: 800; padding: 2px 7px; }
    .status-pill-active { background: var(--success-bg); border-color: #bbf7d0; color: var(--success); }
    .institution-meta { align-items: start; display: grid; gap: 8px; grid-template-columns: .55fr .8fr .7fr .85fr 1fr; margin: 0; min-width: 0; }
    .institution-meta div { display: grid; gap: 1px; min-width: 0; }
    .institution-meta dt { color: var(--muted); font-size: 0.6rem; font-weight: 800; text-transform: uppercase; }
    .institution-meta dd { font-size: 0.76rem; line-height: 1.24; margin: 0; min-width: 0; overflow-wrap: anywhere; }
    .institution-actions { display: flex; justify-content: flex-end; }
    .status-form { display: flex; justify-content: flex-start; }
    .status-form button { font-size: 0.8125rem; min-height: 44px; min-width: 72px; padding: 0 10px; }
    .logo-upload-dialog { max-width: 560px; }
    .logo-dialog-layout { align-items: center; display: grid; gap: 16px; grid-template-columns: 84px 1fr; margin-bottom: 16px; }
    .logo-dialog-preview { align-items: center; background: var(--primary-soft); border: 1px solid #d4e6ec; border-radius: 8px; color: var(--primary); display: flex; font-size: 1.1rem; font-weight: 900; height: 84px; justify-content: center; overflow: hidden; width: 84px; }
    .logo-dialog-preview img { height: 68px; max-width: 68px; object-fit: contain; }
    .logo-upload-form { display: grid; gap: 12px; }
    .logo-upload-control { color: var(--text); display: grid; font-size: 0.9rem; gap: 6px; }
    .admin-denied { max-width: 760px; }
    .form-status { margin: 0; }
    @media (max-width: 1240px) { .admin-institution-row { grid-template-columns: 56px minmax(0, 1fr); } .institution-meta, .institution-actions { grid-column: 2 / -1; } .institution-actions { justify-content: flex-start; } }
    @media (max-width: 980px) { .filters-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .filters-grid .wide { grid-column: 1 / -1; } .advanced-filters-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .institution-meta { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 640px) { .filters-panel { padding: 10px 12px; } .filters-panel h2 { margin-bottom: 6px; } .admin-filter-form, .filters-grid { gap: 7px; } main { padding: 14px 14px 24px; } .admin-heading, .section-heading, .advanced-filters-grid { align-items: stretch; display: grid; grid-template-columns: 1fr; } .filters-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .filters-grid .wide { grid-column: 1 / -1; } .filter-actions { gap: 6px; } .filter-actions button, .filter-actions .button-link { flex: 1 1 0; min-width: 0; } .admin-institution-row { align-items: start; grid-template-columns: 52px minmax(0, 1fr); } .institution-meta, .institution-actions { grid-column: 1 / -1; } .institution-meta { grid-template-columns: repeat(2, minmax(0, 1fr)); } .logo-dialog-layout { grid-template-columns: 1fr; } }
  `;
}
