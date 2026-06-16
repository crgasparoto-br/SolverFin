import type { ShellNavigationModel } from "../app-shell/navigation.js";

export type MobileViewportStateKind = "loading" | "empty" | "error" | "ready";

export interface MobileViewportReadinessInput {
  viewportWidth: number;
  navigation: ShellNavigationModel;
  state: MobileViewportStateKind;
  hasPrimaryAction: boolean;
  hasReadableEmptyState: boolean;
  hasRetryAction: boolean;
}

export interface MobileViewportReadinessResult {
  mobileFirst: boolean;
  bottomNavigationVisible: boolean;
  primaryRoutesReachable: boolean;
  stateMessage: string;
  issues: readonly string[];
}

const MOBILE_MAX_WIDTH = 767;
const PRIMARY_ROUTE_IDS = new Set(["dashboard", "transactions", "review", "settings"]);

export function evaluateMobileViewportReadiness(
  input: MobileViewportReadinessInput,
): MobileViewportReadinessResult {
  const issues: string[] = [];
  const isMobileViewport = input.viewportWidth <= MOBILE_MAX_WIDTH;
  const bottomNavigationVisible = input.navigation.mode === "mobile" && isMobileViewport;
  const primaryRoutesReachable = input.navigation.items
    .filter((item) => PRIMARY_ROUTE_IDS.has(item.route.id))
    .every((item) => !item.isCollapsedOnMobile);

  if (!bottomNavigationVisible) {
    issues.push("A navegacao inferior deve ficar disponivel em viewport mobile.");
  }

  if (!primaryRoutesReachable) {
    issues.push("Rotas principais precisam continuar acessiveis no celular.");
  }

  if (input.state === "empty" && !input.hasReadableEmptyState) {
    issues.push("Estado vazio precisa explicar a proxima acao para a pessoa usuaria.");
  }

  if (input.state === "error" && !input.hasRetryAction) {
    issues.push("Estado de erro precisa oferecer tentativa de recuperacao.");
  }

  if (input.state === "ready" && !input.hasPrimaryAction) {
    issues.push("Tela pronta deve manter uma acao principal acionavel por toque.");
  }

  return {
    mobileFirst: issues.length === 0,
    bottomNavigationVisible,
    primaryRoutesReachable,
    stateMessage: buildMobileStateMessage(input.state),
    issues,
  };
}

function buildMobileStateMessage(state: MobileViewportStateKind): string {
  if (state === "loading") {
    return "Carregando seus dados financeiros.";
  }

  if (state === "empty") {
    return "Comece adicionando lancamentos ou compartilhando uma mensagem bancaria.";
  }

  if (state === "error") {
    return "Nao foi possivel carregar agora. Tente novamente.";
  }

  return "Pronto para acompanhar sua rotina financeira.";
}
