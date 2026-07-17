const DISCLOSURE_STYLE_MARKER = "data-account-remuneration-disclosure-affordance";
const DISCLOSURE_SUMMARY = `<summary aria-label="Ver memória do cálculo" title="Ver memória do cálculo"><span class="account-remuneration-disclosure-full">Ver memória do cálculo</span><span class="account-remuneration-disclosure-compact" aria-hidden="true">Memória</span></summary>`;

export function enhanceAccountRemunerationDisclosure(html: string): string {
  if (!html.includes('details class="account-remuneration-audit"')) return html;
  if (html.includes(DISCLOSURE_STYLE_MARKER)) return html;

  const styles = `
      <style ${DISCLOSURE_STYLE_MARKER}>
        .statement-row.account-remuneration-row .col-description{min-width:0}
        .statement-row.account-remuneration-row .description{column-gap:2px;grid-template-columns:max-content minmax(0,1fr);min-width:0}
        .statement-row.account-remuneration-row .description>strong{font-size:.75rem;line-height:1.2;min-width:0;white-space:nowrap}
        .account-remuneration-summary{max-width:100%;min-width:0;overflow-wrap:normal;word-break:normal}
        .account-remuneration-audit{max-width:100%;min-width:0}
        .account-remuneration-audit summary{gap:2px;font-size:.75rem;letter-spacing:-.01em;max-width:100%;min-height:24px;min-width:0;padding:1px 0;white-space:nowrap}
        .account-remuneration-disclosure-compact{display:none}
        .account-remuneration-audit summary::before{content:"▸";display:inline-block;font-size:.8125rem;line-height:1;transform:rotate(0deg);transform-origin:center;transition:transform 120ms ease-out}
        .account-remuneration-audit[open] summary::before{transform:rotate(90deg)}
        .account-remuneration-audit summary:focus-visible{border-radius:4px;outline:2px solid var(--primary);outline-offset:2px}
        @media(max-width:1600px){.account-remuneration-disclosure-full{display:none}.account-remuneration-disclosure-compact{display:inline}}
      </style>`;
  const enhancedHtml = html.replaceAll(
    "<summary>Ver memória do cálculo</summary>",
    DISCLOSURE_SUMMARY,
  );

  return enhancedHtml.replace("</head>", `${styles}</head>`);
}
