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

  it("keeps current and legacy app routes reachable", () => {
    assert.deepEqual(resolveRoute("/dashboard", true), {
      statusCode: 200,
      kind: "dashboard",
    });
    assert.deepEqual(resolveRoute("/app/lancamentos", true), {
      statusCode: 302,
      kind: "dashboard",
      location: "/lancamentos",
    });
    assert.deepEqual(resolveRoute("/app/lancamentos", false), {
      statusCode: 302,
      kind: "login",
      location: "/login",
    });
  });
});
