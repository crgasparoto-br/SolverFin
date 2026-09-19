export type SecondaryRouteId =
  | "categories"
  | "settings"
  | "assistant"
  | "adminInstitutions"
  | "adminFinancialIndexes"
  | "accountRemuneration";

export type SecondaryRouteAudience = "authenticated" | "financial-profile" | "master";
export type SecondaryRouteArchetype =
  | "maintenance"
  | "settings"
  | "read-only-assistant"
  | "admin-maintenance"
  | "admin-operations"
  | "legacy-compatibility";
export type SecondaryRouteOperationalMode = "operational" | "read-only" | "legacy-renderer";

export interface SecondaryRoutePageViewModel {
  id: SecondaryRouteId;
  title: string;
  eyebrow: string;
  description: string;
  audience: SecondaryRouteAudience;
  archetype: SecondaryRouteArchetype;
  operationalMode: SecondaryRouteOperationalMode;
}

const secondaryRoutePageModels = {
  categories: {
    id: "categories",
    title: "Categorias",
    eyebrow: "Organização financeira",
    description:
      "Classifique receitas, despesas e transferências com uma hierarquia simples para manter relatórios e lançamentos consistentes.",
    audience: "financial-profile",
    archetype: "maintenance",
    operationalMode: "operational",
  },
  settings: {
    id: "settings",
    title: "Configurações",
    eyebrow: "Preferências financeiras",
    description: "Organize seus perfis financeiros e as regras que geram sugestões para revisão.",
    audience: "authenticated",
    archetype: "settings",
    operationalMode: "operational",
  },
  assistant: {
    id: "assistant",
    title: "Pergunte sobre seus dados financeiros",
    eyebrow: "Assistente financeiro",
    description:
      "Consulte períodos, gastos, saldo, faturas, parcelas e recorrências sem alterar nenhum registro.",
    audience: "financial-profile",
    archetype: "read-only-assistant",
    operationalMode: "read-only",
  },
  adminInstitutions: {
    id: "adminInstitutions",
    title: "Instituições financeiras",
    eyebrow: "Admin global",
    description: "Catálogo compartilhado por todos os usuários para contas e cartões.",
    audience: "master",
    archetype: "admin-maintenance",
    operationalMode: "operational",
  },
  adminFinancialIndexes: {
    id: "adminFinancialIndexes",
    title: "Índices financeiros",
    eyebrow: "Operação global",
    description:
      "Acompanhe a atualização do CDI e execute o processamento diário das contas remuneradas.",
    audience: "master",
    archetype: "admin-operations",
    operationalMode: "operational",
  },
  accountRemuneration: {
    id: "accountRemuneration",
    title: "Remuneração pelo CDI",
    eyebrow: "Contas remuneradas",
    description:
      "Configure o renderer de compatibilidade das contas em reais que usam remuneração baseada no CDI.",
    audience: "financial-profile",
    archetype: "legacy-compatibility",
    operationalMode: "legacy-renderer",
  },
} as const satisfies Record<SecondaryRouteId, SecondaryRoutePageViewModel>;

export function getSecondaryRoutePageViewModel(
  id: SecondaryRouteId,
): SecondaryRoutePageViewModel {
  return secondaryRoutePageModels[id];
}
