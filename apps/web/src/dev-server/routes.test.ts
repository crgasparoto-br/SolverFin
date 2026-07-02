import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { listPrivateShellRoutes } from "../app-shell/routes.js";
import { implementedRoutes, privateRoutes, resolveRoute } from "./routes.js";

describe("dev-server route contract", () => {
  it("derives private navigation from the app shell route contract", () => {
    const shellPrivateRoutes = listPrivateShellRoutes();

    assert.deepEqual(
      Array.from(privateRoutes.entries()),
      shellPrivateRoutes.map((route) => [route.path, route.label]),
    );
  });

  it("derives implemented routes from available private shell routes", () => {
    const availableRoutePaths = listPrivateShellRoutes()
      .filter((route) => route.status === "available")
      .map((route) => route.path);

    assert.deepEqual(Array.from(implementedRoutes), availableRoutePaths);
    assert.equal(implementedRoutes.has("/relatorios"), false);
  });

  it("redirects all legacy /app routes to canonical private paths", () => {
    for (const route of listPrivateShellRoutes()) {
      const legacyPath = route.path === "/dashboard" ? "/app" : `/app${route.path}`;

      assert.deepEqual(resolveRoute(legacyPath, true), {
        statusCode: 302,
        kind: "dashboard",
        location: route.path,
      });
      assert.deepEqual(resolveRoute(legacyPath, false), {
        statusCode: 302,
        kind: "login",
        location: "/login",
      });
    }
  });

  it("redirects retired payables routes to transactions", () => {
    for (const retiredPath of ["/pagar-receber", "/app/pagar-receber"] as const) {
      assert.deepEqual(resolveRoute(retiredPath, true), {
        statusCode: 302,
        kind: "placeholder",
        location: "/lancamentos",
      });
      assert.deepEqual(resolveRoute(retiredPath, false), {
        statusCode: 302,
        kind: "login",
        location: "/login",
      });
    }
  });

  it("resolves public and private entry points by session state", () => {
    assert.deepEqual(resolveRoute("/", true), {
      statusCode: 302,
      kind: "dashboard",
      location: "/dashboard",
    });
    assert.deepEqual(resolveRoute("/", false), {
      statusCode: 302,
      kind: "login",
      location: "/login",
    });
    assert.deepEqual(resolveRoute("/login", true), {
      statusCode: 302,
      kind: "dashboard",
      location: "/dashboard",
    });
    assert.deepEqual(resolveRoute("/login", false), {
      statusCode: 200,
      kind: "login",
    });
    assert.deepEqual(resolveRoute("/dashboard", true), {
      statusCode: 200,
      kind: "dashboard",
    });
    assert.deepEqual(resolveRoute("/dashboard", false), {
      statusCode: 302,
      kind: "login",
      location: "/login",
    });
  });

  it("keeps unknown paths out of the private shell", () => {
    assert.deepEqual(resolveRoute("/rota-inexistente", true), {
      statusCode: 404,
      kind: "not-found",
    });
    assert.deepEqual(resolveRoute("/rota-inexistente", false), {
      statusCode: 404,
      kind: "not-found",
    });
  });
});
