export type FinancialInstitutionKey =
  | "banco_do_brasil"
  | "banco_pan"
  | "banco_xp"
  | "bradesco"
  | "btg_pactual"
  | "c6"
  | "caixa"
  | "inter"
  | "itau"
  | "mercado_pago"
  | "neon"
  | "nubank"
  | "original"
  | "pagbank"
  | "picpay"
  | "porto_bank"
  | "safra"
  | "santander"
  | "sicredi"
  | "sicoob"
  | "solverfin_demo";

export type FinancialInstitutionStatus = "active" | "inactive";

export type CardBrandKey = "visa" | "mastercard" | "elo" | "solverfin_demo";

export interface VisualIdentityCatalogItem<TKey extends string> {
  key: TKey;
  label: string;
  fallbackLabel: string;
}

export interface FinancialInstitutionCatalogItem extends VisualIdentityCatalogItem<FinancialInstitutionKey> {
  description: string;
  status: FinancialInstitutionStatus;
  financialInstitutionCode: string;
  bankCode?: string;
  ispb?: string;
  logoAssetPath?: string;
}

export interface ResolvedFinancialInstitution {
  key: string;
  label: string;
  description: string;
  fallbackLabel: string;
  status: FinancialInstitutionStatus | "unknown";
  isKnown: boolean;
  financialInstitutionCode?: string;
  bankCode?: string;
  ispb?: string;
  logoAssetPath?: string;
}

export const financialInstitutionCatalog = [
  {
    key: "banco_do_brasil",
    label: "Banco do Brasil",
    description: "Banco múltiplo brasileiro com ampla rede de varejo e serviços digitais.",
    fallbackLabel: "BB",
    status: "active",
    financialInstitutionCode: "banco_do_brasil",
  },
  {
    key: "banco_pan",
    label: "Banco Pan",
    description: "Banco brasileiro com contas digitais, cartões, crédito e financiamento.",
    fallbackLabel: "PN",
    status: "active",
    financialInstitutionCode: "banco_pan",
  },
  {
    key: "banco_xp",
    label: "Banco XP",
    description:
      "Instituição financeira ligada ao ecossistema XP, com conta, cartão e investimentos.",
    fallbackLabel: "XP",
    status: "active",
    financialInstitutionCode: "banco_xp",
  },
  {
    key: "bradesco",
    label: "Bradesco",
    description: "Banco múltiplo brasileiro com contas, cartões, crédito e investimentos.",
    fallbackLabel: "BR",
    status: "active",
    financialInstitutionCode: "bradesco",
    logoAssetPath: "/images/institutions/bradesco.png",
  },
  {
    key: "btg_pactual",
    label: "BTG Pactual",
    description:
      "Banco brasileiro de investimentos com conta digital, cartão e serviços financeiros.",
    fallbackLabel: "BT",
    status: "active",
    financialInstitutionCode: "btg_pactual",
  },
  {
    key: "c6",
    label: "C6 Bank",
    description: "Banco digital brasileiro com conta, cartões e serviços financeiros.",
    fallbackLabel: "C6",
    status: "active",
    financialInstitutionCode: "c6",
  },
  {
    key: "caixa",
    label: "Caixa",
    description: "Banco público brasileiro com contas, cartões, crédito e serviços sociais.",
    fallbackLabel: "CX",
    status: "active",
    financialInstitutionCode: "caixa",
  },
  {
    key: "inter",
    label: "Inter",
    description: "Banco digital brasileiro com conta, cartões, crédito e marketplace financeiro.",
    fallbackLabel: "IN",
    status: "active",
    financialInstitutionCode: "inter",
    logoAssetPath: "/images/institutions/inter.png",
  },
  {
    key: "itau",
    label: "Itaú",
    description: "Banco múltiplo brasileiro com contas, cartões, crédito e investimentos.",
    fallbackLabel: "IT",
    status: "active",
    financialInstitutionCode: "itau",
  },
  {
    key: "mercado_pago",
    label: "Mercado Pago",
    description: "Conta de pagamento e serviços financeiros digitais do ecossistema Mercado Livre.",
    fallbackLabel: "MP",
    status: "active",
    financialInstitutionCode: "mercado_pago",
  },
  {
    key: "neon",
    label: "Neon",
    description: "Conta digital brasileira com cartões, pagamentos e serviços financeiros.",
    fallbackLabel: "NE",
    status: "active",
    financialInstitutionCode: "neon",
  },
  {
    key: "nubank",
    label: "Nubank",
    description: "Banco digital brasileiro com conta, cartões, crédito e investimentos.",
    fallbackLabel: "NU",
    status: "active",
    financialInstitutionCode: "nubank",
  },
  {
    key: "original",
    label: "Original",
    description: "Banco digital brasileiro com conta, cartões e serviços financeiros.",
    fallbackLabel: "OR",
    status: "active",
    financialInstitutionCode: "original",
  },
  {
    key: "pagbank",
    label: "PagBank",
    description: "Conta digital e serviços financeiros do ecossistema PagSeguro.",
    fallbackLabel: "PG",
    status: "active",
    financialInstitutionCode: "pagbank",
  },
  {
    key: "picpay",
    label: "PicPay",
    description: "Carteira digital e conta de pagamento com serviços financeiros.",
    fallbackLabel: "PP",
    status: "active",
    financialInstitutionCode: "picpay",
  },
  {
    key: "porto_bank",
    label: "Porto Bank",
    description: "Banco e serviços financeiros ligados ao ecossistema Porto.",
    fallbackLabel: "PB",
    status: "active",
    financialInstitutionCode: "porto_bank",
    logoAssetPath: "/images/institutions/porto-bank.svg",
  },
  {
    key: "safra",
    label: "Safra",
    description: "Banco brasileiro com contas, cartões, crédito, câmbio e investimentos.",
    fallbackLabel: "SA",
    status: "active",
    financialInstitutionCode: "safra",
  },
  {
    key: "santander",
    label: "Santander",
    description:
      "Banco múltiplo com atuação no Brasil em contas, cartões, crédito e investimentos.",
    fallbackLabel: "ST",
    status: "active",
    financialInstitutionCode: "santander",
  },
  {
    key: "sicredi",
    label: "Sicredi",
    description: "Instituição financeira cooperativa com contas, cartões, crédito e investimentos.",
    fallbackLabel: "SI",
    status: "active",
    financialInstitutionCode: "sicredi",
  },
  {
    key: "sicoob",
    label: "Sicoob",
    description:
      "Sistema de cooperativas financeiras com contas, cartões, crédito e investimentos.",
    fallbackLabel: "SC",
    status: "active",
    financialInstitutionCode: "sicoob",
  },
  {
    key: "solverfin_demo",
    label: "Instituição demo",
    description: "Instituição fictícia usada apenas em dados de demonstração do SolverFin.",
    fallbackLabel: "SD",
    status: "active",
    financialInstitutionCode: "solverfin_demo",
  },
] as const satisfies readonly FinancialInstitutionCatalogItem[] as readonly FinancialInstitutionCatalogItem[];

