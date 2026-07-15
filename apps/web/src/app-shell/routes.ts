export type ShellRouteId =
  | "dashboard"
  | "transactions"
  | "accountsCards"
  | "accountRemuneration"
  | "categories"
  | "cards"
  | "budgets"
  | "inbox"
  | "reports"
  | "settings"
  | "adminInstitutions"
  | "adminFinancialIndexes"
  | "signIn";

export type ShellNavigationGroup = "main" | "manage" | "review" | "settings" | "admin" | "public";
export type ShellRouteStatus = "available" | "placeholder";

export interface ShellRoute {
  id: ShellRouteId;
  path: string;
  label: string;
  description: string;
  navigationGroup: ShellNavigationGroup;
  requiresAuthentication: boolean;
  requiresFinancialProfile: boolean;
  requiresMaster?: boolean;
  showInNavigation?: boolean;
  status: ShellRouteStatus;
}

export interface ListPrivateShellRoutesOptions {
  includeMaster?: boolean;
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
    id: "accountRemuneration",
    path: "/remuneracao-contas",
    label: "Remuneração pelo CDI",
    description: "Configure contas remuneradas e o percentual aplicado sobre o CDI diário.",
    navigationGroup: "manage",
    requiresAuthentication: true,
    requiresFinancialProfile: true,
    showInNavigation: false,
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
    status: "available",
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
    id: "adminInstitutions",
    path: "/admin/instituicoes",
    label: "Admin - Instituições",
    description: "Mantenha o catálogo global de instituições financeiras e logomarcas.",
    navigationGroup: "admin",
    requiresAuthentication: true,
    requiresFinancialProfile: false,
    requiresMaster: true,
    status: "available",
  },
  {
    id: "adminFinancialIndexes",
    path: "/admin/indices-financeiros",
    label: "Admin - Índices financeiros",
    description: "Acompanhe a importação do CDI e o processamento das contas remuneradas.",
    navigationGroup: "admin",
    requiresAuthentication: true,
    requiresFinancialProfile: false,
    requiresMaster: true,
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

export function listShellRoutesByGroup(
  group: ShellNavigationGroup,
  options: ListPrivateShellRoutesOptions = {},
): ShellRoute[] {
  return solverFinShellRoutes.filter(
    (route) =>
      route.navigationGroup === group &&
      isVisibleInNavigation(route) &&
      shouldIncludeRoute(route, options),
  );
}

export function listPrivateShellRoutes(options: ListPrivateShellRoutesOptions = {}): ShellRoute[] {
  return solverFinShellRoutes.filter(
    (route) => route.requiresAuthentication && shouldIncludeRoute(route, options),
  );
}

export function listNavigablePrivateShellRoutes(
  options: ListPrivateShellRoutesOptions = {},
): ShellRoute[] {
  return listPrivateShellRoutes(options).filter(isVisibleInNavigation);
}

export function listImplementedPrivateShellRoutes(
  options: ListPrivateShellRoutesOptions = {},
): ShellRoute[] {
  return listPrivateShellRoutes(options).filter((route) => route.status === "available");
}

function isVisibleInNavigation(route: ShellRoute): boolean {
  return route.showInNavigation !== false;
}

function shouldIncludeRoute(route: ShellRoute, options: ListPrivateShellRoutesOptions): boolean {
  return route.requiresMaster !== true || options.includeMaster === true;
}
