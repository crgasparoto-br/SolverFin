export type ShellRouteId =
  | "dashboard"
  | "transactions"
  | "payablesReceivables"
  | "accountsCards"
  | "categories"
  | "cards"
  | "budgets"
  | "inbox"
  | "reports"
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
    path: "/dashboard",
    label: "Dashboard",
    description: "Acompanhe saldo, resultado do período e próximas pendências.",
    navigationGroup: "main",
    requiresAuthentication: true,
    requiresFinancialProfile: true,
    status: "available",
  },
  {
    id: "transactions",
    path: "/lancamentos",
    label: "Extrato da conta",
    description: "Acompanhe saldos, filtros e movimentações por conta.",
    navigationGroup: "main",
    requiresAuthentication: true,
    requiresFinancialProfile: true,
    status: "available",
  },
  {
    id: "payablesReceivables",
    path: "/pagar-receber",
    label: "Pagar e receber",
    description: "Acompanhe vencimentos, pagamentos e recebimentos previstos.",
    navigationGroup: "main",
    requiresAuthentication: true,
    requiresFinancialProfile: true,
    status: "available",
  },
  {
    id: "cards",
    path: "/cartoes",
    label: "Cartões de Crédito",
    description: "Acompanhe compras, faturas, fechamento e pagamento de cartão.",
    navigationGroup: "main",
    requiresAuthentication: true,
    requiresFinancialProfile: true,
    status: "available",
  },
  {
    id: "accountsCards",
    path: "/contas-cartoes",
    label: "Contas e Cartões",
    description:
      "Cadastre contas, bancos, dinheiro, aplicações e cartões usados na rotina financeira.",
    navigationGroup: "manage",
    requiresAuthentication: true,
    requiresFinancialProfile: true,
    status: "available",
  },
  {
    id: "categories",
    path: "/categorias",
    label: "Categorias",
    description: "Mantenha categorias para organizar receitas, despesas e transferências.",
    navigationGroup: "manage",
    requiresAuthentication: true,
    requiresFinancialProfile: true,
    status: "available",
  },
  {
    id: "budgets",
    path: "/orcamentos",
    label: "Orçamentos",
    description: "Acompanhe limites planejados por categoria de despesa.",
    navigationGroup: "main",
    requiresAuthentication: true,
    requiresFinancialProfile: true,
    status: "available",
  },
  {
    id: "inbox",
    path: "/inbox",
    label: "Inbox",
    description: "Revise mensagens, importações e sugestões antes de confirmar.",
    navigationGroup: "review",
    requiresAuthentication: true,
    requiresFinancialProfile: true,
    status: "available",
  },
  {
    id: "reports",
    path: "/relatorios",
    label: "Relatórios",
    description: "Veja gastos por categoria, evolução mensal e previsto versus realizado.",
    navigationGroup: "review",
    requiresAuthentication: true,
    requiresFinancialProfile: true,
    status: "placeholder",
  },
  {
    id: "settings",
    path: "/configuracoes",
    label: "Configurações",
    description: "Ajuste perfis financeiros, preferências e privacidade.",
    navigationGroup: "settings",
    requiresAuthentication: true,
    requiresFinancialProfile: false,
    status: "available",
  },
  {
    id: "signIn",
    path: "/login",
    label: "Entrar",
    description: "Acesse sua área financeira para continuar.",
    navigationGroup: "public",
    requiresAuthentication: false,
    requiresFinancialProfile: false,
    status: "available",
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

export function listImplementedPrivateShellRoutes(): ShellRoute[] {
  return listPrivateShellRoutes().filter((route) => route.status === "available");
}
