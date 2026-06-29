const brandLogoMarkup =
  '<img class="brand-logo" src="/brand/Solverfin_02.png" alt="" width="28" height="28" loading="eager" /><span>SolverFin</span>';

export function enhanceSolverFinBrandLogo(html: string): string {
  if (!html.includes('class="brand"')) {
    return html;
  }

  const withLogo = html.replace(
    /(<a class="brand"[^>]*>)\s*SolverFin\s*(<\/a>)/g,
    `$1${brandLogoMarkup}$2`,
  );

  if (withLogo === html || withLogo.includes("data-solverfin-brand-logo")) {
    return withLogo;
  }

  return withLogo.replace(
    "</head>",
    `<style data-solverfin-brand-logo>
      .brand { align-items: center; display: inline-flex; gap: 10px; }
      .brand-logo { border-radius: 8px; flex: 0 0 auto; height: 28px; object-fit: contain; width: 28px; }
    </style></head>`,
  );
}
