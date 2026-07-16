import {
  getShellRouteByPath,
  listImplementedPrivateShellRoutes,
  listPrivateShellRoutes,
} from "../app-shell/routes.js";

export type RouteKind = "login" | "dashboard" | "placeholder" | "not-found";

export const privateRoutes = new Map(
  listPrivateShellRoutes().map((route) => [route.path, route.label]),
);

export const implementedRoutes = new Set(
  listImplementedPrivateShellRoutes().map((route) => route.path),
);

const retiredPrivateRouteRedirects = new Map([
  ["/pagar-receber", "/lancamentos"],
  ["/app/pagar-receber", "/lancamentos"],
  ["/contas", "/contas-cartoes"],
  ["/remuneracao-contas", "/contas-cartoes"],
  ["/app/remuneracao-contas", "/contas-cartoes"],
]);

const legacyAppRouteRedirects = new Map(
  listPrivateShellRoutes().map((route) => [
    route.path === "/dashboard" ? "/app" : `/app${route.path}`,
    route.path,
  ]),
);

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

  const retiredRedirect = retiredPrivateRouteRedirects.get(pathname);

  if (retiredRedirect) {
    return {
      statusCode: 302,
      kind: hasSession ? "placeholder" : "login",
      location: hasSession ? retiredRedirect : "/login",
    };
  }

  const legacyRedirect = legacyAppRouteRedirects.get(pathname);

  if (legacyRedirect) {
    return {
      statusCode: 302,
      kind: hasSession ? "dashboard" : "login",
      location: hasSession ? legacyRedirect : "/login",
    };
  }

  const shellRoute = getShellRouteByPath(pathname);

  if (shellRoute?.requiresAuthentication === false) {
    return hasSession
      ? { statusCode: 302, kind: "dashboard", location: "/dashboard" }
      : { statusCode: 200, kind: "login" };
  }

  if (shellRoute?.requiresAuthentication === true) {
    if (!hasSession) {
      return { statusCode: 302, kind: "login", location: "/login" };
    }

    return {
      statusCode: 200,
      kind: shellRoute.id === "dashboard" ? "dashboard" : "placeholder",
    };
  }

  return { statusCode: 404, kind: "not-found" };
}
