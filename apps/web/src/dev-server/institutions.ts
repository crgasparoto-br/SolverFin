export const fallbackInstitution = { key: "", label: "Sem instituição", shortLabel: "SF" } as const;

export const institutions = [
  fallbackInstitution,
  { key: "bradesco", label: "Bradesco", shortLabel: "BR" },
  { key: "inter", label: "Inter", shortLabel: "IN" },
  { key: "c6", label: "C6 Bank", shortLabel: "C6" },
  { key: "caixa", label: "Caixa", shortLabel: "CX" },
  { key: "porto_bank", label: "Porto Bank", shortLabel: "PB" },
  { key: "solverfin_demo", label: "SolverFin Demo", shortLabel: "SF" },
] as const;

export function findInstitution(key: string | undefined) {
  return institutions.find((item) => item.key === key) ?? fallbackInstitution;
}

const institutionLogoSources: Record<string, string> = {
  bradesco: "/images/institutions/bradesco.png",
  inter: "/images/institutions/inter.png",
  porto_bank: "/images/institutions/porto-bank.svg",
};

function renderInstitutionBadge(key: string, hidden = false): string {
  const institution = findInstitution(key);
  const label = institution.shortLabel;
  const style = hidden ? ` style="display:none"` : "";

  return `<svg class="brand-icon institution-badge-icon" viewBox="0 0 44 44" role="img" aria-label="${institution.label}"${style}><rect x="4" y="4" width="36" height="36" rx="9" fill="#0f3d4c"/><rect x="7" y="7" width="30" height="30" rx="7" fill="#ffffff" fill-opacity=".12"/><text x="22" y="27" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${label.length > 2 ? "12" : "14"}" font-weight="800" fill="#ffffff">${label}</text></svg>`;
}

export function renderInstitutionIcon(key: string): string {
  const institution = findInstitution(key);
  const logoSource = institutionLogoSources[institution.key];

  if (!logoSource) {
    return renderInstitutionBadge(institution.key);
  }

  return `<span class="brand-icon-wrap"><img class="brand-icon institution-logo-img" src="${logoSource}" alt="${institution.label}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='block'" />${renderInstitutionBadge(institution.key, true)}</span>`;
}
