const DISCLOSURE_STYLE_MARKER = "data-account-remuneration-disclosure-affordance";

export function enhanceAccountRemunerationDisclosure(html: string): string {
  if (!html.includes('details class="account-remuneration-audit"')) return html;
  if (html.includes(DISCLOSURE_STYLE_MARKER)) return html;

  const styles = `
      <style ${DISCLOSURE_STYLE_MARKER}>
        .account-remuneration-audit summary{gap:4px;font-size:.75rem;min-height:24px;padding:1px 2px}
        .account-remuneration-audit summary::before{content:"▸";display:inline-block;font-size:.8125rem;line-height:1;transform:rotate(0deg);transform-origin:center;transition:transform 120ms ease-out}
        .account-remuneration-audit[open] summary::before{transform:rotate(90deg)}
        .account-remuneration-audit summary:focus-visible{border-radius:4px;outline:2px solid var(--primary);outline-offset:2px}
      </style>`;

  return html.replace("</head>", `${styles}</head>`);
}
