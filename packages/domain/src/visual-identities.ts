export type FinancialInstitutionKey =
  | "bradesco"
  | "inter"
  | "c6"
  | "caixa"
  | "porto_bank"
  | "solverfin_demo";

export type CardBrandKey = "visa" | "mastercard" | "elo" | "solverfin_demo";

export interface VisualIdentityCatalogItem<TKey extends string> {
  key: TKey;
  label: string;
  fallbackLabel: string;
}

export const financialInstitutionCatalog = [
  { key: "bradesco", label: "Bradesco", fallbackLabel: "BR" },
  { key: "inter", label: "Inter", fallbackLabel: "IN" },
  { key: "c6", label: "C6", fallbackLabel: "C6" },
  { key: "caixa", label: "Caixa", fallbackLabel: "CX" },
  { key: "porto_bank", label: "Porto Bank", fallbackLabel: "PB" },
  { key: "solverfin_demo", label: "Instituição demo", fallbackLabel: "SD" },
] as const satisfies readonly VisualIdentityCatalogItem<FinancialInstitutionKey>[];

export const cardBrandCatalog = [
  { key: "visa", label: "Visa", fallbackLabel: "VI" },
  { key: "mastercard", label: "Mastercard", fallbackLabel: "MC" },
  { key: "elo", label: "Elo", fallbackLabel: "EL" },
  { key: "solverfin_demo", label: "Bandeira demo", fallbackLabel: "BD" },
] as const satisfies readonly VisualIdentityCatalogItem<CardBrandKey>[];

const financialInstitutionKeys = new Set<string>(
  financialInstitutionCatalog.map((item) => item.key),
);
const cardBrandKeys = new Set<string>(cardBrandCatalog.map((item) => item.key));

export function isFinancialInstitutionKey(value: string): value is FinancialInstitutionKey {
  return financialInstitutionKeys.has(value);
}

export function isCardBrandKey(value: string): value is CardBrandKey {
  return cardBrandKeys.has(value);
}

export function normalizeOptionalCatalogKey(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = value.trim().toLowerCase();

  return normalizedValue || undefined;
}

export function getVisualFallbackLabel(label: string): string {
  const initials = label
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return initials || "SF";
}
