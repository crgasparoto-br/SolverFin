import { solverFinDesignTokens } from "../design-system/tokens.js";

/** Progressive DOM grouping preserves the original nodes, handlers and no-JS markup. */
export function statementGoldenRefinementRuntime(): string {
  return `<script data-statement-golden-refinements>
    (() => {
      const root = document.currentScript?.closest('[data-golden-screen="statement"]');
      if (!root) return;
      const primary = root.querySelector('[data-quick-kind="expense"]');
      primary?.parentElement?.prepend(primary);
      for (const row of root.querySelectorAll('.statement-body')) {
        if (row.hasAttribute('data-statement-row-refined')) continue;
        const category = row.querySelector('.col-category');
        const kind = row.querySelector('.col-kind');
        const date = row.querySelector('.col-date');
        const balance = row.querySelector('.col-balance');
        if (!category || !kind || !date || !balance) continue;
        const metadata = document.createElement('div');
        metadata.className = 'statement-row-metadata';
        category.before(metadata);
        metadata.append(category, kind);
        const footer = document.createElement('div');
        footer.className = 'statement-row-footer';
        const actions = row.querySelector('.col-actions');
        if (actions) actions.before(footer);
        else row.append(footer);
        footer.append(date, balance);
        const description = row.querySelector('.col-description');
        const amount = row.querySelector('.col-amount');
        if (description && amount) description.after(amount);
        row.setAttribute('data-statement-row-refined', 'true');
      }
      const status = root.querySelector('.status-overview');
      if (status && !status.querySelector('.statement-status-details')) {
        const details = document.createElement('details');
        details.className = 'statement-status-details';
        const summary = document.createElement('summary');
        summary.textContent = 'Situação do período';
        const content = document.createElement('div');
        content.className = 'statement-status-content';
        status.querySelector('h3')?.remove();
        while (status.firstChild) content.append(status.firstChild);
        details.append(summary, content);
        status.append(details);
        const mobile = matchMedia('(max-width: ${solverFinDesignTokens.breakpoints.shellCompact})');
        details.open = !mobile.matches;
        mobile.addEventListener('change', (event) => { details.open = !event.matches; });
      }
    })();
  </script>`;
}

export function statementGoldenRefinementStyles(): string {
  const { spacing, breakpoints, density, typography } = solverFinDesignTokens;
  const root = '[data-statement-archetype="A2"][data-golden-screen="statement"]';
  return `
    ${root} :is(.statement-row-metadata,.statement-row-footer){display:contents}
    ${root} .statement-status-details{width:100%}
    ${root} .statement-status-details>summary{color:var(--muted);cursor:pointer;font-size:${typography.sizes.sm};padding-block:${spacing[1]}}
    ${root} .statement-status-content{display:flex;flex-wrap:wrap;gap:${spacing[2]} ${spacing[4]};padding-top:${spacing[2]}}
    body:has([data-golden-screen="statement"]) dialog[data-modal] .modal-panel>div:nth-child(2){padding-right:0}
    body:has([data-golden-screen="statement"]) dialog[data-modal] .modal-panel>div:nth-child(2)>.eyebrow{align-items:center;display:flex;min-height:${density.interactiveTargetMin};padding-right:calc(${density.interactiveTargetMin} + ${spacing[6]});margin:0 0 ${spacing[2]}}
    body:has([data-golden-screen="statement"]) dialog[data-modal] .close-form button{min-height:${density.interactiveTargetMin};min-width:${density.interactiveTargetMin}}
    body:has([data-golden-screen="statement"]) dialog[data-modal] [data-modal-title]{overflow-wrap:anywhere}
    @media(max-width:${breakpoints.shellCompact}){
      ${root},${root} .statement-a2-workspace{gap:${spacing[3]}}
      ${root} .sf-page-header-description{display:none}
      ${root} .statement-heading-actions{display:grid;gap:${spacing[2]};grid-template-columns:repeat(3,minmax(0,1fr))}
      ${root} .statement-heading-actions button{font-size:${typography.sizes.sm};min-width:0;padding-inline:${spacing[2]}}
      ${root} .statement-heading-actions button[data-quick-kind="expense"]{grid-column:auto;grid-row:auto}
      ${root} .statement-context{gap:${spacing[2]};padding-bottom:${spacing[2]}}
      ${root} .statement-context-copy>.muted{display:none}
      ${root} .statement-context-meta{gap:${spacing[1]} ${spacing[3]}}
      ${root} .status-overview{padding-top:0}
      ${root} .statement-status-details>summary{box-sizing:border-box;min-height:${density.interactiveTargetMin};padding-block:${spacing[3]}}
      ${root} .statement-status-content{padding-top:0;padding-bottom:${spacing[2]}}
      ${root} .filter-form .account-select-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      ${root} .filter-form :is(input,select,button),${root} [data-statement-options-toggle]{min-height:${density.interactiveTargetMin}}
      ${root} .statement-body[data-statement-row-refined]{grid-template-columns:24px minmax(0,1fr) ${density.interactiveTargetMin};grid-template-areas:"select description actions" "select amount amount" "select metadata status" "select footer footer";gap:${spacing[1]} ${spacing[2]}}
      ${root} .statement-body .statement-row-metadata{align-items:baseline;display:flex;flex-wrap:wrap;gap:${spacing[1]} ${spacing[2]};grid-area:metadata;min-width:0}
      ${root} .statement-body .statement-row-footer{align-items:baseline;display:flex;flex-wrap:wrap;gap:${spacing[1]} ${spacing[2]};grid-area:footer;justify-content:space-between;min-width:0}
      ${root} .statement-body .statement-row-footer .col-balance{margin-left:auto}
      ${root} .statement-body .actions summary{height:${density.interactiveTargetMin};width:${density.interactiveTargetMin}}
    }
  `;
}
