import { solverFinDesignTokens } from "../design-system/tokens.js";
import { statementMockupControlsStyles } from "./statement-mockup-controls.js";

export function statementGoldenRefinementStylesPart3(root: string, dialog: string): string {
  void dialog;
  const { spacing, typography } = solverFinDesignTokens;
  return `       Reflow instead of extending the document beyond the viewport. */
    @media(min-width:1101px) and (max-width:1339px){
      ${root}[data-statement-options] .filter-form{grid-template-columns:repeat(3,minmax(0,1fr))}
      ${root}[data-statement-options] .filter-form>.statement-search-field{grid-column:1/-1}
      ${root}[data-statement-options] .filter-form>.statement-filter-actions{grid-column:1/-1;justify-content:end}
    }
    /* Below this width the action group keeps its own row so no filter loses legibility. */
    @media(min-width:1101px) and (max-width:1339px){
      ${root}[data-statement-options] .filter-form>.statement-filter-actions{grid-column:1/-1;justify-content:end}
    }
    @media(min-width:1101px){
      ${root}[data-statement-options="expanded"] .filter-form>.statement-filter-actions{grid-column:1/-1;justify-content:end}
    }
    @media(min-width:1101px){
      ${root} .statement-mobile-advanced-filters::details-content{display:contents}
      /* Reference anatomy: check | glyph | date | description | category | value | status | actions.
         Rows and header share one track list, so the columns always line up. */
      ${root} .statement-row{column-gap:${spacing[2]};grid-template-columns:24px 44px 4.5rem minmax(14rem,1fr) minmax(8rem,11rem) minmax(7.5rem,auto) minmax(7.5rem,auto) 3.5rem 36px;min-height:52px;min-width:960px}
      ${root} .statement-body{grid-template-areas:"select icon date description category amount balance status actions";grid-template-rows:minmax(44px,auto)}
      ${root} .statement-body .col-row-icon{grid-area:icon}
      ${root} .statement-body .statement-row-footer{display:contents}
      ${root} .statement-body .col-date{grid-area:date}
      ${root} .statement-body .col-description{grid-area:description}
      ${root} .statement-body .statement-row-metadata{align-items:flex-start;display:flex;flex-direction:column;gap:2px;grid-area:category}
      ${root} .statement-body .col-status{grid-area:status;justify-self:start}
      ${root} .statement-body .col-amount{grid-area:amount}
      ${root} .statement-body .col-balance{grid-area:balance}
      ${root} .statement-body .col-actions{grid-area:actions}
      ${root} .statement-head{grid-template-areas:"select icon date description category amount balance status actions";row-gap:0}
      ${root} .statement-head .col-row-icon{grid-area:icon}
      ${root} .statement-head .col-date{grid-area:date}
      ${root} .statement-head .col-description{grid-area:description}
      ${root} .statement-head .col-category{clip-path:none;grid-area:category;height:auto;overflow:visible;position:static;width:auto}
      ${root} .statement-head .col-amount{grid-area:amount}
      ${root} .statement-head .col-balance{clip-path:none;grid-area:balance;height:auto;overflow:visible;position:static;text-align:right;width:auto}
      ${root} .statement-head .col-status{grid-area:status;justify-self:center;text-align:center}
      ${root} .statement-head .col-actions{grid-area:actions}
    }
    @media(max-width:1100px){
      ${root} .statement-body[data-statement-row-refined]{grid-template-areas:"select description actions" "select amount amount" "select metadata metadata" "select status status" "select footer footer"}
      ${root} .statement-body .col-row-icon{display:none}
      ${root} .statement-body .col-status{justify-self:start}
      ${root} .statement-query-heading{display:none}
      ${root} .filter-form .statement-sort-field{display:grid}
      ${root} .statement-query .statement-search-field{font-size:0;line-height:0;gap:0}
      ${root} .statement-query .statement-search-field input{font-size:${typography.sizes.sm};line-height:normal}
    }
    @media(max-width:430px){
      ${root} .statement-period-control{display:grid;grid-template-columns:minmax(0,1fr)}
      ${root} .statement-period-control [data-month-current]{justify-self:end}
    }
    @media(min-width:361px) and (max-width:430px){
      /* Preserve the month field's 240px readability floor. Recover mobile
         density from excess spacing instead of squeezing its native controls. */
      ${root} .statement-period-control{gap:4px;grid-template-columns:minmax(0,1fr)}
      ${root} .statement-period-control .month-field{min-width:0}
      ${root} .statement-period-control .month-nav{height:44px}
      ${root} .statement-period-control [data-month-current]{height:44px;justify-self:end}
      /* Recover vertical space at 390px without shrinking month navigation,
         financial values, search or 44px interactive targets. */
      ${root} .statement-toolbar{padding-block:0}
      ${root} .statement-account-heading{gap:4px;padding-block:2px}
      ${root} .statement-account-heading .summary-balance{padding-top:4px}
      ${root} .account-summary[data-mockup-composition]{row-gap:2px;padding-block:4px}
      ${root} .account-summary[data-mockup-composition] .summary-total{gap:2px;padding:2px 6px}
      ${root} .account-summary[data-mockup-composition] .summary-total-copy{gap:1px}
      ${root} .account-summary[data-mockup-composition] .summary-total-copy>strong{line-height:1.1}
      ${root} .statement-query{padding:1px 4px}
      ${root} .filter-form{row-gap:2px}
    }
    @media(max-width:360px){
      /* At 320px, an inline month shortcut clips the native year. Pin the
         44px shortcut to the spare header corner so month navigation keeps
         the full row and Movimentacoes still enters the first viewport. */
      ${root} .statement-account-heading{position:relative}
      ${root} .statement-period-control{display:block;min-width:0;position:static;width:100%}
      ${root} .statement-period-control .month-field{min-width:0;width:100%}
      ${root} .statement-period-control .month-nav{box-sizing:border-box;min-width:0;width:100%}
      ${root} .statement-period-control [data-month-current]{font-size:0;height:44px;min-height:44px;min-width:44px;padding:0;position:absolute;right:6px;top:2px}
      ${root} .statement-period-control [data-month-current]::before{content:"↻";font-size:20px;line-height:1}
      /* Keep the 320px first-viewport budget without truncating the selected account. */
      ${root} .statement-account-heading{gap:${spacing[1]}}
      ${root} .statement-account-control .account-field>label#account-picker-label{clip-path:inset(50%);height:1px;overflow:hidden;position:absolute;width:1px}
      ${root} .statement-account-heading .summary-balance{align-items:baseline;display:flex;gap:${spacing[1]};justify-content:space-between}
      ${root} .statement-account-heading .summary-balance strong{font-size:${typography.sizes.md};white-space:nowrap}
      /* Four full-width financial rows push movements below the 320px viewport.
         Keep all four values, but place them in two compact, self-contained rows. */
      ${root} .account-summary[data-mockup-composition]{column-gap:4px;grid-template-columns:repeat(2,minmax(0,1fr));padding-block:6px;row-gap:4px}
      ${root} .account-summary[data-mockup-composition] .summary-total{align-items:start;display:grid;gap:2px;min-width:0;padding:4px 6px}
      ${root} .account-summary[data-mockup-composition] .summary-total-icon{display:none}
      ${root} .account-summary[data-mockup-composition] .summary-total-copy{min-width:0}
      ${root} .account-summary[data-mockup-composition] .summary-total strong{font-size:11px;line-height:1.2;max-width:100%;overflow-wrap:anywhere;white-space:normal;word-break:normal;width:auto}
    }

    /* F-702-04: in the two-column phone layout, a long amount needs its own
       full-width line. Document-level overflow checks do not detect a value
       painting into the neighbouring financial card. Preserve the full amount. */
    @media(min-width:361px) and (max-width:760px){
      ${root} .account-summary[data-mockup-composition] .summary-total{align-content:start;display:grid;grid-template-columns:minmax(0,1fr);min-width:0}
      ${root} .summary-total-copy{display:grid;gap:2px;grid-template-columns:minmax(0,1fr);min-width:0;width:100%}
      ${root} .summary-total-copy>strong{display:block;font-size:clamp(11px,2.9vw,13px);max-width:100%;min-width:0;overflow-wrap:anywhere;white-space:normal;width:100%;word-break:normal}
    }


    /* Golden Screen: day headers stay readable and groups may be collapsed natively. */
    ${root} .statement-day-group{display:block;min-width:0}
    ${root} .statement-day-group>summary.statement-date-group{
      align-items:center;background:var(--surface-soft);border-bottom:1px solid var(--line);
      color:var(--text);cursor:pointer;display:flex;flex-wrap:wrap;gap:6px 14px;
      list-style:none;min-height:40px;padding:6px 12px;
    }
    ${root} .statement-day-group>summary::-webkit-details-marker{display:none}
    ${root} .statement-day-group>summary:focus-visible{outline:2px solid var(--primary);outline-offset:-2px}
    ${root} .statement-day-group .statement-date-group>strong{font-size:.8rem;font-weight:750}
    ${root} .statement-day-count{color:var(--muted);font-size:.75rem}
    ${root} .statement-day-in,${root} .statement-day-out{font-size:.75rem;font-weight:600;font-variant-numeric:tabular-nums}
    ${root} .statement-day-in{color:var(--success);margin-left:auto}
    ${root} .statement-day-out{color:var(--danger)}
    ${root} .statement-day-chevron{border-right:2px solid var(--muted);border-bottom:2px solid var(--muted);height:7px;width:7px;transform:rotate(45deg);transition:transform .15s}
    ${root} .statement-day-group:not([open]) .statement-day-chevron{transform:rotate(-45deg)}
    /* Category already encodes type; the redundant text must not create another row. */
    ${root} .statement-body .col-kind,${root} .statement-head .col-kind{display:none}
    ${root} .statement-body .col-balance{font-variant-numeric:tabular-nums;font-weight:600;text-align:right;white-space:nowrap}
    ${root} .statement-body .col-description{min-width:0}
    /* design-interface: dates are short fields; never give a day picker a broad grid span.
       Keep the clear action beside the label instead of compressing the native calendar. */
    ${root} .statement-day-field{display:grid;gap:4px;min-width:0;position:relative}
    ${root} .statement-day-field>label{color:var(--muted);font-size:.75rem}
    ${root} .statement-day-controls{align-items:center;display:flex;min-width:0}
    ${root} .statement-day-controls>input{box-sizing:border-box;flex:1 1 auto;min-width:0;min-height:40px;width:100%}
    ${root} .filter-form .statement-day-clear{background:transparent;border:0;color:var(--primary);font-size:.7rem;min-height:26px;padding:0 3px;position:absolute;right:0;top:-5px;white-space:nowrap}
    ${root} .statement-day-clear[hidden]{display:none}
    ${root} .filter-form .statement-day-clear:hover:not(:disabled){background:var(--neutral-control-hover);color:var(--neutral-control-text-hover);text-decoration:underline}
    @media(min-width:761px){
      ${root} .filter-form>.statement-day-field{max-width:11.5rem;width:100%}
    }
    @media(min-width:1600px){
      /* One balanced seven-track row only when content width supports every selector: day, search, four selectors and actions.
         Match the higher-specificity Golden options grid; no implicit tracks. */
      ${root}[data-statement-options] .filter-form{
        align-items:end;
        grid-template-columns:minmax(10.5rem,11.5rem) minmax(13rem,1.5fr) repeat(4,minmax(8.75rem,1fr)) minmax(0,max-content);
      }
      ${root}[data-statement-options] .filter-form>.statement-period-shortcuts{grid-column:1/-1}
      ${root}[data-statement-options] .filter-form>.statement-day-field{grid-column:auto}
      ${root}[data-statement-options] .filter-form>.statement-search-field{grid-column:auto}
      ${root}[data-statement-options] .filter-form :is(.statement-kind-field,.statement-status-field,.statement-reconciliation-field,.statement-category-field){grid-column:auto}
      ${root}[data-statement-options] .filter-form>.statement-filter-actions{grid-column:auto}
    }
    @media(min-width:1101px) and (max-width:1339px){
      /* Below 1340px, the six-field row would clip native selectors. */
      ${root}[data-statement-options] .filter-form{grid-template-columns:repeat(3,minmax(0,1fr))}
      ${root}[data-statement-options] .filter-form>.statement-period-shortcuts{grid-column:1/-1}
      ${root}[data-statement-options] .filter-form>.statement-day-field{grid-column:1}
      ${root}[data-statement-options] .filter-form>.statement-search-field{grid-column:2/-1}
      ${root}[data-statement-options] .filter-form>.statement-filter-actions{grid-column:1/-1;justify-content:end}
    }
    @media(min-width:1101px) and (max-width:1599px){
      /* Two intermediate-desktop filter rows must meet the 150px density budget
         without clipping native controls or removing the action row. */
      ${root}[data-statement-options] .filter-form{row-gap:0}
    }
    @media(min-width:1340px) and (max-width:1599px){
      /* Keep the short day, search and four selectors on one row at 1366px.
         Only the actions use a second row, preventing collision and excessive height. */
      ${root}[data-statement-options] .filter-form{
        grid-template-columns:minmax(10.5rem,11.5rem) minmax(11rem,1.35fr) repeat(4,minmax(7.5rem,1fr));
      }
      ${root}[data-statement-options] .filter-form>.statement-period-shortcuts{grid-column:1/-1}
      ${root}[data-statement-options] .filter-form>.statement-day-field{grid-column:1}
      ${root}[data-statement-options] .filter-form>.statement-search-field{grid-column:2}
      ${root}[data-statement-options] .filter-form :is(.statement-kind-field,.statement-status-field,.statement-reconciliation-field,.statement-category-field){grid-column:auto}
      ${root}[data-statement-options] .filter-form>.statement-filter-actions{grid-column:1/-1;justify-content:end}
    }
    @media(min-width:1101px){
      ${root} .statement-row.statement-body{padding-block:4px;row-gap:0}
      ${root} .statement-body .statement-row-metadata{justify-content:center}
      ${root} .statement-body .col-amount{font-size:1rem}
      ${root} .statement-body .col-balance{color:var(--text);font-size:.8rem}
    }
    @media(min-width:761px) and (max-width:1100px){
      ${root} .filter-form{grid-template-columns:repeat(2,minmax(0,1fr))}
      ${root} .filter-form>.statement-period-shortcuts{grid-column:1/-1}
      ${root} .filter-form>.statement-day-field{grid-column:1}
    }
    @media(max-width:760px){
      ${root} .filter-form{grid-template-columns:minmax(0,1fr)}
      ${root} .filter-form>.statement-period-shortcuts{grid-column:1}
      ${root} .filter-form>.statement-day-field{grid-column:1}
      ${root} .statement-day-group>summary.statement-date-group{gap:4px 8px;padding:7px 10px}
      ${root} .statement-day-in{margin-left:0}
      ${root} .statement-day-group .statement-day-count{margin-right:auto}
      ${root} .statement-body .col-balance{font-size:.75rem}
    }
    ${statementMockupControlsStyles()}
  `;
}