export const cardBrandCatalog = [
  { key: "visa", label: "Visa", fallbackLabel: "VI" },
  { key: "mastercard", label: "Mastercard", fallbackLabel: "MC" },
  { key: "elo", label: "Elo", fallbackLabel: "EL" },
  { key: "solverfin_demo", label: "Bandeira demo", fallbackLabel: "BD" },
] as const satisfies readonly VisualIdentityCatalogItem<CardBrandKey>[];

export const noFinancialInstitution: ResolvedFinancialInstitution = {
  key: "",
  label: "Sem instituição",
  description: "Nenhuma instituição financeira vinculada.",
  fallbackLabel: "--",
  status: "inactive",
  isKnown: false,
};

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

export function findFinancialInstitution(value: string | undefined): ResolvedFinancialInstitution {
  const normalizedValue = normalizeOptionalCatalogKey(value);

  if (normalizedValue === undefined) {
    return noFinancialInstitution;
  }

  const institution = financialInstitutionCatalog.find((item) => item.key === normalizedValue);

  if (institution !== undefined) {
    return { ...institution, isKnown: true };
  }

  return {
    key: normalizedValue,
    label: "Instituição não cadastrada",
    description: "Chave legada preservada para compatibilidade.",
    fallbackLabel: getVisualFallbackLabel(normalizedValue.replace(/[_-]+/g, " ")),
    status: "unknown",
    isKnown: false,
  };
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
    .split(/[\s_-]+/)
    .slice(0, 2)
    .map((part) => part.replace(/[^A-Za-z0-9]/g, "")[0]?.toUpperCase() ?? "")
    .join("");

  return initials || "SF";
}
