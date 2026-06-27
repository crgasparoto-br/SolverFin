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

export function renderInstitutionIcon(key: string): string {
  if (key === "bradesco")
    return `<svg class="brand-icon" viewBox="0 0 44 44" role="img"><circle cx="22" cy="22" r="18" fill="#cc092f"/><path d="M14 24c2.2-6 7.9-9.6 14.8-9.6 1.5 0 2.9.2 4.2.6-2.8 1.2-4.9 3.4-6.2 6.4 3 .4 5.4 1.9 7.2 4.4-2.4-.7-4.8-.8-7-.2-1.8.5-3.4 1.6-4.7 3.2-1.7-3-4.7-4.7-8.3-4.8z" fill="#fff"/></svg>`;
  if (key === "inter")
    return `<svg class="brand-icon" viewBox="0 0 44 44" role="img"><circle cx="22" cy="22" r="18" fill="#ff7a00"/><rect x="14" y="11" width="5" height="22" rx="2.5" fill="#fff"/><path d="M22 14h4.5c4.3 0 7.5 3.2 7.5 8s-3.2 8-7.5 8H22V14zm5 11c1.6 0 2.8-1.2 2.8-3S28.6 19 27 19h-.4v6h.4z" fill="#fff"/></svg>`;
  if (key === "c6")
    return `<svg class="brand-icon" viewBox="0 0 44 44" role="img"><rect x="7" y="7" width="30" height="30" rx="9" fill="#111827"/><path d="M27 16.2c-1.3-1.2-3-1.9-5.1-1.9-4.5 0-7.8 3.3-7.8 7.7s3.3 7.7 7.8 7.7c2.2 0 4-.8 5.3-2.1l-2.7-3c-.6.7-1.5 1.1-2.6 1.1-2 0-3.3-1.5-3.3-3.7s1.3-3.7 3.3-3.7c1 0 1.8.4 2.5 1l2.6-3.1z" fill="#fff"/><circle cx="30" cy="28" r="3" fill="#22d3ee"/></svg>`;
  if (key === "caixa")
    return `<svg class="brand-icon" viewBox="0 0 44 44" role="img"><rect x="7" y="9" width="30" height="26" rx="7" fill="#005ca9"/><path d="M13 29 25.8 15h5.5L18.5 29H13z" fill="#f59e0b"/><path d="M14 15h6l6.5 7-3.1 3.4L14 15zm15.5 8.4L36 29h-6.1l-3.6-3.1 3.2-2.5z" fill="#fff"/></svg>`;
  if (key === "porto_bank")
    return `<svg class="brand-icon" viewBox="0 0 44 44" role="img"><path d="M22 6 36 12v9.5c0 8.5-5.8 13.8-14 16.5-8.2-2.7-14-8-14-16.5V12l14-6z" fill="#0b66c3"/><path d="M17 15h7.2c4.2 0 7 2.6 7 6.4s-2.8 6.4-7 6.4h-2.9V33H17V15zm6.8 8.9c1.7 0 2.8-.9 2.8-2.5s-1.1-2.5-2.8-2.5h-2.5v5h2.5z" fill="#fff"/></svg>`;
  if (key === "solverfin_demo")
    return `<svg class="brand-icon" viewBox="0 0 44 44" role="img"><rect x="7" y="7" width="30" height="30" rx="9" fill="#0f3d4c"/><path d="M14 27.5c4.1 0 4.1-11 8.2-11s4.1 11 8.8 11" fill="none" stroke="#22d3ee" stroke-width="4" stroke-linecap="round"/><circle cx="31" cy="27.5" r="3" fill="#fff"/></svg>`;
  return `<svg class="brand-icon" viewBox="0 0 44 44" role="img"><rect x="7" y="15" width="30" height="21" rx="4" fill="#0f3d4c"/><path d="M9 15 22 8l13 7H9z" fill="#22d3ee"/><path d="M14 19h4v12h-4V19zm6 0h4v12h-4V19zm6 0h4v12h-4V19z" fill="#fff"/></svg>`;
}
