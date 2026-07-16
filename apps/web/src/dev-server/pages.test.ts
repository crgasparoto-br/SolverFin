import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { listNavigablePrivateShellRoutes } from "../app-shell/routes.js";
import { renderPrivatePage } from "./pages.js";

describe("dev-server private placeholder pages", () => {
  it("renders placeholder pages with canonical private navigation", async () => {
    const html = await renderPrivatePage("/relatorios", "demo-token");

    assert.match(html, /<title>Relatórios - SolverFin<\/title>/);
    assert.match(html, /<h1>Relatórios<\/h1>/);
    assert.match(
      html,
      /<a href="\/relatorios" id="nav-secondary-reports" data-nav-priority="secondary" title="[^"]+" aria-current="page">[\s\S]*?Relatórios<\/a>/,
    );

    for (const route of listNavigablePrivateShellRoutes()) {
      assert.ok(html.includes(`<a href="${route.path}"`));
      assert.ok(html.includes(`>${route.label}</a>`));
    }

    assert.doesNotMatch(html, /href="\/remuneracao-contas"/);
  });
});
