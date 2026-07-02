import { findFinancialInstitution, financialInstitutionCatalog } from "@solverfin/domain";

interface WebInstitution {
  key: string;
  label: string;
  shortLabel: string;
  isKnown: boolean;
  logoAssetPath?: string;
}

export const fallbackInstitution = {
  key: "",
  label: "Sem instituição",
  shortLabel: "--",
  isKnown: false,
} as const satisfies WebInstitution;

const activeFinancialInstitutions = [...financialInstitutionCatalog]
  .filter((item) => item.status === "active")
  .sort((first, second) => first.label.localeCompare(second.label, "pt-BR"));

export const institutions: readonly WebInstitution[] = [
  fallbackInstitution,
  ...activeFinancialInstitutions.map(toWebInstitution),
];

export function findInstitution(key: string | undefined): WebInstitution {
  const institution = findFinancialInstitution(key);

  if (!institution.key) {
    return fallbackInstitution;
  }

  return toWebInstitution(institution);
}

const institutionLogoSources: Readonly<Record<string, string>> = Object.fromEntries(
  financialInstitutionCatalog.flatMap((institution) =>
    institution.logoAssetPath === undefined ? [] : [[institution.key, institution.logoAssetPath]],
  ),
);

function toWebInstitution(institution: {
  key: string;
  label: string;
  fallbackLabel: string;
  isKnown?: boolean;
  logoAssetPath?: string;
}): WebInstitution {
  return {
    key: institution.key,
    label: institution.label,
    shortLabel: institution.fallbackLabel,
    isKnown: institution.isKnown ?? true,
    ...(institution.logoAssetPath !== undefined
      ? { logoAssetPath: institution.logoAssetPath }
      : {}),
  };
}

function renderInstitutionBadge(key: string, hidden = false): string {
  const institution = findInstitution(key);
  const label = institution.shortLabel;
  const style = hidden ? ` style="display:none"` : "";

  return `<svg class="brand-icon institution-badge-icon" viewBox="0 0 44 44" role="img" aria-label="${escapeHtml(institution.label)}"${style}><rect x="4" y="4" width="36" height="36" rx="9" fill="#0f3d4c"/><rect x="7" y="7" width="30" height="30" rx="7" fill="#ffffff" fill-opacity=".12"/><text x="22" y="27" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${label.length > 2 ? "12" : "14"}" font-weight="800" fill="#ffffff">${escapeHtml(label)}</text></svg>`;
}

export function renderInstitutionIcon(key: string): string {
  const institution = findInstitution(key);
  const logoSource = institutionLogoSources[institution.key];

  if (!logoSource) {
    return renderInstitutionBadge(institution.key);
  }

  return `<span class="brand-icon-wrap"><img class="brand-icon institution-logo-img" src="${escapeHtml(logoSource)}" alt="${escapeHtml(institution.label)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='block'" />${renderInstitutionBadge(institution.key, true)}</span>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
