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
    .resource-master-filters { display: grid; gap: 8px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .resource-master-filters > label:first-child { grid-column: 1 / -1; }
    .resource-master-filters select, .resource-master-filters input { min-width: 0; width: 100%; }
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
    .dialog-subsection { border-top: 1px solid var(--line); display: grid; gap: 10px; margin-top: 14px; padding-top: 14px; }
    .dialog-subsection-heading, .instrument-edit-heading { align-items: center; display: flex; gap: 8px; justify-content: space-between; }
    .dialog-instrument-forms { display: grid; gap: 10px; }
    .instrument-edit-form { background: var(--surface-soft); border: 1px solid var(--line); border-radius: var(--radius); margin-top: 0; padding: 10px; }
    [data-resource-loading] { position: sticky; top: 8px; z-index: 20; }
    .form-status { font-size: .8rem; }
    @media (max-width: 1050px) {
      .accounts-cards-a3-page .sf-detail-layout { grid-template-columns: 260px minmax(0,1fr); }
      .resource-detail-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
      .resource-master-filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .resource-master-filters > label:first-child, .resource-master-filters > label:last-child { grid-column: 1 / -1; }
    }
    @media (max-width: 760px) {
      main { padding: 12px; }
      .accounts-cards-a3-page .sf-page-header { align-items: stretch; display: grid; }
      .accounts-cards-a3-page .sf-page-header-actions { display: grid; }
      .accounts-cards-a3-page .sf-page-header-actions > * { width: 100%; }
      .accounts-cards-a3-page .sf-detail-layout { grid-template-columns: 1fr; }
      .resource-master-panel { position: static; }
      .resource-master-list { max-height: none; }
      .resource-master-filters, .resource-detail-grid, .edit-grid, .resource-detail-heading, .instrument-item { grid-template-columns: 1fr; }
      .resource-master-filters > label { grid-column: 1 / -1; }
      .resource-detail-heading .sf-badge { justify-self: start; }
      .resource-detail-identity { display: none; }
      .instrument-side { justify-items: start; }
      .instrument-tags, .instrument-actions { justify-content: flex-start; }
      .resource-detail-actions { align-items: stretch; display: grid; }
      .resource-detail-actions > *, .resource-detail-actions form > button { width: 100%; }
    }

    /* #716: hierarquia editorial da Golden Screen, preservando o arquetipo A3. */
    .accounts-cards-a3-page .sf-detail-layout { gap: 20px; grid-template-columns: minmax(280px, 344px) minmax(0, 1fr); }
    .resource-master-panel, .resource-detail-panel { box-shadow: none; }
    .resource-master-panel { gap: 14px; }
    .resource-detail-panel { gap: 18px; padding: 24px; }
    .resource-master-summary { padding-bottom: 4px; }
    .resource-master-summary strong { font-size: .94rem; }
    .resource-master-list { gap: 2px; }
    .resource-master-item { border-bottom: 1px solid var(--line); border-radius: 0; }
    .resource-master-item:last-child { border-bottom-color: transparent; }
    .resource-master-item.is-selected { border: 1px solid var(--line); border-left: 3px solid var(--primary); border-radius: var(--radius); }
    .resource-master-item.is-selected .resource-master-link:hover { background: transparent; }
    .resource-master-link { gap: 12px; min-height: 72px; padding: 10px 8px; }
    .resource-master-link:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
    .resource-master-title strong { font-size: .93rem; line-height: 1.35; overflow-wrap: anywhere; }
    .resource-master-institution { color: var(--text) !important; font-weight: 600; }
    .resource-master-context { align-items: baseline; display: flex; flex-wrap: wrap; gap: 6px; }
    .resource-master-currency { border: 1px solid var(--line); border-radius: 4px; color: var(--text) !important; font-size: .7rem; font-weight: 750; padding: 1px 5px; }
    .resource-detail-heading { grid-template-columns: 48px minmax(0,1fr) auto; }
    .resource-detail-heading h2 { font-size: clamp(1.25rem, 2.2vw, 1.55rem); line-height: 1.2; }
    .resource-detail-heading p { margin: 0; }
    .resource-financial-summary { border-block: 1px solid var(--line); display: grid; gap: 3px; padding: 19px 0; }
    .resource-financial-summary > span { color: var(--muted); font-size: .81rem; font-weight: 650; }
    .resource-financial-summary > strong { color: var(--text); font-size: clamp(1.45rem, 2.8vw, 2rem); font-variant-numeric: tabular-nums; letter-spacing: -.025em; overflow-wrap: anywhere; }
    .resource-detail-grid { gap: 8px 24px; }
    .resource-detail-field { background: transparent; border: 0; border-top: 1px solid var(--line); border-radius: 0; min-height: 62px; padding: 10px 0 4px; }
    .resource-detail-field.is-unavailable { background: transparent; }
    .resource-detail-field > span { letter-spacing: .025em; }
    .resource-detail-field > strong { font-weight: 650; }
    .resource-instruments { gap: 12px; }
    .instrument-list { border: 0; border-radius: 0; }
    .instrument-item { background: transparent; border-color: var(--line); padding: 12px 0; }
    .instrument-item:first-child { border-top: 1px solid var(--line); }
    .instrument-item > div:first-child { min-width: 0; }
    .resource-detail-actions { border-top: 0; padding-top: 0; }
    .resource-detail-actions .secondary-button { background: var(--surface); border: 1px solid var(--line); }
    .resource-detail-actions .secondary-button:hover:not(:disabled), .resource-detail-actions .secondary-button:focus-visible { background: var(--surface-soft); color: var(--text); border-color: var(--primary); }
    .resource-detail-actions .danger-button:hover:not(:disabled), .resource-detail-actions .danger-button:focus-visible { background: var(--danger-bg); color: var(--danger); }
    .resource-primary-action:hover:not(:disabled), .resource-primary-action:focus-visible { background: var(--primary); color: #fff; filter: brightness(1.08); }
    .resource-detail-actions :is(button, a):focus-visible, .resource-form-actions button:focus-visible, .instrument-actions button:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .edit-grid > label { min-width: 0; }
    .edit-grid input, .edit-grid select { min-width: 0; width: 100%; }
    .resource-form-actions { align-items: center; background: var(--surface); border-top: 1px solid var(--line); bottom: 0; display: flex; flex-wrap: wrap; gap: 8px; grid-column: 1 / -1; justify-content: flex-end; padding: 12px 0 2px; position: sticky; z-index: 1; }
    .resource-form-actions button { align-items: center; border-radius: var(--radius); display: inline-flex; justify-content: center; min-height: 44px; padding: 0 16px; width: auto; }
    .resource-form-actions button[type="submit"] { background: var(--primary); border: 1px solid var(--primary); color: #fff; font-weight: 700; }
    .resource-form-actions button[type="submit"]:hover:not(:disabled), .resource-form-actions button[type="submit"]:focus-visible { background: var(--primary); color: #fff; filter: brightness(1.08); }
    .resource-form-actions .secondary-button:hover:not(:disabled), .resource-form-actions .secondary-button:focus-visible { background: var(--surface-soft); border-color: var(--primary); color: var(--text); }
    @media (max-width: 1050px) and (min-width: 761px) {
      .accounts-cards-a3-page .sf-detail-layout { grid-template-columns: minmax(245px, 30%) minmax(0,1fr); gap: 12px; }
      .resource-detail-panel { padding: 18px; }
    }
    @media (max-width: 760px) {
      .accounts-cards-a3-page .sf-detail-layout { grid-template-columns: minmax(0,1fr); gap: 12px; }
      .resource-detail-panel { padding: 16px; }
      .resource-detail-heading { grid-template-columns: 44px minmax(0,1fr); align-items: start; }
      .resource-detail-identity { display: flex; width: 44px; height: 44px; }
      .resource-detail-identity .brand-icon { width: 44px; height: 44px; }
      .resource-detail-heading .sf-badge { grid-column: 2; }
      .resource-detail-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
      .resource-master-filters { grid-template-columns: repeat(2,minmax(0,1fr)); }
      .resource-master-filters > label:first-child { grid-column: 1 / -1; }
      .resource-master-filters > label:last-child { grid-column: auto; }
      .resource-detail-actions { display: flex; }
      .resource-detail-actions > *, .resource-detail-actions form > button { width: auto; }
      .resource-form-actions { padding-top: 10px; }
    }
    @media (max-width: 360px) {
      .resource-master-filters, .resource-detail-grid, .edit-grid { grid-template-columns: minmax(0,1fr); }
      .resource-master-filters > label { grid-column: 1 / -1; }
      .resource-form-actions { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); }
      .resource-form-actions button { padding-inline: 6px; width: 100%; }
    }
  `;
}
