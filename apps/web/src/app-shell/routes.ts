export type ShellRouteId =
  | "dashboard"
  | "accounts"
  | "cards"
  | "categories"
  | "transactions"
  | "budgets"
  | "reports"
  | "review"
  | "settings"
  | "signIn";

export type ShellNavigationGroup = "main" | "manage" | "review" | "settings" | "public";
export type ShellRouteStatus = "available" | "placeholder";

export interface ShellRoute {
  id: ShellRouteId;
  path: string;
  label: string;
  description: string;
  navigationGroup: ShellNavigationGroup;
  requiresAuthentication: boolean;
  requiresFinancialProfile: boolean;
  status: ShellRouteStatus;
}

export const solverFinShellRoutes = [
  {
    id: "dashboard",
    path: "/app",
    label: "Resumo",
    description: "Acompanhe saldo, resultado do periodo e proximas pendencias.",
    navigationGroup: "main",
    requiresAuthentication: true,
    requiresFinancialProfile: true,
    status: "placeholder",
  },
  {
    id: "transactions",
    path: "/app/lancamentos",
    label: "Lancamentos",
    description: "Registre, revise e filtre receitas, despesas e transferencias.",
    navigationGroup: "main",
    requiresAuthentication: true,
    requiresFinancialProfile: true,
    status: "placeholder",
  },
  {
    id: "accounts",
    path: "/app/contas",
    label: "Contas",
    description: "Configure contas financeiras usadas nos lancamentos.",
    navigationGroup: "manage",
    requiresAuthentication: true,
    requiresFinancialProfile: true,
    status: "placeholder",
  },
  {
    id: "cards",
    path: "/app/cartoes",
    label: "Cartoes",
    description: "Organize cartoes, faturas e contas de pagamento.",
    navigationGroup: "manage",
    requiresAuthentication: true,
    requiresFinancialProfile: true,
    status: "placeholder",
  },
  {
    id: "categories",
    path: "/app/categorias",
    label: "Categorias",
    description: "Mantenha categorias para organizar receitas e despesas.",
    navigationGroup: "manage",
    requiresAuthentication: true,
    requiresFinancialProfile: true,
    status: "placeholder",
  },
  {
    id: "budgets",
    path: "/app/orcamentos",
    label: "Orcamentos",
    description: "Acompanhe limites, metas e alertas basicos.",
    navigationGroup: "main",
    requiresAuthentication: true,
    requiresFinancialProfile: true,
    status: "placeholder",
  },
  {
    id: "reports",
    path: "/app/relatorios",
    label: "Relatorios",
    description: "Veja gastos por categoria, evolucao mensal e previsto versus realizado.",
    navigationGroup: "main",
    requiresAuthentication: true,
    requiresFinancialProfile: true,
    status: "placeholder",
  },
  {
    id: "review",
    path: "/app/revisao",
    label: "Revisao",
    description: "Revise sugestoes, importacoes e possiveis duplicidades antes de confirmar.",
    navigationGroup: "review",
    requiresAuthentication: true,
    requiresFinancialProfile: true,
    status: "placeholder",
  },
  {
    id: "settings",
    path: "/app/configuracoes",
    label: "Configuracoes",
    description: "Ajuste contexto financeiro, preferencias e privacidade quando disponivel.",
    navigationGroup: "settings",
    requiresAuthentication: true,
    requiresFinancialProfile: false,
    status: "placeholder",
  },
  {
    id: "signIn",
    path: "/entrar",
    label: "Entrar",
    description: "Acesse sua area financeira para continuar.",
    navigationGroup: "public",
    requiresAuthentication: false,
    requiresFinancialProfile: false,
    status: "placeholder",
  },
] as const satisfies readonly ShellRoute[];

export function getShellRouteByPath(path: string): ShellRoute | undefined {
  return solverFinShellRoutes.find((route) => route.path === path);
}

export function listShellRoutesByGroup(group: ShellNavigationGroup): ShellRoute[] {
  return solverFinShellRoutes.filter((route) => route.navigationGroup === group);
}

export function listPrivateShellRoutes(): ShellRoute[] {
  return solverFinShellRoutes.filter((route) => route.requiresAuthentication);
}
