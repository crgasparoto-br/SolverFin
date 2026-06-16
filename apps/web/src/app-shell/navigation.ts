import type { ShellFinancialProfileSummary, ShellUserSummary } from "./access.js";
import type { ShellNavigationGroup, ShellRoute } from "./routes.js";
import { listShellRoutesByGroup } from "./routes.js";

export type ShellViewportMode = "mobile" | "desktop";

export interface ShellNavigationSection {
  group: ShellNavigationGroup;
  label: string;
  routes: readonly ShellRoute[];
}

export interface ShellHeaderModel {
  productName: "SolverFin";
  currentRouteLabel: string;
  userLabel: string;
  profileLabel: string;
  mobileMenuLabel: string;
}

export interface BuildShellNavigationInput {
  activePath: string;
  viewportMode: ShellViewportMode;
}

export interface ShellNavigationItem {
  route: ShellRoute;
  isActive: boolean;
  isCollapsedOnMobile: boolean;
}

export interface ShellNavigationModel {
  mode: ShellViewportMode;
  sections: readonly ShellNavigationSection[];
  items: readonly ShellNavigationItem[];
}

const NAVIGATION_GROUP_LABELS: Record<ShellNavigationGroup, string> = {
  main: "Rotina",
  manage: "Organizar",
  review: "Revisar",
  settings: "Ajustes",
  public: "Publico",
};

const PRIVATE_NAVIGATION_GROUPS: readonly ShellNavigationGroup[] = [
  "main",
  "manage",
  "review",
  "settings",
];

export function buildShellNavigation(input: BuildShellNavigationInput): ShellNavigationModel {
  const sections = PRIVATE_NAVIGATION_GROUPS.map((group) => ({
    group,
    label: NAVIGATION_GROUP_LABELS[group],
    routes: listShellRoutesByGroup(group),
  })).filter((section) => section.routes.length > 0);
  const items = sections.flatMap((section) =>
    section.routes.map((route) => ({
      route,
      isActive: route.path === input.activePath,
      isCollapsedOnMobile: input.viewportMode === "mobile" && !isPrimaryMobileRoute(route),
    })),
  );

  return {
    mode: input.viewportMode,
    sections,
    items,
  };
}

export function buildShellHeaderModel(input: {
  currentRoute: ShellRoute;
  user?: ShellUserSummary;
  activeFinancialProfile?: ShellFinancialProfileSummary;
}): ShellHeaderModel {
  return {
    productName: "SolverFin",
    currentRouteLabel: input.currentRoute.label,
    userLabel: input.user?.displayName ?? "Visitante",
    profileLabel: input.activeFinancialProfile?.name ?? "Perfil financeiro pendente",
    mobileMenuLabel: "Abrir navegacao",
  };
}

function isPrimaryMobileRoute(route: ShellRoute): boolean {
  return route.id === "dashboard" || route.id === "transactions" || route.id === "review";
}
