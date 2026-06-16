import type { ShellRoute } from "./routes.js";

export type ShellSessionState = "loading" | "unauthenticated" | "authenticated" | "error";
export type FinancialProfileKind = "personal" | "family" | "mei" | "business";

export interface ShellUserSummary {
  id: string;
  displayName: string;
  email?: string;
}

export interface ShellFinancialProfileSummary {
  id: string;
  name: string;
  kind: FinancialProfileKind;
}

export interface ShellRuntimeContext {
  sessionState: ShellSessionState;
  user?: ShellUserSummary;
  activeFinancialProfile?: ShellFinancialProfileSummary;
  availableFinancialProfiles?: readonly ShellFinancialProfileSummary[];
  errorMessage?: string;
}

export type ShellAccessResult =
  | {
      state: "loading";
      title: string;
      description: string;
    }
  | {
      state: "redirect";
      to: "/entrar";
      title: string;
      description: string;
    }
  | {
      state: "missing-profile";
      title: string;
      description: string;
      actionLabel: string;
    }
  | {
      state: "error";
      title: string;
      description: string;
      actionLabel: string;
    }
  | {
      state: "ready";
      title: string;
      description: string;
    };

export function evaluateShellRouteAccess(
  route: ShellRoute,
  context: ShellRuntimeContext,
): ShellAccessResult {
  if (context.sessionState === "loading") {
    return {
      state: "loading",
      title: "Carregando sua area financeira",
      description: "Estamos preparando a navegacao e o contexto selecionado.",
    };
  }

  if (context.sessionState === "error") {
    return {
      state: "error",
      title: "Nao foi possivel carregar sua area",
      description:
        context.errorMessage ?? "Tente novamente para continuar acompanhando seus dados.",
      actionLabel: "Tentar novamente",
    };
  }

  if (route.requiresAuthentication && context.sessionState === "unauthenticated") {
    return {
      state: "redirect",
      to: "/entrar",
      title: "Entre para continuar",
      description: "Sua area financeira fica protegida para manter seus dados separados e seguros.",
    };
  }

  if (route.requiresFinancialProfile && context.activeFinancialProfile === undefined) {
    return {
      state: "missing-profile",
      title: "Escolha ou crie um perfil financeiro",
      description: "Use um perfil para separar vida pessoal, familia, MEI ou negocio.",
      actionLabel: "Configurar perfil",
    };
  }

  return {
    state: "ready",
    title: route.label,
    description: route.description,
  };
}

export function isShellRouteReady(result: ShellAccessResult): boolean {
  return result.state === "ready";
}
