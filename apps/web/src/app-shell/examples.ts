import type { ShellRuntimeContext } from "./access.js";
import type { ShellRoute } from "./routes.js";
import { evaluateShellRouteAccess } from "./access.js";
import { getShellRouteByPath } from "./routes.js";

export interface ShellStateExample {
  name: string;
  path: string;
  context: ShellRuntimeContext;
  expectedState: ReturnType<typeof evaluateShellRouteAccess>["state"];
}

export const shellStateExamples = [
  {
    name: "Carregando sessao",
    path: "/app",
    context: {
      sessionState: "loading",
    },
    expectedState: "loading",
  },
  {
    name: "Usuario nao autenticado em rota privada",
    path: "/app/lancamentos",
    context: {
      sessionState: "unauthenticated",
    },
    expectedState: "redirect",
  },
  {
    name: "Usuario autenticado sem perfil financeiro",
    path: "/app",
    context: {
      sessionState: "authenticated",
      user: {
        id: "user-demo",
        displayName: "Pessoa Demo",
      },
    },
    expectedState: "missing-profile",
  },
  {
    name: "Falha ao carregar contexto inicial",
    path: "/app",
    context: {
      sessionState: "error",
      errorMessage: "Nao conseguimos carregar seus dados agora.",
    },
    expectedState: "error",
  },
  {
    name: "Dashboard pronto para uso",
    path: "/app",
    context: {
      sessionState: "authenticated",
      user: {
        id: "user-demo",
        displayName: "Pessoa Demo",
      },
      activeFinancialProfile: {
        id: "profile-demo",
        name: "Perfil pessoal",
        kind: "personal",
      },
    },
    expectedState: "ready",
  },
] as const satisfies readonly ShellStateExample[];

export function evaluateShellStateExample(
  example: ShellStateExample,
): ReturnType<typeof evaluateShellRouteAccess> {
  const route = requireShellRoute(example.path);

  return evaluateShellRouteAccess(route, example.context);
}

function requireShellRoute(path: string): ShellRoute {
  const route = getShellRouteByPath(path);

  if (route === undefined) {
    throw new Error(`Shell route not found for path: ${path}`);
  }

  return route;
}
