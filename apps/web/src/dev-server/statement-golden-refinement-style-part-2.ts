import { solverFinDesignTokens } from "../design-system/tokens.js";

export function statementGoldenRefinementStylesPart2(root: string, dialog: string): string {
  const { spacing, density, typography } = solverFinDesignTokens;
  return `    ${root} .summary-total[data-summary-total="income"]{background:#f0fdf4}
    ${root} .summary-total[data-summary-total="income"] .summary-total-icon{background:#dcfce7;color:#15803d}
    ${root} .summary-total[data-summary-total="expense"]{background:#fef2f2}
    ${root} .summary-total[data-summary-total="expense"] .summary-total-icon{background:#fee2e2;color:#b91c1c}
    ${root} .summary-total[data-summary-total="closing"]{background:#f8fafc}
    ${root} .summary-total[data-summary-total="closing"] .summary-total-icon{background:#e2e8f0;color:#334155}
    ${root} .statement-body .col-description>strong{font-weight:700;line-height:1.4}
    ${root} .statement-body .col-amount{font-variant-numeric:tabular-nums;font-weight:700;letter-spacing:-.015em}
    /* Reference glyph: a soft tile per movement, tinted by its own direction or category. */
    ${root} .statement-body .col-row-icon{align-items:center;background:#f1f5f9;border-radius:12px;color:#64748b;display:inline-flex;flex:0 0 auto;height:44px;justify-content:center;width:44px}
    ${root} .statement-body .col-row-icon svg{display:block;height:21px;width:21px}
    ${root} .statement-row[data-row-glyph="expense"] .col-row-icon{background:#fef2f2;color:#b91c1c}
    ${root} .statement-row[data-row-glyph="income"] .col-row-icon{background:#ecfdf5;color:#047857}
    ${root} .statement-row[data-row-glyph="incomeCategory"] .col-row-icon{background:#ecfdf5;color:#047857}
    ${root} .statement-row[data-row-glyph="transfer"] .col-row-icon{background:#eef2ff;color:#4338ca}
    ${root} .statement-row[data-row-glyph="food"] .col-row-icon{background:#fff7ed;color:#c2410c}
    ${root} .statement-row[data-row-glyph="health"] .col-row-icon{background:#fdf2f8;color:#be185d}
    ${root} .statement-row[data-row-glyph="transport"] .col-row-icon{background:#eff6ff;color:#1d4ed8}
    ${root} .statement-row[data-row-glyph="home"] .col-row-icon{background:#f5f3ff;color:#6d28d9}
    ${root} .statement-row[data-row-glyph="utility"] .col-row-icon{background:#fefce8;color:#a16207}
    ${root} .statement-row[data-row-glyph="education"] .col-row-icon{background:#ecfeff;color:#0e7490}
    ${root} .statement-row[data-row-glyph="leisure"] .col-row-icon{background:#f0fdfa;color:#0f766e}
    ${root} .statement-row[data-row-glyph="investment"] .col-row-icon{background:#f0fdf4;color:#15803d}
    ${root} .statement-row[data-row-glyph="tax"] .col-row-icon{background:#f8fafc;color:#475569}
    ${root} .statement-row[data-row-glyph="receipt"] .col-row-icon{background:#f8fafc;color:#475569}
    ${root} .statement-body .col-category{align-items:center;align-self:start;background:#f1f5f9;border-radius:999px;color:#475569;display:inline-flex;gap:5px;max-width:100%;padding:3px 9px;width:max-content}
    ${root} .statement-body .col-category:empty{display:none}
    ${root} .statement-body .col-category svg{display:block;flex:0 0 auto}
    ${root} .statement-body .col-category-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    /* The chip wears the tint of its own category, matching the glyph tile. */
    /* The chip wears the colour of the movement direction it leads with: entry green,
       exit red, transfer grey. */
    ${root} .statement-body .col-category[data-category-direction="in"]{background:#ecfdf5;color:#047857}
    ${root} .statement-body .col-category[data-category-direction="out"]{background:#fef2f2;color:#b91c1c}
    ${root} .statement-body .col-category[data-category-direction="transfer"]{background:#f1f5f9;color:#475569}
    /* Reference description: a strong title over a muted second line. */
    ${root} .statement-body .description-note{color:var(--muted);display:block;font-size:${typography.sizes.xs};line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    /* Reference selection control: a rounded square, not a native circle. */
    ${root} .statement-body .col-select input[type="checkbox"]{appearance:none;background:#fff;border:1.5px solid #cbd5e1;border-radius:5px;cursor:pointer;height:18px;margin:0;position:relative;width:18px}
    ${root} .statement-body .col-select input[type="checkbox"]:hover{border-color:#94a3b8}
    ${root} .statement-body .col-select input[type="checkbox"]:checked{background:var(--primary);border-color:var(--primary)}
    ${root} .statement-body .col-select input[type="checkbox"]:checked::after{border:solid #fff;border-width:0 0 2px 2px;content:"";height:4px;left:5px;position:absolute;top:2px;transform:rotate(-45deg);width:8px}
    ${root} .statement-body .col-select input[type="checkbox"]:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
    ${root} .statement-body .col-select input[type="checkbox"]:disabled{cursor:not-allowed;opacity:.45}
    ${root} .statement-body :is(.col-kind,.col-balance){color:var(--muted)}
    /* M02/M04: metadata stays secondary and on one line so it neither competes with the
       description/amount nor inflates the row height of the movement list. */
    /* Status keeps the semantic label in aria-label/title, while only its glyph is visible. */
    ${root} .statement-body .statement-status{align-items:center;border:1px solid transparent;border-radius:999px;display:inline-flex;flex:0 0 auto;height:32px;justify-content:center;max-width:100%;min-width:32px;padding:0;width:32px}
    ${root} .statement-body .col-status{justify-self:center}
    ${root} .statement-body .statement-status-label{display:none}
    ${root} .statement-body .statement-status svg{flex:0 0 auto;height:14px;width:14px}
    /* The row indicator is 32px, but the compact reconciliation popover uses
       the canonical 26px circle and 15px glyph; do not enlarge its 44px target. */
    ${root} .statement-body .statement-status-menu .statement-status{height:26px;min-width:26px;width:26px}
    ${root} .statement-body .statement-status-menu .statement-status svg{height:15px;width:15px}
    ${root} .statement-body .statement-status-label{font-size:inherit;font-weight:inherit;line-height:1.25;overflow:hidden;text-overflow:ellipsis}
    ${root} .statement-body .statement-status-ok{background:#dcfce7;border-color:#bbf7d0;color:#166534}
    ${root} .statement-body .statement-status-posted{background:#f1f5f9;border-color:#e2e8f0;color:#475569}
    ${root} .statement-body .statement-status-pending{background:#fef3c7;border-color:#fde68a;color:#92400e}
    ${root} .statement-body .statement-status-planned{background:#eff6ff;border-color:#dbeafe;color:#1d4ed8}
    ${root} .statement-panel.panel{background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden}
    /* Keep existing canonical GET sorting reachable; do not synthesize unsupported filters. */
    ${root} .statement-query-heading>span{display:block;color:var(--muted);font-size:${typography.sizes.xs}}
    ${root} .statement-mobile-advanced-filters,
    ${root} .statement-mobile-advanced-fields{display:contents}
    ${root} .statement-mobile-advanced-filters>summary{display:none}
    ${root} .filter-form .statement-sort-field{min-width:0}
    ${root} .statement-body .col-amount{font-size:${typography.sizes.md};font-variant-numeric:tabular-nums;font-weight:700}
    ${root} .statement-body .col-description>strong{font-size:${typography.sizes.md};font-weight:700}
    @media(max-width:1100px){
      /* Progressive reduction: compact widths drop the decorative glyph so the long values
         keep their full width, and label and value stay on one line. */
      ${root} .account-summary[data-mockup-composition] .summary-total{align-items:baseline;display:flex;flex-wrap:wrap;justify-content:space-between;padding:${spacing[1]} ${spacing[2]}}
      ${root} .summary-total-copy{align-items:baseline;display:flex;flex-wrap:wrap;gap:2px ${spacing[1]};justify-content:space-between;width:100%}
      ${root} .summary-total-icon{display:none}
    ${root} .statement-body .col-amount{font-size:${typography.sizes.sm}}
    }
    ${root} .statement-toolbar{display:none}
    ${root} .statement-table{max-width:100%;overflow-x:auto;overflow-y:visible}
    ${root} .statement-head{background:transparent;border-bottom:1px solid var(--line);color:#94a3b8;font-size:${typography.sizes.xs};font-weight:${typography.weights.medium};letter-spacing:0;padding-inline:${spacing[3]};text-transform:none}
    ${root} .statement-body{border-bottom:1px solid #eef2f7;padding-block:${spacing[2]};padding-inline:${spacing[3]}}
    ${root} .statement-date-group{display:none}
    ${root} .statement-body .col-description>strong{font-size:${typography.sizes.md}}
    ${root} .statement-body .col-description>span,${root} .statement-body :is(.col-category,.col-kind,.col-balance){font-size:${typography.sizes.xs}}
    ${root} .statement-body .col-amount{font-size:${typography.sizes.md}}
    html:has(body [data-golden-screen="statement"]):has(dialog[data-modal][open]){overflow-y:hidden}
    ${dialog}{border:1px solid var(--line);border-radius:10px;height:fit-content;margin:auto;max-height:calc(100dvh - 32px);max-width:min(440px,calc(100% - 32px));overflow:hidden;padding:0;width:min(440px,calc(100% - 32px))}
    /* Both create and edit dialogs use the same centered viewport contract. Keep the PATCH
       selector for compatibility with the existing edit flow without moving either dialog. */
    ${dialog}:has(form[data-method="PATCH"]){height:fit-content;margin:auto;max-height:calc(100dvh - 32px)}
    ${dialog}::backdrop{background:rgba(15,23,42,.38)}
    ${dialog} .modal-panel{box-sizing:border-box;max-height:calc(100dvh - 34px);min-height:100%;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;padding:${spacing[4]}}
    ${dialog} .statement-entry-heading>.eyebrow{display:none!important}
    ${dialog} .statement-entry-heading{border-bottom:1px solid #eef2f7;grid-column:1!important;grid-row:1;padding-bottom:${spacing[3]};padding-right:${spacing[2]}}
    ${dialog} .statement-entry-heading p{font-size:${typography.sizes.sm}}
    ${dialog} .close-form button{background:transparent;border:0;color:#475569;font-size:${typography.sizes.xl};line-height:1}
    ${dialog} .close-form button::before,${dialog} .close-form button::after{content:none}
    ${dialog} .close-form button>[data-popup-action-icon]{display:none!important}
    body:has(${root}) dialog[data-group-modal] button[data-group-close][aria-label="Fechar"]>[data-popup-action-icon]{display:none!important}
    ${dialog} .modal-panel form[data-form]{display:grid;gap:${spacing[3]};grid-template-columns:repeat(2,minmax(0,1fr));margin-top:${spacing[3]}}
    ${dialog} .modal-panel form[data-form]>label.full,
    ${dialog} .modal-panel form[data-form]>.statement-entry-advanced,
    ${dialog} .modal-panel form[data-form]>.save-row,
    ${dialog} .modal-panel form[data-form]>.statement-entry-kinds{grid-column:1/-1}
    ${dialog} .statement-entry-account input{background:#f8fafc}
    ${dialog} [data-account-readonly-full-name]{align-items:center;background:#f8fafc;border:1px solid var(--line);border-radius:var(--radius);display:flex;font-size:${typography.sizes.sm};line-height:1.4;min-height:${density.interactiveTargetMin};overflow-wrap:anywhere;padding:${spacing[2]} ${spacing[3]};white-space:normal}
    ${dialog} .statement-entry-account-selector{grid-column:1/-1;min-width:0}
    ${dialog} .statement-entry-account-selector select{min-width:0;max-width:100%;width:100%}
    ${dialog} [data-edit-account-full-name]{display:block;font-size:${typography.sizes.xs};line-height:1.4;overflow-wrap:anywhere;white-space:normal}
    ${dialog} .statement-entry-advanced{border-top:1px solid #eef2f7;padding-top:${spacing[2]}}
    ${dialog} .statement-entry-advanced>summary{color:var(--primary);cursor:pointer;font-size:${typography.sizes.sm};font-weight:${typography.weights.medium};min-height:${density.interactiveTargetMin}}
    ${dialog} .statement-entry-advanced-grid{display:grid;gap:${spacing[3]};grid-template-columns:repeat(2,minmax(0,1fr));padding-top:${spacing[2]}}
    ${dialog} .statement-entry-advanced-grid>.full{grid-column:1/-1}
    /* The dialog is at most 440px wide even on desktop: viewport media queries
       cannot decide whether its three actions fit. Keep status on a separate row
       and size every action against the dialog's own content box. */
    ${dialog} .save-row{align-items:start;border-top:1px solid var(--line);display:grid;gap:${spacing[3]};grid-template-columns:minmax(0,1fr);justify-content:stretch;max-width:100%;min-width:0;padding-top:${spacing[3]};width:100%}
    ${dialog} .save-row .status-icons{flex-wrap:nowrap;justify-self:start;margin-right:0;min-width:0}
    ${dialog} .save-row .status-label{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
    ${dialog} .statement-save-actions{box-sizing:border-box;display:grid;gap:8px;grid-template-columns:repeat(2,minmax(0,1fr));margin-left:0;max-width:100%;min-width:0;width:100%}
    ${dialog} .statement-save-actions>button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;grid-column:auto;max-width:100%;min-height:44px;min-width:0;overflow-wrap:anywhere;padding:8px;white-space:normal;width:100%}
    ${dialog} .statement-save-actions>button[type=submit]:not([data-statement-save-continue]){grid-column:1/-1}
    /* Edits show only Cancelar + Salvar lançamento; use one row for those. */
    ${dialog} .statement-save-actions:has([data-statement-save-continue][hidden])>button[type=submit]:not([data-statement-save-continue]){grid-column:auto}
    ${dialog} .statement-save-actions>[data-transaction-cancel]{background:transparent;border:1px solid var(--line);color:var(--text)}
    ${dialog} .statement-save-actions>[data-statement-save-continue]{background:var(--surface);border:1px solid var(--line);color:var(--primary)}
    ${dialog} .statement-save-actions>[data-statement-save-continue]:hover:not(:disabled){background:var(--primary-soft);border-color:var(--primary)}
    ${dialog} .statement-save-actions>[data-statement-save-continue]:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
    @media(max-width:360px){
      /* 320px viewport: a single column protects full labels and 44px targets. */
      ${dialog} .statement-save-actions{grid-template-columns:minmax(0,1fr)}
      ${dialog} .statement-save-actions>button[type=submit]:not([data-statement-save-continue]){grid-column:auto}
      ${dialog} .statement-save-actions [data-popup-action-icon]{display:none!important}
    }
    @media(max-width:1100px){
      body:has(${root}) .app-shell{grid-template-columns:1fr}
      body:has(${root}) .main-area>main{padding:${spacing[2]} ${spacing[3]} ${spacing[6]}}
      ${root} .statement-breadcrumb{display:none}
      body:has(${root}) .sidebar{overflow-x:hidden}
      body:has(${root}) .brand{flex:0 0 var(--sf-density-compact-action-min-height);font-size:0;justify-content:center;overflow:hidden;padding-inline:0;width:var(--sf-density-compact-action-min-height)}
      body:has(${root}) nav{display:grid;flex:1 1 auto;grid-template-columns:repeat(6,minmax(0,1fr));min-width:0;overflow:visible;padding-bottom:0}
      body:has(${root}) nav a{flex:1 1 auto;justify-content:center;min-width:0;padding-inline:0}
      body:has(${root}) nav a[data-nav-priority="primary"]{font-size:0}
      body:has(${root}) .nav-more-toggle{font-size:0;min-width:var(--sf-density-compact-action-min-height);padding:0}
      body:has(${root}) .nav-more-toggle::after{content:"⋯";font-size:var(--sf-font-size-lg);line-height:1}
      ${root} .account-summary[data-mockup-composition]{grid-template-columns:repeat(2,minmax(0,1fr));padding:${spacing[2]};row-gap:${spacing[1]}}
      ${root} .account-summary[data-mockup-composition] .summary-total{min-height:0;padding:${spacing[1]} ${spacing[2]}}
      ${root} .statement-status-details>summary{min-height:32px;padding:0}
      ${root} .statement-query{padding:${spacing[1]}}
      ${root} .filter-form{row-gap:${spacing[1]}}
      ${root} .statement-account-heading{grid-column:1/-1;grid-template-columns:minmax(0,1fr);margin:-${spacing[2]} -${spacing[2]} 0;padding:${spacing[1]} ${spacing[2]}}
      ${root} .statement-period-control{align-items:center;justify-content:space-between;width:100%}
      ${root} .statement-period-control .month-field{flex:1 1 auto;min-width:0}
      ${root} .statement-period-control [data-month-current]{flex:0 0 auto}
      ${root} .statement-query{align-items:stretch;display:grid;grid-template-columns:minmax(0,1fr) auto}
      ${root} #statement-query-fields{grid-column:1/-1}
      ${root} .statement-query-heading{grid-column:2;grid-row:1}
      ${root} .filter-form{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:${spacing[2]}}
      ${root} .filter-form .statement-search-field{grid-column:1/-1}
      /* Progressive reduction: compact widths keep the month stepper and "Mês atual"
         instead of a second row of period shortcuts, which the density budget rejects. */
      ${root} .statement-period-shortcuts{display:none}
      ${root} .statement-filter-count{display:none}
      ${root} .statement-body{box-sizing:border-box;max-width:100%;min-width:0}
      ${root} .statement-body :is(.col-description,.description,.account-remuneration-summary){max-width:100%;min-width:0;overflow-wrap:anywhere}
      ${root} .statement-body .description details.account-remuneration-audit{max-width:100%;min-width:0}
      ${root} .statement-row.account-remuneration-row .col-description{min-width:0;max-width:100%;overflow-wrap:anywhere}
      ${root} .statement-row.account-remuneration-row .description{display:block;min-width:0;max-width:100%}
      ${root} .statement-body.account-remuneration-row .description>strong{max-width:100%;min-width:0;overflow-wrap:anywhere;white-space:normal}
      ${root} .statement-body.account-remuneration-row .account-remuneration-audit summary{max-width:100%;overflow-wrap:anywhere;white-space:normal}
      ${root} .statement-mobile-advanced-filters{display:block;grid-column:1/-1;min-width:0}
      ${root} .statement-mobile-advanced-filters>summary{align-items:center;cursor:pointer;display:flex;min-height:36px;padding:${spacing[1]} ${spacing[2]};border:1px solid var(--line);border-radius:7px;font-size:${typography.sizes.sm}}
      ${root} .statement-mobile-advanced-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:${spacing[2]};padding-top:${spacing[2]}}
      ${root} .statement-mobile-advanced-filters:not([open]) .statement-mobile-advanced-fields{display:none}

      ${root} .filter-form :is(.statement-kind-field,.statement-status-field,.statement-reconciliation-field,.statement-category-field,.statement-sort-field){min-width:0}
      ${root} .filter-form :is(.statement-kind-field,.statement-status-field,.statement-reconciliation-field,.statement-category-field,.statement-sort-field) select{min-width:0;width:100%}
      ${root} .statement-filter-actions{grid-column:1/-1;justify-content:stretch}
      ${root} .statement-filter-actions>button{flex:1}
      ${dialog}{height:fit-content;margin:auto;max-height:calc(100dvh - 32px);max-width:calc(100% - 32px);width:calc(100% - 32px)}
      ${dialog} .modal-panel form[data-form],${dialog} .statement-entry-advanced-grid{grid-template-columns:1fr}
      ${dialog} .statement-entry-advanced-grid>.full{grid-column:auto}
    }

    /* State selectors in the A2 compatibility layer otherwise win over the Golden grid. */
    @media(min-width:1101px){
      /* Content-aware compact bar: each control keeps its complete default value instead of
         inheriting a fractional track that clips the native select and the search placeholder. */
      ${root}[data-statement-options] .filter-form{
        column-gap:${spacing[2]};
        row-gap:${spacing[2]};
        grid-template-columns:minmax(14rem,1.5fr) repeat(4,minmax(9.375rem,1fr)) minmax(0,max-content);
      }
      ${root}[data-statement-options] .filter-form>.statement-search-field{grid-column:auto}
      ${root}[data-statement-options] .filter-form :is(.statement-kind-field,.statement-status-field,.statement-reconciliation-field,.statement-category-field){grid-column:auto}
      ${root}[data-statement-options] .filter-form>.statement-sort-field{grid-column:auto;min-width:0}
      ${root}[data-statement-options] .filter-form>.statement-filter-actions{grid-column:auto;flex-wrap:nowrap;min-width:0}
    }
    /* Intermediate desktops cannot fit six content-sized tracks beside the sidebar.
`;
}
