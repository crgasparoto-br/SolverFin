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
    .instrument-pill { background: var(--sf-color-information-surface); border-radius: var(--sf-radius-full); color: var(--sf-color-information); font-size: .68rem; font-weight: 700; padding: 2px 7px; }
    .instrument-pill.is-archived { background: var(--sf-color-surface-soft); color: var(--sf-color-muted-text); }
    .instrument-warning { background: var(--warning-bg); border: 1px solid var(--sf-color-warning-border); border-radius: var(--radius); color: var(--warning); font-size: .8rem; font-weight: 650; padding: 8px 10px; }
    .resource-detail-actions { align-items: center; border-top: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 8px; padding-top: 14px; }
    .resource-detail-actions form { display: inline-flex; margin: 0; }
    .resource-primary-action { align-items: center; border-radius: var(--sf-radius-md); display: inline-flex; gap: var(--sf-space-2); }
    .secondary-button, .danger-button { align-items: center; border-radius: var(--sf-radius-md); display: inline-flex; font: inherit; font-weight: 650; gap: var(--sf-space-2); min-height: var(--sf-density-interactive-target-min); padding: 0 var(--sf-space-3); }
    .secondary-button { background: var(--sf-color-surface); border: 1px solid var(--sf-color-border); color: var(--sf-color-primary); }
    .danger-button { background: var(--sf-color-surface); border: 1px solid var(--sf-color-danger-border); color: var(--sf-color-danger); }
    .danger-button:hover:not(:disabled), .danger-button:focus-visible { background: var(--danger-bg); border-color: var(--sf-color-danger-border); color: var(--danger); }
    .icon-button { align-items: center; border: 1px solid var(--sf-color-border); border-radius: var(--sf-radius-md); display: inline-flex; height: var(--sf-density-interactive-target-min); justify-content: center; min-width: var(--sf-density-interactive-target-min); padding: 0; }
    .danger-icon-button { color: var(--sf-color-danger); }
    /* The shared shell has a generic button:hover. Keep destructive actions on the
       canonical danger palette instead of accidentally turning them primary. */
    .instrument-actions .danger-icon-button:hover:not(:disabled),
    .instrument-actions .danger-icon-button:focus-visible {
      background: var(--sf-color-danger-surface);
      border-color: var(--sf-color-danger-border);
      color: var(--sf-color-danger);
    }
    #accounts-cards-confirm-dialog [data-confirm-accept]:hover:not(:disabled),
    #accounts-cards-confirm-dialog [data-confirm-accept]:focus-visible {
      background: var(--sf-color-danger);
      border-color: var(--sf-color-danger-border);
      color: var(--sf-color-on-danger);
    }
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


    /* #716: one Golden Screen action language for account and card detail/subdialogs. */
    .resource-detail-actions {
      align-items: stretch;
      flex-direction: column;
      gap: var(--sf-space-3);
    }
    .resource-account-cdi-row {
      align-items: center;
      display: flex;
      gap: var(--sf-space-2);
      justify-content: space-between;
      min-width: 0;
      width: 100%;
    }
    .resource-action-toolbar {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: var(--sf-space-2);
      min-width: 0;
    }
    .resource-action-toolbar-separator {
      background: var(--sf-color-border);
      flex: 0 0 1px;
      height: 24px;
      margin-inline: var(--sf-space-1);
    }
    .resource-detail-actions form {
      align-items: center;
      flex: 0 0 auto;
      margin: 0;
    }
    .resource-detail-panel button.resource-action-button {
      align-items: center;
      background: var(--sf-color-surface);
      border: 1px solid var(--sf-color-border);
      border-radius: var(--sf-radius-md);
      box-shadow: none;
      color: var(--sf-color-primary);
      display: inline-flex;
      flex: 0 0 var(--sf-density-interactive-target-min);
      height: var(--sf-density-interactive-target-min);
      justify-content: center;
      min-height: var(--sf-density-interactive-target-min);
      min-width: var(--sf-density-interactive-target-min);
      padding: 0;
      width: var(--sf-density-interactive-target-min);
    }
    .resource-detail-panel button.resource-action-button svg {
      display: block;
      height: 18px;
      width: 18px;
    }
    .resource-detail-panel button.resource-action-button:hover:not(:disabled),
    .resource-detail-panel button.resource-action-button:focus-visible {
      background: var(--sf-color-neutral-control-hover);
      border-color: var(--sf-color-neutral-control-border-hover);
      color: var(--sf-color-neutral-control-text-hover);
    }
    .resource-detail-panel button.resource-action-button:focus-visible,
    .resource-detail-actions button.resource-cdi-switch:focus-visible {
      box-shadow: var(--sf-shadow-focus);
      outline: 2px solid var(--sf-color-primary);
      outline-offset: 2px;
    }
    .resource-detail-panel button.danger-icon-button {
      border-color: var(--sf-color-danger-border);
      color: var(--sf-color-danger);
    }
    .resource-detail-panel button.danger-icon-button:hover:not(:disabled),
    .resource-detail-panel button.danger-icon-button:focus-visible {
      background: var(--sf-color-danger-surface);
      border-color: var(--sf-color-danger-border);
      color: var(--sf-color-danger);
    }
    .resource-cdi-control {
      align-items: center;
      display: flex;
      flex: 1 1 auto;
      flex-wrap: wrap;
      gap: var(--sf-space-2);
      min-height: var(--sf-density-interactive-target-min);
      min-width: 0;
    }
    .resource-cdi-title {
      color: var(--sf-color-text);
      font-size: var(--sf-font-size-sm);
      font-weight: var(--sf-font-weight-bold);
    }
    .resource-cdi-state {
      color: var(--sf-color-muted-text);
      font-size: var(--sf-font-size-sm);
      font-weight: var(--sf-font-weight-bold);
      white-space: nowrap;
    }
    .resource-detail-actions button.resource-cdi-switch {
      align-items: center;
      background: var(--sf-color-border);
      border: 1px solid var(--sf-color-border);
      border-radius: var(--sf-radius-full);
      cursor: pointer;
      display: inline-flex;
      flex: 0 0 44px;
      height: 26px;
      justify-content: flex-start;
      min-height: 26px;
      padding: 2px;
      transition: background var(--sf-motion-fast), border-color var(--sf-motion-fast);
      width: 44px;
    }
    .resource-cdi-switch-thumb {
      background: var(--sf-color-surface);
      border-radius: var(--sf-radius-full);
      display: block;
      height: 20px;
      transition: transform var(--sf-motion-fast);
      width: 20px;
    }
    .resource-detail-actions button.resource-cdi-switch[aria-checked="true"] {
      background: var(--sf-color-success);
      border-color: var(--sf-color-success);
    }
    .resource-detail-actions button.resource-cdi-switch[aria-checked="true"] .resource-cdi-switch-thumb {
      transform: translateX(18px);
    }
    .resource-detail-actions button.resource-cdi-switch:hover:not(:disabled) {
      border-color: var(--sf-color-primary);
    }
    .resource-detail-actions button.resource-cdi-switch:disabled {
      cursor: not-allowed;
      opacity: .55;
    }
    .resource-cdi-feedback {
      flex-basis: 100%;
      font-size: var(--sf-font-size-xs);
    }
    .resource-cdi-feedback:empty { display: none; }
    .resource-cdi-feedback.error { color: var(--sf-color-danger); }
    .resource-cdi-feedback.success { color: var(--sf-color-success); }
    /* #716: lista mestre dominante; detalhe e manutencao em segundo plano. */
    .accounts-cards-a3-page .sf-detail-layout { gap: 16px; grid-template-columns: minmax(0, 2.55fr) minmax(288px, 1fr); }
    .resource-master-panel, .resource-detail-panel { box-shadow: none; }
    .resource-master-panel { gap: 14px; padding: 16px; position: static; }
    .resource-master-summary { padding-bottom: 2px; }
    .resource-master-summary > div { align-items: baseline; }
    .resource-master-summary h2 { font-size: 1.05rem; line-height: 1.35; margin: 0; }
    .resource-master-summary span { color: var(--muted); font-size: .78rem; white-space: nowrap; }
    .resource-master-filters { gap: 8px; grid-template-columns: minmax(180px, 2fr) repeat(3, minmax(96px, 1fr)); }
    .resource-master-filters > label:first-child, .resource-master-filters > label:last-child { grid-column: auto; }
    .resource-master-filters > label { font-size: .76rem; min-width: 0; }
    /* The Golden Screen filter bar is neutral; the master panel already owns the surface. */
    .resource-master-filters.sf-filter-bar { background: transparent; border: 0; border-radius: 0; padding: 0; }
    .resource-master-filters :is(input, select) { background: var(--sf-color-surface); border: 1px solid var(--sf-color-border); color: var(--sf-color-text); min-height: var(--sf-density-interactive-target-min); }
    .resource-master-filters :is(input, select):hover:not(:disabled) { border-color: var(--sf-color-neutral-control-border-hover); }
    .resource-master-filters :is(input, select):focus-visible { border-color: var(--sf-color-primary); box-shadow: var(--sf-shadow-focus); outline: none; }
    .resource-master-columns, .resource-master-link {
      align-items: center;
      column-gap: 12px;
      display: grid;
      grid-template-columns: minmax(0, 1.7fr) minmax(58px, .4fr) minmax(140px, .9fr) minmax(78px, .6fr) minmax(74px, .5fr);
    }
    .resource-master-columns { border-bottom: 1px solid var(--line); color: var(--muted); font-size: .71rem; font-weight: 750; padding: 11px 10px; }
    .resource-master-columns > span:nth-child(3), .resource-master-columns > span:nth-child(5) { text-align: right; }
    .resource-master-columns > span:nth-child(4) { text-align: center; }
    .resource-master-list { gap: 0; max-height: none; overflow: visible; padding: 0; }
    .resource-master-item { border: 0; border-bottom: 1px solid var(--line); border-radius: 0; }
    .resource-master-item:last-child { border-bottom: 0; }
    .resource-master-item.is-selected { background: var(--primary-soft); border: 0; border-bottom: 1px solid var(--line); box-shadow: inset 3px 0 var(--primary); }
    .resource-master-link { color: inherit; min-height: 72px; padding: 9px 10px; text-decoration: none; }
    .resource-master-link:hover { background: var(--surface-soft); border-radius: 0; }
    .resource-master-item.is-selected .resource-master-link:hover { background: transparent; }
    .resource-master-link:focus-visible { border-radius: 0; outline: 2px solid var(--primary); outline-offset: -2px; }
    .resource-master-identity { align-items: center; display: grid; gap: 10px; grid-template-columns: 42px minmax(0, 1fr); min-width: 0; }
    .resource-master-icon { background: var(--surface-soft); border-radius: 8px; height: 42px; width: 42px; }
    .resource-master-icon .brand-icon { height: 42px; width: 42px; }
    .resource-master-copy { display: grid; gap: 2px; min-width: 0; overflow-wrap: anywhere; }
    .resource-master-title strong { color: var(--text); font-size: .93rem; line-height: 1.3; overflow-wrap: anywhere; }
    .resource-master-institution, .resource-master-context { color: var(--muted); font-size: .75rem; line-height: 1.3; }
    .resource-master-cdi-column { display: flex; justify-content: center; white-space: nowrap; }
    .resource-master-cdi-column .sf-badge { font-size: .69rem; }
    .resource-master-cdi-compact { color: var(--sf-color-muted-text); display: none; font-weight: 650; white-space: normal; }
    .resource-master-cdi-compact.is-active { color: var(--sf-color-success); }
    .resource-master-currency { background: transparent; border: 0; color: var(--text) !important; font-size: .8rem; font-weight: 700; overflow-wrap: anywhere; }
    .resource-master-amount { display: grid; gap: 3px; justify-items: end; min-width: 0; text-align: right; }
    .resource-master-amount strong { color: var(--text); font-size: .96rem; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    .resource-master-amount small { color: var(--muted); font-size: .71rem; }
    .resource-master-state { justify-self: end; }
    .resource-detail-panel { gap: 14px; padding: 17px; }
    .resource-detail-heading { align-items: start; gap: 9px; grid-template-columns: 40px minmax(0, 1fr); }
    .resource-detail-heading > div:nth-child(2) { gap: 2px; }
    .resource-detail-heading h2 { font-size: 1.06rem; line-height: 1.35; }
    .resource-detail-heading p { font-size: .76rem; margin: 0; }
    .resource-detail-heading .sf-badge { grid-column: 2; justify-self: start; }
    .resource-detail-identity { height: 40px; width: 40px; }
    .resource-detail-identity .brand-icon { height: 40px; width: 40px; }
    .resource-detail-grid { gap: 6px 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .resource-detail-field { background: transparent; border: 0; border-top: 1px solid var(--line); border-radius: 0; min-height: 52px; padding: 9px 0 3px; }
    .resource-detail-field.is-unavailable { background: transparent; }
    .resource-detail-field > span { color: var(--muted); font-size: .69rem; letter-spacing: .02em; }
    .resource-detail-field > strong { font-size: .83rem; font-weight: 650; overflow-wrap: anywhere; }
    .resource-detail-actions { border-top: 1px solid var(--line); gap: 7px; padding-top: 12px; }
    .resource-detail-actions :is(button, a) { font-size: .79rem; }
    .resource-detail-actions .secondary-button { background: var(--sf-color-surface); border: 1px solid var(--sf-color-border); color: var(--sf-color-primary); }
    .resource-detail-actions .secondary-button:hover:not(:disabled), .resource-detail-actions .secondary-button:focus-visible { background: var(--sf-color-neutral-control-hover); border-color: var(--sf-color-neutral-control-border-hover); color: var(--sf-color-neutral-control-text-hover); }
    .resource-detail-actions :is(button, a):focus-visible, .resource-form-actions button:focus-visible, .instrument-actions button:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .resource-primary-action:hover:not(:disabled), .resource-primary-action:focus-visible { background: var(--sf-color-primary-hover); color: var(--sf-color-on-primary); }
    .resource-instruments { gap: 10px; }
    .instrument-list { border: 0; border-radius: 0; }
    .instrument-item { background: transparent; border-color: var(--line); padding: 10px 0; }
    .instrument-item:first-child { border-top: 1px solid var(--line); }
    .instrument-side { justify-items: start; }
    .instrument-tags, .instrument-actions { justify-content: flex-start; }
    .edit-grid > label { min-width: 0; }
    .edit-grid input, .edit-grid select { min-width: 0; width: 100%; }
    .resource-form-actions { align-items: center; background: var(--surface); border-top: 1px solid var(--line); bottom: 0; display: flex; flex-wrap: wrap; gap: 8px; grid-column: 1 / -1; justify-content: flex-end; padding: 12px 0 2px; position: sticky; z-index: 1; }
    .resource-form-actions button { align-items: center; border-radius: var(--radius); display: inline-flex; justify-content: center; min-height: 44px; padding: 0 16px; width: auto; }
    .resource-form-actions .sf-button-primary { background: var(--sf-color-primary); border-color: var(--sf-color-primary); color: var(--sf-color-on-primary); }
    .resource-form-actions .sf-button-primary:hover:not(:disabled), .resource-form-actions .sf-button-primary:focus-visible { background: var(--sf-color-primary-hover); border-color: var(--sf-color-primary-hover); color: var(--sf-color-on-primary); }
    .resource-form-actions .sf-button-secondary { background: var(--sf-color-surface); border: 1px solid var(--sf-color-border); color: var(--sf-color-primary); }
    .resource-form-actions .sf-button-secondary:hover:not(:disabled), .resource-form-actions .sf-button-secondary:focus-visible { background: var(--sf-color-neutral-control-hover); border-color: var(--sf-color-neutral-control-border-hover); color: var(--sf-color-neutral-control-text-hover); }
    @media (max-width: 1099px) {
      .accounts-cards-a3-page .sf-detail-layout { grid-template-columns: minmax(0, 1fr); }
      .resource-detail-panel { max-width: none; }
      .resource-master-filters { grid-template-columns: minmax(0, 2fr) repeat(3, minmax(96px, 1fr)); }
    }
    @media (max-width: 760px) {
      .accounts-cards-a3-page .sf-detail-layout { grid-template-columns: minmax(0, 1fr); gap: 12px; }
      .resource-master-panel, .resource-detail-panel { padding: 14px; }
      .resource-master-summary > div { align-items: start; flex-wrap: wrap; }
      .resource-master-filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .resource-master-filters > label:first-child, .resource-master-filters > label:last-child { grid-column: 1 / -1; }
      .resource-master-columns { display: none; }
      .resource-master-link { column-gap: 10px; grid-template-columns: minmax(0, 1fr) minmax(96px, auto); min-height: 76px; row-gap: 6px; }
      .resource-master-identity { grid-column: 1; grid-row: 1; }
      .resource-master-amount { grid-column: 2; grid-row: 1; }
      .resource-master-currency { grid-column: 1; grid-row: 2; margin-left: 52px; }
      .resource-master-state { grid-column: 2; grid-row: 2; }
      .resource-master-cdi-column { display: none; }
      .resource-master-cdi-compact { display: inline; }
      .resource-detail-heading { grid-template-columns: 40px minmax(0, 1fr); }
      .resource-detail-identity { display: flex; }
      .resource-detail-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .resource-detail-actions { align-items: center; display: flex; }
      .resource-detail-actions > *, .resource-detail-actions form > button { width: auto; }
      .resource-form-actions { padding-top: 10px; }
    }
    @media (max-width: 360px) {
      .resource-master-filters, .resource-detail-grid, .edit-grid { grid-template-columns: minmax(0, 1fr); }
      .resource-master-filters > label { grid-column: 1 / -1; }
      .resource-master-link { grid-template-columns: minmax(0, 1fr) minmax(88px, auto); }
      .resource-master-amount strong { font-size: .84rem; }
      .resource-form-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .resource-form-actions button { padding-inline: 6px; width: 100%; }
    }

    @media (max-width: 760px) {
      .resource-detail-actions { align-items: stretch; display: flex; flex-direction: column; }
      .resource-account-cdi-row { flex-wrap: wrap; }
      .resource-action-toolbar { flex-wrap: wrap; }
      .resource-detail-actions .resource-action-toolbar button.resource-action-button,
      .resource-detail-actions .resource-account-cdi-row button.resource-action-button {
        width: var(--sf-density-interactive-target-min);
      }
    }
  `;
}
