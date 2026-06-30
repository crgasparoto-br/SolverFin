export type RouteKind = "login" | "dashboard" | "placeholder" | "not-found";

export const privateRoutes = new Map<string, string>([
  ["/dashboard", "Dashboard"],
  ["/lancamentos", "Extrato da conta"],
  ["/pagar-receber", "Pagar e receber"],
  ["/contas-cartoes", "Contas e Cartões"],
  ["/categorias", "Categorias"],
  ["/cartoes", "Cartões de Crédito"],
  ["/orcamentos", "Orçamentos"],
  ["/inbox", "Inbox"],
  ["/relatorios", "Relatórios"],
  ["/configuracoes", "Configurações"],
]);

export const implementedRoutes = new Set([
  "/dashboard",
  "/contas-cartoes",
  "/categorias",
  "/lancamentos",
  "/pagar-receber",
  "/cartoes",
  "/orcamentos",
  "/inbox",
  "/configuracoes",
]);

export function resolveRoute(
  pathname: string,
  hasSession: boolean,
): { statusCode: number; kind: RouteKind; location?: string } {
  if (pathname === "/") {
    return {
      statusCode: 302,
      kind: hasSession ? "dashboard" : "login",
      location: hasSession ? "/dashboard" : "/login",
    };
  }

  if (pathname === "/login") {
    return hasSession
      ? { statusCode: 302, kind: "dashboard", location: "/dashboard" }
      : { statusCode: 200, kind: "login" };
  }

  if (privateRoutes.has(pathname)) {
    return hasSession
      ? { statusCode: 200, kind: pathname === "/dashboard" ? "dashboard" : "placeholder" }
      : { statusCode: 302, kind: "login", location: "/login" };
  }

  return { statusCode: 404, kind: "not-found" };
}
